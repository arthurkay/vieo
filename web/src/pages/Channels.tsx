import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Plus, MoreHorizontal, Pencil, Trash2, ExternalLink } from 'lucide-react'

export default function Channels() {
  const queryClient = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [description, setDescription] = useState('')

  const { data: channels, isLoading } = useQuery({ queryKey: ['channels'], queryFn: api.channels.list })

  const createMutation = useMutation({
    mutationFn: (data: { name: string; slug: string; description: string }) =>
      api.channels.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['channels'] })
      resetForm()
    },
    onError: (err: Error) => alert(`Create failed: ${err.message}`),
  })

  const updateMutation = useMutation({
    mutationFn: (data: { id: number; name: string; slug: string; description: string }) =>
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
  }

  function startEdit(ch: { id: number; name: string; slug: string; description: string }) {
    setEditId(ch.id)
    setName(ch.name)
    setSlug(ch.slug)
    setDescription(ch.description)
    setShowForm(true)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (editId) {
      updateMutation.mutate({ id: editId, name, slug, description })
    } else {
      createMutation.mutate({ name, slug, description })
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
          <Button onClick={() => { resetForm(); setShowForm(true) }}>
            <Plus className="h-4 w-4 mr-2" /> New Channel
          </Button>
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
                <div className="flex gap-2">
                  <Button type="submit" disabled={isMutating}>{editId ? 'Update' : 'Create'}</Button>
                  <Button variant="outline" onClick={resetForm}>Cancel</Button>
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
            ) : channels && channels.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Slug</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {channels.map((ch) => (
                    <TableRow key={ch.id}>
                      <TableCell className="font-medium">{ch.name}</TableCell>
                      <TableCell className="text-muted-foreground font-mono text-xs">{ch.slug}</TableCell>
                      <TableCell className="text-muted-foreground max-w-[300px] truncate">{ch.description || '—'}</TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreHorizontal className="h-4 w-4" />
                              <span className="sr-only">Actions</span>
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem asChild>
                              <Link to={`/channels/${ch.id}`}>
                                <ExternalLink className="mr-2 h-4 w-4" /> View
                              </Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => startEdit(ch)}>
                              <Pencil className="mr-2 h-4 w-4" /> Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={() => { if (confirm(`Delete channel "${ch.name}"?`)) deleteMutation.mutate(ch.id) }}
                            >
                              <Trash2 className="mr-2 h-4 w-4" /> Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="py-8 text-center text-muted-foreground">
                No channels yet. Create one to get started.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
