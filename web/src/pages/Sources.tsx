import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'
import { Plus, MoreHorizontal, Trash2 } from 'lucide-react'
import type { Source } from '@/types'

export default function Sources() {
  const queryClient = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [type, setType] = useState<Source['type']>('file')
  const [url, setUrl] = useState('')
  const [channelId, setChannelId] = useState('')

  const { data: sources, isLoading } = useQuery({ queryKey: ['sources'], queryFn: () => api.sources.list() })
  const { data: channels } = useQuery({ queryKey: ['channels'], queryFn: api.channels.list })

  const channelMap = new Map(channels?.map((c) => [c.id, c]) || [])

  const createMutation = useMutation({
    mutationFn: (data: { channel_id: number; type: Source['type']; url: string }) =>
      api.sources.create({ ...data, stream_type: 'audio_video' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sources'] })
      setShowForm(false)
      setUrl('')
      setChannelId('')
    },
    onError: (err: Error) => alert(`Create failed: ${err.message}`),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.sources.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sources'] }),
    onError: (err: Error) => alert(`Delete failed: ${err.message}`),
  })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const parsedChannelId = parseInt(channelId)
    if (!parsedChannelId || isNaN(parsedChannelId)) {
      alert('Please select a channel')
      return
    }
    if (!url.trim()) {
      alert('URL is required')
      return
    }
    createMutation.mutate({ channel_id: parsedChannelId, type, url: url.trim() })
  }

  return (
    <div className="flex flex-1 flex-col gap-4 py-4 md:gap-6 md:py-6">
      <div className="px-4 lg:px-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Sources</h2>
            <p className="text-muted-foreground">Manage media sources</p>
          </div>
          <Button onClick={() => { setShowForm(true) }}>
            <Plus className="h-4 w-4 mr-2" /> New Source
          </Button>
        </div>
      </div>

      {showForm && (
        <div className="px-4 lg:px-6">
          <Card>
            <CardContent className="pt-6">
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-3">
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
                </div>
                <div className="flex gap-2">
                  <Button type="submit" disabled={createMutation.isPending}>
                    {createMutation.isPending ? 'Creating...' : 'Create'}
                  </Button>
                  <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="px-4 lg:px-6">
        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-4 space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : sources && sources.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ID</TableHead>
                    <TableHead>Channel</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Stream</TableHead>
                    <TableHead>URL</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sources.map((source) => {
                    const ch = channelMap.get(source.channel_id)
                    return (
                      <TableRow key={source.id}>
                        <TableCell className="font-medium">#{source.id}</TableCell>
                        <TableCell>{ch?.name || `Channel #${source.channel_id}`}</TableCell>
                        <TableCell className="capitalize">{source.type}</TableCell>
                        <TableCell className="text-muted-foreground">{(source.stream_type as string).split('_').join(' + ')}</TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground max-w-[300px] truncate" title={source.url}>{source.url}</TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <MoreHorizontal className="h-4 w-4" />
                                <span className="sr-only">Actions</span>
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                className="text-destructive"
                                onClick={() => { if (confirm('Delete this source?')) deleteMutation.mutate(source.id) }}
                              >
                                <Trash2 className="mr-2 h-4 w-4" /> Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            ) : (
              <div className="py-8 text-center text-muted-foreground">
                No sources yet. Create one to get started.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
