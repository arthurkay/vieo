import { useEffect, useRef, useState, useCallback } from 'react'
import Hls from 'hls.js'
import { cn } from '@/lib/utils'
import { Slider } from '@/components/ui/slider'
import {
  Loader2,
  AlertCircle,
  RefreshCw,
  Play,
  Pause,
  Volume2,
  Volume1,
  VolumeX,
  Maximize,
  Minimize,
  Radio,
} from 'lucide-react'

interface VideoPlayerProps {
  streamUrl: string
  posterUrl?: string
  isLive?: boolean
  watermark?: boolean
  className?: string
}

function formatTime(seconds: number): string {
  if (!isFinite(seconds)) return '0:00'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  return `${m}:${s.toString().padStart(2, '0')}`
}

export default function VideoPlayer({ streamUrl, posterUrl, isLive = false, watermark = false, className = '' }: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [playing, setPlaying] = useState(false)
  const [muted, setMuted] = useState(false)
  const [volume, setVolume] = useState(1)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [seeking, setSeeking] = useState(false)
  const [seekValue, setSeekValue] = useState(0)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [controlsVisible, setControlsVisible] = useState(true)
  const [buffered, setBuffered] = useState(0)
  const [liveEdge, setLiveEdge] = useState(true)

  const retryCountRef = useRef(0)
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isLiveRef = useRef(isLive)
  const hlsRef = useRef<Hls | null>(null)

  isLiveRef.current = isLive

  const showControls = useCallback(() => {
    setControlsVisible(true)
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
    hideTimerRef.current = setTimeout(() => {
      if (videoRef.current && !videoRef.current.paused) {
        setControlsVisible(false)
      }
    }, 3000)
  }, [])

  const togglePlay = useCallback(() => {
    const video = videoRef.current
    if (!video) return
    if (video.paused) {
      video.play().catch(() => {})
    } else {
      video.pause()
    }
  }, [])

  const toggleMute = useCallback(() => {
    const video = videoRef.current
    if (!video) return
    video.muted = !video.muted
    setMuted(video.muted)
  }, [])

  const handleVolumeChange = useCallback((value: number[]) => {
    const video = videoRef.current
    if (!video) return
    const vol = value[0] / 100
    video.volume = vol
    setVolume(vol)
    if (vol === 0) {
      video.muted = true
      setMuted(true)
    } else if (video.muted) {
      video.muted = false
      setMuted(false)
    }
  }, [])

  const handleSeekStart = useCallback(() => {
    setSeeking(true)
  }, [])

  const handleSeekChange = useCallback((value: number[]) => {
    setSeekValue(value[0])
  }, [])

  const handleSeekEnd = useCallback((value: number[]) => {
    const video = videoRef.current
    if (!video || !isFinite(duration)) return
    video.currentTime = (value[0] / 100) * duration
    setSeeking(false)
  }, [duration])

  const goToLiveEdge = useCallback(() => {
    const video = videoRef.current
    const hls = hlsRef.current
    if (!video || !hls) return
    if (hls.levels.length > 0) {
      hls.nextLevel = -1
    }
    video.currentTime = video.buffered.length > 0
      ? video.buffered.end(video.buffered.length - 1)
      : video.duration
  }, [])

  const toggleFullscreen = useCallback(() => {
    const container = containerRef.current
    if (!container) return
    if (document.fullscreenElement) {
      document.exitFullscreen()
    } else {
      container.requestFullscreen()
    }
  }, [])

  useEffect(() => {
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onFsChange)
    return () => document.removeEventListener('fullscreenchange', onFsChange)
  }, [])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const onPlay = () => setPlaying(true)
    const onPause = () => { setPlaying(false); showControls() }
    const onTimeUpdate = () => {
      if (!seeking) setCurrentTime(video.currentTime)
    }
    const onDurationChange = () => setDuration(video.duration)
    const onVolumeChange = () => {
      setVolume(video.volume)
      setMuted(video.muted)
    }
    const onProgress = () => {
      if (video.buffered.length > 0) {
        setBuffered(video.buffered.end(video.buffered.length - 1))
      }
    }

    video.addEventListener('play', onPlay)
    video.addEventListener('pause', onPause)
    video.addEventListener('timeupdate', onTimeUpdate)
    video.addEventListener('durationchange', onDurationChange)
    video.addEventListener('volumechange', onVolumeChange)
    video.addEventListener('progress', onProgress)

    return () => {
      video.removeEventListener('play', onPlay)
      video.removeEventListener('pause', onPause)
      video.removeEventListener('timeupdate', onTimeUpdate)
      video.removeEventListener('durationchange', onDurationChange)
      video.removeEventListener('volumechange', onVolumeChange)
      video.removeEventListener('progress', onProgress)
    }
  }, [seeking, showControls])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    let hls: Hls | null = null
    let destroyed = false
    retryCountRef.current = 0

    setStatus('loading')

    function attachHls() {
      if (destroyed) return

      const live = isLiveRef.current

      hls = new Hls({
        liveSyncDurationCount: live ? 2 : undefined,
        liveMaxLatencyDurationCount: live ? 5 : undefined,
        enableWorker: true,
        lowLatencyMode: live,
        maxBufferLength: live ? 10 : 30,
        maxMaxBufferLength: live ? 20 : 60,
      })

      hlsRef.current = hls
      hls.loadSource(streamUrl)

      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (destroyed) return

        if (data.type === Hls.ErrorTypes.NETWORK_ERROR && data.details === Hls.ErrorDetails.MANIFEST_LOAD_ERROR) {
          if (retryCountRef.current < 5) {
            retryCountRef.current++
            const delay = Math.min(1000 * Math.pow(1.5, retryCountRef.current - 1), 8000)
            retryTimerRef.current = setTimeout(() => {
              hls?.destroy()
              attachHls()
            }, delay)
          } else {
            setStatus('error')
          }
          return
        }

        if (data.type === Hls.ErrorTypes.NETWORK_ERROR && data.fatal) {
          hls?.startLoad()
          return
        }

        if (data.type === Hls.ErrorTypes.MEDIA_ERROR && data.fatal) {
          if (hls?.recoverMediaError()) return
          hls?.destroy()
          attachHls()
          return
        }

        if (data.type === Hls.ErrorTypes.NETWORK_ERROR &&
          (data.details === Hls.ErrorDetails.FRAG_LOAD_ERROR || data.details === Hls.ErrorDetails.FRAG_LOAD_TIMEOUT)) {
          hls?.startLoad()
          return
        }
      })

      hls.attachMedia(video!)

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        if (destroyed) return
        retryCountRef.current = 0
        setStatus('ready')
        video!.play().catch(() => {})
      })

      if (live) {
        hls.on(Hls.Events.FRAG_BUFFERED, () => {
          if (destroyed || !video!.buffered.length) return
          const liveEdgeTime = video!.buffered.end(video!.buffered.length - 1)
          const behind = liveEdgeTime - video!.currentTime
          setLiveEdge(behind < 5)
        })
      }
    }

    if (Hls.isSupported()) {
      attachHls()
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = streamUrl
      const onLoaded = () => {
        if (destroyed) return
        setStatus('ready')
        video.play().catch(() => {})
      }
      video.addEventListener('loadedmetadata', onLoaded, { once: true })
    }

    return () => {
      destroyed = true
      hlsRef.current = null
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current)
        retryTimerRef.current = null
      }
      hls?.destroy()
    }
  }, [streamUrl])

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return

      switch (e.key) {
        case ' ':
        case 'k':
          e.preventDefault()
          togglePlay()
          break
        case 'm':
          e.preventDefault()
          toggleMute()
          break
        case 'f':
          e.preventDefault()
          toggleFullscreen()
          break
        case 'ArrowLeft':
          e.preventDefault()
          if (videoRef.current) videoRef.current.currentTime -= 10
          break
        case 'ArrowRight':
          e.preventDefault()
          if (videoRef.current) videoRef.current.currentTime += 10
          break
        case 'ArrowUp':
          e.preventDefault()
          if (videoRef.current) {
            const vol = Math.min(1, videoRef.current.volume + 0.1)
            videoRef.current.volume = vol
            setVolume(vol)
          }
          break
        case 'ArrowDown':
          e.preventDefault()
          if (videoRef.current) {
            const vol = Math.max(0, videoRef.current.volume - 0.1)
            videoRef.current.volume = vol
            setVolume(vol)
          }
          break
      }
    }

    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [togglePlay, toggleMute, toggleFullscreen])

  useEffect(() => {
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
    }
  }, [])

  const handleRetry = () => {
    retryCountRef.current = 0
    setStatus('loading')
    const video = videoRef.current
    if (video) video.src = ''
  }

  const seekPercent = seeking ? seekValue : (isFinite(duration) && duration > 0 ? (currentTime / duration) * 100 : 0)
  const bufferedPercent = isFinite(duration) && duration > 0 ? (buffered / duration) * 100 : 0
  const volumePercent = muted ? 0 : volume * 100

  const VolumeIcon = muted || volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2

  return (
    <div
      ref={containerRef}
      className={cn('relative bg-black rounded-lg overflow-hidden group', className)}
      onMouseMove={showControls}
      onMouseLeave={() => {
        if (videoRef.current && !videoRef.current.paused) {
          setControlsVisible(false)
        }
      }}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest('.player-controls')) return
        togglePlay()
      }}
      onDoubleClick={(e) => {
        if ((e.target as HTMLElement).closest('.player-controls')) return
        toggleFullscreen()
      }}
    >
      <video
        ref={videoRef}
        className="w-full h-full object-contain"
        playsInline
        poster={posterUrl}
      />

      {/* Watermark overlay */}
      {watermark && (
        <div className="absolute top-3 right-3 pointer-events-none z-10" aria-hidden="true">
          <div className="text-[10px] font-mono tracking-widest uppercase text-white/25 select-none whitespace-nowrap">
            vieo streaming platform
          </div>
        </div>
      )}

      {/* Loading overlay */}
      {status === 'loading' && posterUrl && (
        <img src={posterUrl} alt="" className="absolute inset-0 w-full h-full object-contain opacity-50 pointer-events-none" />
      )}
      {status === 'loading' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 pointer-events-none">
          <Loader2 className="h-8 w-8 text-white/80 animate-spin" role="status" aria-label="Loading stream" />
          <span className="text-sm text-white/60">Connecting to stream...</span>
        </div>
      )}

      {/* Error overlay */}
      {status === 'error' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/70 pointer-events-none">
          <AlertCircle className="h-10 w-10 text-white/60" aria-hidden="true" />
          <span className="text-sm text-white/80 font-medium">Stream unavailable</span>
          <p className="text-xs text-white/50 text-center max-w-xs">The stream could not be loaded. It may be offline or the URL is incorrect.</p>
          <button
            onClick={handleRetry}
            className="mt-2 inline-flex items-center gap-2 rounded-md bg-white/10 px-3 py-1.5 text-sm text-white hover:bg-white/20 transition-colors pointer-events-auto"
          >
            <RefreshCw className="h-4 w-4" /> Retry
          </button>
        </div>
      )}

      {/* Live badge top-left */}
      {status === 'ready' && isLive && (
        <div className="absolute top-3 left-3 flex items-center gap-1.5 bg-red-600 text-white text-xs font-medium px-2 py-0.5 rounded pointer-events-none">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-white" />
          </span>
          LIVE
        </div>
      )}

      {/* Play icon overlay when paused */}
      {status === 'ready' && !playing && !controlsVisible && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="bg-black/40 rounded-full p-4">
            <Play className="h-10 w-10 text-white fill-white" />
          </div>
        </div>
      )}

      {/* Controls bar */}
      {status === 'ready' && (
        <div
          className={cn(
            'player-controls absolute bottom-0 left-0 right-0 transition-opacity duration-300',
            controlsVisible ? 'opacity-100' : 'opacity-0 pointer-events-none',
          )}
        >
          {/* Gradient fade */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent pointer-events-none" />

          <div className="relative px-4 pb-3 pt-8">
            {/* Seek bar */}
            <div className="mb-2 group/seek">
              <Slider
                value={[seekPercent]}
                max={100}
                step={0.1}
                onValueChange={handleSeekChange}
                onPointerDown={handleSeekStart}
                onValueCommit={handleSeekEnd}
                className="cursor-pointer"
              />
              <div className="h-1 mt-1 bg-white/20 rounded-full relative">
                <div
                  className="absolute h-full bg-white/30 rounded-full"
                  style={{ width: `${bufferedPercent}%` }}
                />
              </div>
            </div>

            {/* Bottom row */}
            <div className="flex items-center gap-2">
              {/* Play/Pause */}
              <button
                onClick={(e) => { e.stopPropagation(); togglePlay() }}
                className="text-white hover:text-white/80 transition-colors"
                aria-label={playing ? 'Pause' : 'Play'}
              >
                {playing ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5 fill-white" />}
              </button>

              {/* Volume */}
              <div className="flex items-center gap-1.5 group/vol">
                <button
                  onClick={(e) => { e.stopPropagation(); toggleMute() }}
                  className="text-white hover:text-white/80 transition-colors"
                  aria-label={muted ? 'Unmute' : 'Mute'}
                >
                  <VolumeIcon className="h-5 w-5" />
                </button>
                <div className="w-0 overflow-hidden group-hover/vol:w-20 transition-all duration-200">
                  <Slider
                    value={[volumePercent]}
                    max={100}
                    step={1}
                    onValueChange={handleVolumeChange}
                    className="cursor-pointer"
                  />
                </div>
              </div>

              {/* Time */}
              <span className="text-xs text-white/80 font-mono select-none ml-1">
                {formatTime(currentTime)} / {formatTime(duration)}
              </span>

              {/* Spacer */}
              <div className="flex-1" />

              {/* Go Live */}
              {isLive && !liveEdge && (
                <button
                  onClick={(e) => { e.stopPropagation(); goToLiveEdge() }}
                  className="flex items-center gap-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-medium px-2 py-1 rounded transition-colors"
                >
                  <Radio className="h-3 w-3" /> Go Live
                </button>
              )}

              {/* Fullscreen */}
              <button
                onClick={(e) => { e.stopPropagation(); toggleFullscreen() }}
                className="text-white hover:text-white/80 transition-colors"
                aria-label={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
              >
                {isFullscreen ? <Minimize className="h-5 w-5" /> : <Maximize className="h-5 w-5" />}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
