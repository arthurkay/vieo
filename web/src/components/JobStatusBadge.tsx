import { cn } from '../lib/utils'

const statusConfig: Record<string, { className: string; label: string }> = {
  pending: { className: 'bg-gray-100 text-gray-700 border-gray-200', label: 'Pending' },
  running: { className: 'bg-blue-100 text-blue-700 border-blue-200 animate-pulse', label: 'Running' },
  paused: { className: 'bg-amber-100 text-amber-700 border-amber-200', label: 'Paused' },
  completed: { className: 'bg-green-100 text-green-700 border-green-200', label: 'Completed' },
  failed: { className: 'bg-red-100 text-red-700 border-red-200', label: 'Failed' },
  stopped: { className: 'bg-slate-100 text-slate-700 border-slate-200', label: 'Stopped' },
}

interface JobStatusBadgeProps {
  status: string
}

export default function JobStatusBadge({ status }: JobStatusBadgeProps) {
  const config = statusConfig[status] || statusConfig.pending
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold',
        config.className,
      )}
    >
      {config.label}
    </span>
  )
}
