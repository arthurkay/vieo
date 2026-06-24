import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useWebSocket } from '@/hooks/use-websocket'
import { Trash2, StopCircle, Pause, Play, RotateCcw, PlayCircle } from 'lucide-react'
import type { Job } from '@/types'
import { Skeleton } from '@/components/ui/skeleton'

export default function Jobs() {
  const queryClient = useQueryClient()
  const [statusFilter, setStatusFilter] = useState('')

  const { data: jobs, isLoading } = useQuery({
    queryKey: ['jobs', statusFilter],
    queryFn: () => api.jobs.list(statusFilter || undefined),
  })

  const stopMutation = useMutation({
    mutationFn: (id: number) => api.jobs.stop(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['jobs'] }),
    onError: (err: Error) => alert(`Stop failed: ${err.message}`),
  })

  const pauseMutation = useMutation({
    mutationFn: (id: number) => api.jobs.pause(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['jobs'] }),
    onError: (err: Error) => alert(`Pause failed: ${err.message}`),
  })

  const resumeMutation = useMutation({
    mutationFn: (id: number) => api.jobs.resume(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['jobs'] }),
    onError: (err: Error) => alert(`Resume failed: ${err.message}`),
  })

  const retryMutation = useMutation({
    mutationFn: (id: number) => api.jobs.retry(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['jobs'] }),
    onError: (err: Error) => alert(`Retry failed: ${err.message}`),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.jobs.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['jobs'] }),
    onError: (err: Error) => alert(`Delete failed: ${err.message}`),
  })

  useWebSocket((event) => {
    const payload = event.payload as { id?: number; status?: string; progress?: number; error?: string }
    if (!payload?.id) return

    if (event.type === 'job:update') {
      queryClient.setQueryData<Job[]>(['jobs', statusFilter], (old) =>
        old?.map((j) =>
          j.id === payload.id
            ? { ...j, status: payload.status as Job['status'] ?? j.status, progress: payload.progress ?? j.progress }
            : j,
        ) ?? old,
      )
      return
    }

    if (event.type === 'job:log') {
      return
    }

    queryClient.invalidateQueries({ queryKey: ['jobs'] })
  })

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl md:text-3xl font-bold tracking-tight">Jobs</h2>
          <p className="text-muted-foreground">Monitor transcoding jobs</p>
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-40">
            <SelectValue placeholder="All Statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="running">Running</SelectItem>
            <SelectItem value="paused">Paused</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
            <SelectItem value="stopped">Stopped</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-3">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="py-4 space-y-2">
                <Skeleton className="h-5 w-48" />
                <Skeleton className="h-4 w-64" />
                <Skeleton className="h-2 w-full" />
              </CardContent>
            </Card>
          ))
        ) : jobs && jobs.length > 0 ? (
          jobs.map((job) => (
            <JobCard
              key={job.id}
              job={job}
              onStop={() => stopMutation.mutate(job.id)}
              onPause={() => pauseMutation.mutate(job.id)}
              onResume={() => resumeMutation.mutate(job.id)}
              onRetry={() => retryMutation.mutate(job.id)}
              onDelete={() => deleteMutation.mutate(job.id)}
            />
          ))
        ) : (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              No jobs found
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}

function JobCard({
  job,
  onStop,
  onPause,
  onResume,
  onRetry,
  onDelete,
}: {
  job: Job
  onStop: () => void
  onPause: () => void
  onResume: () => void
  onRetry: () => void
  onDelete: () => void
}) {
  const navigate = useNavigate()
  const isRunning = job.status === 'running'
  const isPending = job.status === 'pending'
  const isPaused = job.status === 'paused'
  const isActive = isPending || isRunning || isPaused
  const canRetry = job.status === 'failed' || job.status === 'stopped' || job.status === 'completed'
  const canPlay = (isRunning || isPaused || job.status === 'completed') && job.output_id

  return (
    <Card>
      <CardContent className="py-4">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-medium shrink-0">Job #{job.id}</span>
            <Badge variant={job.status as 'pending' | 'running' | 'paused' | 'completed' | 'failed' | 'stopped'}>{job.status}</Badge>
          </div>
          <div className="flex gap-1 shrink-0">
            {canPlay && (
              <Button variant="ghost" size="sm" className="min-h-9 min-w-9" onClick={() => navigate(`/player/${job.output_id}`)} title="Play">
                <Play className="h-4 w-4" />
              </Button>
            )}
            {isRunning && (
              <Button variant="ghost" size="sm" className="min-h-9 min-w-9" onClick={onPause} title="Pause">
                <Pause className="h-4 w-4" />
              </Button>
            )}
            {isPaused && (
              <Button variant="ghost" size="sm" className="min-h-9 min-w-9" onClick={onResume} title="Resume">
                <PlayCircle className="h-4 w-4" />
              </Button>
            )}
            {isActive && (
              <Button variant="ghost" size="sm" className="min-h-9 min-w-9" onClick={onStop} title="Stop">
                <StopCircle className="h-4 w-4" />
              </Button>
            )}
            {canRetry && (
              <Button variant="ghost" size="sm" className="min-h-9 min-w-9" onClick={onRetry} title="Retry">
                <RotateCcw className="h-4 w-4" />
              </Button>
            )}
            <Button variant="ghost" size="sm" className="min-h-9 min-w-9" onClick={onDelete} title="Delete">
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-1 sm:gap-4 text-sm text-muted-foreground mb-2">
          <div>Source #{job.source_id}</div>
          <div>Output #{job.output_id}</div>
          <div>{new Date(job.created_at).toLocaleString()}</div>
        </div>

        {(isRunning || isPaused) && <Progress value={job.progress * 100} className="h-2" />}

        {job.error_msg && (
          <p className="text-sm text-destructive mt-2 break-all">{job.error_msg}</p>
        )}
      </CardContent>
    </Card>
  )
}
