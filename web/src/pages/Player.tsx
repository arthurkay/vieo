import { useParams, useNavigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import VideoPlayer from '@/components/VideoPlayer'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ArrowLeft } from 'lucide-react'

export default function Player() {
  const { outputId } = useParams<{ outputId: string }>()
  const navigate = useNavigate()
  const id = parseInt(outputId || '0')
  const [jobStatus, setJobStatus] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    fetch('/api/jobs')
      .then((r) => r.json())
      .then((jobs) => {
        if (!active) return
        const found = jobs?.find((j: { output_id: number }) => j.output_id === id)
        if (found) setJobStatus(found.status)
      })
      .catch(() => {})
    return () => { active = false }
  }, [id])

  const isLive = jobStatus === 'running'

  return (
    <div className="h-full flex flex-col bg-background">
      <div className="flex items-center gap-4 p-4 border-b shrink-0">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back
        </Button>
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold">Stream Player</h1>
          {jobStatus && <Badge variant={jobStatus as 'pending' | 'running' | 'paused' | 'completed' | 'failed' | 'stopped'}>{jobStatus}</Badge>}
        </div>
      </div>
      <div className="flex-1 p-4 min-h-0">
        <VideoPlayer
          streamUrl={`/api/stream/${id}/playlist.m3u8`}
          posterUrl={`/api/stream/${id}/thumb.jpg`}
          isLive={isLive}
          className="w-full h-full max-h-[calc(100vh-8rem)]"
        />
      </div>
    </div>
  )
}
