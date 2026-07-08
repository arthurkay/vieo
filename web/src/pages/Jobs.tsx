import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { useWebSocket } from '@/hooks/use-websocket'
import { Skeleton } from '@/components/ui/skeleton'
import { MoreHorizontal, Play, Pause, PlayCircle, StopCircle, RotateCcw, Trash2, FileText } from 'lucide-react'
import type { Job, JobStatus, JobLog } from '@/types'

const VALID_STATUSES: JobStatus[] = ['pending', 'running', 'paused', 'completed', 'failed', 'stopped']
function isValidStatus(s: string): s is JobStatus {
  return (VALID_STATUSES as string[]).includes(s)
}

const STATUS_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'running', label: 'Running' },
  { value: 'completed', label: 'Completed' },
  { value: 'failed', label: 'Failed' },
  { value: 'paused', label: 'Paused' },
  { value: 'pending', label: 'Pending' },
  { value: 'stopped', label: 'Stopped' },
] as const

export default function Jobs() {
  const queryClient = useQueryClient()
  const [statusFilter, setStatusFilter] = useState('all')

  const { data: jobs, isLoading } = useQuery({
    queryKey: ['jobs', statusFilter],
    queryFn: () => api.jobs.list(statusFilter === 'all' ? undefined : statusFilter),
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
    if (event.type === 'job:update') {
      const payload = event.payload as { id?: number; status?: string; progress?: number }
      if (!payload?.id) return
      const status = payload.status
      queryClient.setQueryData<Job[]>(['jobs', statusFilter], (old) =>
        old?.map((j) =>
          j.id === payload.id
            ? { ...j, status: isValidStatus(status ?? '') ? status as JobStatus : j.status, progress: payload.progress ?? j.progress }
            : j,
        ) ?? old,
      )
      return
    }
    if (event.type === 'job:log') return
    queryClient.invalidateQueries({ queryKey: ['jobs'] })
  })

  return (
    <div className="flex flex-1 flex-col gap-4 py-4 md:gap-6 md:py-6">
      <div className="px-4 lg:px-6">
        <h2 className="text-2xl font-bold tracking-tight">Jobs</h2>
        <p className="text-muted-foreground">Monitor transcoding jobs</p>
      </div>

      <div className="px-4 lg:px-6">
        <Tabs value={statusFilter} onValueChange={setStatusFilter}>
          <TabsList>
            {STATUS_OPTIONS.map((opt) => (
              <TabsTrigger key={opt.value} value={opt.value}>
                {opt.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      <div className="px-4 lg:px-6">
        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-4 space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : jobs && jobs.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[80px]">ID</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Output</TableHead>
                    <TableHead className="w-[200px]">Progress</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {jobs.map((job) => (
                    <JobRow
                      key={job.id}
                      job={job}
                      onStop={() => stopMutation.mutate(job.id)}
                      onPause={() => pauseMutation.mutate(job.id)}
                      onResume={() => resumeMutation.mutate(job.id)}
                      onRetry={() => retryMutation.mutate(job.id)}
                      onDelete={() => { if (confirm('Delete this job?')) deleteMutation.mutate(job.id) }}
                    />
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="py-8 text-center text-muted-foreground">
                No jobs found
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function JobRow({
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
  const [showLogs, setShowLogs] = useState(false)
  const isRunning = job.status === 'running'
  const isPending = job.status === 'pending'
  const isPaused = job.status === 'paused'
  const isActive = isPending || isRunning || isPaused
  const canRetry = job.status === 'failed' || job.status === 'stopped' || job.status === 'completed'
  const canPlay = (isRunning || isPaused || job.status === 'completed') && job.output_id

  return (
    <>
      <TableRow>
        <TableCell className="font-medium">#{job.id}</TableCell>
        <TableCell><Badge variant={job.status}>{job.status}</Badge></TableCell>
        <TableCell>Source #{job.source_id}</TableCell>
        <TableCell>Output #{job.output_id}</TableCell>
        <TableCell>
          {(isRunning || isPaused) ? (
            <div className="flex items-center gap-2">
              <Progress value={job.progress * 100} className="h-2 flex-1" />
              <span className="text-xs text-muted-foreground w-10 text-right">{Math.round(job.progress * 100)}%</span>
            </div>
          ) : job.error_msg ? (
            <span className="text-xs text-destructive truncate block max-w-[200px]" title={job.error_msg}>{job.error_msg}</span>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          )}
        </TableCell>
        <TableCell className="text-muted-foreground text-sm">{new Date(job.created_at).toLocaleDateString()}</TableCell>
        <TableCell>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreHorizontal className="h-4 w-4" />
                <span className="sr-only">Actions</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {canPlay && (
                <DropdownMenuItem onClick={() => navigate(`/player/${job.output_id}`)}>
                  <Play className="mr-2 h-4 w-4" /> Play
                </DropdownMenuItem>
              )}
              {isRunning && (
                <DropdownMenuItem onClick={onPause}>
                  <Pause className="mr-2 h-4 w-4" /> Pause
                </DropdownMenuItem>
              )}
              {isPaused && (
                <DropdownMenuItem onClick={onResume}>
                  <PlayCircle className="mr-2 h-4 w-4" /> Resume
                </DropdownMenuItem>
              )}
              {isActive && (
                <DropdownMenuItem onClick={onStop}>
                  <StopCircle className="mr-2 h-4 w-4" /> Stop
                </DropdownMenuItem>
              )}
              {canRetry && (
                <DropdownMenuItem onClick={onRetry}>
                  <RotateCcw className="mr-2 h-4 w-4" /> Retry
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={() => setShowLogs(!showLogs)}>
                <FileText className="mr-2 h-4 w-4" /> {showLogs ? 'Hide Logs' : 'Show Logs'}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-destructive" onClick={onDelete}>
                <Trash2 className="mr-2 h-4 w-4" /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </TableCell>
      </TableRow>
      {showLogs && (
        <TableRow>
          <TableCell colSpan={7} className="p-0">
            <JobLogsPanel jobId={job.id} />
          </TableCell>
        </TableRow>
      )}
    </>
  )
}

function JobLogsPanel({ jobId }: { jobId: number }) {
  const { data: logs, isLoading } = useQuery({
    queryKey: ['jobLogs', jobId],
    queryFn: () => api.jobs.logs(jobId),
  })

  return (
    <div className="bg-muted/50 px-4 py-3 border-t">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-muted-foreground">Job #{jobId} Logs</span>
      </div>
      {isLoading ? (
        <Skeleton className="h-16 w-full" />
      ) : !logs || logs.length === 0 ? (
        <p className="text-xs text-muted-foreground">No logs yet</p>
      ) : (
        <div className="max-h-40 overflow-y-auto rounded bg-background border p-2">
          {logs.map((log: JobLog) => (
            <div key={log.id} className="text-xs font-mono py-0.5 flex gap-2">
              <span className="text-muted-foreground shrink-0">{new Date(log.created_at).toLocaleTimeString()}</span>
              <span className="text-muted-foreground shrink-0">[{log.level}]</span>
              <span className="break-all">{log.message}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
