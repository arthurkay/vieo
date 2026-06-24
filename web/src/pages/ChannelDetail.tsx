import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useParams, useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Input } from '../components/ui/input'
import { Select } from '../components/ui/select'
import { useWebSocket } from '../hooks/use-websocket'
import { Plus, Play } from 'lucide-react'
import type { Source } from '../types'

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
              className="flex flex-wrap gap-2 mb-4"
            >
              <Select
                options={[
                  { value: 'file', label: 'File / URL' },
                  { value: 'hls', label: 'HLS Stream' },
                  { value: 'rtmp', label: 'RTMP' },
                  { value: 'rtsp', label: 'RTSP' },
                  { value: 'device', label: 'Device' },
                ]}
                value={sourceType}
                onChange={(e) => setSourceType(e.target.value as Source['type'])}
                className="w-32"
              />
              <Input
                placeholder="URL or file path"
                value={sourceUrl}
                onChange={(e) => setSourceUrl(e.target.value)}
                className="min-w-[200px] flex-1"
                required
              />
              <Button type="submit">Add</Button>
            </form>
          )}

          {sourcesLoading ? (
            <p className="text-muted-foreground">Loading sources...</p>
          ) : sources && sources.length > 0 ? (
            <div className="space-y-2">
              {sources.map((source) => {
                const output = outputs?.find((o) => o.source_id === source.id)
                const job = jobs?.find((j) => j.source_id === source.id)
                const isRunning = job?.status === 'running'
                const isCompleted = job?.status === 'completed'
                const canPreview = isRunning || isCompleted

                return (
                  <div key={source.id} className="border rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <span className="font-medium">{source.type}</span>
                        <span className="text-muted-foreground ml-2 text-sm">{source.url}</span>
                      </div>
                      {job && (
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          job.status === 'running' ? 'bg-blue-100 text-blue-700 animate-pulse' :
                          job.status === 'completed' ? 'bg-green-100 text-green-700' :
                          job.status === 'failed' ? 'bg-red-100 text-red-700' :
                          'bg-gray-100 text-gray-700'
                        }`}>
                          {job.status}
                        </span>
                      )}
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
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-2"
                        onClick={() => navigate(`/player/${output.id}`)}
                      >
                        <Play className="h-3 w-3 mr-1" /> View Stream
                      </Button>
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
