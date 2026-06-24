import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { api } from '../lib/api'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Input } from '../components/ui/input'
import { Plus, Edit2, Trash2, ExternalLink } from 'lucide-react'

export default function Channels() {
  const queryClient = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [description, setDescription] = useState('')

  const { data: channels } = useQuery({ queryKey: ['channels'], queryFn: api.channels.list })

  const createMutation = useMutation({
    mutationFn: (data: { name: string; slug: string; description: string }) =>
      api.channels.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['channels'] })
      resetForm()
    },
  })

  const updateMutation = useMutation({
    mutationFn: (data: { id: number; name: string; slug: string; description: string }) =>
      api.channels.update(data.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['channels'] })
      resetForm()
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.channels.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['channels'] }),
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Channels</h2>
          <p className="text-muted-foreground">Manage your content channels</p>
        </div>
        <Button onClick={() => { resetForm(); setShowForm(true) }}>
          <Plus className="h-4 w-4 mr-2" /> New Channel
        </Button>
      </div>

      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle>{editId ? 'Edit Channel' : 'Create Channel'}</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="text-sm font-medium">Name</label>
                <Input value={name} onChange={(e) => setName(e.target.value)} required />
              </div>
              <div>
                <label className="text-sm font-medium">Slug</label>
                <Input value={slug} onChange={(e) => setSlug(e.target.value)} required />
              </div>
              <div>
                <label className="text-sm font-medium">Description</label>
                <Input value={description} onChange={(e) => setDescription(e.target.value)} />
              </div>
              <div className="flex gap-2">
                <Button type="submit">{editId ? 'Update' : 'Create'}</Button>
                <Button variant="outline" onClick={resetForm}>Cancel</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {channels?.map((ch) => (
          <Card key={ch.id}>
            <CardHeader>
              <CardTitle className="text-lg">{ch.name}</CardTitle>
              <p className="text-sm text-muted-foreground">{ch.slug}</p>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">{ch.description || 'No description'}</p>
              <div className="flex gap-2">
                <Link to={`/channels/${ch.id}`}>
                  <Button variant="outline" size="sm">
                    <ExternalLink className="h-3 w-3 mr-1" /> View
                  </Button>
                </Link>
                <Button variant="ghost" size="sm" onClick={() => startEdit(ch)}>
                  <Edit2 className="h-3 w-3" />
                </Button>
                <Button variant="ghost" size="sm" onClick={() => deleteMutation.mutate(ch.id)}>
                  <Trash2 className="h-3 w-3 text-destructive" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
