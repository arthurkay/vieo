import { useState, Fragment } from 'react'
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
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Plus, MoreHorizontal, Trash2, HardDrive, Calendar, ChevronDown, ChevronRight, Clock, Pencil, Check, X } from 'lucide-react'
import type { Source, Output, Schedule } from '@/types'

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

function SourceStorage({ sourceId, outputs }: { sourceId: number; outputs: Output[] | undefined }) {
  const sourceOutputs = outputs?.filter(o => o.source_id === sourceId) || []
  if (sourceOutputs.length === 0) return <span className="text-muted-foreground">-</span>

  return (
    <div className="flex items-center gap-1">
      {sourceOutputs.map(output => (
        <StorageBadge key={output.id} outputId={output.id} />
      ))}
    </div>
  )
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

const DAY_OPTIONS = [
  { value: 'Mon', label: 'Monday' },
  { value: 'Tue', label: 'Tuesday' },
  { value: 'Wed', label: 'Wednesday' },
  { value: 'Thu', label: 'Thursday' },
  { value: 'Fri', label: 'Friday' },
  { value: 'Sat', label: 'Saturday' },
  { value: 'Sun', label: 'Sunday' },
]

function ScheduleForm({ sourceId, onClose }: { sourceId: number; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [startTime, setStartTime] = useState('09:00')
  const [endTime, setEndTime] = useState('17:00')
  const [selectedDays, setSelectedDays] = useState<string[]>(['Mon', 'Tue', 'Wed', 'Thu', 'Fri'])

  const createMutation = useMutation({
    mutationFn: () => api.schedules.create({
      source_id: sourceId,
      name: name.trim(),
      start_time: startTime,
      end_time: endTime,
      days_of_week: selectedDays.join(','),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['schedules'] })
      onClose()
    },
    onError: (err: Error) => alert(`Create failed: ${err.message}`),
  })

  function toggleDay(day: string) {
    setSelectedDays(prev =>
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]
    )
  }

  return (
    <div className="p-3 border rounded-lg bg-muted/30 space-y-3">
      <div className="grid gap-3 sm:grid-cols-4">
        <div className="space-y-2">
          <Label className="text-xs">Name (optional)</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Morning Stream"
            className="h-8"
          />
        </div>
        <div className="space-y-2">
          <Label className="text-xs">Start Time</Label>
          <Input
            type="time"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            className="h-8"
          />
        </div>
        <div className="space-y-2">
          <Label className="text-xs">End Time</Label>
          <Input
            type="time"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
            className="h-8"
          />
        </div>
        <div className="space-y-2">
          <Label className="text-xs">Days</Label>
          <div className="flex flex-wrap gap-1">
            {DAY_OPTIONS.map(day => (
              <button
                key={day.value}
                type="button"
                onClick={() => toggleDay(day.value)}
                className={`px-2 py-1 text-xs rounded ${
                  selectedDays.includes(day.value)
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-secondary text-secondary-foreground'
                }`}
              >
                {day.value}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="flex gap-2">
        <Button
          size="sm"
          onClick={() => createMutation.mutate()}
          disabled={createMutation.isPending || selectedDays.length === 0}
        >
          {createMutation.isPending ? 'Creating...' : 'Create Schedule'}
        </Button>
        <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
      </div>
    </div>
  )
}

function ScheduleRow({ schedule }: { schedule: Schedule }) {
  const queryClient = useQueryClient()

  const toggleMutation = useMutation({
    mutationFn: () => api.schedules.update(schedule.id, { enabled: !schedule.enabled }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['schedules'] }),
  })

  const deleteMutation = useMutation({
    mutationFn: () => api.schedules.delete(schedule.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['schedules'] }),
  })

  const days = schedule.days_of_week.split(',').join(', ')
  const isRunning = schedule.current_job_id !== null

  return (
    <div className="flex items-center justify-between p-2 border rounded bg-background">
      <div className="flex items-center gap-4 text-sm">
        <div className="flex items-center gap-1.5">
          <Clock className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="font-mono">{schedule.start_time} - {schedule.end_time || '∞'}</span>
        </div>
        <div className="text-muted-foreground">
          {days || 'Every day'}
        </div>
        {schedule.name && (
          <div className="text-muted-foreground italic">{schedule.name}</div>
        )}
        {isRunning && (
          <span className="text-xs px-1.5 py-0.5 bg-green-100 text-green-700 rounded dark:bg-green-900 dark:text-green-300">
            Recording
          </span>
        )}
      </div>
      <div className="flex items-center gap-1">
        <button
          onClick={() => toggleMutation.mutate()}
          className={`w-8 h-4 rounded-full transition-colors ${
            schedule.enabled ? 'bg-primary' : 'bg-muted'
          }`}
        >
          <div className={`w-3.5 h-3.5 rounded-full bg-white shadow transform transition-transform ${
            schedule.enabled ? 'translate-x-4' : 'translate-x-0.5'
          }`} />
        </button>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={() => deleteMutation.mutate()}
        >
          <Trash2 className="h-3 w-3 text-muted-foreground" />
        </Button>
      </div>
    </div>
  )
}

function SourceSchedules({ sourceId }: { sourceId: number }) {
  const [showForm, setShowForm] = useState(false)

  const { data: schedules } = useQuery({
    queryKey: ['schedules', sourceId],
    queryFn: () => api.schedules.list(sourceId),
  })

  return (
    <div className="space-y-2">
      {schedules && schedules.length > 0 && (
        <div className="space-y-1">
          {schedules.map(schedule => (
            <ScheduleRow key={schedule.id} schedule={schedule} />
          ))}
        </div>
      )}
      {showForm ? (
        <ScheduleForm sourceId={sourceId} onClose={() => setShowForm(false)} />
      ) : (
        <Button
          variant="ghost"
          size="sm"
          className="text-xs text-muted-foreground"
          onClick={() => setShowForm(true)}
        >
          <Plus className="h-3 w-3 mr-1" /> Add Schedule
        </Button>
      )}
    </div>
  )
}

function EditableSourceName({ source }: { source: Source }) {
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(source.name)

  const updateMutation = useMutation({
    mutationFn: () => api.sources.update(source.id, { name: value.trim() }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sources'] })
      setEditing(false)
    },
    onError: (err: Error) => alert(`Update failed: ${err.message}`),
  })

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="h-7 w-40 text-sm"
          autoFocus
          onKeyDown={(e) => {
            if (e.key === 'Enter') updateMutation.mutate()
            if (e.key === 'Escape') { setEditing(false); setValue(source.name) }
          }}
        />
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => updateMutation.mutate()} disabled={updateMutation.isPending}>
          <Check className="h-3 w-3" />
        </Button>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => { setEditing(false); setValue(source.name) }}>
          <X className="h-3 w-3" />
        </Button>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-1 group">
      <span className="text-muted-foreground">{source.name || '—'}</span>
      <button
        className="opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={() => setEditing(true)}
      >
        <Pencil className="h-3 w-3 text-muted-foreground hover:text-foreground" />
      </button>
    </div>
  )
}

export default function Sources() {
  const queryClient = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [type, setType] = useState<Source['type']>('file')
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [channelId, setChannelId] = useState('')
  const [watermarkEnabled, setWatermarkEnabled] = useState(false)
  const [watermarkText, setWatermarkText] = useState('LIVE')
  const [watermarkPosition, setWatermarkPosition] = useState<'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'>('top-left')
  const [deleteId, setDeleteId] = useState<number | null>(null)
  const [expandedSource, setExpandedSource] = useState<number | null>(null)

  const { data: sources, isLoading } = useQuery({ queryKey: ['sources'], queryFn: () => api.sources.list() })
  const { data: channels } = useQuery({ queryKey: ['channels'], queryFn: api.channels.list })
  const { data: outputs } = useQuery({ queryKey: ['outputs'], queryFn: api.outputs.list })

  const channelMap = new Map(channels?.map((c) => [c.id, c]) || [])

  const createMutation = useMutation({
    mutationFn: (data: { channel_id: number; name: string; type: Source['type']; url: string; metadata?: string }) =>
      api.sources.create({ ...data, stream_type: 'audio_video' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sources'] })
      setShowForm(false)
      setName('')
      setUrl('')
      setChannelId('')
      setWatermarkEnabled(false)
      setWatermarkText('LIVE')
      setWatermarkPosition('top-left')
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
    const metadata = type === 'device' && watermarkEnabled
      ? JSON.stringify({ watermark: { enabled: true, text: watermarkText || 'LIVE', position: watermarkPosition } })
      : undefined
    createMutation.mutate({ channel_id: parsedChannelId, name: name.trim(), type, url: url.trim(), metadata })
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
                <div className="grid gap-4 sm:grid-cols-4">
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
                    <Label>Name (optional)</Label>
                    <Input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g. Security Camera"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Type</Label>
                    <Select value={type} onValueChange={(v) => setType(v as Source['type'])}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="file">File</SelectItem>
                        <SelectItem value="hls">HLS Stream</SelectItem>
                        <SelectItem value="rtmp">RTMP</SelectItem>
                        <SelectItem value="rtsp">RTSP</SelectItem>
                        <SelectItem value="device">Device</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>{type === 'file' ? 'File Path' : 'URL'}</Label>
                    <Input
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                      placeholder={type === 'file' ? '/path/to/video.mp4' : type === 'device' ? '/dev/video0' : 'https://...m3u8, rtmp://..., or rtsp://...'}
                      required
                    />
                  </div>
                </div>
                {type === 'device' && (
                  <div className="grid gap-4 sm:grid-cols-3 mt-4 p-3 border rounded-lg bg-muted/30">
                    <div className="space-y-2">
                      <Label className="text-xs">Watermark</Label>
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={watermarkEnabled}
                          onChange={(e) => setWatermarkEnabled(e.target.checked)}
                          className="rounded"
                        />
                        Show LIVE badge
                      </label>
                    </div>
                    {watermarkEnabled && (
                      <>
                        <div className="space-y-2">
                          <Label className="text-xs">Badge Text</Label>
                          <Input
                            value={watermarkText}
                            onChange={(e) => setWatermarkText(e.target.value)}
                            placeholder="LIVE"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs">Position</Label>
                          <Select value={watermarkPosition} onValueChange={(v) => setWatermarkPosition(v as typeof watermarkPosition)}>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="top-left">Top Left</SelectItem>
                              <SelectItem value="top-right">Top Right</SelectItem>
                              <SelectItem value="bottom-left">Bottom Left</SelectItem>
                              <SelectItem value="bottom-right">Bottom Right</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </>
                    )}
                  </div>
                )}
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
                    <TableHead className="w-8"></TableHead>
                    <TableHead>ID</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Channel</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Stream</TableHead>
                    <TableHead>URL</TableHead>
                    <TableHead>Storage</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sources.map((source) => {
                    const ch = channelMap.get(source.channel_id)
                    const isExpanded = expandedSource === source.id
                    return (
                      <Fragment key={source.id}>
                        <TableRow key={source.id} className="cursor-pointer" onClick={() => setExpandedSource(isExpanded ? null : source.id)}>
                          <TableCell>
                            {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          </TableCell>
                          <TableCell className="font-medium">#{source.id}</TableCell>
                          <TableCell className="text-muted-foreground"><EditableSourceName source={source} /></TableCell>
                          <TableCell>{ch?.name || `Channel #${source.channel_id}`}</TableCell>
                          <TableCell className="capitalize">{source.type}</TableCell>
                          <TableCell className="text-muted-foreground">{(source.stream_type as string).split('_').join(' + ')}</TableCell>
                          <TableCell className="font-mono text-xs text-muted-foreground max-w-[300px] truncate" title={source.url}>{source.url}</TableCell>
                          <TableCell>
                            <SourceStorage sourceId={source.id} outputs={outputs} />
                          </TableCell>
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
                                  onClick={(e) => { e.stopPropagation(); setDeleteId(source.id) }}
                                >
                                  <Trash2 className="mr-2 h-4 w-4" /> Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                        {isExpanded && (
                          <TableRow key={`${source.id}-schedules`}>
                            <TableCell colSpan={9} className="p-3 bg-muted/20">
                              <div className="flex items-center gap-2 mb-2">
                                <Calendar className="h-4 w-4 text-muted-foreground" />
                                <span className="text-sm font-medium">Schedules</span>
                              </div>
                              <SourceSchedules sourceId={source.id} />
                            </TableCell>
                          </TableRow>
                        )}
                      </Fragment>
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

      <ConfirmDialog
        open={deleteId !== null}
        onOpenChange={(open) => { if (!open) setDeleteId(null) }}
        title="Delete Source"
        description="Are you sure you want to delete this source? This action cannot be undone."
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={() => { if (deleteId) deleteMutation.mutate(deleteId); setDeleteId(null) }}
        loading={deleteMutation.isPending}
      />
    </div>
  )
}
