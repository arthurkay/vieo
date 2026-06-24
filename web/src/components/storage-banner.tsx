import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { AlertTriangle, HardDrive } from 'lucide-react'
import { cn } from '@/lib/utils'

export default function StorageBanner() {
  const { data: health } = useQuery({
    queryKey: ['health'],
    queryFn: api.health,
    refetchInterval: 30_000,
  })

  const disk = health?.disk
  if (!disk) return null

  const usage = disk.usage_percent
  const isCritical = usage >= disk.crit
  const isWarning = usage >= disk.warn

  if (!isWarning && !isCritical) return null

  return (
    <div
      className={cn(
        'flex items-center gap-3 px-4 py-2 text-sm font-medium border-b',
        isCritical
          ? 'bg-destructive/10 text-destructive border-destructive/20'
          : 'bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800',
      )}
    >
      {isCritical ? (
        <AlertTriangle className="h-4 w-4 shrink-0" />
      ) : (
        <HardDrive className="h-4 w-4 shrink-0" />
      )}
      <span>
        {isCritical
          ? `Critical disk usage: ${usage.toFixed(1)}% — jobs are being stopped`
          : `Disk usage at ${usage.toFixed(1)}% — transcoding jobs paused`}
      </span>
      <span className="text-xs opacity-60 ml-auto">
        {disk.free_gb.toFixed(1)} GB free of {disk.total_gb.toFixed(0)} GB
      </span>
    </div>
  )
}
