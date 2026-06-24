import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { api } from '@/lib/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useWebSocket } from '@/hooks/use-websocket'
import { Radio, Video, Activity, CheckCircle, AlertCircle, PauseCircle, Play } from 'lucide-react'
import type { Job } from '@/types'

export default function Dashboard() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { data: channels } = useQuery({ queryKey: ['channels'], queryFn: api.channels.list })
  const { data: sources } = useQuery({ queryKey: ['sources'], queryFn: () => api.sources.list() })
  const { data: jobs } = useQuery({ queryKey: ['jobs'], queryFn: () => api.jobs.list() })

  const running = jobs?.filter((j) => j.status === 'running').length || 0
  const completed = jobs?.filter((j) => j.status === 'completed').length || 0
  const failed = jobs?.filter((j) => j.status === 'failed').length || 0
  const paused = jobs?.filter((j) => j.status === 'paused').length || 0

  const liveJobs = jobs?.filter((j) => (j.status === 'stopped' ||j.status === 'paused' ||j.status === 'completed' || j.status === 'running') && j.output_id) || []

  const stats = [
    { label: 'Channels', value: channels?.length || 0, icon: Radio, color: 'text-blue-600' },
    { label: 'Sources', value: sources?.length || 0, icon: Video, color: 'text-purple-600' },
    { label: 'Running Jobs', value: running, icon: Activity, color: 'text-green-600' },
    { label: 'Completed', value: completed, icon: CheckCircle, color: 'text-emerald-600' },
    { label: 'Failed', value: failed, icon: AlertCircle, color: 'text-red-600' },
    { label: 'Paused', value: paused, icon: PauseCircle, color: 'text-amber-600' },
  ]

  useWebSocket((event) => {
    if (event.type === 'job:update') {
      const payload = event.payload as { id?: number; status?: string; progress?: number }
      if (!payload?.id) return
      queryClient.setQueryData<Job[]>(['jobs'], (old) =>
        old?.map((j) =>
          j.id === payload.id
            ? { ...j, status: payload.status as Job['status'] ?? j.status, progress: payload.progress ?? j.progress }
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
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl md:text-3xl font-bold tracking-tight">Dashboard</h2>
        <p className="text-muted-foreground">Overview of your streaming platform</p>
      </div>

      <div className="grid gap-4 grid-cols-2 md:grid-cols-3">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{stat.label}</CardTitle>
              <stat.icon className={`h-4 w-4 ${stat.color}`} />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {liveJobs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Play className="h-4 w-4" />
              Vieo Streams
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
              {liveJobs.map((job) => (
                <div key={job.id} className="border rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium text-sm">Job #{job.id}</span>
                    <span className="text-xs text-muted-foreground">Source #{job.source_id}</span>
                  </div>
                  <div
                    className="aspect-video bg-black rounded-md relative overflow-hidden cursor-pointer active:scale-[0.98] transition-transform"
                    role="button"
                    tabIndex={0}
                    onClick={() => navigate(`/player/${job.output_id}`)}
                    onKeyDown={(e) => { if (e.key === 'Enter') navigate(`/player/${job.output_id}`) }}
                  >
                    <img
                      src={`/api/stream/${job.output_id}/thumb.jpg`}
                      alt=""
                      className="w-full h-full object-contain"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                    />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <Play className="h-10 w-10 text-white/80 drop-shadow-lg" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Recent Jobs</CardTitle>
        </CardHeader>
        <CardContent>
          {jobs && jobs.length > 0 ? (
            <div className="space-y-2">
              {jobs.slice(0, 5).map((job) => (
                <div key={job.id} className="flex items-center justify-between py-2 border-b last:border-0">
                  <div className="min-w-0">
                    <span className="font-medium">Job #{job.id}</span>
                    <span className="text-muted-foreground ml-2">
                      Source #{job.source_id}
                    </span>
                  </div>
                  <Badge variant={job.status as 'pending' | 'running' | 'paused' | 'completed' | 'failed' | 'stopped'}>{job.status}</Badge>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground">No jobs yet</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
