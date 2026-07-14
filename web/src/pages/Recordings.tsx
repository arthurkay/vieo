import { useState, useMemo, useRef, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { api } from '@/lib/api'
import { toast } from '@/lib/toast'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Play, Search, Clapperboard, Download } from 'lucide-react'
import type { Output, Source, Job } from '@/types'

type StatusFilter = 'all' | 'live' | 'recorded'

interface Recording {
  output: Output
  source: Source
  job: Job | undefined
  isLive: boolean
}

export default function Recordings() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const downloadPollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    return () => {
      if (downloadPollRef.current) clearInterval(downloadPollRef.current)
    }
  }, [])

  const handleDownload = (outputId: number) => {
    api.outputs.download(outputId).then((exp) => {
      toast.info('Preparing download', 'Your recording is being packaged...')
      if (downloadPollRef.current) clearInterval(downloadPollRef.current)
      downloadPollRef.current = setInterval(() => {
        api.exports.get(exp.id).then((e) => {
          if (e.status === 'completed') {
            if (downloadPollRef.current) clearInterval(downloadPollRef.current)
            const link = document.createElement('a')
            link.href = api.exports.downloadUrl(e.id)
            link.download = `recording_${outputId}.mp4`
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
  }

  const { data: sources } = useQuery({ queryKey: ['sources'], queryFn: () => api.sources.list() })
  const { data: outputs } = useQuery({ queryKey: ['outputs'], queryFn: api.outputs.list })
  const { data: jobs } = useQuery({ queryKey: ['jobs'], queryFn: () => api.jobs.list() })

  const recordings = useMemo<Recording[]>(() => {
    if (!sources || !outputs || !jobs) return []
    const sourceMap = new Map(sources.map((s) => [s.id, s]))
    const jobsByOutput = new Map<number, Job[]>()
    for (const j of jobs) {
      const list = jobsByOutput.get(j.output_id)
      if (list) list.push(j)
      else jobsByOutput.set(j.output_id, [j])
    }
    const result: Recording[] = []
    for (const output of outputs) {
      const source = sourceMap.get(output.source_id)
      if (!source) continue
      const outputJobs = jobsByOutput.get(output.id)
      const latestJob = [...(outputJobs || [])].sort((a, b) => b.id - a.id)[0]
      const isLive = latestJob?.status === 'running'
      result.push({ output, source, job: latestJob, isLive })
    }
    return result
  }, [sources, outputs, jobs])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return recordings.filter((r) => {
      if (statusFilter === 'live' && !r.isLive) return false
      if (statusFilter === 'recorded' && r.isLive) return false
      if (q && !r.source.name.toLowerCase().includes(q)) return false
      return true
    })
  }, [recordings, search, statusFilter])

  return (
    <div className="flex flex-1 flex-col gap-4 py-4 md:gap-6 md:py-6">
      <div className="px-4 lg:px-6">
        <h2 className="text-2xl font-bold tracking-tight">Recordings</h2>
        <p className="text-muted-foreground">Browse and review recorded streams</p>
      </div>

      <div className="px-4 lg:px-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="live">Live</TabsTrigger>
            <TabsTrigger value="recorded">Recorded</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="relative w-full sm:max-w-xs">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by source name"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>
      </div>

      <div className="px-4 lg:px-6">
        <Card>
          <CardContent className="p-0">
            {!recordings.length ? (
              <div className="p-8 text-center text-muted-foreground">
                <Clapperboard className="h-8 w-8 mx-auto mb-2 opacity-50" />
                No recordings available
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Source</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((r) => (
                      <TableRow key={r.output.id}>
                        <TableCell className="font-medium">{r.source.name}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{r.source.stream_type}</TableCell>
                        <TableCell>
                          <Badge variant={r.isLive ? 'running' : 'completed'}>
                            {r.isLive ? 'live' : 'recorded'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {new Date(r.output.created_at).toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 gap-1"
                              onClick={() => handleDownload(r.output.id)}
                            >
                              <Download className="h-3.5 w-3.5" />
                              <span className="hidden sm:inline">Download</span>
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 gap-1"
                              onClick={() => navigate(`/player/${r.output.id}`)}
                            >
                              <Play className="h-3.5 w-3.5" />
                              Play
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                    {filtered.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-muted-foreground py-6">
                          No recordings match your filters
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
