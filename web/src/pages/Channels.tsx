import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { api } from '@/lib/api'
import { useAuth } from '@/hooks/use-auth'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Plus, Radio, Play, HardDrive, Pencil, Trash2, ExternalLink, Globe, Lock } from 'lucide-react'
import type { Job, Channel, Source, Output } from '@/types'

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
    refetchInterval: 10000,
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

interface PlayableStream {
  channel: Channel
  source: Source
  output: Output
  job: Job
}

export default function Channels() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [description, setDescription] = useState('')
  const [isPublic, setIsPublic] = useState(false)
  const [deleteId, setDeleteId] = useState<number | null>(null)
  const [deleteName, setDeleteName] = useState('')

  const { data: channels, isLoading } = useQuery({ queryKey: ['channels'], queryFn: api.channels.list })
  const { data: sources } = useQuery({ queryKey: ['sources'], queryFn: () => api.sources.list(), enabled: isAdmin })
  const { data: outputs } = useQuery({ queryKey: ['outputs'], queryFn: api.outputs.list, enabled: isAdmin })
  const { data: jobs } = useQuery({ queryKey: ['jobs'], queryFn: () => api.jobs.list(), enabled: isAdmin })

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

  const streamsByChannel = new Map<number, PlayableStream[]>()
  for (const stream of playableStreams) {
    const list = streamsByChannel.get(stream.channel.id)
    if (list) list.push(stream)
    else streamsByChannel.set(stream.channel.id, [stream])
  }

  const createMutation = useMutation({
    mutationFn: (data: { name: string; slug: string; description: string; public: boolean }) =>
      api.channels.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['channels'] })
      resetForm()
    },
    onError: (err: Error) => alert(`Create failed: ${err.message}`),
  })

  const updateMutation = useMutation({
    mutationFn: (data: { id: number; name: string; slug: string; description: string; public: boolean }) =>
      api.channels.update(data.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['channels'] })
      resetForm()
    },
    onError: (err: Error) => alert(`Update failed: ${err.message}`),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.channels.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['channels'] }),
    onError: (err: Error) => alert(`Delete failed: ${err.message}`),
  })

  function resetForm() {
    setShowForm(false)
    setEditId(null)
    setName('')
    setSlug('')
    setDescription('')
    setIsPublic(false)
  }

  function startEdit(ch: Channel) {
    setEditId(ch.id)
    setName(ch.name)
    setSlug(ch.slug)
    setDescription(ch.description)
    setIsPublic(ch.public)
    setShowForm(true)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (editId) {
      updateMutation.mutate({ id: editId, name, slug, description, public: isPublic })
    } else {
      createMutation.mutate({ name, slug, description, public: isPublic })
    }
  }

  const isMutating = createMutation.isPending || updateMutation.isPending

  return (
    <div className="flex flex-1 flex-col gap-4 py-4 md:gap-6 md:py-6">
      <div className="px-4 lg:px-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Channels</h2>
            <p className="text-muted-foreground">Manage your content channels</p>
          </div>
          {isAdmin && (
            <Button onClick={() => { resetForm(); setShowForm(true) }}>
              <Plus className="h-4 w-4 mr-2" /> New Channel
            </Button>
          )}
        </div>
      </div>

      {showForm && (
        <div className="px-4 lg:px-6">
          <Card>
            <CardHeader>
              <CardTitle>{editId ? 'Edit Channel' : 'Create Channel'}</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="space-y-2">
                    <Label htmlFor="channel-name">Name</Label>
                    <Input id="channel-name" value={name} onChange={(e) => setName(e.target.value)} required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="channel-slug">Slug</Label>
                    <Input id="channel-slug" value={slug} onChange={(e) => setSlug(e.target.value)} required pattern="[a-z0-9\-]+" title="Lowercase letters, numbers, and hyphens only" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="channel-desc">Description</Label>
                    <Input id="channel-desc" value={description} onChange={(e) => setDescription(e.target.value)} />
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Label className="text-sm font-medium">Visibility</Label>
                  <button
                    type="button"
                    onClick={() => setIsPublic(!isPublic)}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm border transition-colors ${
                      isPublic
                        ? 'bg-green-50 border-green-300 text-green-700 dark:bg-green-900/30 dark:border-green-700 dark:text-green-400'
                        : 'bg-muted border-border text-muted-foreground'
                    }`}
                  >
                    {isPublic ? <Globe className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
                    {isPublic ? 'Public — visible to guests' : 'Private — admin only'}
                  </button>
                </div>
                <div className="flex gap-2">
                  <Button type="submit" disabled={isMutating}>{editId ? 'Update' : 'Create'}</Button>
                  <Button variant="outline" onClick={resetForm}>Cancel</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="px-4 lg:px-6 space-y-6">
        {isLoading ? (
          <div className="space-y-4">
            {Array.from({ length: 2 }).map((_, i) => (
              <Card key={i}>
                <CardContent className="p-4">
                  <Skeleton className="h-6 w-40 mb-4" />
                  <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {Array.from({ length: 3 }).map((_, j) => (
                      <Skeleton key={j} className="h-40 w-full" />
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : channels && channels.length > 0 ? (
          channels.map((ch) => {
            const streams = streamsByChannel.get(ch.id) || []
            return (
              <Card key={ch.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Radio className="h-4 w-4 text-blue-600" />
                      <CardTitle className="text-base">{ch.name}</CardTitle>
                      {ch.description && (
                        <span className="text-xs text-muted-foreground">— {ch.description}</span>
                      )}
                      <Badge variant={ch.public ? 'default' : 'secondary'} className="text-xs">
                        {ch.public ? 'Public' : 'Private'}
                      </Badge>
                      <Badge variant="secondary" className="text-xs">{streams.length} stream{streams.length !== 1 ? 's' : ''}</Badge>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="sm" onClick={() => navigate(`/channels/${ch.id}`)}>
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                      {isAdmin && (
                        <>
                          <Button variant="ghost" size="sm" onClick={() => startEdit(ch)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => { setDeleteId(ch.id); setDeleteName(ch.name) }}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {streams.length > 0 ? (
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
                            aria-label={`Play stream from ${ch.name}`}
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
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-4">No streams yet</p>
                  )}
                </CardContent>
              </Card>
            )
          })
        ) : (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              No channels yet. Create one to get started.
            </CardContent>
          </Card>
        )}
      </div>

      <ConfirmDialog
        open={deleteId !== null}
        onOpenChange={(open) => { if (!open) { setDeleteId(null); setDeleteName('') } }}
        title="Delete Channel"
        description={`Are you sure you want to delete "${deleteName}"? This action cannot be undone.`}
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={() => { if (deleteId) deleteMutation.mutate(deleteId); setDeleteId(null); setDeleteName('') }}
        loading={deleteMutation.isPending}
      />
    </div>
  )
}
