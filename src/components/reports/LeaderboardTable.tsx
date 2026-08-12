import { Trophy, Star } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { LeaderboardRow } from '@/types/models'

const RANK_COLORS = ['text-amber-400', 'text-[var(--text-secondary)]', 'text-amber-600']

export function LeaderboardTable({ rows }: { rows: LeaderboardRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="glass-panel rounded-2xl p-10 flex flex-col items-center gap-3 text-center">
        <Trophy className="w-8 h-8 text-[var(--text-muted)]" />
        <p className="text-sm text-[var(--text-secondary)]">No calls logged in this period</p>
      </div>
    )
  }

  return (
    <div className="glass-panel rounded-2xl overflow-hidden">
      <table className="w-full">
        <thead>
          <tr className="border-b border-[var(--panel-border)]">
            <th className="text-left px-5 py-3 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] w-10">#</th>
            <th className="text-left px-5 py-3 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">SDR</th>
            <th className="text-right px-5 py-3 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">Calls</th>
            <th className="text-right px-5 py-3 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">Convs</th>
            <th className="text-right px-5 py-3 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">MBs</th>
            <th className="text-right px-5 py-3 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">Score</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--panel-border)]">
          {rows.map((row, i) => (
            <tr key={row.userId} className="hover:bg-[var(--panel-border-hover)] transition-colors">
              <td className="px-5 py-3.5">
                <span className={cn('font-mono text-sm font-bold', RANK_COLORS[i] ?? 'text-[var(--text-muted)]')}>
                  {i + 1}
                </span>
              </td>
              <td className="px-5 py-3.5">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-[var(--text-primary)]">{row.name}</span>
                  {row.isMostImproved && (
                    <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-[var(--accent-muted)] text-[var(--lf-accent)] text-[10px] font-semibold">
                      <Star className="w-2.5 h-2.5" />
                      Most Improved
                    </span>
                  )}
                </div>
              </td>
              <td className="px-5 py-3.5 text-right font-mono text-sm text-[var(--text-secondary)]">{row.calls}</td>
              <td className="px-5 py-3.5 text-right font-mono text-sm text-[var(--text-secondary)]">{row.conversations}</td>
              <td className="px-5 py-3.5 text-right font-mono text-sm text-[var(--text-secondary)]">{row.meetings}</td>
              <td className="px-5 py-3.5 text-right font-mono text-sm font-semibold text-[var(--lf-accent)]">{row.score}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
