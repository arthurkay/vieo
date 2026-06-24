import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useParams, useNavigate } from 'react-router-dom'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useWebSocket } from '@/hooks/use-websocket'
import { Plus, Play } from 'lucide-react'
import type { Source } from '@/types'
import { Skeleton } from '@/components/ui/skeleton'

export default function ChannelDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const channelId = parseInt(id || '0')

  const [showSourceForm, setShowSourceForm] = useState(false)
  const [sourceType, setSourceType] = useState<Source['type']>('file')
  const [sourceUrl, setSourceUrl] = useState('')

  const { data: channel } = useQuery({
    queryKey: ['channel', channelId],
    queryFn: () => api.channels.get(channelId),
    enabled: !!channelId,
  })

  const { data: sources, isLoading: sourcesLoading } = useQuery({
    queryKey: ['sources', channelId],
    queryFn: () => api.sources.list(channelId),
    enabled: !!channelId,
  })

  const { data: outputs } = useQuery({
    queryKey: ['outputs'],
    queryFn: api.outputs.list,
  })

  const { data: jobs } = useQuery({
    queryKey: ['jobs'],
    queryFn: () => api.jobs.list(),
  })

  const createSourceMutation = useMutation({
    mutationFn: (data: { channel_id: number; type: Source['type']; url: string }) =>
      api.sources.create({ ...data, stream_type: 'audio_video' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sources', channelId] })
      setShowSourceForm(false)
      setSourceUrl('')
    },
    onError: (err: Error) => alert(`Create source failed: ${err.message}`),
  })

  const createJobMutation = useMutation({
    mutationFn: ({ sourceId, outputId }: { sourceId: number; outputId: number }) =>
      api.jobs.create(sourceId, outputId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['jobs'] }),
    onError: (err: Error) => alert(`Start transcoding failed: ${err.message}`),
  })

  useWebSocket((event) => {
    if (event.type.startsWith('job:')) {
      queryClient.invalidateQueries({ queryKey: ['jobs'] })
    }
  })

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">{channel?.name || 'Channel'}</h2>
        <p className="text-muted-foreground">{channel?.description}</p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Sources</CardTitle>
          <Button size="sm" onClick={() => setShowSourceForm(!showSourceForm)}>
            <Plus className="h-4 w-4 mr-1" /> Add Source
          </Button>
        </CardHeader>
        <CardContent>
          {showSourceForm && (
            <form
              onSubmit={(e) => {
                e.preventDefault()
                createSourceMutation.mutate({ channel_id: channelId, type: sourceType, url: sourceUrl })
              }}
              className="flex flex-wrap gap-2 mb-4 items-end"
            >
              <div className="space-y-1">
                <Label className="text-xs">Type</Label>
                <Select value={sourceType} onValueChange={(v) => setSourceType(v as Source['type'])}>
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="file">File / URL</SelectItem>
                    <SelectItem value="hls">HLS Stream</SelectItem>
                    <SelectItem value="rtmp">RTMP</SelectItem>
                    <SelectItem value="rtsp">RTSP</SelectItem>
                    <SelectItem value="device">Device</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1 flex-1 min-w-[200px]">
                <Label className="text-xs">URL</Label>
                <Input
                  placeholder="URL or file path"
                  value={sourceUrl}
                  onChange={(e) => setSourceUrl(e.target.value)}
                  required
                />
              </div>
              <Button type="submit" className="mt-auto">Add</Button>
            </form>
          )}

          {sourcesLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 2 }).map((_, i) => (
                <Skeleton key={i} className="h-24 w-full rounded-lg" />
              ))}
            </div>
          ) : sources && sources.length > 0 ? (
            <div className="space-y-2">
              {sources.map((source) => {
                const output = outputs?.find((o) => o.source_id === source.id)
                const job = jobs?.find((j) => j.source_id === source.id)
                const isRunning = job?.status === 'running'
                const isPaused = job?.status === 'paused'
                const isStopped = job?.status === 'stopped'
                const isCompleted = job?.status === 'completed'
                const canPreview = isRunning || isCompleted || isPaused || isStopped

                return (
                  <div key={source.id} className="border rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <span className="font-medium">{source.type}</span>
                        <span className="text-muted-foreground ml-2 text-sm">{source.url}</span>
                      </div>
                      {job && <Badge variant={job.status as 'pending' | 'running' | 'paused' | 'completed' | 'failed' | 'stopped'}>{job.status}</Badge>}
                    </div>

                    {!output && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={async () => {
                          const newOutput = await api.outputs.create({
                            source_id: source.id,
                            type: 'hls',
                            path: '',
                          })
                          queryClient.invalidateQueries({ queryKey: ['outputs'] })
                          createJobMutation.mutate({ sourceId: source.id, outputId: newOutput.id })
                        }}
                      >
                        Start Transcoding
                      </Button>
                    )}

                    {canPreview && output && (
                      <div className="mt-2 flex items-center gap-3">
                        <div className="w-32 aspect-video bg-black rounded overflow-hidden relative shrink-0">
                          <img
                            src={`/api/stream/${output.id}/thumb.jpg`}
                            alt=""
                            className="w-full h-full object-contain"
                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                          />
                          <div className="absolute inset-0 flex items-center justify-center">
                            <Play className="h-4 w-4 text-white/80" />
                          </div>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => navigate(`/player/${output.id}`)}
                        >
                          <Play className="h-3 w-3 mr-1" /> View Stream
                        </Button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="text-muted-foreground">No sources configured</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
