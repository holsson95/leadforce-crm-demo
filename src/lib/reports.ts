import { db, withTenant } from '@/lib/db'
import type {
  DashboardKpisData,
  CampaignHealthRow,
  LeaderboardRow,
  MBBreakdownData,
  MBDetailRow,
  DailyTargetStats,
} from '@/types/models'

// ─── Date utilities ───────────────────────────────────────────────────────────

export function getWeekBounds(now = new Date()): { start: Date; end: Date } {
  const day = now.getUTCDay()
  const monday = new Date(now)
  monday.setUTCDate(now.getUTCDate() - (day === 0 ? 6 : day - 1))
  monday.setUTCHours(0, 0, 0, 0)
  return { start: monday, end: now }
}

export function getPriorWeekBounds(now = new Date()): { start: Date; end: Date } {
  const { start: thisMonday } = getWeekBounds(now)
  const priorMonday = new Date(thisMonday)
  priorMonday.setUTCDate(priorMonday.getUTCDate() - 7)
  const priorEnd = new Date(thisMonday)
  priorEnd.setMilliseconds(priorEnd.getMilliseconds() - 1)
  return { start: priorMonday, end: priorEnd }
}

export function getMonthBounds(now = new Date()): { start: Date; end: Date } {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0))
  return { start, end: now }
}

export function getPriorMonthBounds(now = new Date()): { start: Date; end: Date } {
  const { start: thisMonthStart } = getMonthBounds(now)
  const priorEnd = new Date(thisMonthStart)
  priorEnd.setMilliseconds(priorEnd.getMilliseconds() - 1)
  const priorStart = new Date(Date.UTC(priorEnd.getUTCFullYear(), priorEnd.getUTCMonth(), 1, 0, 0, 0, 0))
  return { start: priorStart, end: priorEnd }
}

function getLast7DayBuckets(now = new Date()): Array<{ start: Date; end: Date }> {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now)
    d.setUTCDate(now.getUTCDate() - (6 - i))
    const start = new Date(d)
    start.setUTCHours(0, 0, 0, 0)
    const end = new Date(d)
    end.setUTCHours(23, 59, 59, 999)
    return { start, end }
  })
}

// ─── Pure formula functions (exported for tests) ─────────────────────────────

export function computeCompositeScore(calls: number, conversations: number, meetings: number): number {
  return calls * 0.3 + conversations * 0.4 + meetings * 0.3
}

export function computeHealthScore(activityRate: number, conversionRate: number): number {
  const capped = Math.min(activityRate, 1)
  return Math.round((capped * 0.6 + conversionRate * 0.4) * 100)
}

export function healthScoreLabel(score: number): 'green' | 'yellow' | 'red' {
  if (score >= 70) return 'green'
  if (score >= 40) return 'yellow'
  return 'red'
}

export function computeTrendPct(current: number, prior: number): number {
  if (prior === 0) return current > 0 ? 100 : 0
  return Math.round(((current - prior) / prior) * 100)
}

export function computeMostImprovedId(
  sdrs: Array<{ userId: string; currentRaw: number; priorRaw: number; hasBothPeriods: boolean }>
): string | null {
  const eligible = sdrs.filter(s => s.hasBothPeriods && s.priorRaw > 0 && s.currentRaw > s.priorRaw)
  if (eligible.length === 0) return null
  return eligible.reduce((a, b) => {
    const aGain = (a.currentRaw - a.priorRaw) / a.priorRaw
    const bGain = (b.currentRaw - b.priorRaw) / b.priorRaw
    return aGain >= bGain ? a : b
  }).userId
}

// ─── Query helpers ────────────────────────────────────────────────────────────

export async function getDashboardKpis(
  tenantId: string,
  userId: string | null
): Promise<DashboardKpisData> {
  const now = new Date()
  const { start: weekStart } = getWeekBounds(now)
  const buckets = getLast7DayBuckets(now)
  const sparklineStart = buckets[0].start

  // Prior week: same calendar window, 7 days earlier
  const priorWeekStart = new Date(weekStart)
  priorWeekStart.setUTCDate(priorWeekStart.getUTCDate() - 7)
  const priorNow = new Date(now)
  priorNow.setUTCDate(priorNow.getUTCDate() - 7)

  const records = await withTenant(tenantId, () =>
    db.callRecord.findMany({
      where: {
        createdAt: { gte: priorWeekStart },
        ...(userId ? { userId } : {}),
      },
      select: { createdAt: true, conversationTagged: true, outcome: true },
    })
  )

  const weekRecords  = records.filter(r => r.createdAt >= weekStart)
  const priorRecords = records.filter(r => r.createdAt >= priorWeekStart && r.createdAt <= priorNow)

  function bucketCounts(fn: (r: typeof records[0]) => boolean) {
    return buckets.map(({ start, end }) =>
      records.filter(r => r.createdAt >= start && r.createdAt <= end && fn(r)).length
    )
  }

  const currentCalls   = weekRecords.length
  const currentConvs   = weekRecords.filter(r => r.conversationTagged).length
  const currentMBs     = weekRecords.filter(r => r.outcome === 'meeting_booked').length
  const currentConvPct = currentConvs > 0 ? Math.round((currentMBs / currentConvs) * 100) : 0

  const priorCalls   = priorRecords.length
  const priorConvs   = priorRecords.filter(r => r.conversationTagged).length
  const priorMBs     = priorRecords.filter(r => r.outcome === 'meeting_booked').length
  const priorConvPct = priorConvs > 0 ? Math.round((priorMBs / priorConvs) * 100) : 0

  const convRateByDay = buckets.map(({ start, end }) => {
    const day = records.filter(r => r.createdAt >= start && r.createdAt <= end)
    const c = day.filter(r => r.conversationTagged).length
    const m = day.filter(r => r.outcome === 'meeting_booked').length
    return c > 0 ? Math.round((m / c) * 100) : 0
  })

  return {
    calls:          { current: currentCalls, sparkline: bucketCounts(() => true), trend: computeTrendPct(currentCalls, priorCalls) },
    conversations:  { current: currentConvs, sparkline: bucketCounts(r => r.conversationTagged), trend: computeTrendPct(currentConvs, priorConvs) },
    meetings:       { current: currentMBs,   sparkline: bucketCounts(r => r.outcome === 'meeting_booked'), trend: computeTrendPct(currentMBs, priorMBs) },
    conversionRate: { current: currentConvPct, sparkline: convRateByDay, trend: computeTrendPct(currentConvPct, priorConvPct) },
  }
}

export async function getCampaignHealth(tenantId: string, userId?: string | null): Promise<CampaignHealthRow[]> {
  const now = new Date()
  const { start: weekStart } = getWeekBounds(now)
  const daysElapsed = Math.max(1, Math.ceil((now.getTime() - weekStart.getTime()) / (1000 * 60 * 60 * 24)))

  const campaigns = await withTenant(tenantId, () =>
    db.campaign.findMany({
      where: {
        status: 'active', archivedAt: null, deletedAt: null, dailyTargetCalls: { not: null },
        ...(userId ? { sdrs: { some: { userId } } } : {}),
      },
      select: {
        id: true,
        name: true,
        dailyTargetCalls: true,
        client: { select: { name: true } },
        callRecords: {
          where: { createdAt: { gte: weekStart } },
          select: { conversationTagged: true, outcome: true },
        },
      },
    })
  )

  return campaigns
    .map((campaign) => {
      const records    = campaign.callRecords
      const totalCalls = records.length
      const convs      = records.filter(r => r.conversationTagged).length
      const mbs        = records.filter(r => r.outcome === 'meeting_booked').length
      const target     = (campaign.dailyTargetCalls ?? 1) * daysElapsed
      const activityRate   = target > 0 ? totalCalls / target : 0
      const conversionRate = convs > 0 ? mbs / convs : 0
      const score = computeHealthScore(activityRate, conversionRate)

      return {
        campaignId:     campaign.id,
        campaignName:   campaign.name,
        clientName:     campaign.client.name,
        score,
        scoreLabel:     healthScoreLabel(score),
        activityRate:   Math.round(activityRate * 100),
        conversionRate: Math.round(conversionRate * 100),
        totalMBs:       mbs,
      }
    })
    .sort((a, b) => b.score - a.score)
}

export async function getLeaderboard(
  tenantId: string,
  period: 'week' | 'month'
): Promise<LeaderboardRow[]> {
  const now = new Date()
  const { start: currentStart } = period === 'week' ? getWeekBounds(now) : getMonthBounds(now)
  const { start: priorStart }   = period === 'week' ? getPriorWeekBounds(now) : getPriorMonthBounds(now)

  const users = await withTenant(tenantId, () =>
    db.user.findMany({
      where: { deletedAt: null },
      select: {
        id: true,
        name: true,
        role: true,
        callRecords: {
          where: { createdAt: { gte: priorStart } },
          select: { createdAt: true, conversationTagged: true, outcome: true },
        },
      },
    })
  )

  // Everyone with the sdr role is eligible regardless of activity; anyone else
  // (e.g. an admin/manager who's dialing) only shows up if they logged calls.
  const sdrs = users.filter(u => u.role === 'sdr' || u.callRecords.length > 0)

  const rows = sdrs.map((sdr) => {
    const current = sdr.callRecords.filter(r => r.createdAt >= currentStart)
    const prior   = sdr.callRecords.filter(r => r.createdAt >= priorStart && r.createdAt < currentStart)

    const currentRaw = computeCompositeScore(
      current.length,
      current.filter(r => r.conversationTagged).length,
      current.filter(r => r.outcome === 'meeting_booked').length
    )
    const priorRaw = computeCompositeScore(
      prior.length,
      prior.filter(r => r.conversationTagged).length,
      prior.filter(r => r.outcome === 'meeting_booked').length
    )

    return {
      userId:        sdr.id,
      name:          sdr.name,
      calls:         current.length,
      conversations: current.filter(r => r.conversationTagged).length,
      meetings:      current.filter(r => r.outcome === 'meeting_booked').length,
      currentRaw,
      priorRaw,
      hasBothPeriods: prior.length >= 1 && current.length >= 1,
    }
  })

  const maxRaw         = Math.max(...rows.map(r => r.currentRaw), 1)
  const mostImprovedId = computeMostImprovedId(rows)

  return rows
    .map(r => ({
      userId:         r.userId,
      name:           r.name,
      calls:          r.calls,
      conversations:  r.conversations,
      meetings:       r.meetings,
      score:          Math.round((r.currentRaw / maxRaw) * 100),
      isMostImproved: r.userId === mostImprovedId,
    }))
    .sort((a, b) => b.score - a.score)
}

export async function getMBBreakdown(
  tenantId: string,
  period: 'week' | 'month',
  campaignId?: string
): Promise<MBBreakdownData> {
  const now = new Date()
  const { start, end } = period === 'week' ? getWeekBounds(now) : getMonthBounds(now)

  const records = await withTenant(tenantId, () =>
    db.callRecord.findMany({
      where: {
        outcome: 'meeting_booked',
        mbLeadStatus: { not: null },
        createdAt: { gte: start, lte: end },
        campaign: { deletedAt: null },
        ...(campaignId ? { campaignId } : {}),
      },
      select: {
        id: true,
        mbLeadStatus: true,
        createdAt: true,
        contact:  { select: { firstName: true, lastName: true, companyName: true } },
        user:     { select: { name: true } },
        campaign: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
    })
  )

  const summary = {
    total:             records.length,
    firstConversation: records.filter(r => r.mbLeadStatus === 'first_conversation').length,
    followUp:          records.filter(r => r.mbLeadStatus === 'follow_up').length,
    nurturedLead:      records.filter(r => r.mbLeadStatus === 'nurtured_lead').length,
  }

  const rows: MBDetailRow[] = records
    .filter((r): r is typeof r & { mbLeadStatus: NonNullable<typeof r.mbLeadStatus> } => r.mbLeadStatus !== null)
    .map(r => ({
      callRecordId:     r.id,
      contactFirstName: r.contact.firstName,
      contactLastName:  r.contact.lastName,
      companyName:      r.contact.companyName ?? null,
      sdrName:          r.user.name,
      campaignName:     r.campaign.name,
      date:             r.createdAt.toISOString(),
      mbLeadStatus:     r.mbLeadStatus,
    }))

  return { summary, rows }
}

export async function getDailyTargetStats(
  tenantId: string,
  userId: string,
  role: string
): Promise<DailyTargetStats> {
  const now = new Date()
  const todayStart = new Date(now)
  todayStart.setUTCHours(0, 0, 0, 0)

  if (role === 'sdr') {
    const [count, assignments] = await withTenant(tenantId, () =>
      Promise.all([
        // count is not covered by tenant middleware — explicit tenantId required
        db.callRecord.count({ where: { userId, tenantId, createdAt: { gte: todayStart } } }),
        db.campaignSDR.findMany({
          where: { userId },
          select: {
            campaign: {
              select: { dailyTargetCalls: true, status: true, archivedAt: true, deletedAt: true },
            },
          },
        }),
      ])
    )
    const target = assignments
      .filter(
        a =>
          a.campaign.status === 'active' &&
          a.campaign.archivedAt === null &&
          a.campaign.deletedAt === null &&
          a.campaign.dailyTargetCalls
      )
      .reduce((sum, a) => sum + (a.campaign.dailyTargetCalls ?? 0), 0)
    return { count, target }
  }

  const [count, campaigns] = await withTenant(tenantId, () =>
    Promise.all([
      // count is not covered by tenant middleware — explicit tenantId required
      db.callRecord.count({ where: { tenantId, createdAt: { gte: todayStart } } }),
      db.campaign.findMany({
        where: { status: 'active', archivedAt: null, deletedAt: null, dailyTargetCalls: { not: null } },
        select: { dailyTargetCalls: true },
      }),
    ])
  )
  const target = campaigns.reduce((sum, c) => sum + (c.dailyTargetCalls ?? 0), 0)
  return { count, target }
}
