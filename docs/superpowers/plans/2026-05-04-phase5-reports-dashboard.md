# Phase 5: Reports & Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the live Dashboard page (KPI cards, campaign health, leaderboard snapshot) and a Reports page (full leaderboard, MB lead status breakdown) using Server Components + URL search params, with MB lead status stored at call-log time.

**Architecture:** Pure Server Components with `searchParams` for period filtering. All DB queries go through helper functions in `src/lib/reports.ts`. One new pure-function file (`mb-lead-status.ts`) extracted for testability. No new API routes.

**Tech Stack:** Next.js 14 App Router, Prisma/PostgreSQL, Clerk, Tailwind CSS, Shadcn/UI, Lucide React, Vitest

---

## File Map

**New files:**
- `src/lib/mb-lead-status.ts` — pure `classifyMBLeadStatus` function
- `src/lib/__tests__/mb-lead-status.test.ts` — unit tests for all 3 classification branches
- `src/lib/reports.ts` — query helpers + exported pure formula functions
- `src/lib/__tests__/reports.test.ts` — unit tests for formulas (no DB)
- `src/components/dashboard/Sparkline.tsx` — inline SVG sparkline, 7-point path
- `src/components/dashboard/KpiCard.tsx` — metric card with sparkline + trend badge
- `src/components/dashboard/CampaignHealthCard.tsx` — single campaign health card
- `src/components/dashboard/CampaignHealthGrid.tsx` — grid of health cards
- `src/components/dashboard/LeaderboardSnapshot.tsx` — top-5 leaderboard for dashboard
- `src/components/reports/PeriodToggle.tsx` — week/month link toggle
- `src/components/reports/CampaignFilter.tsx` — `'use client'` campaign select
- `src/components/reports/LeaderboardTable.tsx` — full SDR leaderboard table
- `src/components/reports/MBStatusBreakdown.tsx` — MB summary counts + detail table
- `src/app/(dashboard)/reports/page.tsx` — Reports Server Component

**Modified files:**
- `prisma/schema.prisma` — add `MBLeadStatus` enum + `mbLeadStatus` field on `CallRecord`
- `src/lib/auth.ts` — add `reports:read` permission to admin/manager/sdr roles
- `src/types/models.ts` — add `KpiStat`, `DashboardKpisData`, `CampaignHealthRow`, `LeaderboardRow`, `MBBreakdownData`, `MBDetailRow`, `DailyTargetStats`
- `src/app/api/dialer/log-outcome/route.ts` — compute + store `mbLeadStatus` on `meeting_booked`
- `src/app/(dashboard)/page.tsx` — replace Phase 1 placeholder with full dashboard
- `src/app/(dashboard)/layout.tsx` — make async, fetch daily target stats, pass to Sidebar
- `src/components/layout/Sidebar.tsx` — accept `dailyStats` prop, render real count/target

---

### Task 1: Schema — add MBLeadStatus

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add `MBLeadStatus` enum and field to schema**

Open `prisma/schema.prisma`. After the `CallOutcome` enum (before the `model Tenant` block), add:

```prisma
enum MBLeadStatus {
  first_conversation
  follow_up
  nurtured_lead
}
```

Then inside the `CallRecord` model, after the `conversationTagged` field, add:

```prisma
  mbLeadStatus   MBLeadStatus?
```

The full `CallRecord` model should now look like:

```prisma
model CallRecord {
  id                 String       @id @default(cuid())
  tenantId           String
  campaignId         String
  contactId          String
  userId             String
  outcome            CallOutcome?
  notes              String?
  durationSecs       Int?
  conversationTagged Boolean      @default(false)
  mbLeadStatus       MBLeadStatus?
  createdAt          DateTime     @default(now())
  updatedAt          DateTime     @updatedAt
  tenant             Tenant       @relation(fields: [tenantId], references: [id])
  campaign           Campaign     @relation(fields: [campaignId], references: [id])
  contact            Contact      @relation(fields: [contactId], references: [id])
  user               User         @relation(fields: [userId], references: [id])

  @@index([tenantId, campaignId])
  @@index([tenantId, contactId])
}
```

- [ ] **Step 2: Run migration**

```bash
npx prisma migrate dev --name add-mb-lead-status
```

Expected output includes `Applying migration '..._add_mb_lead_status'` and no errors.

- [ ] **Step 3: Regenerate Prisma client**

```bash
npx prisma generate
```

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "Add MBLeadStatus enum and field on CallRecord"
```

---

### Task 2: MB classification function + tests

**Files:**
- Create: `src/lib/mb-lead-status.ts`
- Create: `src/lib/__tests__/mb-lead-status.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/__tests__/mb-lead-status.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { classifyMBLeadStatus } from '../mb-lead-status'

describe('classifyMBLeadStatus', () => {
  const now = new Date('2026-05-04T12:00:00Z')
  const recentContact = new Date('2026-04-20T00:00:00Z')  // 14 days ago
  const oldContact    = new Date('2026-03-01T00:00:00Z')  // 64 days ago

  it('returns first_conversation when no prior conversations', () => {
    expect(classifyMBLeadStatus(0, recentContact, now)).toBe('first_conversation')
  })

  it('returns nurtured_lead when contact is older than 30 days and prior convs exist', () => {
    expect(classifyMBLeadStatus(2, oldContact, now)).toBe('nurtured_lead')
  })

  it('returns follow_up when prior convs exist and contact is recent', () => {
    expect(classifyMBLeadStatus(1, recentContact, now)).toBe('follow_up')
  })

  it('returns first_conversation even when contact is old, if no prior convs', () => {
    expect(classifyMBLeadStatus(0, oldContact, now)).toBe('first_conversation')
  })

  it('returns nurtured_lead at exactly 30 days boundary (just over)', () => {
    const thirtyOneDaysAgo = new Date(now.getTime() - 31 * 24 * 60 * 60 * 1000)
    expect(classifyMBLeadStatus(1, thirtyOneDaysAgo, now)).toBe('nurtured_lead')
  })

  it('returns follow_up at exactly 30 days boundary (just under)', () => {
    const twentyNineDaysAgo = new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000)
    expect(classifyMBLeadStatus(1, twentyNineDaysAgo, now)).toBe('follow_up')
  })
})
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
npx vitest run src/lib/__tests__/mb-lead-status.test.ts
```

Expected: all tests fail with "Cannot find module '../mb-lead-status'"

- [ ] **Step 3: Implement the function**

Create `src/lib/mb-lead-status.ts`:

```typescript
import { MBLeadStatus } from '@prisma/client'

export function classifyMBLeadStatus(
  priorConversationCount: number,
  contactCreatedAt: Date,
  now = new Date()
): MBLeadStatus {
  if (priorConversationCount === 0) return MBLeadStatus.first_conversation
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
  if (contactCreatedAt < thirtyDaysAgo) return MBLeadStatus.nurtured_lead
  return MBLeadStatus.follow_up
}
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
npx vitest run src/lib/__tests__/mb-lead-status.test.ts
```

Expected: 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/mb-lead-status.ts src/lib/__tests__/mb-lead-status.test.ts
git commit -m "Add classifyMBLeadStatus pure function with tests"
```

---

### Task 3: Add reports:read permission

**Files:**
- Modify: `src/lib/auth.ts`

- [ ] **Step 1: Add `reports:read` to Permission type and role maps**

In `src/lib/auth.ts`, update the `Permission` type to add `'reports:read'`:

```typescript
export type Permission =
  | 'clients:read'
  | 'clients:write'
  | 'campaigns:read'
  | 'campaigns:write'
  | 'sdrs:manage'
  | 'contacts:read'
  | 'contacts:write'
  | 'calls:write'
  | 'pipeline:read'
  | 'pipeline:write'
  | 'tasks:read'
  | 'tasks:write'
  | 'reports:read'
```

Update `ROLE_PERMISSIONS` to add `'reports:read'` to admin, manager, and sdr (not client):

```typescript
const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  admin:   ['clients:read', 'clients:write', 'campaigns:read', 'campaigns:write', 'sdrs:manage', 'contacts:read', 'contacts:write', 'calls:write', 'pipeline:read', 'pipeline:write', 'tasks:read', 'tasks:write', 'reports:read'],
  manager: ['clients:read', 'clients:write', 'campaigns:read', 'campaigns:write', 'sdrs:manage', 'contacts:read', 'contacts:write', 'calls:write', 'pipeline:read', 'pipeline:write', 'tasks:read', 'tasks:write', 'reports:read'],
  sdr:     ['campaigns:read', 'contacts:read', 'contacts:write', 'calls:write', 'pipeline:read', 'tasks:read', 'tasks:write', 'reports:read'],
  client:  ['campaigns:read', 'pipeline:read'],
}
```

- [ ] **Step 2: Verify the existing auth tests still pass**

```bash
npx vitest run src/lib/__tests__/auth.test.ts
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/lib/auth.ts
git commit -m "Add reports:read permission to admin, manager, and sdr roles"
```

---

### Task 4: Add types to models.ts

**Files:**
- Modify: `src/types/models.ts`

- [ ] **Step 1: Append new types**

At the end of `src/types/models.ts`, add:

```typescript
export type KpiStat = {
  current: number
  sparkline: number[]
  trend: number
}

export type DashboardKpisData = {
  calls: KpiStat
  conversations: KpiStat
  meetings: KpiStat
  conversionRate: KpiStat
}

export type CampaignHealthRow = {
  campaignId: string
  campaignName: string
  clientName: string
  score: number
  scoreLabel: 'green' | 'yellow' | 'red'
  activityRate: number
  conversionRate: number
  totalMBs: number
}

export type LeaderboardRow = {
  userId: string
  name: string
  calls: number
  conversations: number
  meetings: number
  score: number
  isMostImproved: boolean
}

export type MBDetailRow = {
  callRecordId: string
  contactFirstName: string
  contactLastName: string
  companyName: string | null
  sdrName: string
  campaignName: string
  date: string
  mbLeadStatus: 'first_conversation' | 'follow_up' | 'nurtured_lead'
}

export type MBBreakdownData = {
  summary: {
    total: number
    firstConversation: number
    followUp: number
    nurturedLead: number
  }
  rows: MBDetailRow[]
}

export type DailyTargetStats = {
  count: number
  target: number
}
```

- [ ] **Step 2: Commit**

```bash
git add src/types/models.ts
git commit -m "Add Phase 5 types: KpiStat, CampaignHealthRow, LeaderboardRow, MBBreakdownData"
```

---

### Task 5: reports.ts query helpers + formula tests

**Files:**
- Create: `src/lib/reports.ts`
- Create: `src/lib/__tests__/reports.test.ts`

- [ ] **Step 1: Write the failing formula tests**

Create `src/lib/__tests__/reports.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import {
  getWeekBounds,
  getPriorWeekBounds,
  getMonthBounds,
  getPriorMonthBounds,
  computeCompositeScore,
  computeHealthScore,
  healthScoreLabel,
  computeTrendPct,
  computeMostImprovedId,
} from '../reports'

describe('getWeekBounds', () => {
  it('returns Monday 00:00 as start for a Wednesday', () => {
    const wed = new Date('2026-05-06T15:00:00Z')  // Wednesday
    const { start } = getWeekBounds(wed)
    expect(start.toISOString().startsWith('2026-05-04')).toBe(true)  // Monday
    expect(start.getHours()).toBe(0)
  })

  it('returns Monday 00:00 as start when today is Monday', () => {
    const mon = new Date('2026-05-04T09:00:00Z')
    const { start } = getWeekBounds(mon)
    expect(start.toISOString().startsWith('2026-05-04')).toBe(true)
    expect(start.getHours()).toBe(0)
  })

  it('returns Monday 00:00 as start when today is Sunday', () => {
    const sun = new Date('2026-05-10T23:00:00Z')  // Sunday
    const { start } = getWeekBounds(sun)
    expect(start.toISOString().startsWith('2026-05-04')).toBe(true)  // prior Monday
  })
})

describe('getPriorWeekBounds', () => {
  it('returns the Monday 7 days prior as start', () => {
    const wed = new Date('2026-05-06T15:00:00Z')
    const { start } = getPriorWeekBounds(wed)
    expect(start.toISOString().startsWith('2026-04-27')).toBe(true)  // prior Monday
  })
})

describe('getMonthBounds', () => {
  it('returns the 1st of the current month as start', () => {
    const mid = new Date('2026-05-14T10:00:00Z')
    const { start } = getMonthBounds(mid)
    expect(start.getDate()).toBe(1)
    expect(start.getMonth()).toBe(4)  // May
    expect(start.getHours()).toBe(0)
  })
})

describe('getPriorMonthBounds', () => {
  it('returns April bounds when current month is May', () => {
    const mid = new Date('2026-05-14T10:00:00Z')
    const { start, end } = getPriorMonthBounds(mid)
    expect(start.getMonth()).toBe(3)  // April
    expect(start.getDate()).toBe(1)
    expect(end.getMonth()).toBe(3)    // still April
  })
})

describe('computeCompositeScore', () => {
  it('weights calls 0.3, convs 0.4, mbs 0.3', () => {
    expect(computeCompositeScore(10, 5, 2)).toBeCloseTo(10 * 0.3 + 5 * 0.4 + 2 * 0.3)
  })

  it('returns 0 for all-zero input', () => {
    expect(computeCompositeScore(0, 0, 0)).toBe(0)
  })
})

describe('computeHealthScore', () => {
  it('weights activity 0.6 and conversion 0.4, scales to 100', () => {
    expect(computeHealthScore(1.0, 1.0)).toBe(100)
    expect(computeHealthScore(0.5, 0.5)).toBe(50)
    expect(computeHealthScore(1.0, 0.0)).toBe(60)
    expect(computeHealthScore(0.0, 1.0)).toBe(40)
  })

  it('caps at 100 when activity rate exceeds 1', () => {
    expect(computeHealthScore(1.5, 1.0)).toBe(100)
  })
})

describe('healthScoreLabel', () => {
  it('returns green for score >= 70', () => {
    expect(healthScoreLabel(70)).toBe('green')
    expect(healthScoreLabel(100)).toBe('green')
  })

  it('returns yellow for 40–69', () => {
    expect(healthScoreLabel(40)).toBe('yellow')
    expect(healthScoreLabel(69)).toBe('yellow')
  })

  it('returns red for score < 40', () => {
    expect(healthScoreLabel(39)).toBe('red')
    expect(healthScoreLabel(0)).toBe('red')
  })
})

describe('computeTrendPct', () => {
  it('returns percentage change', () => {
    expect(computeTrendPct(110, 100)).toBe(10)
    expect(computeTrendPct(90, 100)).toBe(-10)
  })

  it('returns 100 when prior is 0 and current is positive', () => {
    expect(computeTrendPct(5, 0)).toBe(100)
  })

  it('returns 0 when both are zero', () => {
    expect(computeTrendPct(0, 0)).toBe(0)
  })
})

describe('computeMostImprovedId', () => {
  it('returns the user with the highest improvement percentage', () => {
    const sdrs = [
      { userId: 'a', currentRaw: 20, priorRaw: 10, hasBothPeriods: true },  // +100%
      { userId: 'b', currentRaw: 30, priorRaw: 20, hasBothPeriods: true },  // +50%
    ]
    expect(computeMostImprovedId(sdrs)).toBe('a')
  })

  it('returns null when no sdr improved', () => {
    const sdrs = [
      { userId: 'a', currentRaw: 10, priorRaw: 20, hasBothPeriods: true },  // declined
    ]
    expect(computeMostImprovedId(sdrs)).toBeNull()
  })

  it('returns null when no sdr has data in both periods', () => {
    const sdrs = [
      { userId: 'a', currentRaw: 20, priorRaw: 10, hasBothPeriods: false },
    ]
    expect(computeMostImprovedId(sdrs)).toBeNull()
  })

  it('returns null when priorRaw is 0 (division by zero guard)', () => {
    const sdrs = [
      { userId: 'a', currentRaw: 20, priorRaw: 0, hasBothPeriods: true },
    ]
    expect(computeMostImprovedId(sdrs)).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
npx vitest run src/lib/__tests__/reports.test.ts
```

Expected: fail with "Cannot find module '../reports'"

- [ ] **Step 3: Implement reports.ts**

Create `src/lib/reports.ts`:

```typescript
import { db, withTenant } from '@/lib/db'
import { UserRole } from '@prisma/client'
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
  const day = now.getDay()
  const monday = new Date(now)
  monday.setDate(now.getDate() - (day === 0 ? 6 : day - 1))
  monday.setHours(0, 0, 0, 0)
  return { start: monday, end: now }
}

export function getPriorWeekBounds(now = new Date()): { start: Date; end: Date } {
  const { start: thisMonday } = getWeekBounds(now)
  const priorMonday = new Date(thisMonday)
  priorMonday.setDate(priorMonday.getDate() - 7)
  const priorEnd = new Date(thisMonday)
  priorEnd.setMilliseconds(priorEnd.getMilliseconds() - 1)
  return { start: priorMonday, end: priorEnd }
}

export function getMonthBounds(now = new Date()): { start: Date; end: Date } {
  const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0)
  return { start, end: now }
}

export function getPriorMonthBounds(now = new Date()): { start: Date; end: Date } {
  const { start: thisMonthStart } = getMonthBounds(now)
  const priorEnd = new Date(thisMonthStart)
  priorEnd.setMilliseconds(priorEnd.getMilliseconds() - 1)
  const priorStart = new Date(priorEnd.getFullYear(), priorEnd.getMonth(), 1, 0, 0, 0, 0)
  return { start: priorStart, end: priorEnd }
}

function getLast7DayBuckets(now = new Date()): Array<{ start: Date; end: Date }> {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now)
    d.setDate(now.getDate() - (6 - i))
    const start = new Date(d)
    start.setHours(0, 0, 0, 0)
    const end = new Date(d)
    end.setHours(23, 59, 59, 999)
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

  const fourteenDaysAgo = new Date(sparklineStart)
  fourteenDaysAgo.setDate(sparklineStart.getDate() - 7)

  const records = await withTenant(tenantId, () =>
    db.callRecord.findMany({
      where: {
        createdAt: { gte: fourteenDaysAgo },
        ...(userId ? { userId } : {}),
      },
      select: { createdAt: true, conversationTagged: true, outcome: true },
    })
  )

  const currentRecords = records.filter(r => r.createdAt >= sparklineStart)
  const priorRecords   = records.filter(r => r.createdAt >= fourteenDaysAgo && r.createdAt < sparklineStart)
  const weekRecords    = records.filter(r => r.createdAt >= weekStart)

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

export async function getCampaignHealth(tenantId: string): Promise<CampaignHealthRow[]> {
  const now = new Date()
  const { start: weekStart } = getWeekBounds(now)
  const daysElapsed = Math.max(1, Math.ceil((now.getTime() - weekStart.getTime()) / (1000 * 60 * 60 * 24)))

  const campaigns = await withTenant(tenantId, () =>
    db.campaign.findMany({
      where: { status: 'active', dailyTargetCalls: { not: null } },
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

  const sdrs = await withTenant(tenantId, () =>
    db.user.findMany({
      where: { role: UserRole.sdr, deletedAt: null },
      select: {
        id: true,
        name: true,
        callRecords: {
          where: { createdAt: { gte: priorStart } },
          select: { createdAt: true, conversationTagged: true, outcome: true },
        },
      },
    })
  )

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

  const maxRaw      = Math.max(...rows.map(r => r.currentRaw), 1)
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

  const rows: MBDetailRow[] = records.map(r => ({
    callRecordId:     r.id,
    contactFirstName: r.contact.firstName,
    contactLastName:  r.contact.lastName,
    companyName:      r.contact.companyName,
    sdrName:          r.user.name,
    campaignName:     r.campaign.name,
    date:             r.createdAt.toISOString(),
    mbLeadStatus:     r.mbLeadStatus as MBDetailRow['mbLeadStatus'],
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
  todayStart.setHours(0, 0, 0, 0)

  if (role === 'sdr') {
    const [count, assignments] = await withTenant(tenantId, () =>
      Promise.all([
        db.callRecord.count({ where: { userId, createdAt: { gte: todayStart } } }),
        db.campaignSDR.findMany({
          where: { userId },
          select: { campaign: { select: { dailyTargetCalls: true, status: true } } },
        }),
      ])
    )
    const target = assignments
      .filter(a => a.campaign.status === 'active' && a.campaign.dailyTargetCalls)
      .reduce((sum, a) => sum + (a.campaign.dailyTargetCalls ?? 0), 0)
    return { count, target }
  }

  const [count, campaigns] = await withTenant(tenantId, () =>
    Promise.all([
      db.callRecord.count({ where: { createdAt: { gte: todayStart } } }),
      db.campaign.findMany({
        where: { status: 'active', dailyTargetCalls: { not: null } },
        select: { dailyTargetCalls: true },
      }),
    ])
  )
  const target = campaigns.reduce((sum, c) => sum + (c.dailyTargetCalls ?? 0), 0)
  return { count, target }
}
```

- [ ] **Step 4: Run formula tests — verify they pass**

```bash
npx vitest run src/lib/__tests__/reports.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/reports.ts src/lib/__tests__/reports.test.ts
git commit -m "Add reports.ts query helpers and formula unit tests"
```

---

### Task 6: Update log-outcome to store mbLeadStatus

**Files:**
- Modify: `src/app/api/dialer/log-outcome/route.ts`

- [ ] **Step 1: Add the mbLeadStatus computation to the transaction**

Replace the entire file content of `src/app/api/dialer/log-outcome/route.ts` with:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { db, withTenant } from '@/lib/db'
import { hasPermission, getClerkMeta } from '@/lib/auth'
import { routeOutcome, CONVERSATION_TAGGED_OUTCOMES } from '@/lib/outcome-router'
import { autoCreateDeal } from '@/lib/auto-deal'
import { classifyMBLeadStatus } from '@/lib/mb-lead-status'
import { CallOutcome } from '@prisma/client'

const OUTCOME_ENUM = [
  'no_answer', 'voicemail', 'not_interested', 'not_relevant_contact',
  'disqualified', 'lead', 'call_back_later', 'meeting_booked', 'call_back_attempted',
  'connected', 'left_voicemail', 'bad_time_to_speak', 'in_a_meeting', 'on_holiday',
  'hung_up', 'does_not_take_cold_calls', 'ai_assistant', 'line_engaged', 'wrong_number',
  'mobile_switched_off', 'foreign_dial_tone', 'not_available', 'other',
] as const

const BodySchema = z.object({
  manual:       z.boolean().optional().default(false),
  callRecordId: z.string().min(1).optional(),
  campaignId:   z.string().min(1).optional(),
  outcome:      z.enum(OUTCOME_ENUM),
  notes:        z.string().optional(),
  contactId:    z.string().min(1),
})

export async function POST(req: NextRequest) {
  try {
    const { userId: clerkId } = await auth()
    if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { role, tenantId } = await getClerkMeta()
    if (!hasPermission(role, 'calls:write') || !tenantId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await req.json()
    const parsed = BodySchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid body', details: parsed.error.flatten() }, { status: 400 })
    }
    const { manual, callRecordId, campaignId, outcome, notes, contactId } = parsed.data

    if (!manual && !callRecordId) {
      return NextResponse.json({ error: 'callRecordId required' }, { status: 400 })
    }
    if (manual && !campaignId) {
      return NextResponse.json({ error: 'campaignId required for manual outcomes' }, { status: 400 })
    }

    const typedOutcome       = outcome as CallOutcome
    const conversationTagged = CONVERSATION_TAGGED_OUTCOMES.has(typedOutcome)
    const isMeetingBooked    = typedOutcome === 'meeting_booked'

    const dbUser = await withTenant(tenantId, () =>
      db.user.findFirst({ where: { clerkId }, select: { id: true, name: true } })
    )
    if (!dbUser) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    const record = await withTenant(tenantId, () =>
      db.$transaction(async (tx) => {
        let mbLeadStatus = null

        if (isMeetingBooked) {
          const [contact, priorConvCount] = await Promise.all([
            tx.contact.findUniqueOrThrow({ where: { id: contactId }, select: { createdAt: true } }),
            tx.callRecord.count({ where: { contactId, conversationTagged: true } }),
          ])
          mbLeadStatus = classifyMBLeadStatus(priorConvCount, contact.createdAt)
        }

        if (manual) {
          const created = await tx.callRecord.create({
            data: {
              tenantId,
              campaignId:      campaignId!,
              contactId,
              userId:          dbUser.id,
              outcome:         typedOutcome,
              notes:           notes ?? null,
              durationSecs:    0,
              conversationTagged,
              ...(mbLeadStatus ? { mbLeadStatus } : {}),
            },
            select: { id: true, createdAt: true },
          })
          await routeOutcome(contactId, typedOutcome, tx)
          if (isMeetingBooked) {
            await autoCreateDeal({ contactId, campaignId: campaignId!, tenantId }, tx)
          }
          return created
        } else {
          const updated = await tx.callRecord.update({
            where: { id: callRecordId! },
            data: {
              outcome: typedOutcome,
              notes: notes ?? null,
              conversationTagged,
              ...(mbLeadStatus ? { mbLeadStatus } : {}),
            },
            select: { id: true, campaignId: true, createdAt: true },
          })
          await routeOutcome(contactId, typedOutcome, tx)
          if (isMeetingBooked) {
            await autoCreateDeal({ contactId, campaignId: updated.campaignId, tenantId }, tx)
          }
          return updated
        }
      })
    )

    return NextResponse.json({
      data: {
        success: true,
        callRecord: {
          id:         record.id,
          outcome:    typedOutcome,
          notes:      notes ?? null,
          createdAt:  record.createdAt.toISOString(),
          callerName: dbUser.name,
        },
      },
    })
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/dialer/log-outcome/route.ts
git commit -m "Store mbLeadStatus on CallRecord when outcome is meeting_booked"
```

---

### Task 7: Sparkline + KpiCard components

**Files:**
- Create: `src/components/dashboard/Sparkline.tsx`
- Create: `src/components/dashboard/KpiCard.tsx`

- [ ] **Step 1: Create Sparkline component**

Create `src/components/dashboard/Sparkline.tsx`:

```typescript
interface SparklineProps {
  data: number[]
  width?: number
  height?: number
}

export function Sparkline({ data, width = 80, height = 32 }: SparklineProps) {
  if (data.length < 2) return null

  const max   = Math.max(...data, 1)
  const min   = Math.min(...data, 0)
  const range = max - min || 1
  const padX  = 2
  const padY  = 2
  const innerW = width - padX * 2
  const innerH = height - padY * 2

  const pts = data.map((v, i) => {
    const x = padX + (i / (data.length - 1)) * innerW
    const y = padY + innerH - ((v - min) / range) * innerH
    return `${x.toFixed(1)},${y.toFixed(1)}`
  })

  const linePath = `M ${pts.join(' L ')}`
  const areaPath = `${linePath} L ${(padX + innerW).toFixed(1)},${(padY + innerH).toFixed(1)} L ${padX},${(padY + innerH).toFixed(1)} Z`

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="overflow-visible flex-shrink-0"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="lf-spark-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="#00d4ff" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#00d4ff" stopOpacity="0"    />
        </linearGradient>
      </defs>
      <path d={areaPath} fill="url(#lf-spark-grad)" stroke="none" />
      <path d={linePath} fill="none" stroke="#00d4ff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
```

- [ ] **Step 2: Create KpiCard component**

Create `src/components/dashboard/KpiCard.tsx`:

```typescript
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Sparkline } from './Sparkline'

interface KpiCardProps {
  title: string
  value: number
  format: 'number' | 'percent'
  sparkline: number[]
  trend: number
  icon: React.ReactNode
}

export function KpiCard({ title, value, format, sparkline, trend, icon }: KpiCardProps) {
  const displayValue  = format === 'percent' ? `${value}%` : value.toLocaleString()
  const isPositive    = trend > 0
  const isNeutral     = trend === 0

  return (
    <div className="glass-panel rounded-2xl p-5 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">{title}</p>
        <div className="text-gray-600">{icon}</div>
      </div>

      <div className="flex items-end justify-between gap-3">
        <span className="font-mono text-3xl font-semibold text-white leading-none">{displayValue}</span>
        <Sparkline data={sparkline} />
      </div>

      <div className="flex items-center gap-1.5">
        {isNeutral ? (
          <Minus className="w-3.5 h-3.5 text-gray-500" />
        ) : isPositive ? (
          <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
        ) : (
          <TrendingDown className="w-3.5 h-3.5 text-red-400" />
        )}
        <span className={cn(
          'text-xs font-medium',
          isNeutral ? 'text-gray-500' : isPositive ? 'text-emerald-400' : 'text-red-400'
        )}>
          {trend > 0 ? '+' : ''}{trend}% vs prior 7 days
        </span>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/dashboard/Sparkline.tsx src/components/dashboard/KpiCard.tsx
git commit -m "Add Sparkline and KpiCard dashboard components"
```

---

### Task 8: CampaignHealthCard + CampaignHealthGrid

**Files:**
- Create: `src/components/dashboard/CampaignHealthCard.tsx`
- Create: `src/components/dashboard/CampaignHealthGrid.tsx`

- [ ] **Step 1: Create CampaignHealthCard**

Create `src/components/dashboard/CampaignHealthCard.tsx`:

```typescript
import type { CampaignHealthRow } from '@/types/models'

const SCORE_STYLES = {
  green:  { badge: 'bg-emerald-500/10 text-emerald-400', border: 'border-emerald-500/20' },
  yellow: { badge: 'bg-amber-500/10 text-amber-400',     border: 'border-amber-500/20'   },
  red:    { badge: 'bg-red-500/10 text-red-400',         border: 'border-red-500/20'     },
}

export function CampaignHealthCard({ row }: { row: CampaignHealthRow }) {
  const styles = SCORE_STYLES[row.scoreLabel]

  return (
    <div className={`glass-panel rounded-2xl p-5 border ${styles.border}`}>
      <div className="flex items-start justify-between mb-4">
        <div className="min-w-0 mr-3">
          <p className="text-sm font-semibold text-white truncate">{row.campaignName}</p>
          <p className="text-xs text-gray-500 mt-0.5 truncate">{row.clientName}</p>
        </div>
        <span className={`flex-shrink-0 px-3 py-1 rounded-xl text-xs font-bold font-mono ${styles.badge}`}>
          {row.score}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-600 mb-1">Activity</p>
          <p className="font-mono text-sm font-semibold text-white">{row.activityRate}%</p>
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-600 mb-1">Conv. Rate</p>
          <p className="font-mono text-sm font-semibold text-white">{row.conversionRate}%</p>
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-600 mb-1">Meetings</p>
          <p className="font-mono text-sm font-semibold text-white">{row.totalMBs}</p>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create CampaignHealthGrid**

Create `src/components/dashboard/CampaignHealthGrid.tsx`:

```typescript
import { Activity } from 'lucide-react'
import { CampaignHealthCard } from './CampaignHealthCard'
import type { CampaignHealthRow } from '@/types/models'

export function CampaignHealthGrid({ rows }: { rows: CampaignHealthRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="glass-panel rounded-2xl p-10 flex flex-col items-center justify-center gap-3 text-center">
        <Activity className="w-8 h-8 text-gray-600" />
        <p className="text-sm text-gray-400">No active campaigns with a daily target set</p>
        <p className="text-xs text-gray-600">Set a daily target on a campaign to see health scoring.</p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {rows.map((row) => (
        <CampaignHealthCard key={row.campaignId} row={row} />
      ))}
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/dashboard/CampaignHealthCard.tsx src/components/dashboard/CampaignHealthGrid.tsx
git commit -m "Add CampaignHealthCard and CampaignHealthGrid components"
```

---

### Task 9: LeaderboardSnapshot

**Files:**
- Create: `src/components/dashboard/LeaderboardSnapshot.tsx`

- [ ] **Step 1: Create LeaderboardSnapshot**

Create `src/components/dashboard/LeaderboardSnapshot.tsx`:

```typescript
import Link from 'next/link'
import { Trophy, ArrowRight, Star } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { LeaderboardRow } from '@/types/models'

const RANK_COLORS = ['text-amber-400', 'text-gray-300', 'text-amber-600']

export function LeaderboardSnapshot({ rows }: { rows: LeaderboardRow[] }) {
  const top5 = rows.slice(0, 5)

  return (
    <div className="glass-panel rounded-2xl overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
        <div className="flex items-center gap-2">
          <Trophy className="w-4 h-4 text-amber-400" />
          <h3 className="text-sm font-semibold text-white">Leaderboard</h3>
          <span className="text-xs text-gray-600">this week</span>
        </div>
        <Link
          href="/reports"
          className="flex items-center gap-1 text-xs text-accent hover:text-white transition-colors duration-150"
        >
          See full <ArrowRight className="w-3 h-3" />
        </Link>
      </div>

      {top5.length === 0 ? (
        <div className="px-5 py-10 text-center text-sm text-gray-500">No calls logged this week yet</div>
      ) : (
        <div className="divide-y divide-white/5">
          {top5.map((row, i) => (
            <div key={row.userId} className="flex items-center gap-3 px-5 py-3 hover:bg-white/5 transition-colors">
              <span className={cn('font-mono text-sm font-bold w-5 text-center flex-shrink-0', RANK_COLORS[i] ?? 'text-gray-500')}>
                {i + 1}
              </span>
              <div className="flex-1 flex items-center gap-2 min-w-0">
                <span className="text-sm text-white truncate">{row.name}</span>
                {row.isMostImproved && (
                  <span className="flex-shrink-0 flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-accent/10 text-accent text-[9px] font-semibold">
                    <Star className="w-2 h-2" />
                    Improved
                  </span>
                )}
              </div>
              <span className="font-mono text-xs text-gray-500 flex-shrink-0">{row.meetings} MB</span>
              <span className="font-mono text-xs font-semibold text-accent w-8 text-right flex-shrink-0">{row.score}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/dashboard/LeaderboardSnapshot.tsx
git commit -m "Add LeaderboardSnapshot component"
```

---

### Task 10: Dashboard page

**Files:**
- Modify: `src/app/(dashboard)/page.tsx`

- [ ] **Step 1: Replace the placeholder with the full dashboard**

Replace the entire contents of `src/app/(dashboard)/page.tsx` with:

```typescript
import { redirect } from 'next/navigation'
import { auth } from '@clerk/nextjs/server'
import { Phone, MessageSquare, CalendarCheck, Percent } from 'lucide-react'
import { db, withTenant } from '@/lib/db'
import { getClerkMeta } from '@/lib/auth'
import { getDashboardKpis, getCampaignHealth, getLeaderboard } from '@/lib/reports'
import { Header } from '@/components/layout/Header'
import { PageShell } from '@/components/layout/PageShell'
import { KpiCard } from '@/components/dashboard/KpiCard'
import { CampaignHealthGrid } from '@/components/dashboard/CampaignHealthGrid'
import { LeaderboardSnapshot } from '@/components/dashboard/LeaderboardSnapshot'

export default async function DashboardPage() {
  const { userId: clerkId } = await auth()
  if (!clerkId) redirect('/sign-in')

  const { role, tenantId } = await getClerkMeta()
  if (!tenantId) redirect('/sign-in')

  const isManager = role === 'admin' || role === 'manager'

  const dbUser = await withTenant(tenantId, () =>
    db.user.findFirst({ where: { clerkId }, select: { id: true } })
  )
  if (!dbUser) redirect('/sign-in')

  const [kpis, healthRows, leaderboardRows] = await Promise.all([
    getDashboardKpis(tenantId, isManager ? null : dbUser.id),
    getCampaignHealth(tenantId),
    getLeaderboard(tenantId, 'week'),
  ])

  return (
    <>
      <Header
        title="Dashboard"
        subtitle={isManager ? 'Team overview — this week' : 'Your performance — this week'}
      />
      <PageShell>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard
            title="Calls Made"
            value={kpis.calls.current}
            format="number"
            sparkline={kpis.calls.sparkline}
            trend={kpis.calls.trend}
            icon={<Phone className="w-4 h-4" />}
          />
          <KpiCard
            title="Conversations"
            value={kpis.conversations.current}
            format="number"
            sparkline={kpis.conversations.sparkline}
            trend={kpis.conversations.trend}
            icon={<MessageSquare className="w-4 h-4" />}
          />
          <KpiCard
            title="Meetings Booked"
            value={kpis.meetings.current}
            format="number"
            sparkline={kpis.meetings.sparkline}
            trend={kpis.meetings.trend}
            icon={<CalendarCheck className="w-4 h-4" />}
          />
          <KpiCard
            title="Conversion Rate"
            value={kpis.conversionRate.current}
            format="percent"
            sparkline={kpis.conversionRate.sparkline}
            trend={kpis.conversionRate.trend}
            icon={<Percent className="w-4 h-4" />}
          />
        </div>

        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-4">Campaign Health</h2>
          <CampaignHealthGrid rows={healthRows} />
        </section>

        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-4">Top Performers</h2>
          <LeaderboardSnapshot rows={leaderboardRows} />
        </section>
      </PageShell>
    </>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(dashboard)/page.tsx"
git commit -m "Build Dashboard page with KPI cards, campaign health, and leaderboard snapshot"
```

---

### Task 11: Wire Sidebar Daily Target

**Files:**
- Modify: `src/app/(dashboard)/layout.tsx`
- Modify: `src/components/layout/Sidebar.tsx`

- [ ] **Step 1: Update Sidebar to accept dailyStats prop**

In `src/components/layout/Sidebar.tsx`, add the `dailyStats` prop and wire it to the widget. Replace the entire file:

```typescript
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, Target, Users, PhoneCall, Kanban,
  ScrollText, CalendarCheck2, BarChart3, Settings, ChevronLeft,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useUIStore } from '@/stores/ui-store'
import type { DailyTargetStats } from '@/types/models'

const NAV_ITEMS = [
  { href: '/',          label: 'Dashboard', icon: LayoutDashboard },
  { href: '/campaigns', label: 'Campaigns', icon: Target },
  { href: '/contacts',  label: 'Contacts',  icon: Users },
  { href: '/calling',   label: 'Calling',   icon: PhoneCall },
  { href: '/pipeline',  label: 'Pipeline',  icon: Kanban },
  { href: '/scripts',   label: 'Scripts',   icon: ScrollText },
  { href: '/schedule',  label: 'Schedule',  icon: CalendarCheck2 },
  { href: '/reports',   label: 'Reports',   icon: BarChart3 },
]

interface SidebarProps {
  dailyStats: DailyTargetStats
}

export function Sidebar({ dailyStats }: SidebarProps) {
  const pathname = usePathname()
  const { sidebarCollapsed, toggleSidebar } = useUIStore()
  const pct = dailyStats.target > 0
    ? Math.min(100, Math.round((dailyStats.count / dailyStats.target) * 100))
    : 0

  return (
    <aside
      className={cn(
        'flex flex-col h-screen flex-shrink-0 transition-all duration-300 border-r border-white/5 bg-dark',
        sidebarCollapsed ? 'w-16' : 'w-64'
      )}
    >
      <div className={cn('flex items-center p-6 flex-shrink-0', sidebarCollapsed && 'justify-center px-0')}>
        <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#00d4ff] to-cyan-600 flex-shrink-0" />
        {!sidebarCollapsed && (
          <span className="ml-3 text-xl font-bold bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent select-none">
            LeadForce
          </span>
        )}
      </div>

      <nav className="flex-1 px-4 mt-2 space-y-0.5 overflow-y-auto custom-scrollbar">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = href === '/' ? pathname === '/' : pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              title={sidebarCollapsed ? label : undefined}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-colors duration-200',
                active ? 'bg-white/5 text-[#00d4ff]' : 'text-gray-400 hover:text-white hover:bg-white/5',
                sidebarCollapsed && 'justify-center px-0'
              )}
            >
              <Icon className="w-5 h-5 flex-shrink-0" />
              {!sidebarCollapsed && <span>{label}</span>}
            </Link>
          )
        })}
      </nav>

      {!sidebarCollapsed && (
        <div className="mx-4 mb-4 glass-panel rounded-2xl p-4">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-3">Daily Target</p>
          <div className="flex items-end justify-between mb-2">
            <span className="font-mono text-2xl font-semibold text-white">{dailyStats.count}</span>
            <span className="font-mono text-sm text-gray-500">
              / {dailyStats.target > 0 ? dailyStats.target : '—'}
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-white/10">
            <div
              className="h-1.5 rounded-full bg-[#00d4ff] transition-all duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
          {dailyStats.target > 0 && (
            <p className="text-[10px] text-gray-600 mt-2">{pct}% of today's target</p>
          )}
        </div>
      )}

      <div className="border-t border-white/5 p-4 space-y-0.5 flex-shrink-0">
        <Link
          href="/settings"
          title={sidebarCollapsed ? 'Settings' : undefined}
          className={cn(
            'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-gray-400 hover:text-white hover:bg-white/5 transition-colors duration-200',
            sidebarCollapsed && 'justify-center px-0'
          )}
        >
          <Settings className="w-5 h-5 flex-shrink-0" />
          {!sidebarCollapsed && <span>Settings</span>}
        </Link>
        <button
          type="button"
          onClick={toggleSidebar}
          title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className={cn(
            'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-gray-500 hover:text-white hover:bg-white/5 w-full transition-colors duration-200',
            sidebarCollapsed && 'justify-center px-0'
          )}
        >
          <ChevronLeft className={cn('w-5 h-5 flex-shrink-0 transition-transform duration-300', sidebarCollapsed && 'rotate-180')} />
          {!sidebarCollapsed && <span>Collapse</span>}
        </button>
      </div>
    </aside>
  )
}
```

- [ ] **Step 2: Make layout async and pass dailyStats to Sidebar**

Replace the entire contents of `src/app/(dashboard)/layout.tsx` with:

```typescript
import { auth } from '@clerk/nextjs/server'
import { db, withTenant } from '@/lib/db'
import { getClerkMeta } from '@/lib/auth'
import { getDailyTargetStats } from '@/lib/reports'
import { Sidebar } from '@/components/layout/Sidebar'
import { Toaster } from '@/components/ui/sonner'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  let dailyStats = { count: 0, target: 0 }

  try {
    const { userId: clerkId } = await auth()
    const { role, tenantId } = await getClerkMeta()

    if (clerkId && tenantId && role) {
      const dbUser = await withTenant(tenantId, () =>
        db.user.findFirst({ where: { clerkId }, select: { id: true } })
      )
      if (dbUser) {
        dailyStats = await getDailyTargetStats(tenantId, dbUser.id, role)
      }
    }
  } catch {
    // unauthenticated — individual pages handle redirect
  }

  return (
    <div className="flex h-screen overflow-hidden bg-dark">
      <Sidebar dailyStats={dailyStats} />
      <main className="flex-1 overflow-y-auto custom-scrollbar">
        {children}
      </main>
      <Toaster position="bottom-right" theme="dark" />
    </div>
  )
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(dashboard)/layout.tsx" src/components/layout/Sidebar.tsx
git commit -m "Wire Sidebar Daily Target widget with real call count and campaign targets"
```

---

### Task 12: PeriodToggle + CampaignFilter components

**Files:**
- Create: `src/components/reports/PeriodToggle.tsx`
- Create: `src/components/reports/CampaignFilter.tsx`

- [ ] **Step 1: Create PeriodToggle**

Create `src/components/reports/PeriodToggle.tsx`:

```typescript
import Link from 'next/link'
import { cn } from '@/lib/utils'

interface PeriodToggleProps {
  current: 'week' | 'month'
}

export function PeriodToggle({ current }: PeriodToggleProps) {
  return (
    <div className="flex items-center gap-1 bg-white/5 rounded-xl p-1">
      <Link
        href="/reports?period=week"
        className={cn(
          'px-4 py-1.5 rounded-lg text-sm font-medium transition-colors duration-150',
          current === 'week' ? 'bg-accent/10 text-accent' : 'text-gray-400 hover:text-white'
        )}
      >
        This Week
      </Link>
      <Link
        href="/reports?period=month"
        className={cn(
          'px-4 py-1.5 rounded-lg text-sm font-medium transition-colors duration-150',
          current === 'month' ? 'bg-accent/10 text-accent' : 'text-gray-400 hover:text-white'
        )}
      >
        This Month
      </Link>
    </div>
  )
}
```

- [ ] **Step 2: Create CampaignFilter**

Create `src/components/reports/CampaignFilter.tsx`:

```typescript
'use client'

import { useRouter } from 'next/navigation'

interface CampaignFilterProps {
  campaigns: { id: string; name: string }[]
  selected: string | undefined
  period: 'week' | 'month'
}

export function CampaignFilter({ campaigns, selected, period }: CampaignFilterProps) {
  const router = useRouter()

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const params = new URLSearchParams({ period })
    if (e.target.value) params.set('campaignId', e.target.value)
    router.push(`/reports?${params.toString()}`)
  }

  return (
    <select
      value={selected ?? ''}
      onChange={handleChange}
      className="bg-white/5 border border-white/10 rounded-xl px-3 py-1.5 text-sm text-gray-300 focus:outline-none focus:border-white/30 cursor-pointer"
    >
      <option value="" className="bg-[#161c26]">All campaigns</option>
      {campaigns.map((c) => (
        <option key={c.id} value={c.id} className="bg-[#161c26]">{c.name}</option>
      ))}
    </select>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/reports/PeriodToggle.tsx src/components/reports/CampaignFilter.tsx
git commit -m "Add PeriodToggle and CampaignFilter components for Reports page"
```

---

### Task 13: LeaderboardTable

**Files:**
- Create: `src/components/reports/LeaderboardTable.tsx`

- [ ] **Step 1: Create LeaderboardTable**

Create `src/components/reports/LeaderboardTable.tsx`:

```typescript
import { Trophy, Star } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { LeaderboardRow } from '@/types/models'

const RANK_COLORS = ['text-amber-400', 'text-gray-300', 'text-amber-600']

export function LeaderboardTable({ rows }: { rows: LeaderboardRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="glass-panel rounded-2xl p-10 flex flex-col items-center gap-3 text-center">
        <Trophy className="w-8 h-8 text-gray-600" />
        <p className="text-sm text-gray-400">No calls logged in this period</p>
      </div>
    )
  }

  return (
    <div className="glass-panel rounded-2xl overflow-hidden">
      <table className="w-full">
        <thead>
          <tr className="border-b border-white/5">
            <th className="text-left px-5 py-3 text-[10px] font-semibold uppercase tracking-wider text-gray-600 w-10">#</th>
            <th className="text-left px-5 py-3 text-[10px] font-semibold uppercase tracking-wider text-gray-600">SDR</th>
            <th className="text-right px-5 py-3 text-[10px] font-semibold uppercase tracking-wider text-gray-600">Calls</th>
            <th className="text-right px-5 py-3 text-[10px] font-semibold uppercase tracking-wider text-gray-600">Convs</th>
            <th className="text-right px-5 py-3 text-[10px] font-semibold uppercase tracking-wider text-gray-600">MBs</th>
            <th className="text-right px-5 py-3 text-[10px] font-semibold uppercase tracking-wider text-gray-600">Score</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {rows.map((row, i) => (
            <tr key={row.userId} className="hover:bg-white/5 transition-colors">
              <td className="px-5 py-3.5">
                <span className={cn('font-mono text-sm font-bold', RANK_COLORS[i] ?? 'text-gray-500')}>
                  {i + 1}
                </span>
              </td>
              <td className="px-5 py-3.5">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-white">{row.name}</span>
                  {row.isMostImproved && (
                    <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-accent/10 text-accent text-[10px] font-semibold">
                      <Star className="w-2.5 h-2.5" />
                      Most Improved
                    </span>
                  )}
                </div>
              </td>
              <td className="px-5 py-3.5 text-right font-mono text-sm text-gray-300">{row.calls}</td>
              <td className="px-5 py-3.5 text-right font-mono text-sm text-gray-300">{row.conversations}</td>
              <td className="px-5 py-3.5 text-right font-mono text-sm text-gray-300">{row.meetings}</td>
              <td className="px-5 py-3.5 text-right font-mono text-sm font-semibold text-accent">{row.score}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/reports/LeaderboardTable.tsx
git commit -m "Add LeaderboardTable component with Most Improved badge"
```

---

### Task 14: MBStatusBreakdown

**Files:**
- Create: `src/components/reports/MBStatusBreakdown.tsx`

- [ ] **Step 1: Create MBStatusBreakdown**

Create `src/components/reports/MBStatusBreakdown.tsx`:

```typescript
import { Target } from 'lucide-react'
import type { MBBreakdownData } from '@/types/models'

const CATEGORY_LABELS = {
  first_conversation: 'First Conversation',
  follow_up:          'Follow-Up',
  nurtured_lead:      'Nurtured Lead',
} as const

const CATEGORY_BADGE = {
  first_conversation: 'bg-accent/10 text-accent',
  follow_up:          'bg-amber-500/10 text-amber-400',
  nurtured_lead:      'bg-emerald-500/10 text-emerald-400',
} as const

export function MBStatusBreakdown({ data }: { data: MBBreakdownData }) {
  const { summary, rows } = data

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="glass-panel rounded-2xl p-4">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-2">Total MBs</p>
          <p className="font-mono text-2xl font-semibold text-white">{summary.total}</p>
        </div>
        <div className="glass-panel rounded-2xl p-4">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-2">First Conv.</p>
          <p className="font-mono text-2xl font-semibold text-accent">{summary.firstConversation}</p>
        </div>
        <div className="glass-panel rounded-2xl p-4">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-2">Follow-Up</p>
          <p className="font-mono text-2xl font-semibold text-amber-400">{summary.followUp}</p>
        </div>
        <div className="glass-panel rounded-2xl p-4">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-2">Nurtured Lead</p>
          <p className="font-mono text-2xl font-semibold text-emerald-400">{summary.nurturedLead}</p>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="glass-panel rounded-2xl p-10 flex flex-col items-center gap-3 text-center">
          <Target className="w-8 h-8 text-gray-600" />
          <p className="text-sm text-gray-400">No meeting bookings in this period</p>
        </div>
      ) : (
        <div className="glass-panel rounded-2xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/5">
                <th className="text-left px-5 py-3 text-[10px] font-semibold uppercase tracking-wider text-gray-600">Contact</th>
                <th className="text-left px-5 py-3 text-[10px] font-semibold uppercase tracking-wider text-gray-600">SDR</th>
                <th className="text-left px-5 py-3 text-[10px] font-semibold uppercase tracking-wider text-gray-600">Campaign</th>
                <th className="text-left px-5 py-3 text-[10px] font-semibold uppercase tracking-wider text-gray-600">Date</th>
                <th className="text-left px-5 py-3 text-[10px] font-semibold uppercase tracking-wider text-gray-600">Category</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {rows.map((row) => (
                <tr key={row.callRecordId} className="hover:bg-white/5 transition-colors">
                  <td className="px-5 py-3.5">
                    <p className="text-sm text-white">{row.contactFirstName} {row.contactLastName}</p>
                    {row.companyName && <p className="text-xs text-gray-500 mt-0.5">{row.companyName}</p>}
                  </td>
                  <td className="px-5 py-3.5 text-sm text-gray-300">{row.sdrName}</td>
                  <td className="px-5 py-3.5 text-sm text-gray-300">{row.campaignName}</td>
                  <td className="px-5 py-3.5 text-sm text-gray-300 font-mono">
                    {new Date(row.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
                  </td>
                  <td className="px-5 py-3.5">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${CATEGORY_BADGE[row.mbLeadStatus]}`}>
                      {CATEGORY_LABELS[row.mbLeadStatus]}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/reports/MBStatusBreakdown.tsx
git commit -m "Add MBStatusBreakdown component with summary counts and detail table"
```

---

### Task 15: Reports page

**Files:**
- Create: `src/app/(dashboard)/reports/page.tsx`

- [ ] **Step 1: Create the Reports page**

Create `src/app/(dashboard)/reports/page.tsx`:

```typescript
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
        where:   { status: 'active' },
        select:  { id: true, name: true },
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
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-4">SDR Leaderboard</h2>
          <LeaderboardTable rows={leaderboardRows} />
        </section>

        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500">Meeting Bookings</h2>
            <CampaignFilter campaigns={campaigns} selected={campaignId} period={period} />
          </div>
          <MBStatusBreakdown data={mbData} />
        </section>
      </PageShell>
    </>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Run all tests**

```bash
npm run test:run
```

Expected: all tests pass (mb-lead-status, reports formulas, outcome-router, auto-deal, auth).

- [ ] **Step 4: Commit**

```bash
git add "src/app/(dashboard)/reports/page.tsx"
git commit -m "Add Reports page with leaderboard, MB status breakdown, and period toggle"
```

---

## Self-Review Notes

**Spec coverage check:**
- Dashboard KPI cards (4 metrics, sparklines, trend badges): Tasks 7 + 10
- Campaign health scoring (composite formula, color coding): Tasks 5 + 8 + 10
- Leaderboard snapshot on dashboard: Tasks 9 + 10
- MB lead status classification + storage: Tasks 1 + 2 + 6
- Full leaderboard with Most Improved badge: Tasks 5 + 13 + 15
- MB status breakdown with campaign filter: Tasks 14 + 15
- Period toggle (week/month): Tasks 12 + 15
- Sidebar Daily Target wiring: Task 11
- All role logic (SDR personal vs manager aggregate): Tasks 5 + 10
- All unit tests: Tasks 2 + 5

**Type consistency verified:** `CampaignHealthRow`, `LeaderboardRow`, `MBBreakdownData`, `MBDetailRow`, `DailyTargetStats`, `DashboardKpisData`, `KpiStat` — all defined in Task 4 (`models.ts`) and consumed consistently in Tasks 5–15.

**Formula consistency:** `computeCompositeScore` defined once in `reports.ts`, used in both `getLeaderboard` (Tasks 5, 13, 15) and `LeaderboardSnapshot` (Task 9 via `getLeaderboard`). `computeHealthScore` + `healthScoreLabel` defined in `reports.ts`, used in `getCampaignHealth` which feeds `CampaignHealthCard`.
