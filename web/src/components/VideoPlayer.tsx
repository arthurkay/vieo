import { useEffect, useRef } from 'react'
import Hls from 'hls.js'

interface VideoPlayerProps {
  streamUrl: string
  posterUrl?: string
  isLive?: boolean
  className?: string
}

export default function VideoPlayer({
  streamUrl,
  posterUrl,
  isLive,
  className = '',
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    let hls: Hls | null = null

    if (Hls.isSupported()) {
      hls = new Hls()
      hls.loadSource(streamUrl)
      hls.attachMedia(video)
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        video.play().catch(() => {})
      })
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = streamUrl
      video.addEventListener('loadedmetadata', () => {
        video.play().catch(() => {})
      })
    }

    return () => {
      hls?.destroy()
    }
  }, [streamUrl])

  return (
    <div className={`relative bg-black rounded-lg overflow-hidden ${className}`}>
      <video
        ref={videoRef}
        className="w-full h-full object-contain"
        controls
        playsInline
        poster={posterUrl}
      />
      {isLive && (
        <div className="absolute top-3 left-3 z-10">
          <span className="bg-red-600 text-white px-2 py-0.5 text-xs font-bold rounded shadow-lg animate-pulse">
            LIVE
          </span>
        </div>
      )}
      <div className="absolute top-3 right-3 z-10">
        <span className="bg-black/60 text-white px-2 py-0.5 text-xs font-semibold rounded shadow">
          Vieo <br /> Media Streaming
        </span>
      </div>
    </div>
  )
}
