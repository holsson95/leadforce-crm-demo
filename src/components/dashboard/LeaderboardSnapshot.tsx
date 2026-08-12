import Link from 'next/link'
import { Trophy, ArrowRight, Star } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { LeaderboardRow } from '@/types/models'

const RANK_COLORS = ['text-amber-400', 'text-[var(--text-secondary)]', 'text-amber-600']

export function LeaderboardSnapshot({ rows }: { rows: LeaderboardRow[] }) {
  const top5 = rows.slice(0, 5)

  return (
    <div className="glass-panel rounded-2xl overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--panel-border)]">
        <div className="flex items-center gap-2">
          <Trophy className="w-4 h-4 text-amber-400" />
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">Leaderboard</h3>
          <span className="text-xs text-[var(--text-muted)]">this week</span>
        </div>
        <Link
          href="/reports"
          className="flex items-center gap-1 text-xs text-[var(--lf-accent)] hover:text-[var(--text-primary)] transition-colors duration-150"
        >
          See full leaderboard <ArrowRight className="w-3 h-3" />
        </Link>
      </div>

      {top5.length === 0 ? (
        <div className="px-5 py-10 text-center text-sm text-[var(--text-muted)]">No calls logged this week yet</div>
      ) : (
        <div className="divide-y divide-[var(--panel-border)]">
          {top5.map((row, i) => (
            <div key={row.userId} className="flex items-center gap-3 px-5 py-3 hover:bg-[var(--panel-border-hover)] transition-colors">
              <span className={cn('font-mono text-sm font-bold w-5 text-center flex-shrink-0', RANK_COLORS[i] ?? 'text-[var(--text-muted)]')}>
                {i + 1}
              </span>
              <div className="flex-1 flex items-center gap-2 min-w-0">
                <span className="text-sm text-[var(--text-primary)] truncate">{row.name}</span>
                {row.isMostImproved && (
                  <span className="flex-shrink-0 flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-[var(--accent-muted)] text-[var(--lf-accent)] text-[9px] font-semibold">
                    <Star className="w-2 h-2" />
                    Most Improved
                  </span>
                )}
              </div>
              <span className="font-mono text-xs text-[var(--text-muted)] flex-shrink-0">{row.meetings} MB</span>
              <span className="font-mono text-xs font-semibold text-[var(--lf-accent)] w-8 text-right flex-shrink-0">{row.score}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
