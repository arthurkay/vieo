import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Plus, Trash2 } from 'lucide-react'
import type { Source } from '@/types'
import { Skeleton } from '@/components/ui/skeleton'

export default function Sources() {
  const queryClient = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [type, setType] = useState<Source['type']>('file')
  const [url, setUrl] = useState('')
  const [channelId, setChannelId] = useState('')

  const { data: sources, isLoading } = useQuery({ queryKey: ['sources'], queryFn: () => api.sources.list() })
  const { data: channels } = useQuery({ queryKey: ['channels'], queryFn: api.channels.list })

  const createMutation = useMutation({
    mutationFn: (data: { channel_id: number; type: Source['type']; url: string }) =>
      api.sources.create({ ...data, stream_type: 'audio_video' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sources'] })
      setShowForm(false)
      setUrl('')
    },
    onError: (err: Error) => alert(`Create failed: ${err.message}`),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.sources.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sources'] }),
    onError: (err: Error) => alert(`Delete failed: ${err.message}`),
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Sources</h2>
          <p className="text-muted-foreground">Manage media sources</p>
        </div>
        <Button onClick={() => { setShowForm(true) }}>
          <Plus className="h-4 w-4 mr-2" /> New Source
        </Button>
      </div>

      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle>Create Source</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={(e) => {
                e.preventDefault()
                createMutation.mutate({ channel_id: parseInt(channelId), type, url })
              }}
              className="space-y-4"
            >
              <div className="space-y-2">
                <Label>Channel</Label>
                <Select value={channelId} onValueChange={setChannelId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select channel..." />
                  </SelectTrigger>
                  <SelectContent>
                    {channels?.map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Type</Label>
                <Select value={type} onValueChange={(v) => setType(v as Source['type'])}>
                  <SelectTrigger>
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
                <Label>URL / Path</Label>
                <Input
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://...m3u8, rtmp://..., or /path/to/file"
                  required
                />
              </div>
              <div className="flex gap-2">
                <Button type="submit">Create</Button>
                <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="py-8">
                <Skeleton className="h-5 w-24 mb-2" />
                <Skeleton className="h-4 w-32 mb-2" />
                <Skeleton className="h-8 w-full" />
              </CardContent>
            </Card>
          ))
        ) : sources?.map((source) => (
          <Card key={source.id}>
            <CardHeader>
              <CardTitle className="text-lg">{source.type}</CardTitle>
              <p className="text-sm text-muted-foreground">Channel #{source.channel_id} &middot; {source.stream_type?.replace('_', ' + ') || 'auto-detect'}</p>
            </CardHeader>
            <CardContent>
              <p className="text-sm font-mono bg-muted rounded p-2 mb-4 truncate">{source.url}</p>
              <Button variant="ghost" size="sm" onClick={() => deleteMutation.mutate(source.id)}>
                <Trash2 className="h-3 w-3 text-destructive" />
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
