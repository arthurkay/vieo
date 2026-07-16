import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useState, useEffect } from 'react'
import { api } from '@/lib/api'
import VideoPlayer from '@/components/VideoPlayer'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from '@/components/ui/dropdown-menu'
import { ArrowLeft, Tv, Lock, ChevronDown, Loader2 } from 'lucide-react'
import type { M3UChannel } from '@/types'

export default function BrowsePlayer() {
  const { channelIndex } = useParams<{ channelIndex: string }>()
  const navigate = useNavigate()
  const idx = parseInt(channelIndex || '-1')
  const [connecting, setConnecting] = useState(true)

  const { data, isLoading, error } = useQuery({
    queryKey: ['browse-channels'],
    queryFn: api.browse.channels,
    retry: false,
  })

  const channels = data?.channels ?? []
  const channel: M3UChannel | undefined = idx >= 0 && idx < channels.length ? channels[idx] : undefined

  if (isLoading) {
    return (
      <div className="container mx-auto p-6">
        <Skeleton className="h-8 w-48 mb-4" />
        <Skeleton className="aspect-video w-full rounded-lg" />
      </div>
    )
  }

  if (error || !channel) {
    return (
      <div className="container mx-auto p-6">
        <Button variant="ghost" size="sm" onClick={() => navigate('/browse')} className="mb-4">
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to channels
        </Button>
        <p className="text-sm text-muted-foreground">
          {error ? 'No playlist configured or it could not be read.' : 'Channel not found.'}
        </p>
      </div>
    )
  }

  const streamUrl = api.browse.streamUrl(channel.url)

  // Reset the connecting state whenever the channel changes.
  useEffect(() => {
    setConnecting(true)
  }, [channelIndex])

  return (
    <div className="container mx-auto p-4 sm:p-6 flex flex-col h-full min-h-0">
      <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
        <Button variant="ghost" size="sm" onClick={() => navigate('/browse')}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Channels
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-2 min-w-0 rounded-md px-2 py-1 hover:bg-muted transition-colors">
              <Tv className="h-5 w-5 shrink-0 text-muted-foreground" />
              <h1 className="text-lg font-semibold truncate flex items-center gap-1.5">
                {channel.name}
                {channel.geo_blocked && <Lock className="h-3.5 w-3.5 text-muted-foreground" />}
              </h1>
              {channel.resolution && (
                <Badge variant="outline" className="text-[10px]">{channel.resolution}</Badge>
              )}
              {channel.geo_blocked && (
                <Badge variant="secondary" className="text-[10px]">geo-blocked</Badge>
              )}
              <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="max-h-80 w-80 overflow-y-auto">
            <DropdownMenuRadioGroup
              value={String(idx)}
              onValueChange={(v) => navigate(`/browse/${v}`)}
            >
              {channels.map((c, i) => (
                <DropdownMenuRadioItem key={`${c.tvg_id}-${i}`} value={String(i)}>
                  <span className="flex items-center gap-2 min-w-0">
                    <Tv className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span className="truncate">{c.name}</span>
                    {c.geo_blocked && <Lock className="h-3 w-3 text-muted-foreground shrink-0" />}
                  </span>
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="bg-black rounded-lg overflow-hidden flex-1 min-h-0 relative">
        <VideoPlayer
          streamUrl={streamUrl}
          isLive={true}
          streamType="audio_video"
          showExportButton={false}
          outputId={undefined}
          autoPlay={true}
          onPlaying={() => setConnecting(false)}
          className="w-full h-full"
        />
        {connecting && (
          <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 bg-black/60 pointer-events-none">
            <Loader2 className="h-10 w-10 text-white/80 animate-spin" />
            <p className="text-sm text-white/80">Connecting to stream…</p>
          </div>
        )}
      </div>
    </div>
  )
}
