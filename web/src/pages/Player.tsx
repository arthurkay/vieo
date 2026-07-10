import { useParams, useNavigate } from 'react-router-dom'
import { useState, useEffect, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import VideoPlayer from '@/components/VideoPlayer'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { ArrowLeft, Radio, Activity, Clock, Calendar } from 'lucide-react'
import type { JobStatus } from '@/types'

function SourceName({ sourceId }: { sourceId: number }) {
  const { data: sources } = useQuery({
    queryKey: ['sources'],
    queryFn: () => api.sources.list(),
  })
  const source = sources?.find((s) => s.id === sourceId)
  if (!source) return <div className="text-sm">#{sourceId}</div>
  return <div className="text-sm">{source.name || `#${source.id}`}</div>
}

export default function Player() {
  const { outputId } = useParams<{ outputId: string }>()
  const navigate = useNavigate()
  const id = parseInt(outputId || '0')
  const [jobStatus, setJobStatus] = useState<JobStatus | null>(null)

  const [jumpDate, setJumpDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [jumpTime, setJumpTime] = useState(() => new Date().toTimeString().slice(0, 8))
  const [showJump, setShowJump] = useState(false)

  const { data: jobs } = useQuery({
    queryKey: ['jobs'],
    queryFn: () => api.jobs.list(),
  })

  const job = jobs?.find((j) => j.output_id === id && j.status !== 'stopped')

  useEffect(() => {
    if (job) {
      setJobStatus(job.status)
    }
  }, [job])

  useEffect(() => {
    if (job?.created_at) {
      const d = new Date(job.created_at)
      setJumpDate(d.toISOString().slice(0, 10))
      setJumpTime(d.toTimeString().slice(0, 8))
      setShowJump(true)
    }
  }, [job?.created_at])

  const isLive = jobStatus === 'running'

  const handleJump = useCallback(() => {
    if (!job?.created_at) return
    const target = new Date(`${jumpDate}T${jumpTime}`).getTime()
    const start = new Date(job.created_at).getTime()
    const offsetSec = (target - start) / 1000
    if (offsetSec >= 0) {
      const video = document.querySelector('video')
      if (video) {
        video.currentTime = offsetSec
        video.play().catch(() => {})
      }
    }
  }, [job?.created_at, jumpDate, jumpTime])

  return (
    <div className="h-full flex flex-col bg-background">
      <div className="flex items-center gap-2 sm:gap-4 p-3 sm:p-4 border-b shrink-0">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="min-h-9 shrink-0" aria-label="Go back">
          <ArrowLeft className="h-4 w-4 sm:mr-1" />
          <span className="hidden sm:inline">Back</span>
        </Button>
        <Separator orientation="vertical" className="h-6" />
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <Radio className="h-4 w-4 text-muted-foreground shrink-0" />
          <h1 className="text-base sm:text-lg font-semibold truncate">
            {job ? (job.source_id ? `Stream #${job.source_id}` : 'Stream') : 'Player'}
          </h1>
          {jobStatus && <Badge variant={jobStatus}>{jobStatus}</Badge>}
        </div>

        {showJump && !isLive && (
          <div className="ml-auto flex items-center gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground hidden sm:block" />
            <Input
              type="date"
              value={jumpDate}
              onChange={(e) => setJumpDate(e.target.value)}
              className="h-8 w-[140px] text-xs"
            />
            <Input
              type="time"
              value={jumpTime}
              onChange={(e) => setJumpTime(e.target.value)}
              step={1}
              className="h-8 w-[110px] text-xs"
            />
            <Button size="sm" className="h-8" onClick={handleJump}>
              Go
            </Button>
          </div>
        )}
      </div>

      <div className="flex-1 flex min-h-0">
        <div className="flex-1 p-2 sm:p-4 min-h-0">
          <VideoPlayer
            streamUrl={`/api/stream/${id}/playlist.m3u8`}
            posterUrl={`/api/stream/${id}/thumb.jpg`}
            isLive={isLive}
            startTime={job?.created_at}
            className="w-full h-full max-h-[calc(100vh-5rem)] sm:max-h-[calc(100vh-8rem)]"
          />
        </div>

        <div className="hidden lg:flex w-64 border-l flex-col p-4 gap-4 overflow-y-auto">
          <Card className="bg-muted/50">
            <CardContent className="p-4">
              <div className="text-xs text-muted-foreground mb-1">Output</div>
              <div className="font-medium text-sm">#{id}</div>
            </CardContent>
          </Card>

          <Card className="bg-muted/50">
            <CardContent className="p-4">
              <div className="text-xs text-muted-foreground mb-1">Status</div>
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4" />
                <span className="text-sm capitalize">{jobStatus || 'unknown'}</span>
              </div>
            </CardContent>
          </Card>

          {job && (
            <Card className="bg-muted/50">
              <CardContent className="p-4">
                <div className="text-xs text-muted-foreground mb-1">Source</div>
                <SourceName sourceId={job.source_id} />
              </CardContent>
            </Card>
          )}

          {job?.created_at && (
            <Card className="bg-muted/50">
              <CardContent className="p-4">
                <div className="text-xs text-muted-foreground mb-1">Recording Started</div>
                <div className="flex items-center gap-2 text-sm">
                  <Clock className="h-4 w-4" />
                  <div>
                    <div>{new Date(job.created_at).toLocaleDateString()}</div>
                    <div className="text-muted-foreground">{new Date(job.created_at).toLocaleTimeString()}</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {isLive && (
            <Card className="bg-muted/50">
              <CardContent className="p-4">
                <div className="text-xs text-muted-foreground mb-1">Live</div>
                <div className="flex items-center gap-2 text-sm">
                  <Radio className="h-4 w-4 text-red-500 animate-pulse" />
                  <span>Recording in progress</span>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
