import { Activity } from 'lucide-react'
import { CampaignHealthCard } from './CampaignHealthCard'
import type { CampaignHealthRow } from '@/types/models'

function gridCols(count: number) {
  if (count === 1) return 'grid-cols-1'
  if (count === 2) return 'grid-cols-1 sm:grid-cols-2'
  return 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'
}

export function CampaignHealthGrid({ rows }: { rows: CampaignHealthRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="glass-panel rounded-2xl p-10 flex flex-col items-center justify-center gap-3 text-center">
        <Activity className="w-8 h-8 text-[var(--text-muted)]" />
        <p className="text-sm text-[var(--text-secondary)]">No active campaigns with a daily target set</p>
        <p className="text-xs text-[var(--text-muted)]">Set a daily target on a campaign to see health scoring.</p>
      </div>
    )
  }

  return (
    <div className={`grid ${gridCols(rows.length)} gap-4`}>
      {rows.map((row) => (
        <CampaignHealthCard key={row.campaignId} row={row} />
      ))}
    </div>
  )
}
