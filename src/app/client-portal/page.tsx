import { Target, PhoneCall, TrendingUp } from 'lucide-react'
import { KpiCard } from '@/components/dashboard/KpiCard'
import { PortalDealsList } from '@/components/client-portal/PortalDealsList'
import { getCurrentClientRecord, getPortalSummary, getPortalDealsGrouped } from '@/lib/client-portal'

export default async function ClientPortalDashboard() {
  const client = await getCurrentClientRecord()
  if (!client) return null  // layout shows PortalPending in this case

  const [summary, { stages, deals }] = await Promise.all([
    getPortalSummary(client.id, client.tenantId),
    getPortalDealsGrouped(client.id, client.tenantId),
  ])

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">Overview</h1>
        <p className="text-sm text-[var(--text-secondary)] mt-0.5">Your campaign and pipeline summary</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiCard
          title="Active Campaigns"
          value={summary.activeCampaigns}
          format="number"
          icon={<Target className="w-4 h-4" />}
        />
        <KpiCard
          title="Meetings Booked"
          value={summary.meetingsBooked}
          format="number"
          icon={<PhoneCall className="w-4 h-4" />}
        />
        <KpiCard
          title="Open Deals"
          value={summary.openDealCount}
          format="number"
          icon={<TrendingUp className="w-4 h-4" />}
        />
      </div>

      <PortalDealsList stages={stages} deals={deals} />
    </div>
  )
}
