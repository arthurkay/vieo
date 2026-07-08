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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
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

  const { data: channel, isLoading: channelLoading } = useQuery({
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

  const startTranscodeMutation = useMutation({
    mutationFn: async ({ sourceId }: { sourceId: number }) => {
      const newOutput = await api.outputs.create({ source_id: sourceId, type: 'hls', path: '' })
      queryClient.invalidateQueries({ queryKey: ['outputs'] })
      return api.jobs.create(sourceId, newOutput.id)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['jobs'] }),
    onError: (err: Error) => alert(`Start transcoding failed: ${err.message}`),
  })

  useWebSocket((event) => {
    if (event.type.startsWith('job:')) {
      queryClient.invalidateQueries({ queryKey: ['jobs'] })
    }
  })

  const isSourceFormMutating = createSourceMutation.isPending

  return (
    <div className="flex flex-1 flex-col gap-4 py-4 md:gap-6 md:py-6">
      <div className="px-4 lg:px-6">
        {channelLoading ? (
          <Skeleton className="h-8 w-48" />
        ) : (
          <div>
            <h2 className="text-2xl font-bold tracking-tight">{channel?.name || 'Channel not found'}</h2>
            <p className="text-muted-foreground">{channel?.description}</p>
          </div>
        )}
      </div>

      <div className="px-4 lg:px-6">
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
                  if (!sourceUrl.trim()) return
                  createSourceMutation.mutate({ channel_id: channelId, type: sourceType, url: sourceUrl.trim() })
                }}
                className="mb-4 p-4 border rounded-lg bg-muted/50"
              >
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="space-y-2">
                    <Label className="text-xs">Type</Label>
                    <Select value={sourceType} onValueChange={(v) => setSourceType(v as Source['type'])}>
                      <SelectTrigger className="w-full">
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
                  <div className="space-y-2">
                    <Label className="text-xs">URL</Label>
                    <Input placeholder="URL or file path" value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} required />
                  </div>
                  <div className="flex items-end gap-2">
                    <Button type="submit" disabled={isSourceFormMutating}>
                      {isSourceFormMutating ? 'Adding...' : 'Add'}
                    </Button>
                    <Button variant="outline" type="button" onClick={() => setShowSourceForm(false)}>Cancel</Button>
                  </div>
                </div>
              </form>
            )}

            {sourcesLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 2 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : sources && sources.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ID</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>URL</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-[120px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sources.map((source) => {
                    const output = outputs?.find((o) => o.source_id === source.id)
                    const sourceJobs = jobs?.filter((j) => j.source_id === source.id) || []
                    const latestJob = sourceJobs[0]
                    const isRunning = latestJob?.status === 'running'
                    const isPaused = latestJob?.status === 'paused'
                    const isStopped = latestJob?.status === 'stopped'
                    const isCompleted = latestJob?.status === 'completed'
                    const canPreview = isRunning || isCompleted || isStopped || isPaused

                    return (
                      <TableRow key={source.id}>
                        <TableCell className="font-medium">#{source.id}</TableCell>
                        <TableCell className="capitalize">{source.type}</TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground max-w-[300px] truncate" title={source.url}>{source.url}</TableCell>
                        <TableCell>
                          {latestJob && <Badge variant={latestJob.status}>{latestJob.status}</Badge>}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            {!output && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs"
                                disabled={startTranscodeMutation.isPending}
                                onClick={() => startTranscodeMutation.mutate({ sourceId: source.id })}
                              >
                                {startTranscodeMutation.isPending ? 'Starting...' : 'Start'}
                              </Button>
                            )}
                            {canPreview && output && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7"
                                onClick={() => navigate(`/player/${output.id}`)}
                              >
                                <Play className="h-3 w-3 mr-1" /> Play
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            ) : (
              <div className="py-8 text-center text-muted-foreground">No sources configured</div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
