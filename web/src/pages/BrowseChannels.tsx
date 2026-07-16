import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { api } from '@/lib/api'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Tv, Play, Search, Lock } from 'lucide-react'
import type { M3UChannel } from '@/types'

export default function BrowseChannels() {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')

  const { data, isLoading, error } = useQuery({
    queryKey: ['browse-channels'],
    queryFn: api.browse.channels,
    retry: false,
  })

  const channels = data?.channels ?? []

  const filtered = useMemo(() => {
    if (!query.trim()) return channels
    const q = query.toLowerCase()
    return channels.filter(
      (c) => c.name.toLowerCase().includes(q) || c.tvg_id.toLowerCase().includes(q),
    )
  }, [channels, query])

  if (isLoading) {
    return (
      <div className="container mx-auto p-6">
        <Skeleton className="h-8 w-48 mb-4" />
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {Array.from({ length: 12 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="container mx-auto p-6">
        <h1 className="text-2xl font-bold mb-2 flex items-center gap-2">
          <Tv className="h-6 w-6" /> Browse Channels
        </h1>
        <p className="text-sm text-muted-foreground">
          No playlist is configured on the server, or it could not be read.
        </p>
      </div>
    )
  }

  return (
    <div className="container mx-auto p-6">
      <div className="flex items-center justify-between mb-4 gap-4 flex-wrap">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Tv className="h-6 w-6" /> Browse Channels
          {channels.length > 0 && (
            <Badge variant="secondary" className="ml-1">{channels.length}</Badge>
          )}
        </h1>
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search channels..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-8"
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">No channels found.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {filtered.map((c: M3UChannel, i) => (
            <button
              key={`${c.tvg_id}-${i}`}
              onClick={() => navigate(`/browse/${i}`)}
              className="text-left rounded-lg border bg-card hover:bg-accent transition-colors p-3 flex items-center gap-3 group"
            >
              <div className="h-10 w-10 shrink-0 rounded bg-muted flex items-center justify-center">
                <Tv className="h-5 w-5 text-muted-foreground" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-medium truncate flex items-center gap-1">
                  {c.name}
                  {c.geo_blocked && <Lock className="h-3 w-3 text-muted-foreground shrink-0" />}
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  {c.resolution && (
                    <Badge variant="outline" className="text-[10px] px-1 py-0 h-4">
                      {c.resolution}
                    </Badge>
                  )}
                  {c.geo_blocked && (
                    <span className="text-[10px] text-muted-foreground">geo-blocked</span>
                  )}
                </div>
              </div>
              <Play className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
