import { redirect } from 'next/navigation'
import { db, withTenant } from '@/lib/db'
import { getClerkMeta, hasPermission } from '@/lib/auth'
import { getLeaderboard, getMBBreakdown } from '@/lib/reports'
import { Header } from '@/components/layout/Header'
import { PageShell } from '@/components/layout/PageShell'
import { PeriodToggle } from '@/components/reports/PeriodToggle'
import { LeaderboardTable } from '@/components/reports/LeaderboardTable'
import { MBStatusBreakdown } from '@/components/reports/MBStatusBreakdown'
import { CampaignFilter } from '@/components/reports/CampaignFilter'

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; campaignId?: string }>
}) {
  const { role, tenantId } = await getClerkMeta()
  if (!tenantId || !hasPermission(role, 'reports:read')) redirect('/')

  const { period: rawPeriod, campaignId } = await searchParams
  const period = rawPeriod === 'month' ? 'month' : 'week'

  const [leaderboardRows, mbData, campaigns] = await Promise.all([
    getLeaderboard(tenantId, period),
    getMBBreakdown(tenantId, period, campaignId),
    withTenant(tenantId, () =>
      db.campaign.findMany({
        where:   { deletedAt: null },
        select:  { id: true, name: true, archivedAt: true },
        orderBy: { name: 'asc' },
      })
    ),
  ])

  return (
    <>
      <Header title="Reports" subtitle="SDR performance and pipeline analytics" />
      <PageShell>
        <div className="flex justify-end">
          <PeriodToggle current={period} />
        </div>

        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-4">SDR Leaderboard</h2>
          <LeaderboardTable rows={leaderboardRows} />
        </section>

        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">Meeting Bookings</h2>
            <CampaignFilter campaigns={campaigns} selected={campaignId} period={period} />
          </div>
          <MBStatusBreakdown data={mbData} />
        </section>
      </PageShell>
    </>
  )
}
