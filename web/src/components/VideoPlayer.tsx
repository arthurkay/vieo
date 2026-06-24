import { useEffect, useRef, useState } from 'react'
import Hls from 'hls.js'
import { cn } from '@/lib/utils'
import { Loader2 } from 'lucide-react'

interface VideoPlayerProps {
  streamUrl: string
  posterUrl?: string
  isLive?: boolean
  className?: string
}

export default function VideoPlayer({ streamUrl, posterUrl, isLive = false, className = '' }: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const retryCountRef = useRef(0)
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isLiveRef = useRef(isLive)

  isLiveRef.current = isLive

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
    }

    if (Hls.isSupported()) {
      attachHls()
    } else if (video!.canPlayType('application/vnd.apple.mpegurl')) {
      video!.src = streamUrl
      const onLoaded = () => {
        if (destroyed) return
        setStatus('ready')
        video!.play().catch(() => {})
      }
      video!.addEventListener('loadedmetadata', onLoaded, { once: true })
    }

    return () => {
      destroyed = true
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current)
        retryTimerRef.current = null
      }
      hls?.destroy()
    }
  }, [streamUrl])

  return (
    <div className={cn('relative bg-background rounded-md overflow-hidden', className)}>
      <video
        ref={videoRef}
        className="w-full h-full object-contain"
        controls={status === 'ready'}
        playsInline
        poster={posterUrl}
      />
      {status === 'loading' && posterUrl && (
        <img
          src={posterUrl}
          alt=""
          className="absolute inset-0 w-full h-full object-contain"
        />
      )}
      {status === 'loading' && !posterUrl && (
        <div className="absolute inset-0 flex items-center justify-center">
          <Loader2 className="h-8 w-8 text-white animate-spin" />
        </div>
      )}
      {status === 'error' && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60">
          <span className="text-sm text-white/80">Stream unavailable</span>
        </div>
      )}
    </div>
  )
}
