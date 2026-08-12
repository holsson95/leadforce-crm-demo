import { redirect } from 'next/navigation'
import { auth } from '@clerk/nextjs/server'
import { Phone, MessageSquare, CalendarCheck, Percent, ArrowRight, Info, Trophy, AlertCircle } from 'lucide-react'
import Link from 'next/link'
import { db, withTenant } from '@/lib/db'
import { getClerkMeta, getCurrentClerkUser } from '@/lib/auth'
import type { UserRole } from '@prisma/client'
import { getDashboardKpis, getCampaignHealth, getLeaderboard, getDailyTargetStats } from '@/lib/reports'
import { cn } from '@/lib/utils'
import { Header } from '@/components/layout/Header'
import { PageShell } from '@/components/layout/PageShell'
import { KpiCard } from '@/components/dashboard/KpiCard'
import { CampaignHealthGrid } from '@/components/dashboard/CampaignHealthGrid'

export default async function DashboardPage() {
  const { userId: clerkId } = await auth()
  if (!clerkId) redirect('/sign-in')

  const { role, tenantId } = await getClerkMeta()
  if (!tenantId) {
    return (
      <div className="flex h-screen items-center justify-center bg-[var(--bg-dark)]">
        <div className="glass-panel p-8 max-w-sm text-center space-y-3">
          <p className="text-[var(--text-primary)] font-semibold">Account setup pending</p>
          <p className="text-sm text-[var(--text-secondary)]">Your account is being provisioned. Please refresh in a moment.</p>
        </div>
      </div>
    )
  }

  const isManager = role === 'admin' || role === 'manager'

  let dbUser = await withTenant(tenantId, () =>
    db.user.findFirst({
      where:  { clerkId },
      select: {
        id: true,
        sdrPermissions: { select: { canAccessDashboard: true }, take: 1 },
      },
    })
  )
  if (!dbUser) {
    const clerkUser = await getCurrentClerkUser()
    const email = clerkUser?.emailAddresses[0]?.emailAddress ?? ''
    const name  = [clerkUser?.firstName, clerkUser?.lastName].filter(Boolean).join(' ') || email
    dbUser = await db.user.upsert({
      where:  { clerkId },
      create: { clerkId, tenantId, email, name, role: role as UserRole },
      update: { email, name },
      select: { id: true, sdrPermissions: { select: { canAccessDashboard: true }, take: 1 } },
    })
  }

  if (!isManager) {
    const canAccess = dbUser.sdrPermissions[0]?.canAccessDashboard ?? true
    if (!canAccess) redirect('/calling')
  }

  const [kpis, healthRows, leaderboardRows, dailyStats, unassignedCount] = await Promise.all([
    getDashboardKpis(tenantId, isManager ? null : dbUser.id),
    getCampaignHealth(tenantId, isManager ? null : dbUser.id),
    getLeaderboard(tenantId, 'week'),
    getDailyTargetStats(tenantId, dbUser.id, role),
    withTenant(tenantId, () =>
      db.campaign.count({
        where: { status: 'draft', deletedAt: null, sdrs: { none: {} } },
      })
    ),
  ])

  const targetPct = dailyStats.target > 0
    ? Math.min(100, Math.round((dailyStats.count / dailyStats.target) * 100))
    : 0
  const top5 = leaderboardRows.slice(0, 5)
  const noActivity = kpis.calls.current === 0

  const RANK_COLORS = [
    'text-[var(--lf-accent)]',
    'text-[var(--text-secondary)]',
    'text-amber-700',
    'text-[var(--text-muted)]',
    'text-[var(--text-muted)]',
  ]

  return (
    <>
      <Header
        title="Dashboard"
        subtitle={isManager ? 'Team overview — this week' : 'Your performance — this week'}
      />
      <PageShell>

        {/* Activity banner — shown when nothing logged yet */}
        {noActivity && (
          <div className="glass-panel rounded-2xl px-5 py-4 flex items-center justify-between border border-[var(--lf-accent)]/20">
            <div className="flex items-center gap-3">
              <Info className="w-5 h-5 text-[var(--lf-accent)]/60 flex-shrink-0" />
              <p className="text-sm text-[var(--text-secondary)]">
                No calling activity logged yet this week. Start a session to see live stats here.
              </p>
            </div>
            <Link
              href="/calling"
              className="flex-shrink-0 ml-4 px-5 py-2.5 rounded-xl bg-[var(--lf-accent)] text-[#17140f] text-sm font-semibold hover:bg-[#e8970d] transition-colors duration-200 flex items-center gap-2"
            >
              <Phone className="w-4 h-4" />
              Start calling
            </Link>
          </div>
        )}

        {/* KPI grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard
            title="Calls made"
            value={kpis.calls.current}
            format="number"
            icon={<Phone className="w-4 h-4" />}
          />
          <KpiCard
            title="Conversations"
            value={kpis.conversations.current}
            format="number"
            icon={<MessageSquare className="w-4 h-4" />}
          />
          <KpiCard
            title="Meetings booked"
            value={kpis.meetings.current}
            format="number"
            icon={<CalendarCheck className="w-4 h-4" />}
          />
          <KpiCard
            title="Conversion rate"
            value={kpis.conversionRate.current}
            format="percent"
            icon={<Percent className="w-4 h-4" />}
          />
        </div>

        {/* Two-column section: Campaign health + Daily target/Leaderboard */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-3 items-start">

          {/* Left: Campaign health */}
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-[var(--text-primary)]">Campaign health</h2>
              {healthRows.length > 0 && (
                <span className="px-2.5 py-1 rounded-full bg-[#8fce7d]/10 text-[#8fce7d] text-xs font-semibold">
                  {healthRows.length} active
                </span>
              )}
            </div>
            <CampaignHealthGrid rows={healthRows} />
            {unassignedCount > 0 && (
              <div className="mt-[10px] flex items-center gap-1.5">
                <AlertCircle className="w-[14px] h-[14px] text-[#d98a5f] flex-shrink-0" />
                <span className="text-xs text-[#d98a5f]">
                  {unassignedCount} draft campaign{unassignedCount !== 1 ? 's' : ''} have no SDR assigned
                </span>
              </div>
            )}
          </section>

          {/* Right: Today's target + leaderboard */}
          <div className="glass-panel rounded-2xl overflow-hidden">

            {/* Daily target */}
            <div className="px-[18px] py-4 border-b border-[var(--panel-border)]">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-semibold text-[var(--text-primary)]">Today's target</p>
                <span className="font-mono text-sm text-[var(--text-muted)]">
                  {dailyStats.count} of {dailyStats.target > 0 ? dailyStats.target : '—'}
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-[var(--panel-border)]">
                <div
                  className="h-1.5 rounded-full bg-[var(--lf-accent)] transition-all duration-500"
                  style={{ width: `${targetPct}%` }}
                />
              </div>
            </div>

            {/* Leaderboard */}
            <div className="px-[18px] py-4">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Trophy className="w-4 h-4 text-amber-400 flex-shrink-0" />
                  <span className="text-sm font-semibold text-[var(--text-primary)]">Leaderboard, this week</span>
                </div>
                <Link
                  href="/reports"
                  className="flex items-center gap-1 text-xs text-[var(--lf-accent)]/60 hover:text-[var(--lf-accent)] transition-colors duration-150"
                >
                  See all <ArrowRight className="w-3 h-3" />
                </Link>
              </div>
              {top5.length === 0 ? (
                <p className="text-sm text-[var(--text-muted)]">No calls logged yet — be the first.</p>
              ) : (
                <div className="space-y-2.5">
                  {top5.map((row, i) => (
                    <div key={row.userId} className="flex items-center gap-2.5">
                      <span className={cn('font-mono text-xs font-bold w-4 text-center flex-shrink-0', RANK_COLORS[i])}>
                        {i + 1}
                      </span>
                      <span className="text-sm text-[var(--text-secondary)] flex-1 truncate">{row.name}</span>
                      <span className="font-mono text-xs text-[var(--lf-accent)] font-semibold">{row.score}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>
        </div>

      </PageShell>
    </>
  )
}
