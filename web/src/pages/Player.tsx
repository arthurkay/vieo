import { useParams, useNavigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import VideoPlayer from '@/components/VideoPlayer'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { ArrowLeft, Radio, Activity, Clock } from 'lucide-react'
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

  const isLive = jobStatus === 'running'

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
          <h1 className="text-base sm:text-lg font-semibold truncate">Stream Player</h1>
          {jobStatus && <Badge variant={jobStatus}>{jobStatus}</Badge>}
        </div>
      </div>

      <div className="flex-1 flex min-h-0">
        <div className="flex-1 p-2 sm:p-4 min-h-0">
          <VideoPlayer
            streamUrl={`/api/stream/${id}/playlist.m3u8`}
            posterUrl={`/api/stream/${id}/thumb.jpg`}
            isLive={isLive}
            className="w-full h-full max-h-[calc(100vh-5rem)] sm:max-h-[calc(100vh-8rem)]"
          />
        </div>

        <div className="hidden lg:flex w-64 border-l flex-col p-4 gap-4">
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
                <div className="text-xs text-muted-foreground mb-1">Started</div>
                <div className="flex items-center gap-2 text-sm">
                  <Clock className="h-4 w-4" />
                  {new Date(job.created_at).toLocaleTimeString()}
                </div>
              </CardContent>
            </Card>
          )}

          {job?.progress !== undefined && (isLive || jobStatus === 'paused') && (
            <Card className="bg-muted/50">
              <CardContent className="p-4">
                <div className="text-xs text-muted-foreground mb-1">Progress</div>
                <div className="text-2xl font-bold">{Math.round(job.progress * 100)}%</div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
