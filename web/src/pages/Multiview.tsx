import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useWebSocket } from '@/hooks/use-websocket'
import { toast } from '@/lib/toast'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Maximize, MonitorOff, LayoutGrid, X } from 'lucide-react'
import MultiviewPanel from '@/components/MultiviewPanel'
import type { Job, Source, JobEvent } from '@/types'

type GridSize = 2 | 3 | 4

interface StreamInfo {
  outputId: number
  sourceName: string
  streamType: 'audio_video' | 'audio_only' | 'video_only'
  isLive: boolean
}

export default function Multiview() {
  const queryClient = useQueryClient()
  const [gridSize, setGridSize] = useState<GridSize>(2)
  const [selectedOutputs, setSelectedOutputs] = useState<(number | null)[]>([])
  const [listeningId, setListeningId] = useState<number | null>(null)
  const [showSources, setShowSources] = useState(true)

  const gridRef = useRef<HTMLDivElement>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const autoFilledRef = useRef(false)

  const { data: jobs } = useQuery({ queryKey: ['jobs'], queryFn: () => api.jobs.list() })
  const { data: outputs } = useQuery({ queryKey: ['outputs'], queryFn: api.outputs.list })
  const { data: sources } = useQuery({ queryKey: ['sources'], queryFn: () => api.sources.list() })

  useWebSocket((event: JobEvent) => {
    if (event.type === 'job:update' || event.type === 'job:complete' || event.type === 'job:error') {
      queryClient.invalidateQueries({ queryKey: ['jobs'] })
    }
  })

  const availableStreams = useMemo<StreamInfo[]>(() => {
    if (!outputs || !jobs) return []
    const result: StreamInfo[] = []
    for (const o of outputs) {
      const job = jobs.find((j: Job) => j.output_id === o.id)
      if (!job) continue
      if (job.status === 'stopped' || job.status === 'failed') continue
      const src = sources?.find((s: Source) => s.id === o.source_id)
      result.push({
        outputId: o.id,
        sourceName: src?.name || `Source #${o.source_id}`,
        streamType: src?.stream_type || 'audio_video',
        isLive: job.status === 'running',
      })
    }
    return result
  }, [outputs, jobs, sources])

  const capacity = gridSize * gridSize

  // Auto-fill slots on first load
  useEffect(() => {
    if (autoFilledRef.current) return
    if (availableStreams.length === 0) return
    const init: (number | null)[] = new Array(capacity).fill(null)
    for (let i = 0; i < Math.min(capacity, availableStreams.length); i++) {
      init[i] = availableStreams[i].outputId
    }
    setSelectedOutputs(init)
    autoFilledRef.current = true
  }, [availableStreams, capacity])

  // Resize array when grid changes
  useEffect(() => {
    setSelectedOutputs((prev) => {
      const next: (number | null)[] = new Array(capacity).fill(null)
      for (let i = 0; i < Math.min(capacity, prev.length); i++) next[i] = prev[i]
      // Fill remaining with available streams not yet placed
      if (!autoFilledRef.current) {
        const used = new Set(next.filter((v): v is number => v !== null))
        let idx = prev.length
        for (const s of availableStreams) {
          if (idx >= capacity) break
          if (used.has(s.outputId)) continue
          next[idx] = s.outputId
          used.add(s.outputId)
          idx++
        }
      }
      return next
    })
  }, [gridSize, capacity, availableStreams])

  const ensureAudio = useCallback(() => {
    if (!audioCtxRef.current) {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      const ctx = new Ctx()
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 256
      const gain = ctx.createGain()
      gain.gain.value = 1
      analyser.connect(gain)
      gain.connect(ctx.destination)
      audioCtxRef.current = ctx
      analyserRef.current = analyser
    }
    if (audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume()
    }
  }, [])

  const handleListen = useCallback(
    (outputId: number) => {
      ensureAudio()
      setListeningId((cur) => (cur === outputId ? null : outputId))
    },
    [ensureAudio],
  )

  const handleSlotChange = useCallback((slot: number, value: string) => {
    const outputId = value ? Number(value) : null
    setSelectedOutputs((prev) => {
      const next = [...prev]
      next[slot] = outputId
      return next
    })
    if (outputId && listeningId === outputId) {
      // keep listening
    }
  }, [listeningId])

  const enterFullscreen = () => {
    gridRef.current?.requestFullscreen?.().catch(() => {
      toast.error('Fullscreen unavailable', 'Your browser blocked fullscreen mode')
    })
  }

  const gridColsClass = { 2: 'grid-cols-2', 3: 'grid-cols-3', 4: 'grid-cols-4' }[gridSize]

  return (
    <div className="flex flex-1 flex-col gap-3 py-3 md:gap-4 md:py-4 overflow-hidden">
      <div className="px-4 lg:px-6 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5">
          <LayoutGrid className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Grid</span>
        </div>
        <div className="flex items-center gap-1">
          {([2, 3, 4] as GridSize[]).map((s) => (
            <Button
              key={s}
              size="sm"
              variant={gridSize === s ? 'default' : 'outline'}
              className="h-8 px-2.5 text-xs"
              onClick={() => setGridSize(s)}
            >
              {s}x{s}
            </Button>
          ))}
        </div>

        <Button
          size="sm"
          variant="outline"
          className="h-8 px-2.5 text-xs"
          onClick={() => setShowSources((v) => !v)}
        >
          Sources
        </Button>

        <div className="ml-auto flex items-center gap-1">
          <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={enterFullscreen}>
            <Maximize className="h-4 w-4" />
            <span className="hidden sm:inline">Fullscreen</span>
          </Button>
        </div>
      </div>

      <div className="flex-1 flex min-h-0 px-4 lg:px-6 gap-3">
        <div
          ref={gridRef}
          className={cn(
            'flex-1 grid gap-1 bg-zinc-950 rounded-lg p-1 min-h-0',
            gridColsClass,
          )}
        >
          {Array.from({ length: capacity }).map((_, slot) => {
            const outputId = selectedOutputs[slot]
            const stream = outputId
              ? availableStreams.find((s) => s.outputId === outputId)
              : undefined
            return (
              <div key={slot} className="relative min-h-0 min-w-0 group">
                {stream ? (
                  <>
                    <MultiviewPanel
                      outputId={stream.outputId}
                      sourceName={stream.sourceName}
                      streamType={stream.streamType}
                      isLive={stream.isLive}
                      isListening={listeningId === stream.outputId}
                      onListen={() => handleListen(stream.outputId)}
                      audioCtxRef={audioCtxRef}
                      analyserRef={analyserRef}
                    />
                    <select
                      value={outputId ?? ''}
                      onChange={(e) => handleSlotChange(slot, e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      className="absolute top-1 left-1/2 -translate-x-1/2 z-10 max-w-[80%] text-[10px] bg-black/70 text-white border border-white/20 rounded px-1 py-0.5 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
                    >
                      <option value="">— empty —</option>
                      {availableStreams.map((s) => (
                        <option key={s.outputId} value={s.outputId}>
                          {s.sourceName}
                        </option>
                      ))}
                    </select>
                  </>
                ) : (
                  <div className="relative aspect-video bg-zinc-900 rounded-sm flex flex-col items-center justify-center gap-1 text-zinc-600">
                    <MonitorOff className="h-6 w-6" />
                    <span className="text-[10px]">No signal</span>
                    <select
                      value=""
                      onChange={(e) => handleSlotChange(slot, e.target.value)}
                      className="absolute bottom-1 left-1/2 -translate-x-1/2 max-w-[80%] text-[10px] bg-black/70 text-white border border-white/20 rounded px-1 py-0.5"
                    >
                      <option value="">Assign source…</option>
                      {availableStreams.map((s) => (
                        <option key={s.outputId} value={s.outputId}>
                          {s.sourceName}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {showSources && (
          <div className="hidden md:flex w-56 shrink-0 flex-col border rounded-lg overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 border-b">
              <span className="text-xs font-medium">Available sources</span>
              <button
                onClick={() => setShowSources(false)}
                className="text-muted-foreground hover:text-foreground"
                aria-label="Close sources"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {availableStreams.length === 0 ? (
                <p className="text-xs text-muted-foreground p-2">No active streams</p>
              ) : (
                availableStreams.map((s) => (
                  <div
                    key={s.outputId}
                    className="flex items-center gap-2 text-xs px-2 py-1.5 rounded hover:bg-accent cursor-pointer"
                    onClick={() => {
                      setSelectedOutputs((prev) => {
                        const next = [...prev]
                        const emptyIdx = next.findIndex((v) => v === null)
                        if (emptyIdx >= 0) next[emptyIdx] = s.outputId
                        else next[0] = s.outputId
                        return next
                      })
                    }}
                  >
                    <span
                      className={cn(
                        'h-1.5 w-1.5 rounded-full shrink-0',
                        s.isLive ? 'bg-red-500 animate-pulse' : 'bg-amber-500',
                      )}
                    />
                    <span className="truncate">{s.sourceName}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
