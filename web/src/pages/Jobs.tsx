import { useState, useMemo } from 'react'
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
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { MoreHorizontal, Play, Pause, PlayCircle, StopCircle, RotateCcw, Trash2, FileText, HardDrive } from 'lucide-react'
import type { Job, JobStatus, JobLog } from '@/types'

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

function StorageBadge({ outputId }: { outputId: number }) {
  const { data, isLoading } = useQuery({
    queryKey: ['output-storage', outputId],
    queryFn: () => api.outputs.storage(outputId),
    refetchInterval: 5000,
  })

  if (isLoading) return <Skeleton className="h-4 w-16" />
  if (!data) return null

  return (
    <span className="text-xs text-muted-foreground flex items-center gap-1">
      <HardDrive className="h-3 w-3" />
      {formatBytes(data.bytes)}
    </span>
  )
}

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
  const [deleteId, setDeleteId] = useState<number | null>(null)

  const { data: jobs, isLoading } = useQuery({
    queryKey: ['jobs', statusFilter],
    queryFn: () => api.jobs.list(statusFilter === 'all' ? undefined : statusFilter),
  })

  const { data: sources } = useQuery({
    queryKey: ['sources'],
    queryFn: () => api.sources.list(),
  })

  const sourceTypeMap = useMemo(() => {
    if (!sources) return new Map<number, string>()
    return new Map(sources.map((s) => [s.id, s.type]))
  }, [sources])

  const sourceNameMap = useMemo(() => {
    if (!sources) return new Map<number, string>()
    return new Map(sources.map((s) => [s.id, s.name]))
  }, [sources])

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

  const continueMutation = useMutation({
    mutationFn: (id: number) => api.jobs.continue(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['jobs'] }),
    onError: (err: Error) => alert(`Continue failed: ${err.message}`),
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
                    <TableHead>Type</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Output</TableHead>
                    <TableHead>Storage</TableHead>
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
                      sourceType={sourceTypeMap.get(job.source_id)}
                      sourceName={sourceNameMap.get(job.source_id)}
                      onStop={() => stopMutation.mutate(job.id)}
                      onPause={() => pauseMutation.mutate(job.id)}
                      onResume={() => resumeMutation.mutate(job.id)}
                      onContinue={() => continueMutation.mutate(job.id)}
                      onDelete={() => setDeleteId(job.id)}
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

      <ConfirmDialog
        open={deleteId !== null}
        onOpenChange={(open) => { if (!open) setDeleteId(null) }}
        title="Delete Job"
        description="Are you sure you want to delete this job? This action cannot be undone."
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={() => { if (deleteId) deleteMutation.mutate(deleteId); setDeleteId(null) }}
        loading={deleteMutation.isPending}
      />
    </div>
  )
}

function JobRow({
  job,
  sourceType,
  sourceName,
  onStop,
  onPause,
  onResume,
  onContinue,
  onDelete,
}: {
  job: Job
  sourceType?: string
  sourceName?: string
  onStop: () => void
  onPause: () => void
  onResume: () => void
  onContinue: () => void
  onDelete: () => void
}) {
  const navigate = useNavigate()
  const [showLogs, setShowLogs] = useState(false)
  const isRunning = job.status === 'running'
  const isPending = job.status === 'pending'
  const isPaused = job.status === 'paused'
  const isActive = isPending || isRunning || isPaused
  const canContinue = sourceType !== 'file' && (job.status === 'failed' || job.status === 'stopped')
  const canPlay = (isRunning || isPaused || job.status === 'completed') && job.output_id

  return (
    <>
      <TableRow>
        <TableCell className="font-medium">#{job.id}</TableCell>
        <TableCell><Badge variant={job.status}>{job.status}</Badge></TableCell>
        <TableCell className="capitalize text-muted-foreground">{sourceType || '—'}</TableCell>
        <TableCell>{sourceName || `Source #${job.source_id}`}</TableCell>
        <TableCell>Output #{job.output_id}</TableCell>
        <TableCell><StorageBadge outputId={job.output_id} /></TableCell>
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
              {canContinue && (
                <DropdownMenuItem onClick={onContinue}>
                  <RotateCcw className="mr-2 h-4 w-4" /> Continue
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
          <TableCell colSpan={9} className="p-0">
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
