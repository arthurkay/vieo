import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { api } from '@/lib/api'
import { useAuth } from '@/hooks/use-auth'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useWebSocket } from '@/hooks/use-websocket'
import { Radio, Video, Activity, CheckCircle, AlertCircle, PauseCircle, Play, TrendingUp, TrendingDown, HardDrive } from 'lucide-react'
import type { Job, JobStatus, Channel, Source, Output } from '@/types'

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

interface PlayableStream {
  channel: Channel
  source: Source
  output: Output
  job: Job
}

export default function Dashboard() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'

  const { data: channels, isLoading: channelsLoading } = useQuery({ queryKey: ['channels'], queryFn: api.channels.list })
  const { data: sources, isLoading: sourcesLoading } = useQuery({
    queryKey: ['sources'],
    queryFn: () => api.sources.list(),
    enabled: isAdmin,
  })
  const { data: outputs } = useQuery({
    queryKey: ['outputs'],
    queryFn: api.outputs.list,
    enabled: isAdmin,
  })
  const { data: jobs, isLoading: jobsLoading } = useQuery({
    queryKey: ['jobs'],
    queryFn: () => api.jobs.list(),
    enabled: isAdmin,
  })

  const running = jobs?.filter((j) => j.status === 'running').length || 0
  const completed = jobs?.filter((j) => j.status === 'completed').length || 0
  const failed = jobs?.filter((j) => j.status === 'failed').length || 0
  const paused = jobs?.filter((j) => j.status === 'paused').length || 0

  const playableStreams: PlayableStream[] = []
  if (channels && sources && outputs && jobs) {
    const channelMap = new Map(channels.map((c) => [c.id, c]))
    const sourceMap = new Map(sources.map((s) => [s.id, s]))
    const jobsBySource = new Map<number, Job[]>()
    for (const j of jobs) {
      const list = jobsBySource.get(j.source_id)
      if (list) list.push(j)
      else jobsBySource.set(j.source_id, [j])
    }
    for (const output of outputs) {
      const source = sourceMap.get(output.source_id)
      if (!source) continue
      const channel = channelMap.get(source.channel_id)
      if (!channel) continue
      const sourceJobs = jobsBySource.get(source.id)
      const latestJob = [...(sourceJobs || [])].sort((a, b) => b.id - a.id)[0]
      if (!latestJob) continue
      playableStreams.push({ channel, source, output, job: latestJob })
    }
  }

  const cards = [
    {
      title: 'Channels',
      value: channels?.length || 0,
      icon: Radio,
      color: 'text-blue-600',
      loading: channelsLoading,
    },
    ...(isAdmin ? [
      {
        title: 'Sources',
        value: sources?.length || 0,
        icon: Video,
        color: 'text-purple-600',
        loading: sourcesLoading,
      },
      {
        title: 'Running',
        value: running,
        icon: Activity,
        color: 'text-green-600',
        loading: jobsLoading,
        trend: running > 0 ? 'up' as const : undefined,
      },
      {
        title: 'Completed',
        value: completed,
        icon: CheckCircle,
        color: 'text-emerald-600',
        loading: jobsLoading,
        trend: completed > 0 ? 'up' as const : undefined,
      },
      {
        title: 'Failed',
        value: failed,
        icon: AlertCircle,
        color: 'text-red-600',
        loading: jobsLoading,
        trend: failed > 0 ? 'down' as const : undefined,
      },
      {
        title: 'Paused',
        value: paused,
        icon: PauseCircle,
        color: 'text-amber-600',
        loading: jobsLoading,
      },
    ] : []),
  ]

  useWebSocket((event) => {
    if (!isAdmin) return
    if (event.type === 'job:update') {
      const payload = event.payload as { id?: number; status?: string; progress?: number }
      if (!payload?.id) return
      const status = payload.status
      queryClient.setQueryData<Job[]>(['jobs'], (old) =>
        old?.map((j) =>
          j.id === payload.id
            ? { ...j, status: isValidStatus(status ?? '') ? status as JobStatus : j.status, progress: payload.progress ?? j.progress }
            : j,
        ) ?? old,
      )
      return
    }
    if (event.type.startsWith('job:')) {
      queryClient.invalidateQueries({ queryKey: ['jobs'] })
    }
  })

  return (
    <div className="flex flex-1 flex-col gap-4 py-4 md:gap-6 md:py-6">
      <div className="px-4 lg:px-6">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Dashboard</h2>
          <p className="text-muted-foreground">Overview of your streaming platform</p>
        </div>
      </div>

      <div className="grid gap-4 px-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 lg:px-6">
        {cards.map((card) => (
          <Card key={card.title}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{card.title}</CardTitle>
              <card.icon className={`h-4 w-4 ${card.color}`} />
            </CardHeader>
            <CardContent>
              {card.loading ? (
                <Skeleton className="h-8 w-12" />
              ) : (
                <>
                  <div className="text-2xl font-bold">{card.value}</div>
                  {card.trend && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      {card.trend === 'up' ? (
                        <TrendingUp className="h-3 w-3 text-green-600" />
                      ) : (
                        <TrendingDown className="h-3 w-3 text-red-600" />
                      )}
                      <span className={card.trend === 'up' ? 'text-green-600' : 'text-red-600'}>
                        {card.trend === 'up' ? '+' : '-'}active
                      </span>
                    </p>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {playableStreams.length > 0 && (
        <div className="px-4 lg:px-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Play className="h-4 w-4" />
                Streams
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {Array.from(
                playableStreams.reduce((acc, stream) => {
                  const key = stream.channel.id
                  if (!acc.has(key)) acc.set(key, [])
                  acc.get(key)!.push(stream)
                  return acc
                }, new Map<number, PlayableStream[]>())
              ).map(([channelId, streams]) => {
                const channel = streams[0].channel
                return (
                  <div key={channelId}>
                    <div className="flex items-center gap-2 mb-3">
                      <Radio className="h-4 w-4 text-blue-600" />
                      <h3 className="font-semibold text-sm">{channel.name}</h3>
                      <Badge variant="secondary" className="text-xs">{streams.length}</Badge>
                    </div>
                    <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                      {streams.map((stream) => (
                        <div key={stream.job.id} className="border rounded-lg p-3 group">
                          <div className="flex items-center justify-between mb-2">
                            <span className="font-medium text-sm">{stream.source.name || `Source #${stream.source.id}`}</span>
                            <div className="flex items-center gap-2">
                              <StorageBadge outputId={stream.output.id} />
                              <Badge variant={stream.job.status} className="text-xs">{stream.job.status}</Badge>
                            </div>
                          </div>
                          <button
                            className="aspect-video bg-black rounded-md relative overflow-hidden cursor-pointer active:scale-[0.98] transition-transform w-full"
                            onClick={() => navigate(`/player/${stream.output.id}`)}
                            aria-label={`Play ${stream.source.type} stream from ${channel.name}`}
                          >
                            <img
                              src={`/api/stream/${stream.output.id}/thumb.jpg`}
                              alt=""
                              className="w-full h-full object-contain"
                              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                            />
                            <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/20 transition-colors">
                              <Play className="h-10 w-10 text-white/80 drop-shadow-lg" />
                            </div>
                          </button>
                          <p className="text-xs text-muted-foreground mt-2 truncate" title={stream.source.url}>
                            {stream.source.url}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </CardContent>
          </Card>
        </div>
      )}

      {isAdmin && (
        <div className="px-4 lg:px-6">
          <Card>
            <CardHeader>
              <CardTitle>Recent Jobs</CardTitle>
            </CardHeader>
            <CardContent>
              {jobsLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : jobs && jobs.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[80px]">ID</TableHead>
                      <TableHead>Source</TableHead>
                      <TableHead>Output</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Created</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {jobs.slice(0, 5).map((job) => (
                      <TableRow key={job.id}>
                        <TableCell className="font-medium">#{job.id}</TableCell>
                        <TableCell>Source #{job.source_id}</TableCell>
                        <TableCell>Output #{job.output_id}</TableCell>
                        <TableCell><Badge variant={job.status}>{job.status}</Badge></TableCell>
                        <TableCell className="text-right text-muted-foreground">{new Date(job.created_at).toLocaleDateString()}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-muted-foreground text-center py-4">No jobs yet</p>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
