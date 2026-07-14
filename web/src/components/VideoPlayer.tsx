import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import Hls from 'hls.js'
import { Slider } from '@/components/ui/slider'
import { cn } from '@/lib/utils'
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  Camera,
  Gauge,
  Subtitles,
  Scissors,
  AudioLines,
} from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from '@/components/ui/dropdown-menu'
import type { TimelineEvent } from '@/types'

interface FilmstripMeta {
  interval: number
  tileWidth: number
  tileHeight: number
  gridCols: number
  gridRows: number
  startTime: string
  totalDuration: number
  tiles: { file: string; index: number; count: number }[]
}

interface VideoPlayerProps {
  streamUrl: string
  posterUrl?: string
  isLive?: boolean
  className?: string
  startTime?: string
  events?: TimelineEvent[]
  onExport?: (startTime: number, duration: number) => void
  showExportButton?: boolean
  streamType?: 'audio_video' | 'audio_only' | 'video_only'
}

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return '0:00'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }
  return `${m}:${String(s)}`
}

function formatDateTime(startISO: string, offsetSec: number): string {
  const start = new Date(startISO)
  const d = new Date(start.getTime() + offsetSec * 1000)
  const h = d.getHours()
  const m = d.getMinutes()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(h)}:${pad(m)}`
}

function formatDateTimeFull(startISO: string, offsetSec: number): string {
  const start = new Date(startISO)
  const d = new Date(start.getTime() + offsetSec * 1000)
  return d.toLocaleString()
}

const ALL_SPEEDS = [0.5, 1, 1.5, 2]
const LIVE_EDGE_BUFFER = 3

function getHlsConfig(isLive: boolean) {
  if (isLive) {
    return {
      enableWorker: true,
      lowLatencyMode: false,
      liveDurationInfinity: true,
      liveSyncDuration: Infinity,
      liveMaxLatencyDuration: Infinity,
      maxBufferLength: 30,
      maxMaxBufferLength: 120,
      backBufferLength: 120,
      liveBackBufferLength: 120,
      maxBufferSize: 30 * 1024 * 1024,
    }
  }
  return {
    enableWorker: true,
    lowLatencyMode: false,
    liveDurationInfinity: false,
    maxBufferLength: 60,
    maxMaxBufferLength: 300,
    backBufferLength: 60,
    liveBackBufferLength: 60,
    maxBufferSize: 60 * 1024 * 1024,
  }
}

export default function VideoPlayer({
  streamUrl,
  posterUrl,
  isLive,
  className = '',
  startTime,
  events = [],
  onExport,
  showExportButton = false,
  streamType,
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const timelineRef = useRef<HTMLDivElement>(null)
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const recoveryCountRef = useRef(0)
  const hlsRef = useRef<Hls | null>(null)
  const savedTimeRef = useRef(0)
  const isLiveRef = useRef(isLive)
  const lastDurationUpdateRef = useRef(0)
  const lastPublishedDurationRef = useRef(0)
  const lastTimeUpdateRef = useRef(0)
  const hoverThrottleRef = useRef(0)
  const seekingRef = useRef(false)
  const controlsVisibleRef = useRef(true)

  const [playing, setPlaying] = useState(false)
  const [buffering, setBuffering] = useState(true)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume] = useState(1)
  const [muted, setMuted] = useState(false)
  const [speed, setSpeed] = useState(1)
  const [fullscreen, setFullscreen] = useState(false)
  const [controlsVisible, setControlsVisible] = useState(true)
  const [seeking, setSeeking] = useState(false)
  const [seekValue, setSeekValue] = useState([0])

  const [filmstripMeta, setFilmstripMeta] = useState<FilmstripMeta | null>(null)
  const [filmstripImages, setFilmstripImages] = useState<Map<string, HTMLImageElement>>(new Map())
  const [thumbVisible, setThumbVisible] = useState(false)
  const [thumbX, setThumbX] = useState(0)
  const [thumbTime, setThumbTime] = useState(0)

  const [subtitleTracks, setSubtitleTracks] = useState<{ id: number; name: string }[]>([])
  const [activeSubtitle, setActiveSubtitle] = useState(-1)

  const [clipMode, setClipMode] = useState(false)
  const [clipStart, setClipStart] = useState(0)
  const [clipEnd, setClipEnd] = useState(0)
  const [draggingHandle, setDraggingHandle] = useState<'start' | 'end' | null>(null)

  isLiveRef.current = isLive
  seekingRef.current = seeking

  const speeds = isLive ? ALL_SPEEDS.filter((s) => s <= 1) : ALL_SPEEDS

  const showControls = useCallback(() => {
    if (!controlsVisibleRef.current) {
      controlsVisibleRef.current = true
      setControlsVisible(true)
    }
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
    hideTimerRef.current = setTimeout(() => {
      if (videoRef.current && !videoRef.current.paused) {
        controlsVisibleRef.current = false
        setControlsVisible(false)
      }
    }, 3000)
  }, [])

  const fetchFilmstrip = useCallback(() => {
    const match = streamUrl.match(/\/api\/stream\/(\d+)\//)
    if (!match) return
    const outputId = match[1]

    fetch(`/api/stream/${outputId}/thumbs.json`)
      .then((r) => {
        if (!r.ok) throw new Error('no filmstrip')
        return r.json()
      })
      .then(async (meta: FilmstripMeta) => {
        setFilmstripMeta(meta)
        const images = new Map<string, HTMLImageElement>()
        await Promise.all(meta.tiles.map((tile) =>
          new Promise<void>((resolve) => {
            const img = new Image()
            img.onload = () => { images.set(tile.file, img); resolve() }
            img.onerror = () => resolve()
            img.src = `/api/stream/${outputId}/${tile.file}`
          })
        ))
        setFilmstripImages(new Map(images))
      })
      .catch(() => {})
  }, [streamUrl])

  useEffect(() => {
    fetchFilmstrip()
  }, [fetchFilmstrip])

  useEffect(() => {
    if (!isLive) return
    const interval = setInterval(() => {
      fetchFilmstrip()
    }, 30000)
    return () => clearInterval(interval)
  }, [isLive, fetchFilmstrip])

  // HLS setup — saves/restores position across re-init
  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    const videoEl = video

    // Save position before tearing down (for live→recorded transition)
    if (hlsRef.current && video.currentTime > 0) {
      savedTimeRef.current = video.currentTime
    }

    let hls: Hls | null = null
    let durationInterval: ReturnType<typeof setInterval> | null = null
    recoveryCountRef.current = 0
    lastDurationUpdateRef.current = 0
    setSubtitleTracks([])
    setActiveSubtitle(-1)

    function attachHlsEvents(instance: Hls) {
      instance.on(Hls.Events.MANIFEST_PARSED, () => {
        const restoreTime = savedTimeRef.current
        if (restoreTime > 0) {
          videoEl.currentTime = restoreTime
          savedTimeRef.current = 0
        }

        const dur = videoEl.duration
        if (isFinite(dur)) {
          setDuration(dur)
          lastPublishedDurationRef.current = dur
        }

        setBuffering(false)

        if (isLive) {
          lastDurationUpdateRef.current = Date.now()
          if (durationInterval) clearInterval(durationInterval)
          durationInterval = setInterval(() => {
            if (!videoEl.duration || !isFinite(videoEl.duration)) return
            const now = Date.now()
            const elapsed = now - lastDurationUpdateRef.current
            const newDur = videoEl.duration
            // Only push duration update if it changed by >5s or 15s elapsed
            if (Math.abs(newDur - lastPublishedDurationRef.current) > 5 || elapsed > 15000) {
              setDuration(newDur)
              lastPublishedDurationRef.current = newDur
              lastDurationUpdateRef.current = now
            }
          }, 3000)
        } else {
          if (isFinite(dur)) {
            setDuration(dur)
          }
        }
      })

      instance.on(Hls.Events.SUBTITLE_TRACKS_UPDATED, (_event, data) => {
        const tracks = data.subtitleTracks.map((t) => ({ id: t.id, name: t.name }))
        setSubtitleTracks(tracks)
        setActiveSubtitle(instance.subtitleTrack)
      })

      instance.on(Hls.Events.FRAG_BUFFERED, () => {
        recoveryCountRef.current = 0
      })

      instance.on(Hls.Events.ERROR, (_event, data) => {
        if (!hls) return
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              hls.startLoad()
              break
            case Hls.ErrorTypes.MEDIA_ERROR:
              hls.recoverMediaError()
              break
            default:
              recoveryCountRef.current++
              if (recoveryCountRef.current >= 3) {
                savedTimeRef.current = videoEl.currentTime
                hls.destroy()
                const newHls = new Hls(getHlsConfig(!!isLiveRef.current))
                hlsRef.current = newHls
                hls = newHls
                newHls.loadSource(streamUrl)
                newHls.attachMedia(videoEl)
                attachHlsEvents(newHls)
                recoveryCountRef.current = 0
              }
              break
          }
        }
      })
    }

    if (Hls.isSupported()) {
      const config = getHlsConfig(!!isLive)
      hls = new Hls(config)
      hlsRef.current = hls
      hls.loadSource(streamUrl)
      hls.attachMedia(video)
      attachHlsEvents(hls)
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = streamUrl
    }

    return () => {
      if (durationInterval) clearInterval(durationInterval)
      if (video.currentTime > 0) {
        savedTimeRef.current = video.currentTime
      }
      const current = hlsRef.current
      hlsRef.current = null
      current?.destroy()
    }
  }, [streamUrl, isLive])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const onPlay = () => setPlaying(true)
    const onPause = () => setPlaying(false)
    const onTimeUpdate = () => {
      if (!seekingRef.current) {
        const now = performance.now()
        if (now - lastTimeUpdateRef.current >= 100) {
          lastTimeUpdateRef.current = now
          setCurrentTime(video.currentTime)
        }
      }
    }
    const onEnded = () => setPlaying(false)
    const onVolumeChange = () => {
      setVolume(video.volume)
      setMuted(video.muted)
    }
    const onWaiting = () => setBuffering(true)
    const onPlaying = () => setBuffering(false)

    video.addEventListener('play', onPlay)
    video.addEventListener('pause', onPause)
    video.addEventListener('timeupdate', onTimeUpdate)
    video.addEventListener('ended', onEnded)
    video.addEventListener('volumechange', onVolumeChange)
    video.addEventListener('waiting', onWaiting)
    video.addEventListener('playing', onPlaying)

    return () => {
      video.removeEventListener('play', onPlay)
      video.removeEventListener('pause', onPause)
      video.removeEventListener('timeupdate', onTimeUpdate)
      video.removeEventListener('ended', onEnded)
      video.removeEventListener('volumechange', onVolumeChange)
      video.removeEventListener('waiting', onWaiting)
      video.removeEventListener('playing', onPlaying)
    }
  }, [])

  useEffect(() => {
    const onFullscreenChange = () => {
      setFullscreen(!!document.fullscreenElement)
    }
    document.addEventListener('fullscreenchange', onFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange)
  }, [])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const onMouseMove = () => showControls()
    const onMouseLeave = () => {
      setThumbVisible(false)
      if (videoRef.current && !videoRef.current.paused) {
        controlsVisibleRef.current = false
        setControlsVisible(false)
      }
    }
    container.addEventListener('mousemove', onMouseMove)
    container.addEventListener('mouseleave', onMouseLeave)
    return () => {
      container.removeEventListener('mousemove', onMouseMove)
      container.removeEventListener('mouseleave', onMouseLeave)
    }
  }, [showControls])

  function togglePlay() {
    const video = videoRef.current
    if (!video) return
    if (video.paused) {
      video.play().catch(() => {})
    } else {
      video.pause()
    }
  }

  function toggleMute() {
    const video = videoRef.current
    if (!video) return
    video.muted = !video.muted
  }

  function handleVolumeChange(value: number[]) {
    const video = videoRef.current
    if (!video) return
    const v = value[0] / 100
    video.volume = v
    if (v > 0) video.muted = false
  }

  function cycleSpeed() {
    const video = videoRef.current
    if (!video) return
    const idx = speeds.indexOf(speed)
    const next = speeds[(idx + 1) % speeds.length]
    video.playbackRate = next
    setSpeed(next)
  }

  function selectSubtitle(trackId: number) {
    const hls = hlsRef.current
    if (!hls) return
    hls.subtitleTrack = trackId
    setActiveSubtitle(trackId)
  }

  function toggleClipMode() {
    if (clipMode) {
      setClipMode(false)
      setDraggingHandle(null)
    } else {
      setClipMode(true)
      setClipStart(Math.max(0, currentTime - 30))
      setClipEnd(Math.min(seekMax, currentTime + 30))
    }
  }

  function handleClipMouseDown(handle: 'start' | 'end', e: React.MouseEvent) {
    e.stopPropagation()
    setDraggingHandle(handle)
  }

  function handleClipMouseMove(e: React.MouseEvent) {
    if (!draggingHandle) return
    const timeline = timelineRef.current
    if (!timeline) return
    const rect = timeline.getBoundingClientRect()
    const x = e.clientX - rect.left
    const pct = Math.max(0, Math.min(1, x / rect.width))
    const time = pct * duration
    if (draggingHandle === 'start') {
      setClipStart(Math.min(time, clipEnd - 1))
    } else {
      setClipEnd(Math.max(time, clipStart + 1))
    }
  }

  function handleClipMouseUp() {
    setDraggingHandle(null)
  }

  function confirmExport() {
    if (onExport && clipEnd > clipStart) {
      onExport(clipStart, clipEnd - clipStart)
      setClipMode(false)
      setDraggingHandle(null)
    }
  }

  function handleSeekStart() {
    setSeeking(true)
    setSeekValue([currentTime])
  }

  function handleSeekChange(value: number[]) {
    setSeekValue(value)
  }

  function handleSeekEnd(value: number[]) {
    const video = videoRef.current
    if (!video) return
    let target = value[0]
    // Cap at live edge during live playback
    if (isLive && duration > 0) {
      target = Math.min(target, duration - LIVE_EDGE_BUFFER)
    }
    video.currentTime = Math.max(0, target)
    setCurrentTime(target)
    setSeeking(false)
  }

  function toggleFullscreen() {
    const container = containerRef.current
    if (!container) return
    if (document.fullscreenElement) {
      document.exitFullscreen()
    } else {
      container.requestFullscreen()
    }
  }

  function captureScreenshot() {
    const video = videoRef.current
    if (!video) return
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(video, 0, 0)
    canvas.toBlob((blob) => {
      if (!blob) return
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `screenshot_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.png`
      a.click()
      URL.revokeObjectURL(url)
    }, 'image/png')
  }

  function getFilmstripFrame(timeSec: number): { src: string; x: number; y: number; w: number; h: number } | null {
    if (!filmstripMeta || !filmstripMeta.tiles || filmstripMeta.tiles.length === 0) return null

    const frameIdx = Math.floor(timeSec / filmstripMeta.interval)
    const tilesPerSheet = filmstripMeta.gridCols * filmstripMeta.gridRows
    const sheetIdx = Math.floor(frameIdx / tilesPerSheet)
    const localIdx = frameIdx % tilesPerSheet

    const tile = filmstripMeta.tiles.find((t) => t.index === sheetIdx)
    if (!tile) return null

    const col = localIdx % filmstripMeta.gridCols
    const row = Math.floor(localIdx / filmstripMeta.gridCols)

    return {
      src: tile.file,
      x: col * filmstripMeta.tileWidth,
      y: row * filmstripMeta.tileHeight,
      w: filmstripMeta.tileWidth,
      h: filmstripMeta.tileHeight,
    }
  }

  function handleTimelineHover(e: React.MouseEvent) {
    const now = performance.now()
    if (now - hoverThrottleRef.current < 50) return
    hoverThrottleRef.current = now

    const timeline = timelineRef.current
    if (!timeline) return

    const rect = timeline.getBoundingClientRect()
    const x = e.clientX - rect.left
    const pct = Math.max(0, Math.min(1, x / rect.width))
    const time = pct * duration

    setThumbX(e.clientX - containerRef.current!.getBoundingClientRect().left)
    setThumbTime(time)
    setThumbVisible(true)
  }

  function handleTimelineLeave() {
    setThumbVisible(false)
  }

  const seekProgress = seeking ? seekValue[0] : currentTime
  const seekMax = isLive && duration > LIVE_EDGE_BUFFER ? duration - LIVE_EDGE_BUFFER : duration

  const timeLabels = useMemo(() => {
    if (!startTime || seekMax <= 0) return []
    const labels: { time: number; dateStr: string; pct: number }[] = []
    const interval = seekMax <= 300 ? 30 : seekMax <= 3600 ? 60 : seekMax <= 86400 ? 300 : 3600
    for (let t = 0; t < seekMax; t += interval) {
      labels.push({
        time: t,
        dateStr: formatDateTime(startTime, t),
        pct: (t / seekMax) * 100,
      })
    }
    return labels
  }, [startTime, seekMax])

  const thumbFrame = thumbVisible && duration > 0 ? getFilmstripFrame(thumbTime) : null
  const thumbImage = thumbFrame ? filmstripImages.get(thumbFrame.src) : null

  const filmstripTiles = useMemo(() => {
    if (!filmstripMeta || !filmstripMeta.tiles || filmstripMeta.tiles.length === 0 || seekMax <= 0) return []
    const tilesPerSheet = filmstripMeta.gridCols * filmstripMeta.gridRows
    const rawCount = Math.floor(seekMax / filmstripMeta.interval)
    const targetTiles = 30
    const skipFactor = Math.max(1, Math.floor(rawCount / targetTiles))
    const result: { file: string; leftPct: number; widthPct: number; bgX: number; bgY: number; bgW: number; bgH: number }[] = []
    for (const sheet of filmstripMeta.tiles) {
      for (let i = 0; i < sheet.count; i++) {
        const globalIdx = sheet.index * tilesPerSheet + i
        if (globalIdx % skipFactor !== 0) continue
        const col = i % filmstripMeta.gridCols
        const row = Math.floor(i / filmstripMeta.gridCols)
        result.push({
          file: sheet.file,
          leftPct: (globalIdx * filmstripMeta.interval / seekMax) * 100,
          widthPct: (skipFactor * filmstripMeta.interval / seekMax) * 100,
          bgX: col * filmstripMeta.tileWidth,
          bgY: row * filmstripMeta.tileHeight,
          bgW: filmstripMeta.gridCols * filmstripMeta.tileWidth,
          bgH: filmstripMeta.gridRows * filmstripMeta.tileHeight,
        })
      }
    }
    return result
  }, [filmstripMeta, seekMax])

  return (
    <div
      ref={containerRef}
      className={cn(
        'relative bg-black rounded-lg overflow-hidden select-none group',
        className,
      )}
      onClick={(e) => {
        if (e.target === e.currentTarget || (e.target as HTMLElement).tagName === 'VIDEO') {
          togglePlay()
        }
      }}
      onDoubleClick={toggleFullscreen}
    >
      <video
        ref={videoRef}
        className="w-full h-full object-contain"
        playsInline
        poster={posterUrl}
      />

      {/* Thumbnail preview — sprite-based */}
      {thumbVisible && duration > 0 && (
        <div
          className="absolute z-30 pointer-events-none"
          style={{
            left: `${thumbX}px`,
            bottom: '72px',
            transform: 'translateX(-50%)',
          }}
        >
          <div className="rounded-md overflow-hidden border border-white/20 shadow-xl bg-black">
            {thumbImage && thumbFrame ? (
              <div
                style={{
                  width: thumbFrame.w,
                  height: thumbFrame.h,
                  backgroundImage: `url(${(thumbImage as any).src || ''})`,
                  backgroundPosition: `-${thumbFrame.x}px -${thumbFrame.y}px`,
                  backgroundRepeat: 'no-repeat',
                  backgroundSize: `${filmstripMeta!.gridCols * filmstripMeta!.tileWidth}px ${filmstripMeta!.gridRows * filmstripMeta!.tileHeight}px`,
                }}
              />
            ) : (
              <div
                className="flex items-center justify-center bg-black/80"
                style={{ width: 160, height: 90 }}
              >
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              </div>
            )}
            <div className="text-center text-white text-xs font-mono py-1 bg-black/80">
              {startTime ? (
                <div>
                  <div>{formatDateTimeFull(startTime, thumbTime)}</div>
                </div>
              ) : null}
              {formatTime(thumbTime)}
            </div>
          </div>
        </div>
      )}

      {/* Top overlay — always visible */}
      <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between p-3 pointer-events-none">
        <div className="flex items-center gap-2">
          {isLive && (
            <span className="bg-red-600 text-white px-2 py-0.5 text-xs font-bold rounded shadow-lg animate-pulse">
              LIVE
            </span>
          )}
          {!isLive && startTime && (
            <span className="bg-black/60 text-white px-2 py-0.5 text-xs font-medium rounded shadow">
              {new Date(startTime).toLocaleDateString()} {new Date(startTime).toLocaleTimeString()}
            </span>
          )}
        </div>
        <span className="bg-black/60 text-white px-2 py-0.5 text-xs font-semibold rounded shadow">
          Vieo
        </span>
      </div>

      {/* Audio-only placeholder */}
      {streamType === 'audio_only' && (
        <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
          <AudioLines className="h-16 w-16 text-white/20" />
        </div>
      )}

      {/* Center loading/play indicator */}
      {!playing && streamType !== 'audio_only' && (
        <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
          {buffering ? (
            <div className="bg-black/40 rounded-full p-4">
              <div className="h-10 w-10 border-3 border-white/30 border-t-white rounded-full animate-spin" />
            </div>
          ) : (
            <div className="bg-black/40 rounded-full p-4">
              <Play className="h-10 w-10 text-white fill-white" />
            </div>
          )}
        </div>
      )}

      {/* Bottom controls */}
      <div
        className={cn(
          'absolute bottom-0 left-0 right-0 z-20 transition-opacity duration-300',
          controlsVisible ? 'opacity-100' : 'opacity-0 pointer-events-none',
        )}
      >
        <div className="bg-gradient-to-t from-black/80 via-black/40 to-transparent pt-8 pb-2 px-3">
          {/* Date/time labels */}
          {timeLabels.length > 0 && startTime && (
            <div className="relative h-4 mb-1 px-16">
              {timeLabels.map((label, i) => (
                <span
                  key={i}
                  className="absolute text-[9px] text-white/60 font-mono -translate-x-1/2"
                  style={{ left: `${label.pct}%` }}
                >
                  {label.dateStr}
                </span>
              ))}
            </div>
          )}

          {/* Timeline */}
          <div
            ref={timelineRef}
            className="relative flex items-center gap-3 mb-2"
            onMouseMove={(e) => { handleTimelineHover(e); handleClipMouseMove(e) }}
            onMouseLeave={() => { handleTimelineLeave(); handleClipMouseUp() }}
            onMouseUp={handleClipMouseUp}
          >
            <span className="text-white text-xs font-mono tabular-nums w-16 text-right shrink-0">
              {formatTime(seekProgress)}
            </span>
            <div className="flex-1 relative" style={{ minHeight: filmstripTiles.length > 0 ? '48px' : undefined }}>
              {/* Filmstrip strip — persistent thumbnails along the timeline */}
              {filmstripTiles.length > 0 && (
                <div className="absolute inset-x-0 top-0 bottom-0 overflow-hidden rounded-sm pointer-events-none">
                  {filmstripTiles.map((tile, i) => (
                    <div
                      key={i}
                      className="absolute top-0 bottom-0"
                      style={{
                        left: `${tile.leftPct}%`,
                        width: `${tile.widthPct}%`,
                        backgroundImage: `url(${(filmstripImages.get(tile.file) as any)?.src || ''})`,
                        backgroundPosition: `-${tile.bgX}px -${tile.bgY}px`,
                        backgroundRepeat: 'no-repeat',
                        backgroundSize: `${tile.bgW}px ${tile.bgH}px`,
                      }}
                    />
                  ))}
                </div>
              )}
              {/* Event markers */}
              {events.length > 0 && seekMax > 0 && (
                <div className="absolute inset-x-0 top-0 h-2 pointer-events-none z-10">
                  {events.map((ev) => (
                    <div
                      key={ev.id}
                      className="absolute top-0 w-1.5 h-1.5 rounded-full -translate-x-0.5"
                      style={{
                        left: `${(ev.time_offset / seekMax) * 100}%`,
                        backgroundColor: ev.color,
                      }}
                      title={`${formatTime(ev.time_offset)} — ${ev.label}`}
                    />
                  ))}
                </div>
              )}
              {/* Clip selection overlay */}
              {clipMode && seekMax > 0 && (
                <div className="absolute inset-x-0 top-0 h-4 pointer-events-none z-10">
                  <div
                    className="absolute top-0 h-full bg-blue-500/30 border-y border-blue-500/60"
                    style={{
                      left: `${(clipStart / seekMax) * 100}%`,
                      width: `${((clipEnd - clipStart) / seekMax) * 100}%`,
                    }}
                  />
                  <div
                    className="absolute top-0 h-full w-1 bg-blue-500 cursor-ew-resize pointer-events-auto"
                    style={{ left: `${(clipStart / seekMax) * 100}%`, transform: 'translateX(-50%)' }}
                    onMouseDown={(e) => handleClipMouseDown('start', e)}
                  />
                  <div
                    className="absolute top-0 h-full w-1 bg-blue-500 cursor-ew-resize pointer-events-auto"
                    style={{ left: `${(clipEnd / seekMax) * 100}%`, transform: 'translateX(-50%)' }}
                    onMouseDown={(e) => handleClipMouseDown('end', e)}
                  />
                </div>
              )}
              <Slider
                value={[seekProgress]}
                max={seekMax || 100}
                step={0.1}
                onValueChange={handleSeekChange}
                onPointerDown={handleSeekStart}
                onPointerUp={(e) => {
                  handleSeekEnd(seekValue)
                  ;(e.target as HTMLElement).releasePointerCapture(e.pointerId)
                }}
                className="flex-1 cursor-pointer relative z-20"
                trackClassName={filmstripTiles.length > 0 ? 'h-1.5 bg-white/10' : 'h-1.5'}
                thumbClassName="h-3.5 w-3.5"
              />
            </div>
            <span className="text-white/60 text-xs font-mono tabular-nums w-16 shrink-0">
              {isLive ? `-${formatTime(Math.max(0, duration - currentTime))}` : formatTime(duration)}
            </span>
          </div>
          {/* Clip mode info bar */}
          {clipMode && (
            <div className="flex items-center justify-between text-xs text-white/80 mb-1 px-19">
              <span>Clip: {formatTime(clipStart)} → {formatTime(clipEnd)} ({formatTime(clipEnd - clipStart)})</span>
              <div className="flex gap-2">
                <button onClick={confirmExport} className="px-2 py-0.5 rounded bg-blue-600 hover:bg-blue-500 text-white text-xs">
                  Export
                </button>
                <button onClick={() => { setClipMode(false); setDraggingHandle(null) }} className="px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 text-white text-xs">
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Bottom row */}
          <div className="flex items-center gap-1">
            <button
              onClick={(e) => { e.stopPropagation(); togglePlay() }}
              className="p-1.5 rounded-md text-white hover:bg-white/20 transition-colors"
              aria-label={playing ? 'Pause' : 'Play'}
            >
              {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 fill-white" />}
            </button>

            <button
              onClick={(e) => { e.stopPropagation(); cycleSpeed() }}
              className={cn(
                'px-2 py-1 rounded-md text-xs font-medium transition-colors min-w-[40px] flex items-center justify-center gap-1',
                isLive && speed === 1 ? 'text-white/40 cursor-default' : 'text-white hover:bg-white/20',
              )}
              aria-label={`Playback speed ${speed}x`}
              disabled={isLive && speed === 1 && speeds.length <= 1}
            >
              <Gauge className="h-3 w-3" />
              {speed}x
            </button>

            {subtitleTracks.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    onClick={(e) => e.stopPropagation()}
                    className={cn(
                      'p-1.5 rounded-md transition-colors',
                      activeSubtitle !== -1 ? 'text-white bg-white/20' : 'text-white hover:bg-white/20',
                    )}
                    aria-label="Subtitles"
                  >
                    <Subtitles className="h-4 w-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  side="top"
                  sideOffset={8}
                  align="end"
                  className="bg-black/80 border-white/20 text-white min-w-[120px]"
                  onClick={(e) => e.stopPropagation()}
                >
                  <DropdownMenuRadioGroup
                    value={String(activeSubtitle)}
                    onValueChange={(v) => selectSubtitle(Number(v))}
                  >
                    <DropdownMenuRadioItem value="-1">Off</DropdownMenuRadioItem>
                    {subtitleTracks.map((t) => (
                      <DropdownMenuRadioItem key={t.id} value={String(t.id)}>
                        {t.name}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            {showExportButton && duration > 0 && (
              <button
                onClick={(e) => { e.stopPropagation(); toggleClipMode() }}
                className={cn(
                  'p-1.5 rounded-md transition-colors',
                  clipMode ? 'text-white bg-blue-600' : 'text-white hover:bg-white/20',
                )}
                aria-label="Export clip"
              >
                <Scissors className="h-4 w-4" />
              </button>
            )}

            <div className="flex-1" />

            <button
              onClick={(e) => { e.stopPropagation(); toggleMute() }}
              className="p-1.5 rounded-md text-white hover:bg-white/20 transition-colors"
              aria-label={muted ? 'Unmute' : 'Mute'}
            >
              {muted || volume === 0 ? (
                <VolumeX className="h-4 w-4" />
              ) : (
                <Volume2 className="h-4 w-4" />
              )}
            </button>
            <Slider
              value={[muted ? 0 : volume * 100]}
              max={100}
              step={1}
              onValueChange={handleVolumeChange}
              className="w-20 cursor-pointer"
              trackClassName="h-1"
              thumbClassName="h-3 w-3"
            />

            <button
              onClick={(e) => { e.stopPropagation(); captureScreenshot() }}
              className="p-1.5 rounded-md text-white hover:bg-white/20 transition-colors"
              aria-label="Take screenshot"
            >
              <Camera className="h-4 w-4" />
            </button>

            <button
              onClick={(e) => { e.stopPropagation(); toggleFullscreen() }}
              className="p-1.5 rounded-md text-white hover:bg-white/20 transition-colors"
              aria-label={fullscreen ? 'Exit fullscreen' : 'Fullscreen'}
            >
              {fullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
