import type { PipelineDealRow } from '@/types/models'

interface ReadOnlyDealCardProps {
  deal:       PipelineDealRow
  stageColor: string
}

export function ReadOnlyDealCard({ deal, stageColor }: ReadOnlyDealCardProps) {
  return (
    <div
      style={{ borderLeftColor: stageColor }}
      className="glass-panel rounded-2xl p-4 border-l-2"
    >
      <div className="min-w-0">
        <p className="text-sm font-semibold text-[var(--text-primary)] truncate">
          {deal.contact.firstName} {deal.contact.lastName}
        </p>
        {deal.contact.companyName && (
          <p className="text-xs text-[var(--text-secondary)] truncate mt-0.5">{deal.contact.companyName}</p>
        )}
      </div>
      <p className="text-[11px] text-[var(--text-muted)] mt-2 truncate">{deal.campaign.name}</p>
      <div className="flex items-center justify-between mt-2">
        {deal.value ? (
          <span className="font-mono text-[11px] text-[var(--lf-accent)]">£{deal.value}</span>
        ) : (
          <span />
        )}
        <span className="text-[10px] text-[var(--text-muted)]">
          {new Date(deal.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
        </span>
      </div>
    </div>
  )
}
