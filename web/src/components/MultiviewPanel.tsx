import { useEffect, useRef, useState, type MutableRefObject } from 'react'
import Hls from 'hls.js'
import { cn } from '@/lib/utils'
import { Volume2, VolumeX, Loader2 } from 'lucide-react'

interface MultiviewPanelProps {
  outputId: number
  sourceName: string
  streamType: 'audio_video' | 'audio_only' | 'video_only'
  isLive: boolean
  isListening: boolean
  onListen: () => void
  audioCtxRef: MutableRefObject<AudioContext | null>
  analyserRef: MutableRefObject<AnalyserNode | null>
}

type StatusKind = 'live' | 'recording' | 'offline'

function statusFor(isLive: boolean): StatusKind {
  return isLive ? 'live' : 'recording'
}

export default function MultiviewPanel({
  outputId,
  sourceName,
  streamType,
  isLive,
  isListening,
  onListen,
  audioCtxRef,
  analyserRef,
}: MultiviewPanelProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const hlsRef = useRef<Hls | null>(null)
  const sourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null)
  const rafRef = useRef<number | null>(null)
  const dataRef = useRef<Uint8Array<ArrayBuffer> | null>(null)

  const [resolution, setResolution] = useState('')
  const [meterLevel, setMeterLevel] = useState(0)
  const [buffering, setBuffering] = useState(true)

  const status = statusFor(isLive)
  const streamUrl = `/api/stream/${outputId}/playlist.m3u8`

  // HLS setup
  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    let hls: Hls | null = null
    let recoveryCount = 0

    function attachEvents(instance: Hls) {
      instance.on(Hls.Events.MANIFEST_PARSED, () => {
        setBuffering(false)
        video!.play().catch(() => {})
      })
      instance.on(Hls.Events.ERROR, (_event, data) => {
        if (!hls) return
        if (!data.fatal) return
        switch (data.type) {
          case Hls.ErrorTypes.NETWORK_ERROR:
            hls.startLoad()
            break
          case Hls.ErrorTypes.MEDIA_ERROR:
            hls.recoverMediaError()
            break
          default:
            recoveryCount++
            if (recoveryCount >= 3) {
              hls.destroy()
              const next = new Hls({
                enableWorker: true,
                lowLatencyMode: false,
                liveDurationInfinity: isLive,
                maxBufferLength: isLive ? 30 : 60,
                maxMaxBufferLength: isLive ? 120 : 300,
              })
              hlsRef.current = next
              hls = next
              next.loadSource(streamUrl)
              next.attachMedia(video!)
              attachEvents(next)
            }
            break
        }
      })
    }

    if (Hls.isSupported()) {
      hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
        liveDurationInfinity: isLive,
        maxBufferLength: isLive ? 30 : 60,
        maxMaxBufferLength: isLive ? 120 : 300,
      })
      hlsRef.current = hls
      hls.loadSource(streamUrl)
      hls.attachMedia(video)
      attachEvents(hls)
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = streamUrl
    }

    return () => {
      hlsRef.current = null
      hls?.destroy()
    }
  }, [streamUrl, isLive])

  // Audio routing + meter
  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    if (!isListening) {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
      if (sourceNodeRef.current && analyserRef.current) {
        try {
          sourceNodeRef.current.disconnect(analyserRef.current)
        } catch {
          /* ignore */
        }
      }
      setMeterLevel(0)
      return
    }

    const ctx = audioCtxRef.current
    const analyser = analyserRef.current
    if (!ctx || !analyser) {
      setMeterLevel(0)
      return
    }

    if (!sourceNodeRef.current) {
      try {
        sourceNodeRef.current = ctx.createMediaElementSource(video)
      } catch {
        sourceNodeRef.current = null
      }
    }

    if (sourceNodeRef.current) {
      try {
        sourceNodeRef.current.connect(analyser)
      } catch {
        /* already connected */
      }
    }

    if (!dataRef.current) {
      dataRef.current = new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount))
    }
    const data = dataRef.current

    const tick = () => {
      analyser.getByteFrequencyData(data)
      let sum = 0
      for (let i = 0; i < data.length; i++) {
        sum += data[i] * data[i]
      }
      const rms = Math.sqrt(sum / data.length) / 255
      setMeterLevel(rms)
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
      if (sourceNodeRef.current && analyserRef.current) {
        try {
          sourceNodeRef.current.disconnect(analyserRef.current)
        } catch {
          /* ignore */
        }
      }
    }
  }, [isListening, audioCtxRef, analyserRef])

  // Mute toggle
  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    video.muted = !isListening
  }, [isListening])

  const dbfs = meterLevel > 0 ? Math.round(20 * Math.log10(Math.max(meterLevel, 0.001))) : -60
  const meterColor =
    meterLevel > 0.6 ? 'bg-red-500' : meterLevel > 0.3 ? 'bg-yellow-400' : 'bg-green-500'

  const showVideo = streamType !== 'audio_only'

  return (
    <div
      onClick={onListen}
      className={cn(
        'relative aspect-video bg-black overflow-hidden cursor-pointer group select-none',
        isListening ? 'ring-2 ring-primary ring-inset' : 'ring-1 ring-white/10',
      )}
    >
      {showVideo && (
        <video
          ref={videoRef}
          className="w-full h-full object-contain"
          playsInline
          autoPlay
          muted={!isListening}
          onLoadedMetadata={(e) => {
            const v = e.currentTarget
            if (v.videoWidth && v.videoHeight) {
              setResolution(`${v.videoWidth}x${v.videoHeight}`)
            }
          }}
        />
      )}

      {!showVideo && (
        <div className="absolute inset-0 flex items-center justify-center text-white/30 text-xs">
          AUDIO ONLY
        </div>
      )}

      {buffering && showVideo && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/40">
          <Loader2 className="h-5 w-5 animate-spin text-white/70" />
        </div>
      )}

      {/* Top bar: name + status */}
      <div className="absolute top-0 left-0 right-0 flex items-center justify-between gap-1 px-1.5 py-1 bg-gradient-to-b from-black/80 to-transparent pointer-events-none">
        <span className="text-white text-[11px] font-medium truncate drop-shadow">
          {sourceName}
        </span>
        <StatusBadge status={status} />
      </div>

      {/* Audio meter bar (right edge) */}
      <div className="absolute right-1 top-1/2 -translate-y-1/2 flex flex-col items-center gap-1 pointer-events-none">
        {isListening ? (
          <div className="h-16 w-1.5 bg-white/20 rounded-full overflow-hidden flex flex-col-reverse">
            <div
              className={cn('w-full transition-[height] duration-75', meterColor)}
              style={{ height: `${meterLevel * 100}%` }}
            />
          </div>
        ) : (
          <VolumeX className="h-3.5 w-3.5 text-white/50" />
        )}
      </div>

      {/* Bottom bar: resolution + level */}
      <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between px-1.5 py-1 bg-gradient-to-t from-black/80 to-transparent pointer-events-none">
        <span className="text-white/80 text-[10px] font-mono drop-shadow">
          {resolution || '—'}
        </span>
        <span className="flex items-center gap-1 text-white/80 text-[10px] font-mono drop-shadow">
          {isListening ? <Volume2 className="h-3 w-3" /> : <VolumeX className="h-3 w-3" />}
          {dbfs} dBFS
        </span>
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: StatusKind }) {
  const config = {
    live: { label: 'LIVE', dot: 'bg-red-500', text: 'text-red-400' },
    recording: { label: 'REC', dot: 'bg-amber-500', text: 'text-amber-400' },
    offline: { label: 'OFFLINE', dot: 'bg-gray-500', text: 'text-gray-400' },
  }[status]

  return (
    <span className={cn('flex items-center gap-1 shrink-0', config.text)}>
      <span
        className={cn(
          'h-1.5 w-1.5 rounded-full',
          config.dot,
          status === 'live' && 'animate-pulse',
        )}
      />
      <span className="text-[10px] font-semibold tracking-wide">{config.label}</span>
    </span>
  )
}
