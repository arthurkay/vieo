import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { toast } from '@/lib/toast'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { Camera, ScanLine, Network, Plus, RefreshCw, Circle, VideoOff, Play, Square, ExternalLink } from 'lucide-react'
import type { V4L2Device, ONVIFCamera, CameraStatus, Channel } from '@/types'

const statusBadge: Record<string, { label: string; className: string }> = {
  recording: { label: 'Recording', className: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' },
  online: { label: 'Online', className: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300' },
  offline: { label: 'Offline', className: 'bg-muted text-muted-foreground' },
  error: { label: 'Error', className: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300' },
}

function AddSourceDialog({ camera, kind, onClose }: {
  camera: V4L2Device | ONVIFCamera
  kind: 'v4l2' | 'onvif'
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [channelId, setChannelId] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')

  const { data: channels } = useQuery<Channel[]>({ queryKey: ['channels'], queryFn: api.channels.list })

  const createMutation = useMutation({
    mutationFn: () => {
      const isOnvif = kind === 'onvif'
      let url: string
      let type: string
      let finalName = name.trim()
      let metadata: { onvif?: { username: string; password: string } } | undefined

      if (isOnvif) {
        const c = camera as ONVIFCamera
        url = c.stream_uri
        type = 'rtsp'
        if (!finalName) finalName = `${c.manufacturer || 'IP'} ${c.host}`.trim()
        if (username.trim()) metadata = { onvif: { username: username.trim(), password: password } }
      } else {
        const c = camera as V4L2Device
        url = c.path
        type = 'device'
        if (!finalName) finalName = c.card || c.path
      }

      return api.sources.create({
        channel_id: parseInt(channelId),
        name: finalName,
        type: type as any,
        url,
        stream_type: 'audio_video',
        metadata: metadata ? JSON.stringify(metadata) : undefined,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sources'] })
      queryClient.invalidateQueries({ queryKey: ['cameras-status'] })
      toast.success('Camera source added')
      onClose()
    },
    onError: (err: Error) => toast.error('Add failed', err.message),
  })

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Add as Source</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-2">
          <Label className="text-xs">Channel</Label>
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
          <Label className="text-xs">Name (optional)</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Auto-generated from camera" />
        </div>
        {kind === 'onvif' && (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label className="text-xs">Username (optional)</Label>
              <Input value={username} onChange={(e) => setUsername(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Password</Label>
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
          </div>
        )}
        <div className="flex gap-2">
          <Button size="sm" onClick={() => createMutation.mutate()} disabled={!channelId || createMutation.isPending}>
            {createMutation.isPending ? 'Adding...' : 'Add Source'}
          </Button>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
        </div>
      </CardContent>
    </Card>
  )
}

function LocalDevicesSection({ onAdd }: { onAdd: (d: V4L2Device) => void }) {
  const [scanning, setScanning] = useState(false)
  const [devices, setDevices] = useState<V4L2Device[]>([])

  async function scan() {
    setScanning(true)
    try {
      const result = await api.devices.list()
      setDevices(result)
    } catch (err) {
      toast.error('Scan failed', (err as Error).message)
    } finally {
      setScanning(false)
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <ScanLine className="h-4 w-4" /> Local Devices (V4L2)
          </CardTitle>
          <Button size="sm" variant="outline" onClick={scan} disabled={scanning}>
            <RefreshCw className={scanning ? 'h-3 w-3 mr-1 animate-spin' : 'h-3 w-3 mr-1'} />
            {scanning ? 'Scanning...' : 'Scan'}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {devices.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No local capture devices scanned yet. Click "Scan" to detect cameras on the backend host.
          </p>
        ) : (
          <div className="space-y-2">
            {devices.map((d) => (
              <div key={d.path} className="flex items-center justify-between rounded-lg border p-3">
                <div className="min-w-0">
                  <div className="font-medium truncate">{d.card || d.path}</div>
                  <div className="text-xs text-muted-foreground font-mono">{d.path}</div>
                  {d.resolutions.length > 0 && (
                    <div className="text-xs text-muted-foreground mt-1">
                      {d.resolutions.slice(0, 4).join(', ')}
                      {d.resolutions.length > 4 && '…'}
                    </div>
                  )}
                </div>
                <Button size="sm" variant="ghost" onClick={() => onAdd(d)}>
                  <Plus className="h-3 w-3 mr-1" /> Add
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function IPDiscoverySection({ onAdd }: { onAdd: (c: ONVIFCamera) => void }) {
  const [discovering, setDiscovering] = useState(false)
  const [cameras, setCameras] = useState<ONVIFCamera[]>([])
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')

  async function discover() {
    setDiscovering(true)
    try {
      const result = await api.cameras.discover(10, username.trim() || undefined, password || undefined)
      setCameras(result.cameras ?? [])
      if (result.count === 0) toast.info('No IP cameras found')
    } catch (err) {
      toast.error('Discovery failed', (err as Error).message)
    } finally {
      setDiscovering(false)
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Network className="h-4 w-4" /> IP Cameras (ONVIF)
          </CardTitle>
          <Button size="sm" variant="outline" onClick={discover} disabled={discovering}>
            <RefreshCw className={discovering ? 'h-3 w-3 mr-1 animate-spin' : 'h-3 w-3 mr-1'} />
            {discovering ? 'Discovering...' : 'Discover'}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label className="text-xs">Username (optional)</Label>
            <Input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="admin" />
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Password</Label>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
        </div>
        {cameras.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No IP cameras discovered. ONVIF WS-Discovery scans the local network for cameras.
          </p>
        ) : (
          <div className="space-y-2">
            {cameras.map((c) => (
              <div key={c.endpoint} className="flex items-center justify-between rounded-lg border p-3">
                <div className="min-w-0">
                  <div className="font-medium truncate">
                    {c.manufacturer} {c.model} <span className="text-muted-foreground font-mono text-xs">({c.host}:{c.port})</span>
                  </div>
                  <div className="text-xs text-muted-foreground font-mono truncate">{c.stream_uri}</div>
                </div>
                <Button size="sm" variant="ghost" onClick={() => onAdd(c)}>
                  <Plus className="h-3 w-3 mr-1" /> Add
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function RegisteredCameras() {
  const queryClient = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: ['cameras-status'],
    queryFn: api.cameras.status,
    refetchInterval: 15000,
  })

  const startMutation = useMutation({
    mutationFn: async (sourceId: number) => {
      const output = await api.outputs.create({ source_id: sourceId, type: 'hls', path: '' })
      return api.jobs.create(sourceId, output.id)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cameras-status'] })
      toast.success('Stream started')
    },
    onError: (err: Error) => toast.error('Start failed', err.message),
  })

  const stopMutation = useMutation({
    mutationFn: (jobId: number) => api.jobs.stop(jobId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cameras-status'] })
      toast.success('Stream stopped')
    },
    onError: (err: Error) => toast.error('Stop failed', err.message),
  })

  if (isLoading) return <Skeleton className="h-24 w-full" />
  const cameras = data?.cameras ?? []

  if (cameras.length === 0) {
    return <p className="text-sm text-muted-foreground">No camera-type sources registered yet.</p>
  }

  return (
    <div className="space-y-2">
      {cameras.map((c: CameraStatus) => {
        const badge = statusBadge[c.status] ?? statusBadge.offline
        const isRunning = c.job_status === 'running'
        return (
          <div key={c.id} className="flex items-center gap-4 rounded-lg border p-3">
            <div className="relative h-16 w-24 shrink-0 overflow-hidden rounded bg-muted">
              <img
                src={api.cameras.snapshotUrl(c.id)}
                alt={c.name}
                className="h-full w-full object-cover"
                onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
              />
              <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
                <VideoOff className="h-5 w-5" />
              </div>
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-medium truncate">{c.name}</span>
                <Badge className={badge.className}>{badge.label}</Badge>
              </div>
              <div className="text-xs text-muted-foreground capitalize">{c.type}</div>
              <div className="text-xs text-muted-foreground font-mono truncate">{c.url}</div>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {isRunning ? (
                <>
                  {c.output_id ? (
                    <Button size="sm" variant="ghost" onClick={() => window.open(`/player/${c.output_id}`, '_blank')}>
                      <ExternalLink className="h-3.5 w-3.5 mr-1" /> Watch
                    </Button>
                  ) : null}
                  <Button size="sm" variant="outline" onClick={() => c.job_id && stopMutation.mutate(c.job_id)} disabled={stopMutation.isPending || !c.job_id}>
                    <Square className="h-3 w-3 mr-1" /> Stop
                  </Button>
                </>
              ) : (
                <Button size="sm" onClick={() => startMutation.mutate(c.id)} disabled={startMutation.isPending}>
                  <Play className="h-3 w-3 mr-1" /> Start Stream
                </Button>
              )}
            </div>
            <Circle className={c.status === 'recording' ? 'h-3 w-3 fill-green-500 text-green-500' : c.status === 'online' ? 'h-3 w-3 fill-blue-500 text-blue-500' : 'h-3 w-3 text-muted-foreground'} />
          </div>
        )
      })}
    </div>
  )
}

export default function Cameras() {
  const [adding, setAdding] = useState<V4L2Device | ONVIFCamera | null>(null)
  const [addingKind, setAddingKind] = useState<'v4l2' | 'onvif'>('v4l2')

  function handleAdd(c: V4L2Device | ONVIFCamera, kind: 'v4l2' | 'onvif') {
    setAdding(c)
    setAddingKind(kind)
  }

  return (
    <div className="flex flex-1 flex-col gap-4 py-4 md:gap-6 md:py-6">
      <div className="px-4 lg:px-6">
        <h2 className="text-2xl font-bold tracking-tight">Cameras</h2>
        <p className="text-muted-foreground">Discover and manage local and IP cameras</p>
      </div>

      {adding && (
        <div className="px-4 lg:px-6">
          <AddSourceDialog camera={adding} kind={addingKind} onClose={() => setAdding(null)} />
        </div>
      )}

      <div className="px-4 lg:px-6 grid gap-4 lg:grid-cols-2">
        <LocalDevicesSection onAdd={(d) => handleAdd(d, 'v4l2')} />
        <IPDiscoverySection onAdd={(c) => handleAdd(c, 'onvif')} />
      </div>

      <div className="px-4 lg:px-6">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Camera className="h-4 w-4" /> Registered Cameras
            </CardTitle>
          </CardHeader>
          <CardContent>
            <RegisteredCameras />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
