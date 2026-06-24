import { cn } from '../lib/utils'

interface ProgressBarProps {
  progress: number
  className?: string
}

export default function ProgressBar({ progress, className }: ProgressBarProps) {
  const percent = Math.min(Math.max(progress * 100, 0), 100)
  return (
    <div className={cn('w-full bg-secondary rounded-full h-2', className)}>
      <div
        className="bg-primary h-2 rounded-full transition-all duration-500 ease-out"
        style={{ width: `${percent}%` }}
      />
    </div>
  )
}
