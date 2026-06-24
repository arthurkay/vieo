import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { Button } from '../components/ui/button'
import { Card, CardContent } from '../components/ui/card'
import { Select } from '../components/ui/select'
import JobStatusBadge from '../components/JobStatusBadge'
import ProgressBar from '../components/ProgressBar'
import { useWebSocket } from '../hooks/use-websocket'
import { Trash2, StopCircle, Pause, RotateCcw, Play } from 'lucide-react'
import type { Job } from '../types'

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
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Jobs</h2>
          <p className="text-muted-foreground">Monitor transcoding jobs</p>
        </div>
        <Select
          options={[
            { value: '', label: 'All Statuses' },
            { value: 'pending', label: 'Pending' },
            { value: 'running', label: 'Running' },
            { value: 'paused', label: 'Paused' },
            { value: 'completed', label: 'Completed' },
            { value: 'failed', label: 'Failed' },
            { value: 'stopped', label: 'Stopped' },
          ]}
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="w-40"
        />
      </div>

      <div className="space-y-3">
        {isLoading ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              Loading jobs...
            </CardContent>
          </Card>
        ) : jobs && jobs.length > 0 ? (
          jobs.map((job) => (
            <JobCard
              key={job.id}
              job={job}
              onStop={() => stopMutation.mutate(job.id)}
              onPause={() => pauseMutation.mutate(job.id)}
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
  onRetry,
  onDelete,
}: {
  job: Job
  onStop: () => void
  onPause: () => void
  onRetry: () => void
  onDelete: () => void
}) {
  const navigate = useNavigate()
  const isRunning = job.status === 'running'
  const isPending = job.status === 'pending'
  const isPaused = job.status === 'paused'
  const isActive = isPending || isRunning || isPaused
  const canRetry = job.status === 'failed' || job.status === 'stopped' || job.status === 'completed'
  const canPlay = (isRunning || job.status === 'completed') && job.output_id

  return (
    <Card>
      <CardContent className="py-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            <span className="font-medium">Job #{job.id}</span>
            <JobStatusBadge status={job.status} />
          </div>
          <div className="flex gap-1">
            {canPlay && (
              <Button variant="ghost" size="sm" onClick={() => navigate(`/player/${job.output_id}`)} title="Play">
                <Play className="h-3 w-3" />
              </Button>
            )}
            {isRunning && (
              <Button variant="ghost" size="sm" onClick={onPause} title="Pause">
                <Pause className="h-3 w-3" />
              </Button>
            )}
            {isActive && (
              <Button variant="ghost" size="sm" onClick={onStop} title="Stop">
                <StopCircle className="h-3 w-3" />
              </Button>
            )}
            {canRetry && (
              <Button variant="ghost" size="sm" onClick={onRetry} title="Retry">
                <RotateCcw className="h-3 w-3" />
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={onDelete} title="Delete">
              <Trash2 className="h-3 w-3 text-destructive" />
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4 text-sm text-muted-foreground mb-2">
          <div>Source #{job.source_id}</div>
          <div>Output #{job.output_id}</div>
          <div>{new Date(job.created_at).toLocaleString()}</div>
        </div>

        {(isRunning || isPaused) && <ProgressBar progress={job.progress} />}

        {job.error_msg && (
          <p className="text-sm text-destructive mt-2">{job.error_msg}</p>
        )}
      </CardContent>
    </Card>
  )
}
