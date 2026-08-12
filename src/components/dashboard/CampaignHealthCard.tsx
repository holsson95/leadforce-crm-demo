import Link from 'next/link'
import { PhoneCall } from 'lucide-react'
import type { CampaignHealthRow } from '@/types/models'

const SCORE_BORDER = {
  green:  'border-[#8fce7d]/15',
  yellow: 'border-[var(--lf-accent)]/15',
  red:    'border-[#d98a5f]/15',
}

export function CampaignHealthCard({ row }: { row: CampaignHealthRow }) {
  const border = SCORE_BORDER[row.scoreLabel]

  return (
    <div className={`glass-panel rounded-2xl px-[18px] py-4 border ${border} flex flex-col gap-3`}>
      <div className="flex items-start justify-between">
        <div className="min-w-0 mr-3">
          <p className="text-sm font-semibold text-[var(--text-primary)] truncate">{row.campaignName}</p>
          <p className="text-xs text-[var(--text-muted)] mt-0.5 truncate">{row.clientName}</p>
        </div>
        <span className="flex-shrink-0 px-2.5 py-1 rounded-lg text-xs font-semibold bg-[#8fce7d]/10 text-[#8fce7d]">
          Active
        </span>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1">Activity</p>
          <p className="font-mono text-sm font-semibold text-[var(--text-primary)]">{row.activityRate}%</p>
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1 whitespace-nowrap">Conv. rate</p>
          <p className="font-mono text-sm font-semibold text-[var(--text-primary)]">{row.conversionRate}%</p>
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1">Meetings</p>
          <p className="font-mono text-sm font-semibold text-[var(--text-primary)]">{row.totalMBs}</p>
        </div>
      </div>

      <Link
        href={`/calling?campaign=${row.campaignId}`}
        className="flex items-center justify-center gap-2 py-2 rounded-xl bg-[var(--lf-accent)]/10 text-[var(--lf-accent)] text-xs font-semibold hover:bg-[var(--lf-accent)]/20 transition-colors duration-200"
      >
        <PhoneCall className="w-3.5 h-3.5" />
        Start calling
      </Link>
    </div>
  )
}
