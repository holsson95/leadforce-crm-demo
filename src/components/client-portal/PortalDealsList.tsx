import Link from 'next/link'

interface PortalDeal {
  id:      string
  title:   string
  value:   string | null
  stageId: string
  contact: { firstName: string; lastName: string; companyName: string | null }
}

interface PortalStage {
  id:    string
  name:  string
  color: string
}

interface PortalDealsListProps {
  stages: PortalStage[]
  deals:  PortalDeal[]
}

export function PortalDealsList({ stages, deals }: PortalDealsListProps) {
  const dealsByStage = stages.reduce<Record<string, PortalDeal[]>>((acc, s) => {
    acc[s.id] = deals.filter((d) => d.stageId === s.id)
    return acc
  }, {})

  const stagesWithDeals = stages.filter((s) => (dealsByStage[s.id]?.length ?? 0) > 0)

  if (stagesWithDeals.length === 0) {
    return (
      <div className="glass-panel rounded-2xl p-8 flex flex-col items-center text-center">
        <p className="text-sm text-[var(--text-muted)]">No open deals yet</p>
      </div>
    )
  }

  return (
    <div className="glass-panel rounded-2xl overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-[var(--panel-border)]">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">Open Deals</h3>
        <Link href="/client-portal/pipeline" className="text-xs text-[var(--lf-accent)] hover:underline">
          View full pipeline →
        </Link>
      </div>
      <div className="divide-y divide-[var(--panel-border)]">
        {stagesWithDeals.map((stage) => (
          <div key={stage.id} className="px-5 py-3">
            <div className="flex items-center gap-2 mb-2">
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: stage.color }} />
              <span className="text-xs font-semibold text-[var(--text-secondary)]">{stage.name}</span>
            </div>
            <div className="space-y-2">
              {dealsByStage[stage.id].map((deal) => (
                <div key={deal.id} className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <span className="text-sm text-[var(--text-primary)] truncate block">
                      {deal.contact.firstName} {deal.contact.lastName}
                    </span>
                    {deal.contact.companyName && (
                      <span className="text-xs text-[var(--text-muted)] truncate block">{deal.contact.companyName}</span>
                    )}
                  </div>
                  {deal.value && (
                    <span className="font-mono text-xs text-[var(--lf-accent)] flex-shrink-0">£{deal.value}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
