import { useEffect, useRef, useState, useCallback } from 'react'
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
} from 'lucide-react'

interface VideoPlayerProps {
  streamUrl: string
  posterUrl?: string
  isLive?: boolean
  className?: string
  startTime?: string
}

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return '0:00'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }
  return `${m}:${String(s).padStart(2, '0')}`
}

const SPEEDS = [0.5, 1, 1.5, 2]
const THUMB_WIDTH = 160
const THUMB_HEIGHT = 90

export default function VideoPlayer({
  streamUrl,
  posterUrl,
  isLive,
  className = '',
  startTime,
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const timelineRef = useRef<HTMLDivElement>(null)
  const thumbVideoRef = useRef<HTMLVideoElement>(null)
  const thumbCanvasRef = useRef<HTMLCanvasElement>(null)
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const thumbSeekTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const recoveryCountRef = useRef(0)

  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume] = useState(1)
  const [muted, setMuted] = useState(false)
  const [speed, setSpeed] = useState(1)
  const [fullscreen, setFullscreen] = useState(false)
  const [controlsVisible, setControlsVisible] = useState(true)
  const [seeking, setSeeking] = useState(false)
  const [seekValue, setSeekValue] = useState([0])

  const [thumbVisible, setThumbVisible] = useState(false)
  const [thumbX, setThumbX] = useState(0)
  const [thumbTime, setThumbTime] = useState(0)
  const [thumbReady, setThumbReady] = useState(false)

  const showControls = useCallback(() => {
    setControlsVisible(true)
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
    hideTimerRef.current = setTimeout(() => {
      if (videoRef.current && !videoRef.current.paused) {
        setControlsVisible(false)
      }
    }, 3000)
  }, [])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    let hls: Hls | null = null
    let durationInterval: ReturnType<typeof setInterval> | null = null
    recoveryCountRef.current = 0

    if (Hls.isSupported()) {
      hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
        liveDurationInfinity: false,
        maxBufferLength: 60,
        maxMaxBufferLength: 300,
        backBufferLength: Infinity,
        liveBackBufferLength: Infinity,
        maxBufferSize: 60 * 1024 * 1024,
      })
      hls.loadSource(streamUrl)
      hls.attachMedia(video)

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setDuration(video.duration)
        if (isLive) {
          durationInterval = setInterval(() => {
            if (video.duration && isFinite(video.duration)) {
              setDuration(video.duration)
            }
          }, 10000)
        }
      })

      hls.on(Hls.Events.FRAG_BUFFERED, () => {
        recoveryCountRef.current = 0
      })

      hls.on(Hls.Events.ERROR, (_event, data) => {
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
                hls.destroy()
                hls = new Hls({
                  enableWorker: true,
                  lowLatencyMode: false,
                  liveDurationInfinity: false,
                  maxBufferLength: 60,
                  maxMaxBufferLength: 300,
                  backBufferLength: Infinity,
                  liveBackBufferLength: Infinity,
                  maxBufferSize: 60 * 1024 * 1024,
                })
                hls.loadSource(streamUrl)
                hls.attachMedia(video)
                recoveryCountRef.current = 0
              }
              break
          }
        }
      })
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = streamUrl
    }

    return () => {
      if (durationInterval) clearInterval(durationInterval)
      hls?.destroy()
    }
  }, [streamUrl, isLive])

  useEffect(() => {
    const thumbVideo = thumbVideoRef.current
    if (!thumbVideo) return

    let hls: Hls | null = null

    if (Hls.isSupported()) {
      hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
        maxBufferLength: 10,
        maxMaxBufferLength: 10,
      })
      hls.loadSource(streamUrl)
      hls.attachMedia(thumbVideo)
    } else if (thumbVideo.canPlayType('application/vnd.apple.mpegurl')) {
      thumbVideo.src = streamUrl
    }

    return () => {
      hls?.destroy()
    }
  }, [streamUrl])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const onPlay = () => setPlaying(true)
    const onPause = () => setPlaying(false)
    const onTimeUpdate = () => {
      if (!seeking) {
        setCurrentTime(video.currentTime)
      }
    }
    const onDurationChange = () => setDuration(video.duration)
    const onEnded = () => setPlaying(false)
    const onVolumeChange = () => {
      setVolume(video.volume)
      setMuted(video.muted)
    }

    video.addEventListener('play', onPlay)
    video.addEventListener('pause', onPause)
    video.addEventListener('timeupdate', onTimeUpdate)
    video.addEventListener('durationchange', onDurationChange)
    video.addEventListener('ended', onEnded)
    video.addEventListener('volumechange', onVolumeChange)

    return () => {
      video.removeEventListener('play', onPlay)
      video.removeEventListener('pause', onPause)
      video.removeEventListener('timeupdate', onTimeUpdate)
      video.removeEventListener('durationchange', onDurationChange)
      video.removeEventListener('ended', onEnded)
      video.removeEventListener('volumechange', onVolumeChange)
    }
  }, [seeking])

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
      if (thumbSeekTimerRef.current) clearTimeout(thumbSeekTimerRef.current)
      if (videoRef.current && !videoRef.current.paused) {
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
    const idx = SPEEDS.indexOf(speed)
    const next = SPEEDS[(idx + 1) % SPEEDS.length]
    video.playbackRate = next
    setSpeed(next)
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
    video.currentTime = value[0]
    setCurrentTime(value[0])
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

  function handleTimelineHover(e: React.MouseEvent) {
    const timeline = timelineRef.current
    const thumbVideo = thumbVideoRef.current
    const canvas = thumbCanvasRef.current
    if (!timeline || !thumbVideo || !canvas) return

    const rect = timeline.getBoundingClientRect()
    const x = e.clientX - rect.left
    const pct = Math.max(0, Math.min(1, x / rect.width))
    const time = pct * duration

    setThumbX(e.clientX - containerRef.current!.getBoundingClientRect().left)
    setThumbTime(time)
    setThumbVisible(true)
    setThumbReady(false)

    if (thumbSeekTimerRef.current) clearTimeout(thumbSeekTimerRef.current)
    thumbSeekTimerRef.current = setTimeout(() => {
      thumbVideo.currentTime = time
    }, 50)
  }

  function handleTimelineLeave() {
    setThumbVisible(false)
    if (thumbSeekTimerRef.current) clearTimeout(thumbSeekTimerRef.current)
  }

  useEffect(() => {
    const thumbVideo = thumbVideoRef.current
    const canvas = thumbCanvasRef.current
    if (!thumbVideo || !canvas) return

    function drawFrame() {
      const ctx = canvas!.getContext('2d')
      if (!ctx || !thumbVideo!.videoWidth) return
      canvas!.width = THUMB_WIDTH
      canvas!.height = THUMB_HEIGHT
      ctx.drawImage(thumbVideo!, 0, 0, THUMB_WIDTH, THUMB_HEIGHT)
      setThumbReady(true)
    }

    thumbVideo.addEventListener('seeked', drawFrame)
    return () => thumbVideo.removeEventListener('seeked', drawFrame)
  }, [])

  const seekProgress = seeking ? seekValue[0] : currentTime

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

      {/* Hidden video for thumbnail generation */}
      <video
        ref={thumbVideoRef}
        className="hidden"
        muted
        playsInline
      />
      <canvas ref={thumbCanvasRef} className="hidden" />

      {/* Thumbnail preview */}
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
            {thumbReady ? (
              <canvas
                ref={(el) => {
                  if (el && thumbCanvasRef.current) {
                    const ctx = el.getContext('2d')
                    const srcCtx = thumbCanvasRef.current.getContext('2d')
                    if (ctx && srcCtx) {
                      el.width = THUMB_WIDTH
                      el.height = THUMB_HEIGHT
                      ctx.drawImage(thumbCanvasRef.current, 0, 0)
                    }
                  }
                }}
                width={THUMB_WIDTH}
                height={THUMB_HEIGHT}
                className="block"
              />
            ) : (
              <div
                className="flex items-center justify-center bg-black/80"
                style={{ width: THUMB_WIDTH, height: THUMB_HEIGHT }}
              >
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              </div>
            )}
            <div className="text-center text-white text-xs font-mono py-1 bg-black/80">
              {formatTime(thumbTime)}
            </div>
          </div>
        </div>
      )}

      {/* Top overlay */}
      <div
        className={cn(
          'absolute top-0 left-0 right-0 z-20 flex items-center justify-between p-3 transition-opacity duration-300',
          controlsVisible ? 'opacity-100' : 'opacity-0 pointer-events-none',
        )}
      >
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
        <span className="bg-black/60 text-white px-2 py-0.5 text-xs font-semibold rounded shadow ml-auto">
          Vieo
        </span>
      </div>

      {/* Center play indicator */}
      {!playing && (
        <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
          <div className="bg-black/40 rounded-full p-4">
            <Play className="h-10 w-10 text-white fill-white" />
          </div>
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
          {/* Timeline */}
          <div
            ref={timelineRef}
            className="flex items-center gap-3 mb-2"
            onMouseMove={(e) => handleTimelineHover(e)}
            onMouseLeave={handleTimelineLeave}
          >
            <span className="text-white text-xs font-mono tabular-nums w-16 text-right shrink-0">
              {formatTime(seekProgress)}
            </span>
            <Slider
              value={[seekProgress]}
              max={duration || 100}
              step={0.1}
              onValueChange={handleSeekChange}
              onPointerDown={handleSeekStart}
              onPointerUp={(e) => {
                handleSeekEnd(seekValue)
                ;(e.target as HTMLElement).releasePointerCapture(e.pointerId)
              }}
              className="flex-1 cursor-pointer"
              trackClassName="h-1.5"
              thumbClassName="h-3.5 w-3.5"
            />
            <span className="text-white/60 text-xs font-mono tabular-nums w-16 shrink-0">
              {formatTime(duration)}
            </span>
          </div>

          {/* Bottom row */}
          <div className="flex items-center gap-1">
            {/* Play/Pause */}
            <button
              onClick={(e) => { e.stopPropagation(); togglePlay() }}
              className="p-1.5 rounded-md text-white hover:bg-white/20 transition-colors"
              aria-label={playing ? 'Pause' : 'Play'}
            >
              {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 fill-white" />}
            </button>

            {/* Speed */}
            <button
              onClick={(e) => { e.stopPropagation(); cycleSpeed() }}
              className="px-2 py-1 rounded-md text-white text-xs font-medium hover:bg-white/20 transition-colors min-w-[40px] flex items-center justify-center gap-1"
              aria-label={`Playback speed ${speed}x`}
            >
              <Gauge className="h-3 w-3" />
              {speed}x
            </button>

            {/* Spacer */}
            <div className="flex-1" />

            {/* Volume */}
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

            {/* Screenshot */}
            <button
              onClick={(e) => { e.stopPropagation(); captureScreenshot() }}
              className="p-1.5 rounded-md text-white hover:bg-white/20 transition-colors"
              aria-label="Take screenshot"
            >
              <Camera className="h-4 w-4" />
            </button>

            {/* Fullscreen */}
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
