import { useParams, useNavigate } from 'react-router-dom'
import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import { toast } from '@/lib/toast'
import VideoPlayer from '@/components/VideoPlayer'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { ArrowLeft, Radio, Activity, Clock, Calendar, Bookmark, Trash2, MapPin, Pencil, Download } from 'lucide-react'
import { useAuth } from '@/hooks/use-auth'
import { useWebSocket } from '@/hooks/use-websocket'
import type { JobEvent, TimelineEvent } from '@/types'

const EVENT_COLORS = ['#3b82f6', '#22c55e', '#ef4444', '#eab308', '#a855f7']

function SourceName({ sourceId }: { sourceId: number }) {
  const { data: sources } = useQuery({
    queryKey: ['sources'],
    queryFn: () => api.sources.list(),
  })
  const source = sources?.find((s) => s.id === sourceId)
  if (!source) return <div className="text-sm">#{sourceId}</div>
  return <div className="text-sm">{source.name || `#${source.id}`}</div>
}

export default function Player() {
  const { outputId } = useParams<{ outputId: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const id = parseInt(outputId || '0')

  const [jumpDate, setJumpDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [jumpTime, setJumpTime] = useState(() => new Date().toTimeString().slice(0, 8))
  const [showJump, setShowJump] = useState(false)

  const [showEventForm, setShowEventForm] = useState(false)
  const [eventLabel, setEventLabel] = useState('')
  const [eventColor, setEventColor] = useState(EVENT_COLORS[0])

  const [editingEvent, setEditingEvent] = useState<TimelineEvent | null>(null)
  const [editLabel, setEditLabel] = useState('')
  const [editColor, setEditColor] = useState(EVENT_COLORS[0])

  const { data: jobs } = useQuery({
    queryKey: ['jobs'],
    queryFn: () => api.jobs.list(),
  })

  const { data: sources } = useQuery({
    queryKey: ['sources'],
    queryFn: () => api.sources.list(),
  })

  const job = jobs?.find((j) => j.output_id === id && j.status !== 'stopped')
  const source = sources?.find((s) => s.id === job?.source_id)

  const { data: events = [] } = useQuery({
    queryKey: ['job-events', job?.id],
    queryFn: () => api.events.listByJob(job!.id),
    enabled: !!job?.id,
  })

  const sortedEvents = useMemo(
    () => [...events].sort((a, b) => a.time_offset - b.time_offset),
    [events],
  )

  const createEventMutation = useMutation({
    mutationFn: (data: { time_offset: number; label: string; color: string }) =>
      api.events.create(job!.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['job-events', job?.id] })
      setShowEventForm(false)
      setEventLabel('')
    },
  })

  const deleteEventMutation = useMutation({
    mutationFn: (id: number) => api.events.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['job-events', job?.id] })
    },
  })

  const updateEventMutation = useMutation({
    mutationFn: (data: { id: number; label: string; color: string; time_offset: number }) =>
      api.events.update(data.id, { label: data.label, color: data.color, time_offset: data.time_offset }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['job-events', job?.id] })
      setEditingEvent(null)
    },
    onError: (err: Error) => toast.error('Update event failed', err.message),
  })

  const startEditEvent = (ev: TimelineEvent) => {
    setEditingEvent(ev)
    setEditLabel(ev.label)
    setEditColor(ev.color)
  }

  useEffect(() => {
    if (job?.created_at) {
      const d = new Date(job.created_at)
      setJumpDate(d.toISOString().slice(0, 10))
      setJumpTime(d.toTimeString().slice(0, 8))
      setShowJump(true)
    }
  }, [job?.created_at])

  const isLive = job?.status === 'running'

  useEffect(() => {
    return () => {
      if (downloadPollRef.current) clearInterval(downloadPollRef.current)
    }
  }, [])

  const handleJump = useCallback(() => {
    if (!job?.created_at) return
    const target = new Date(`${jumpDate}T${jumpTime}`).getTime()
    const start = new Date(job.created_at).getTime()
    const offsetSec = (target - start) / 1000
    if (offsetSec >= 0) {
      const video = document.querySelector('video')
      if (video) {
        video.currentTime = offsetSec
        video.play().catch(() => {})
      }
    }
  }, [job?.created_at, jumpDate, jumpTime])

  const handleExport = useCallback((startTime: number, duration: number) => {
    if (!job) return
    api.exports.create({
      source_id: job.source_id,
      output_id: job.output_id,
      start_time: startTime,
      duration: duration,
    }).then(() => {
      queryClient.invalidateQueries({ queryKey: ['exports'] })
      toast.success('Export started', 'Your clip export has been queued')
    }).catch((err) => {
      toast.error('Export failed', err.message)
    })
  }, [job, queryClient])

  const downloadPollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const handleDownloadFull = useCallback(() => {
    if (!id) return
    api.outputs.download(id).then((exp) => {
      toast.info('Preparing download', 'Your recording is being packaged...')
      if (downloadPollRef.current) clearInterval(downloadPollRef.current)
      downloadPollRef.current = setInterval(() => {
        api.exports.get(exp.id).then((e) => {
          if (e.status === 'completed') {
            if (downloadPollRef.current) clearInterval(downloadPollRef.current)
            const link = document.createElement('a')
            link.href = api.exports.downloadUrl(e.id)
            link.download = `recording_${id}.mp4`
            document.body.appendChild(link)
            link.click()
            link.remove()
            toast.success('Download ready', 'Your recording has been downloaded')
          } else if (e.status === 'failed') {
            if (downloadPollRef.current) clearInterval(downloadPollRef.current)
            toast.error('Download failed', e.error_msg || 'Unknown error')
          }
        }).catch(() => {})
      }, 2000)
    }).catch((err) => {
      toast.error('Download failed', err.message)
    })
  }, [id])

  const handleAddEvent = useCallback(() => {
    if (!eventLabel.trim()) return
    const video = document.querySelector('video')
    const currentTime = video ? video.currentTime : 0
    createEventMutation.mutate({
      time_offset: currentTime,
      label: eventLabel.trim(),
      color: eventColor,
    })
  }, [eventLabel, eventColor, createEventMutation])

  const handleSeekToEvent = useCallback((offset: number) => {
    const video = document.querySelector('video')
    if (video) {
      video.currentTime = offset
      video.play().catch(() => {})
    }
  }, [])

  useWebSocket((event: JobEvent) => {
    if (event.type === 'job:update' && 'id' in event.payload) {
      const p = event.payload as { id: number; status?: string; progress?: number }
      if (job && p.id === job.id && p.status && p.status !== job.status) {
        queryClient.setQueryData(['jobs'], (old: any[]) =>
          old?.map((j) => (j.id === job.id ? { ...j, status: p.status } : j))
        )
      }
    }
  })

  return (
    <div className="h-full flex flex-col bg-background">
      <div className="flex items-center gap-2 sm:gap-4 p-3 sm:p-4 border-b shrink-0">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="min-h-9 shrink-0" aria-label="Go back">
          <ArrowLeft className="h-4 w-4 sm:mr-1" />
          <span className="hidden sm:inline">Back</span>
        </Button>
        <Separator orientation="vertical" className="h-6" />
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <Radio className="h-4 w-4 text-muted-foreground shrink-0" />
          <h1 className="text-base sm:text-lg font-semibold truncate">
            {job ? (job.source_id ? `Stream #${job.source_id}` : 'Stream') : 'Player'}
          </h1>
          {job?.status && <Badge variant={job.status}>{job.status}</Badge>}
        </div>

        <div className="ml-auto flex items-center gap-2">
          {showJump && !isLive && (
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground hidden sm:block" />
              <Input
                type="date"
                value={jumpDate}
                onChange={(e) => setJumpDate(e.target.value)}
                className="h-8 w-[140px] text-xs"
              />
              <Input
                type="time"
                value={jumpTime}
                onChange={(e) => setJumpTime(e.target.value)}
                step={1}
                className="h-8 w-[110px] text-xs"
              />
              <Button size="sm" className="h-8" onClick={handleJump}>
                Go
              </Button>
            </div>
          )}
          {user?.role === 'admin' && (
            <Button variant="outline" size="sm" className="h-8 gap-1" onClick={handleDownloadFull}>
              <Download className="h-4 w-4" />
              <span className="hidden sm:inline">Download</span>
            </Button>
          )}
        </div>
      </div>

      <div className="flex-1 flex flex-col lg:flex-row min-h-0">
        <div className="flex-1 p-2 sm:p-4 min-h-0">
          <VideoPlayer
            streamUrl={`/api/stream/${id}/playlist.m3u8`}
            isLive={isLive}
            startTime={job?.created_at}
            events={sortedEvents}
            onExport={handleExport}
            showExportButton={user?.role === 'admin'}
            streamType={source?.stream_type}
            outputId={id}
            className="w-full h-full max-h-[calc(100vh-5rem)] sm:max-h-[calc(100vh-8rem)]"
          />
        </div>

        <div className="flex flex-col p-4 gap-4 overflow-y-auto max-h-[45vh] lg:max-h-none lg:w-64 lg:border-l lg:shrink-0">
          <Card className="bg-muted/50">
            <CardContent className="p-4">
              <div className="text-xs text-muted-foreground mb-1">Output</div>
              <div className="font-medium text-sm">#{id}</div>
            </CardContent>
          </Card>

          <Card className="bg-muted/50">
            <CardContent className="p-4">
              <div className="text-xs text-muted-foreground mb-1">Status</div>
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4" />
                <span className="text-sm capitalize">{job?.status || 'unknown'}</span>
              </div>
            </CardContent>
          </Card>

          {job && (
            <Card className="bg-muted/50">
              <CardContent className="p-4">
                <div className="text-xs text-muted-foreground mb-1">Source</div>
                <SourceName sourceId={job.source_id} />
              </CardContent>
            </Card>
          )}

          {job?.created_at && (
            <Card className="bg-muted/50">
              <CardContent className="p-4">
                <div className="text-xs text-muted-foreground mb-1">Recording Started</div>
                <div className="flex items-center gap-2 text-sm">
                  <Clock className="h-4 w-4" />
                  <div>
                    <div>{new Date(job.created_at).toLocaleDateString()}</div>
                    <div className="text-muted-foreground">{new Date(job.created_at).toLocaleTimeString()}</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {isLive && (
            <Card className="bg-muted/50">
              <CardContent className="p-4">
                <div className="text-xs text-muted-foreground mb-1">Live</div>
                <div className="flex items-center gap-2 text-sm">
                  <Radio className="h-4 w-4 text-red-500 animate-pulse" />
                  <span>Recording in progress</span>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Events section */}
          <Card className="bg-muted/50">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs text-muted-foreground">Events</div>
                {user?.role === 'admin' && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-xs"
                    onClick={() => setShowEventForm(!showEventForm)}
                  >
                    <Bookmark className="h-3 w-3 mr-1" />
                    Add
                  </Button>
                )}
              </div>

              {showEventForm && (
                <div className="space-y-2 mb-3">
                  <Input
                    value={eventLabel}
                    onChange={(e) => setEventLabel(e.target.value)}
                    placeholder="Event label"
                    className="h-7 text-xs"
                    onKeyDown={(e) => e.key === 'Enter' && handleAddEvent()}
                  />
                  <div className="flex gap-1">
                    {EVENT_COLORS.map((c) => (
                      <button
                        key={c}
                        className={cn(
                          'w-5 h-5 rounded-full border-2',
                          eventColor === c ? 'border-white' : 'border-transparent',
                        )}
                        style={{ backgroundColor: c }}
                        onClick={() => setEventColor(c)}
                      />
                    ))}
                  </div>
                  <Button
                    size="sm"
                    className="h-7 w-full text-xs"
                    onClick={handleAddEvent}
                    disabled={!eventLabel.trim() || createEventMutation.isPending}
                  >
                    Save Event
                  </Button>
                </div>
              )}

              {sortedEvents.length === 0 ? (
                <div className="text-xs text-muted-foreground">No events</div>
              ) : (
                <div className="space-y-1">
                  {sortedEvents.map((ev) => {
                    if (editingEvent && editingEvent.id === ev.id) {
                      return (
                        <div key={ev.id} className="rounded p-1 -m-1 bg-muted/50 space-y-2">
                          <Input
                            value={editLabel}
                            onChange={(e) => setEditLabel(e.target.value)}
                            className="h-7 text-xs"
                            autoFocus
                          />
                          <div className="flex items-center gap-1">
                            {EVENT_COLORS.map((c) => (
                              <button
                                key={c}
                                type="button"
                                className={cn(
                                  'h-4 w-4 rounded-full border',
                                  editColor === c ? 'border-foreground' : 'border-transparent',
                                )}
                                style={{ backgroundColor: c }}
                                onClick={() => setEditColor(c)}
                              />
                            ))}
                          </div>
                          <div className="flex gap-1">
                            <Button
                              size="sm"
                              className="h-7 text-xs flex-1"
                              disabled={!editLabel.trim() || updateEventMutation.isPending}
                              onClick={() =>
                                updateEventMutation.mutate({
                                  id: ev.id,
                                  label: editLabel.trim(),
                                  color: editColor,
                                  time_offset: ev.time_offset,
                                })
                              }
                            >
                              Save
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 text-xs"
                              onClick={() => setEditingEvent(null)}
                            >
                              Cancel
                            </Button>
                          </div>
                        </div>
                      )
                    }
                    return (
                      <div
                        key={ev.id}
                        className="flex items-center gap-2 text-xs group cursor-pointer hover:bg-muted/50 rounded p-1 -m-1"
                        onClick={() => handleSeekToEvent(ev.time_offset)}
                      >
                        <MapPin className="h-3 w-3 shrink-0" style={{ color: ev.color }} />
                        <span className="truncate flex-1">{ev.label}</span>
                        <span className="text-muted-foreground shrink-0">{formatTime(ev.time_offset)}</span>
                        {user?.role === 'admin' && (
                          <>
                            <button
                              className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                              onClick={(e) => { e.stopPropagation(); startEditEvent(ev) }}
                            >
                              <Pencil className="h-3 w-3 text-muted-foreground hover:text-foreground" />
                            </button>
                            <button
                              className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                              onClick={(e) => { e.stopPropagation(); deleteEventMutation.mutate(ev.id) }}
                            >
                              <Trash2 className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                            </button>
                          </>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return '0:00'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }
  return `${m}:${String(s)}`
}
