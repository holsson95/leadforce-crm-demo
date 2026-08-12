import Link from 'next/link'
import { cn } from '@/lib/utils'

interface PeriodToggleProps {
  current: 'week' | 'month'
}

export function PeriodToggle({ current }: PeriodToggleProps) {
  return (
    <div className="flex items-center gap-1 bg-[var(--panel-border)] rounded-xl p-1">
      <Link
        href="/reports?period=week"
        className={cn(
          'px-4 py-1.5 rounded-lg text-sm font-medium transition-colors duration-150',
          current === 'week' ? 'bg-[var(--accent-muted)] text-[var(--lf-accent)]' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
        )}
      >
        This Week
      </Link>
      <Link
        href="/reports?period=month"
        className={cn(
          'px-4 py-1.5 rounded-lg text-sm font-medium transition-colors duration-150',
          current === 'month' ? 'bg-[var(--accent-muted)] text-[var(--lf-accent)]' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
        )}
      >
        This Month
      </Link>
    </div>
  )
}
