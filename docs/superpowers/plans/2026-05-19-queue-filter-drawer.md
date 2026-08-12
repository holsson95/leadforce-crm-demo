# Queue Filter Drawer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a slide-in filter drawer to the QueuePanel that lets SDRs narrow the dialer queue by call history, contact attributes, company size, and location — with full filter combinability and active filter chips.

**Architecture:** Pure filter helpers live in `src/lib/dialer-filters.ts` and are unit-tested independently. Filter state (`queueFilters` applied, `pendingFilters` staged) lives in the Zustand dialer store. The API route gains optional query params that stack onto existing Prisma `where` clauses. Two new components (`QueueFilterDrawer`, `QueueFilterChips`) are wired into `QueuePanel`.

**Tech Stack:** Zustand, Prisma, Next.js API routes, Shadcn/UI (Select, Switch), Tailwind CSS, Vitest

**Spec:** `docs/superpowers/specs/2026-05-19-queue-filter-drawer-design.md`

---

## File Map

| File | Action |
|------|--------|
| `src/lib/dialer-filters.ts` | Create — QueueFilters type + pure helpers |
| `src/lib/__tests__/dialer-filters.test.ts` | Create — unit tests for pure helpers |
| `src/stores/dialer-store.ts` | Modify — add filter state + actions, update loadQueue |
| `src/stores/__tests__/dialer-store.test.ts` | Modify — add filter state tests |
| `src/app/api/dialer/queue/route.ts` | Modify — parse + apply filter params |
| `src/app/api/dialer/queue/meta/route.ts` | Create — distinct industries endpoint |
| `src/components/dialer/QueueFilterDrawer.tsx` | Create — filter drawer component |
| `src/components/dialer/QueueFilterChips.tsx` | Create — active filter chip strip |
| `src/components/dialer/QueuePanel.tsx` | Modify — wire button, chips, drawer |

---

## Task 1: Pure filter helpers

**Files:**
- Create: `src/lib/dialer-filters.ts`
- Create: `src/lib/__tests__/dialer-filters.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/__tests__/dialer-filters.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { buildQueueUrl, activeFilterCount, filterToChips } from '../dialer-filters'

describe('buildQueueUrl', () => {
  it('returns base url with just campaignId', () => {
    expect(buildQueueUrl('camp1', {})).toBe('/api/dialer/queue?campaignId=camp1')
  })

  it('includes skip when > 0', () => {
    expect(buildQueueUrl('c1', {}, 15)).toContain('skip=15')
  })

  it('does not include skip when 0 or undefined', () => {
    expect(buildQueueUrl('c1', {}, 0)).not.toContain('skip')
    expect(buildQueueUrl('c1', {})).not.toContain('skip')
  })

  it('includes lastCallBefore', () => {
    expect(buildQueueUrl('c1', { lastCallBefore: '2025-05-01' })).toContain('lastCallBefore=2025-05-01')
  })

  it('includes lastCallOutcome as comma-separated', () => {
    const url = buildQueueUrl('c1', { lastCallOutcome: ['no_answer', 'voicemail'] })
    expect(url).toContain('lastCallOutcome=no_answer%2Cvoicemail')
  })

  it('includes dialAttemptsOp and dialAttemptsVal together', () => {
    const url = buildQueueUrl('c1', { dialAttemptsOp: 'gt', dialAttemptsVal: 3 })
    expect(url).toContain('dialAttemptsOp=gt')
    expect(url).toContain('dialAttemptsVal=3')
  })

  it('omits dialAttemptsOp when val is missing', () => {
    expect(buildQueueUrl('c1', { dialAttemptsOp: 'gt' })).not.toContain('dialAttemptsOp')
  })

  it('includes phonePrefix encoded', () => {
    expect(buildQueueUrl('c1', { phonePrefix: '+1' })).toContain('phonePrefix=%2B1')
  })

  it('includes hasNotes=true only when true', () => {
    expect(buildQueueUrl('c1', { hasNotes: true })).toContain('hasNotes=true')
    expect(buildQueueUrl('c1', { hasNotes: undefined })).not.toContain('hasNotes')
  })

  it('includes industry as comma-separated', () => {
    expect(buildQueueUrl('c1', { industry: ['SaaS', 'Fintech'] })).toContain('industry=SaaS%2CFintech')
  })

  it('includes accountOwnerId', () => {
    expect(buildQueueUrl('c1', { accountOwnerId: 'u1' })).toContain('accountOwnerId=u1')
  })
})

describe('activeFilterCount', () => {
  it('returns 0 for empty filters', () => {
    expect(activeFilterCount({})).toBe(0)
  })

  it('counts independent filters separately', () => {
    expect(activeFilterCount({ lastCallBefore: '2025-01-01', phonePrefix: '+1' })).toBe(2)
  })

  it('counts dialAttempts op+val as one filter', () => {
    expect(activeFilterCount({ dialAttemptsOp: 'gt', dialAttemptsVal: 3 })).toBe(1)
  })

  it('counts employeeCount op+val as one filter', () => {
    expect(activeFilterCount({ employeeCountOp: 'lt', employeeCountVal: 500 })).toBe(1)
  })

  it('counts location (city/state/country) as one filter', () => {
    expect(activeFilterCount({ city: 'Austin', state: 'TX', country: 'US' })).toBe(1)
  })

  it('ignores dialAttemptsOp without val', () => {
    expect(activeFilterCount({ dialAttemptsOp: 'gt' })).toBe(0)
  })
})

describe('filterToChips', () => {
  it('returns empty array for empty filters', () => {
    expect(filterToChips({})).toEqual([])
  })

  it('returns a chip for lastCallBefore with correct clearKeys', () => {
    const chips = filterToChips({ lastCallBefore: '2025-05-01' })
    expect(chips).toHaveLength(1)
    expect(chips[0].label).toContain('2025-05-01')
    expect(chips[0].clearKeys).toEqual(['lastCallBefore'])
  })

  it('groups all location fields into one chip', () => {
    const chips = filterToChips({ city: 'Austin', state: 'TX' })
    expect(chips).toHaveLength(1)
    expect(chips[0].clearKeys).toContain('city')
    expect(chips[0].clearKeys).toContain('state')
    expect(chips[0].clearKeys).toContain('country')
  })

  it('returns a chip for dialAttempts with both clearKeys', () => {
    const chips = filterToChips({ dialAttemptsOp: 'gt', dialAttemptsVal: 3 })
    expect(chips[0].clearKeys).toContain('dialAttemptsOp')
    expect(chips[0].clearKeys).toContain('dialAttemptsVal')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/hannaholsson/LeadforceCRM && npx vitest run src/lib/__tests__/dialer-filters.test.ts
```
Expected: FAIL — `Cannot find module '../dialer-filters'`

- [ ] **Step 3: Create `src/lib/dialer-filters.ts`**

```typescript
import type { CallOutcome } from '@prisma/client'

export type NumericOp = 'eq' | 'gt' | 'lt' | 'gte' | 'lte'

export interface QueueFilters {
  lastCallBefore?:   string        // ISO date YYYY-MM-DD
  lastCallOutcome?:  CallOutcome[]
  dialAttemptsOp?:   NumericOp
  dialAttemptsVal?:  number
  phonePrefix?:      string
  jobTitle?:         string
  companyName?:      string
  hasNotes?:         boolean
  employeeCountOp?:  NumericOp
  employeeCountVal?: number
  industry?:         string[]
  city?:             string
  state?:            string
  country?:          string
  accountOwnerId?:   string
}

export type FilterChip = {
  label:     string
  clearKeys: (keyof QueueFilters)[]
}

export const CALL_OUTCOMES_FOR_FILTER: { value: CallOutcome; label: string }[] = [
  { value: 'no_answer',        label: 'No Answer' },
  { value: 'voicemail',        label: 'Voicemail' },
  { value: 'left_voicemail',   label: 'Left Voicemail' },
  { value: 'not_interested',   label: 'Not Interested' },
  { value: 'call_back_later',  label: 'Call Back Later' },
  { value: 'bad_time_to_speak',label: 'Bad Time to Speak' },
  { value: 'in_a_meeting',     label: 'In a Meeting' },
  { value: 'hung_up',          label: 'Hung Up' },
  { value: 'connected',        label: 'Connected' },
  { value: 'wrong_number',     label: 'Wrong Number' },
]

const OP_LABEL: Record<NumericOp, string> = {
  eq: '=', gt: '>', lt: '<', gte: '≥', lte: '≤',
}

export function buildQueueUrl(
  campaignId: string,
  filters: QueueFilters,
  skip?: number,
): string {
  const params = new URLSearchParams({ campaignId })
  if (skip && skip > 0) params.set('skip', String(skip))
  if (filters.lastCallBefore) params.set('lastCallBefore', filters.lastCallBefore)
  if (filters.lastCallOutcome?.length) params.set('lastCallOutcome', filters.lastCallOutcome.join(','))
  if (filters.dialAttemptsOp && filters.dialAttemptsVal != null) {
    params.set('dialAttemptsOp', filters.dialAttemptsOp)
    params.set('dialAttemptsVal', String(filters.dialAttemptsVal))
  }
  if (filters.phonePrefix) params.set('phonePrefix', filters.phonePrefix)
  if (filters.jobTitle) params.set('jobTitle', filters.jobTitle)
  if (filters.companyName) params.set('companyName', filters.companyName)
  if (filters.hasNotes === true) params.set('hasNotes', 'true')
  if (filters.employeeCountOp && filters.employeeCountVal != null) {
    params.set('employeeCountOp', filters.employeeCountOp)
    params.set('employeeCountVal', String(filters.employeeCountVal))
  }
  if (filters.industry?.length) params.set('industry', filters.industry.join(','))
  if (filters.city) params.set('city', filters.city)
  if (filters.state) params.set('state', filters.state)
  if (filters.country) params.set('country', filters.country)
  if (filters.accountOwnerId) params.set('accountOwnerId', filters.accountOwnerId)
  return `/api/dialer/queue?${params.toString()}`
}

export function activeFilterCount(filters: QueueFilters): number {
  let count = 0
  if (filters.lastCallBefore) count++
  if (filters.lastCallOutcome?.length) count++
  if (filters.dialAttemptsOp && filters.dialAttemptsVal != null) count++
  if (filters.phonePrefix) count++
  if (filters.jobTitle) count++
  if (filters.companyName) count++
  if (filters.hasNotes === true) count++
  if (filters.employeeCountOp && filters.employeeCountVal != null) count++
  if (filters.industry?.length) count++
  if (filters.city || filters.state || filters.country) count++
  if (filters.accountOwnerId) count++
  return count
}

export function filterToChips(filters: QueueFilters): FilterChip[] {
  const chips: FilterChip[] = []

  if (filters.lastCallBefore)
    chips.push({ label: `Last call ≤ ${filters.lastCallBefore}`, clearKeys: ['lastCallBefore'] })

  if (filters.lastCallOutcome?.length) {
    const labels = filters.lastCallOutcome
      .map(v => CALL_OUTCOMES_FOR_FILTER.find(o => o.value === v)?.label ?? v)
      .join(', ')
    chips.push({ label: `Last outcome: ${labels}`, clearKeys: ['lastCallOutcome'] })
  }

  if (filters.dialAttemptsOp && filters.dialAttemptsVal != null)
    chips.push({
      label:     `Dial attempts ${OP_LABEL[filters.dialAttemptsOp]} ${filters.dialAttemptsVal}`,
      clearKeys: ['dialAttemptsOp', 'dialAttemptsVal'],
    })

  if (filters.phonePrefix)
    chips.push({ label: `Phone: ${filters.phonePrefix}*`, clearKeys: ['phonePrefix'] })

  if (filters.jobTitle)
    chips.push({ label: `Title: ${filters.jobTitle}`, clearKeys: ['jobTitle'] })

  if (filters.companyName)
    chips.push({ label: `Company: ${filters.companyName}`, clearKeys: ['companyName'] })

  if (filters.hasNotes === true)
    chips.push({ label: 'Has notes', clearKeys: ['hasNotes'] })

  if (filters.employeeCountOp && filters.employeeCountVal != null)
    chips.push({
      label:     `Employees ${OP_LABEL[filters.employeeCountOp]} ${filters.employeeCountVal}`,
      clearKeys: ['employeeCountOp', 'employeeCountVal'],
    })

  if (filters.industry?.length)
    chips.push({ label: `Industry: ${filters.industry.join(', ')}`, clearKeys: ['industry'] })

  const locationParts = [filters.city, filters.state, filters.country].filter(Boolean)
  if (locationParts.length)
    chips.push({
      label:     `Location: ${locationParts.join(', ')}`,
      clearKeys: ['city', 'state', 'country'],
    })

  if (filters.accountOwnerId)
    chips.push({ label: `Owner ID: ${filters.accountOwnerId}`, clearKeys: ['accountOwnerId'] })

  return chips
}
```

- [ ] **Step 4: Run tests and verify they pass**

```bash
cd /Users/hannaholsson/LeadforceCRM && npx vitest run src/lib/__tests__/dialer-filters.test.ts
```
Expected: All 18 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/dialer-filters.ts src/lib/__tests__/dialer-filters.test.ts
git commit -m "Add QueueFilters type and pure filter helper functions"
```

---

## Task 2: Extend dialer store with filter state

**Files:**
- Modify: `src/stores/dialer-store.ts`
- Modify: `src/stores/__tests__/dialer-store.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `src/stores/__tests__/dialer-store.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest'

// Add at the top of the file alongside existing imports:
// import type { QueueFilters } from '@/lib/dialer-filters'

describe('useDialerStore — queueFilters', () => {
  beforeEach(() => {
    useDialerStore.setState({
      campaignId:     'camp1',
      queueFilters:   {},
      pendingFilters: {},
      queue:          [],
      totalContacts:  0,
    })
  })

  it('updatePendingFilters merges into pendingFilters without touching queueFilters', () => {
    useDialerStore.getState().updatePendingFilters({ jobTitle: 'CEO' })
    const { pendingFilters, queueFilters } = useDialerStore.getState()
    expect(pendingFilters.jobTitle).toBe('CEO')
    expect(queueFilters.jobTitle).toBeUndefined()
  })

  it('updatePendingFilters removes keys set to undefined', () => {
    useDialerStore.setState({ pendingFilters: { jobTitle: 'CEO', phonePrefix: '+1' } })
    useDialerStore.getState().updatePendingFilters({ jobTitle: undefined })
    expect(useDialerStore.getState().pendingFilters.jobTitle).toBeUndefined()
    expect(useDialerStore.getState().pendingFilters.phonePrefix).toBe('+1')
  })

  it('discardPendingFilters resets pendingFilters to queueFilters', () => {
    useDialerStore.setState({
      queueFilters:   { phonePrefix: '+1' },
      pendingFilters: { phonePrefix: '+44', jobTitle: 'VP' },
    })
    useDialerStore.getState().discardPendingFilters()
    const { pendingFilters } = useDialerStore.getState()
    expect(pendingFilters.phonePrefix).toBe('+1')
    expect(pendingFilters.jobTitle).toBeUndefined()
  })

  it('setCampaign resets both queueFilters and pendingFilters', () => {
    useDialerStore.setState({
      queueFilters:   { phonePrefix: '+1' },
      pendingFilters: { phonePrefix: '+1' },
    })
    useDialerStore.getState().setCampaign('new-id', [], 0)
    const { queueFilters, pendingFilters } = useDialerStore.getState()
    expect(queueFilters).toEqual({})
    expect(pendingFilters).toEqual({})
  })

  it('removeFilter clears specified keys from queueFilters and syncs pendingFilters', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [], total: 0 }),
    })
    useDialerStore.setState({
      queueFilters:   { phonePrefix: '+1', jobTitle: 'CEO' },
      pendingFilters: { phonePrefix: '+1', jobTitle: 'CEO' },
    })
    await useDialerStore.getState().removeFilter(['phonePrefix'])
    const { queueFilters, pendingFilters } = useDialerStore.getState()
    expect(queueFilters.phonePrefix).toBeUndefined()
    expect(queueFilters.jobTitle).toBe('CEO')
    expect(pendingFilters.phonePrefix).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/hannaholsson/LeadforceCRM && npx vitest run src/stores/__tests__/dialer-store.test.ts
```
Expected: FAIL — `queueFilters` not on store state.

- [ ] **Step 3: Update `src/stores/dialer-store.ts`**

Add the import at the top (after existing imports):

```typescript
import { buildQueueUrl } from '@/lib/dialer-filters'
import type { QueueFilters } from '@/lib/dialer-filters'
```

Add to the `DialerState` interface (after `elapsedSeconds`):

```typescript
  queueFilters:   QueueFilters
  pendingFilters: QueueFilters

  updatePendingFilters(partial: Partial<QueueFilters>): void
  discardPendingFilters(): void
  applyFilters(): Promise<void>
  removeFilter(keys: (keyof QueueFilters)[]): Promise<void>
  clearFilters(): Promise<void>
```

Add to initial state (after `elapsedSeconds: 0`):

```typescript
      queueFilters:   {},
      pendingFilters: {},
```

Update `setCampaign` to reset filters:

```typescript
      setCampaign(id, contacts, total) {
        set({
          campaignId:         id,
          currentContact:     null,
          queue:              contacts,
          totalContacts:      total,
          callStatus:         'idle',
          activeCallRecordId: null,
          callStartedAt:      null,
          queueFilters:       {},
          pendingFilters:     {},
        })
      },
```

Replace the `loadQueue` action:

```typescript
      async loadQueue(skip) {
        const { campaignId, currentContact, queue, queueFilters } = get()
        if (!campaignId) return
        const url = buildQueueUrl(campaignId, queueFilters, skip)
        const res = await fetch(url)
        if (!res.ok) return
        const { data, total } = (await res.json()) as { data: ContactSummary[]; total: number }
        if (skip != null && skip > 0) {
          const existingIds = new Set(
            [currentContact?.id, ...queue.map((c) => c.id)].filter((id): id is string => id != null)
          )
          const newContacts = data.filter((c) => !existingIds.has(c.id))
          set({ queue: [...queue, ...newContacts], totalContacts: total })
        } else {
          set({ queue: data.filter((c) => c.id !== currentContact?.id), totalContacts: total })
        }
      },
```

Add new filter actions (after `resetCalledTodayIfStale`):

```typescript
      updatePendingFilters(partial) {
        const { pendingFilters } = get()
        const next = { ...pendingFilters, ...partial }
        // Remove keys explicitly set to undefined
        for (const key of Object.keys(partial) as (keyof QueueFilters)[]) {
          if (partial[key] === undefined) delete next[key]
        }
        set({ pendingFilters: next })
      },

      discardPendingFilters() {
        set({ pendingFilters: { ...get().queueFilters } })
      },

      async applyFilters() {
        const { pendingFilters } = get()
        set({ queueFilters: { ...pendingFilters } })
        await get().loadQueue()
      },

      async removeFilter(keys) {
        const { queueFilters } = get()
        const next = { ...queueFilters }
        for (const key of keys) delete next[key]
        set({ queueFilters: next, pendingFilters: { ...next } })
        await get().loadQueue()
      },

      async clearFilters() {
        set({ queueFilters: {}, pendingFilters: {} })
        await get().loadQueue()
      },
```

- [ ] **Step 4: Run tests and verify they pass**

```bash
cd /Users/hannaholsson/LeadforceCRM && npx vitest run src/stores/__tests__/dialer-store.test.ts
```
Expected: All tests pass including the new filter ones.

- [ ] **Step 5: Commit**

```bash
git add src/stores/dialer-store.ts src/stores/__tests__/dialer-store.test.ts
git commit -m "Add queueFilters and pendingFilters state to dialer store"
```

---

## Task 3: Extend queue API route for filter params

**Files:**
- Modify: `src/app/api/dialer/queue/route.ts`

- [ ] **Step 1: Replace the route file**

The full updated `src/app/api/dialer/queue/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import type { Prisma, CallOutcome } from '@prisma/client'
import { db, withTenant } from '@/lib/db'
import { hasPermission, getClerkMeta } from '@/lib/auth'
import type { ContactSummary } from '@/types/models'

const NumericOp = z.enum(['eq', 'gt', 'lt', 'gte', 'lte'])

const QuerySchema = z.object({
  campaignId:       z.string().min(1),
  skip:             z.coerce.number().int().min(0).optional().default(0),
  lastCallBefore:   z.string().optional(),
  lastCallOutcome:  z.string().optional(),  // comma-separated CallOutcome values
  dialAttemptsOp:   NumericOp.optional(),
  dialAttemptsVal:  z.coerce.number().int().min(0).optional(),
  phonePrefix:      z.string().optional(),
  jobTitle:         z.string().optional(),
  companyName:      z.string().optional(),
  hasNotes:         z.enum(['true']).optional(),
  employeeCountOp:  NumericOp.optional(),
  employeeCountVal: z.coerce.number().int().min(0).optional(),
  industry:         z.string().optional(),  // comma-separated
  city:             z.string().optional(),
  state:            z.string().optional(),
  country:          z.string().optional(),
  accountOwnerId:   z.string().optional(),
})

const PRISMA_OP: Record<string, string> = {
  eq: 'equals', gt: 'gt', lt: 'lt', gte: 'gte', lte: 'lte',
}

export async function GET(request: Request) {
  try {
    const { userId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { role, tenantId } = await getClerkMeta()
    if (!hasPermission(role, 'calls:write') || !tenantId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const parsed = QuerySchema.safeParse(Object.fromEntries(searchParams))
    if (!parsed.success) {
      return NextResponse.json({ error: 'campaignId required' }, { status: 400 })
    }
    const {
      campaignId, skip,
      lastCallBefore, lastCallOutcome,
      dialAttemptsOp, dialAttemptsVal,
      phonePrefix, jobTitle, companyName,
      hasNotes, employeeCountOp, employeeCountVal,
      industry, city, state, country, accountOwnerId,
    } = parsed.data

    const now          = new Date()
    const startOfToday = new Date(now)
    startOfToday.setUTCHours(0, 0, 0, 0)

    const where: Prisma.ContactWhereInput = {
      tenantId,
      campaignId,
      status: { in: ['call_back', 'prospect'] },
      OR: [
        { notInterestedUntil: null },
        { notInterestedUntil: { lte: now } },
      ],
      callRecords: {
        none: {
          campaignId,
          createdAt: { gte: startOfToday },
        },
      },
    }

    // --- Simple field filters ---
    if (dialAttemptsOp && dialAttemptsVal != null)
      where.dialAttempts = { [PRISMA_OP[dialAttemptsOp]]: dialAttemptsVal }

    if (employeeCountOp && employeeCountVal != null)
      where.employeeCount = { [PRISMA_OP[employeeCountOp]]: employeeCountVal }

    if (phonePrefix)
      where.mobilePhone = { startsWith: phonePrefix }

    if (jobTitle)
      where.jobTitle = { contains: jobTitle, mode: 'insensitive' }

    if (companyName)
      where.companyName = { contains: companyName, mode: 'insensitive' }

    if (city)
      where.city = { contains: city, mode: 'insensitive' }

    if (state)
      where.state = { contains: state, mode: 'insensitive' }

    if (country)
      where.country = { contains: country, mode: 'insensitive' }

    if (accountOwnerId)
      where.accountOwnerId = accountOwnerId

    if (industry)
      where.industry = { in: industry.split(',') }

    if (hasNotes === 'true')
      where.notes = { some: {} }

    // --- Last call filters (require subquery to find most-recent record per contact) ---
    const parsedOutcomes = lastCallOutcome
      ? (lastCallOutcome.split(',') as CallOutcome[])
      : undefined

    if (lastCallBefore || parsedOutcomes?.length) {
      const allRecords = await withTenant(tenantId, () =>
        db.callRecord.findMany({
          where:   { tenantId, campaignId },
          select:  { contactId: true, outcome: true, createdAt: true },
          orderBy: { createdAt: 'desc' },
        })
      )
      // Keep only the most recent record per contact
      const latestByContact = new Map<string, { outcome: CallOutcome | null; createdAt: Date }>()
      for (const r of allRecords) {
        if (!latestByContact.has(r.contactId)) {
          latestByContact.set(r.contactId, { outcome: r.outcome, createdAt: r.createdAt })
        }
      }
      const matchingIds = [...latestByContact.entries()]
        .filter(([, r]) => {
          if (lastCallBefore && r.createdAt > new Date(lastCallBefore)) return false
          if (parsedOutcomes?.length && (!r.outcome || !parsedOutcomes.includes(r.outcome))) return false
          return true
        })
        .map(([id]) => id)
      where.id = { in: matchingIds }
    }

    const contacts = await withTenant(tenantId, () =>
      db.contact.findMany({
        where,
        select: {
          id:             true,
          firstName:      true,
          lastName:       true,
          mobilePhone:    true,
          corporatePhone: true,
          companyName:    true,
          status:         true,
          jobTitle:       true,
          employeeCount:  true,
          linkedinUrl:    true,
          website:        true,
          callRecords: {
            select: {
              id:        true,
              outcome:   true,
              notes:     true,
              createdAt: true,
              user:      { select: { name: true } },
            },
            orderBy: { createdAt: 'desc' },
            take:    10,
          },
        },
        orderBy: [{ status: 'asc' }, { id: 'asc' }],
        skip,
        take: 20,
      })
    )

    const total = await withTenant(tenantId, () => db.contact.count({ where }))

    const data: ContactSummary[] = contacts.map((c) => ({
      id:             c.id,
      firstName:      c.firstName,
      lastName:       c.lastName,
      mobilePhone:    c.mobilePhone,
      corporatePhone: c.corporatePhone,
      companyName:    c.companyName,
      status:         c.status,
      jobTitle:       c.jobTitle,
      employeeCount:  c.employeeCount,
      linkedinUrl:    c.linkedinUrl,
      website:        c.website,
      callHistory:    c.callRecords.map((r) => ({
        id:         r.id,
        outcome:    r.outcome,
        notes:      r.notes,
        createdAt:  r.createdAt.toISOString(),
        callerName: r.user.name,
      })),
    }))

    return NextResponse.json({ data, total })
  } catch (err) {
    console.error('[queue/route] GET error', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /Users/hannaholsson/LeadforceCRM && npx tsc --noEmit 2>&1 | grep "dialer/queue/route"
```
Expected: No errors for this file.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/dialer/queue/route.ts
git commit -m "Extend queue API with filter query params"
```

---

## Task 4: Industry meta endpoint

**Files:**
- Create: `src/app/api/dialer/queue/meta/route.ts`

- [ ] **Step 1: Create `src/app/api/dialer/queue/meta/route.ts`**

```typescript
import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { db, withTenant } from '@/lib/db'
import { hasPermission, getClerkMeta } from '@/lib/auth'

const QuerySchema = z.object({
  campaignId: z.string().min(1),
})

export async function GET(request: Request) {
  try {
    const { userId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { role, tenantId } = await getClerkMeta()
    if (!hasPermission(role, 'calls:write') || !tenantId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const parsed = QuerySchema.safeParse({ campaignId: searchParams.get('campaignId') })
    if (!parsed.success) {
      return NextResponse.json({ error: 'campaignId required' }, { status: 400 })
    }
    const { campaignId } = parsed.data

    const contacts = await withTenant(tenantId, () =>
      db.contact.findMany({
        where:  { tenantId, campaignId, industry: { not: null }, deletedAt: null },
        select: { industry: true },
        distinct: ['industry'],
      })
    )

    const industries = contacts
      .map((c) => c.industry!)
      .filter(Boolean)
      .sort()

    return NextResponse.json({ data: { industries } })
  } catch (err) {
    console.error('[queue/meta] GET error', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /Users/hannaholsson/LeadforceCRM && npx tsc --noEmit 2>&1 | grep "queue/meta"
```
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/dialer/queue/meta/route.ts
git commit -m "Add queue meta endpoint for distinct industry values"
```

---

## Task 5: QueueFilterDrawer component

**Files:**
- Create: `src/components/dialer/QueueFilterDrawer.tsx`

- [ ] **Step 1: Create `src/components/dialer/QueueFilterDrawer.tsx`**

```typescript
'use client'

import { useState, useEffect } from 'react'
import { X, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useDialerStore } from '@/stores/dialer-store'
import { CALL_OUTCOMES_FOR_FILTER } from '@/lib/dialer-filters'
import type { QueueFilters, NumericOp } from '@/lib/dialer-filters'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'

const OP_OPTIONS: { value: NumericOp; label: string }[] = [
  { value: 'eq',  label: '=' },
  { value: 'gt',  label: '>' },
  { value: 'lt',  label: '<' },
  { value: 'gte', label: '≥' },
  { value: 'lte', label: '≤' },
]

const INPUT_CLASS =
  'w-full bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white placeholder:text-gray-600 focus:outline-none focus:border-[#00d4ff]/30'

const LABEL_CLASS = 'text-[10px] uppercase tracking-wider text-gray-500 block mb-1.5'

function FilterSection({
  title,
  defaultOpen = true,
  children,
}: {
  title: string
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border-b border-white/5">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-gray-400 hover:text-white transition-colors"
      >
        {title}
        <ChevronDown className={cn('w-3 h-3 transition-transform duration-150', open && 'rotate-180')} />
      </button>
      {open && <div className="px-4 pb-4 space-y-3">{children}</div>}
    </div>
  )
}

function NumericFilterControl({
  opValue,
  numValue,
  onOpChange,
  onNumChange,
  placeholder,
}: {
  opValue:     NumericOp
  numValue:    number | undefined
  onOpChange:  (op: NumericOp) => void
  onNumChange: (val: number | undefined) => void
  placeholder: string
}) {
  return (
    <div className="flex gap-2">
      <Select value={opValue} onValueChange={(v) => onOpChange(v as NumericOp)}>
        <SelectTrigger className="w-16 bg-white/5 border-white/10 text-white rounded-lg text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="rounded-lg border-white/10 bg-[#161c26]">
          {OP_OPTIONS.map((o) => (
            <SelectItem
              key={o.value}
              value={o.value}
              className="text-gray-300 focus:bg-white/5 focus:text-white rounded-md text-xs"
            >
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <input
        type="number"
        min={0}
        value={numValue ?? ''}
        onChange={(e) =>
          onNumChange(e.target.value !== '' ? Number(e.target.value) : undefined)
        }
        placeholder={placeholder}
        className={cn(INPUT_CLASS, 'flex-1')}
      />
    </div>
  )
}

interface QueueFilterDrawerProps {
  open:       boolean
  onClose:    () => void
  campaignId: string
  users:      { id: string; name: string }[]
}

export function QueueFilterDrawer({
  open,
  onClose,
  campaignId,
  users,
}: QueueFilterDrawerProps) {
  const { pendingFilters, updatePendingFilters, applyFilters, discardPendingFilters } =
    useDialerStore()
  const [industries, setIndustries] = useState<string[]>([])

  useEffect(() => {
    if (!open || !campaignId) return
    fetch(`/api/dialer/queue/meta?campaignId=${campaignId}`)
      .then((r) => r.json())
      .then(({ data }) => setIndustries(data?.industries ?? []))
      .catch(() => {})
  }, [open, campaignId])

  const handleClose = () => {
    discardPendingFilters()
    onClose()
  }

  const handleApply = async () => {
    await applyFilters()
    onClose()
  }

  const handleClearAll = () => {
    updatePendingFilters({
      lastCallBefore:   undefined,
      lastCallOutcome:  undefined,
      dialAttemptsOp:   undefined,
      dialAttemptsVal:  undefined,
      phonePrefix:      undefined,
      jobTitle:         undefined,
      companyName:      undefined,
      hasNotes:         undefined,
      employeeCountOp:  undefined,
      employeeCountVal: undefined,
      industry:         undefined,
      city:             undefined,
      state:            undefined,
      country:          undefined,
      accountOwnerId:   undefined,
    })
  }

  const upd = (partial: Partial<QueueFilters>) => updatePendingFilters(partial)
  const f   = pendingFilters

  const toggleOutcome = (value: string, checked: boolean) => {
    const curr = f.lastCallOutcome ?? []
    const next = checked
      ? [...curr, value as QueueFilters['lastCallOutcome'][number]]
      : curr.filter((v) => v !== value)
    upd({ lastCallOutcome: next.length ? next : undefined })
  }

  const toggleIndustry = (value: string, checked: boolean) => {
    const curr = f.industry ?? []
    const next = checked ? [...curr, value] : curr.filter((v) => v !== value)
    upd({ industry: next.length ? next : undefined })
  }

  if (!open) return null

  return (
    <>
      {/* Backdrop — closes drawer without applying */}
      <div className="absolute inset-0 z-40" onClick={handleClose} />

      {/* Drawer panel */}
      <div className="absolute top-0 right-0 h-full w-80 z-50 bg-[#0f1420] border-l border-white/10 flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 flex-shrink-0">
          <p className="text-sm font-semibold text-white">Filter queue</p>
          <button
            onClick={handleClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-500 hover:text-white hover:bg-white/5 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable filter groups */}
        <div className="flex-1 overflow-y-auto min-h-0">

          <FilterSection title="Call History">
            {/* Last call date */}
            <div>
              <label className={LABEL_CLASS}>Last call on or before</label>
              <input
                type="date"
                value={f.lastCallBefore ?? ''}
                onChange={(e) => upd({ lastCallBefore: e.target.value || undefined })}
                className={cn(INPUT_CLASS, '[color-scheme:dark]')}
              />
            </div>

            {/* Last call outcome */}
            <div>
              <label className={LABEL_CLASS}>Last call outcome</label>
              <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
                {CALL_OUTCOMES_FOR_FILTER.map(({ value, label }) => (
                  <label key={value} className="flex items-center gap-2 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={f.lastCallOutcome?.includes(value) ?? false}
                      onChange={(e) => toggleOutcome(value, e.target.checked)}
                      className="accent-[#00d4ff]"
                    />
                    <span className="text-xs text-gray-400 group-hover:text-white transition-colors">
                      {label}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            {/* Dial attempts */}
            <div>
              <label className={LABEL_CLASS}>Dial attempts</label>
              <NumericFilterControl
                opValue={f.dialAttemptsOp ?? 'gt'}
                numValue={f.dialAttemptsVal}
                onOpChange={(op) => upd({ dialAttemptsOp: op })}
                onNumChange={(val) => upd({ dialAttemptsVal: val })}
                placeholder="e.g. 3"
              />
            </div>
          </FilterSection>

          <FilterSection title="Phone">
            <div>
              <label className={LABEL_CLASS}>Number starts with</label>
              <input
                type="text"
                value={f.phonePrefix ?? ''}
                onChange={(e) => upd({ phonePrefix: e.target.value || undefined })}
                placeholder="+1"
                className={cn(INPUT_CLASS, 'font-mono')}
              />
            </div>
          </FilterSection>

          <FilterSection title="Contact">
            <div>
              <label className={LABEL_CLASS}>Job title contains</label>
              <input
                type="text"
                value={f.jobTitle ?? ''}
                onChange={(e) => upd({ jobTitle: e.target.value || undefined })}
                placeholder="Director"
                className={INPUT_CLASS}
              />
            </div>
            <div>
              <label className={LABEL_CLASS}>Company name contains</label>
              <input
                type="text"
                value={f.companyName ?? ''}
                onChange={(e) => upd({ companyName: e.target.value || undefined })}
                placeholder="Acme"
                className={INPUT_CLASS}
              />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-400">Has notes</span>
              <Switch
                checked={f.hasNotes === true}
                onCheckedChange={(v) => upd({ hasNotes: v || undefined })}
                className="data-[state=checked]:bg-[#00d4ff]"
              />
            </div>
          </FilterSection>

          <FilterSection title="Company">
            <div>
              <label className={LABEL_CLASS}>Employee count</label>
              <NumericFilterControl
                opValue={f.employeeCountOp ?? 'gt'}
                numValue={f.employeeCountVal}
                onOpChange={(op) => upd({ employeeCountOp: op })}
                onNumChange={(val) => upd({ employeeCountVal: val })}
                placeholder="e.g. 500"
              />
            </div>
            {industries.length > 0 && (
              <div>
                <label className={LABEL_CLASS}>Industry</label>
                <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                  {industries.map((ind) => (
                    <label key={ind} className="flex items-center gap-2 cursor-pointer group">
                      <input
                        type="checkbox"
                        checked={f.industry?.includes(ind) ?? false}
                        onChange={(e) => toggleIndustry(ind, e.target.checked)}
                        className="accent-[#00d4ff]"
                      />
                      <span className="text-xs text-gray-400 group-hover:text-white transition-colors">
                        {ind}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </FilterSection>

          <FilterSection title="Location">
            {(
              [
                { label: 'City',    key: 'city',    placeholder: 'Austin' },
                { label: 'State',   key: 'state',   placeholder: 'TX' },
                { label: 'Country', key: 'country', placeholder: 'US' },
              ] as const
            ).map(({ label, key, placeholder }) => (
              <div key={key}>
                <label className={LABEL_CLASS}>{label}</label>
                <input
                  type="text"
                  value={f[key] ?? ''}
                  onChange={(e) => upd({ [key]: e.target.value || undefined })}
                  placeholder={placeholder}
                  className={INPUT_CLASS}
                />
              </div>
            ))}
          </FilterSection>

          <FilterSection title="Assignment">
            <div>
              <label className={LABEL_CLASS}>Account owner</label>
              <Select
                value={f.accountOwnerId ?? ''}
                onValueChange={(v) => upd({ accountOwnerId: v || undefined })}
              >
                <SelectTrigger className="bg-white/5 border-white/10 text-white rounded-lg text-xs">
                  <SelectValue>
                    {(v: string) =>
                      v ? (users.find((u) => u.id === v)?.name ?? v) : 'Any owner'
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent className="rounded-xl border-white/10 bg-[#161c26]">
                  <SelectItem
                    value=""
                    className="text-gray-400 focus:bg-white/5 focus:text-white rounded-lg text-xs"
                  >
                    Any owner
                  </SelectItem>
                  {users.map((u) => (
                    <SelectItem
                      key={u.id}
                      value={u.id}
                      className="text-gray-300 focus:bg-white/5 focus:text-white rounded-lg text-xs"
                    >
                      {u.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </FilterSection>
        </div>

        {/* Footer */}
        <div className="flex items-center gap-3 px-4 py-3 border-t border-white/10 flex-shrink-0">
          <button
            onClick={handleApply}
            className="flex-1 py-2 bg-[#00d4ff]/10 text-[#00d4ff] border border-[#00d4ff]/20 rounded-xl text-xs font-semibold hover:bg-[#00d4ff]/20 transition-colors"
          >
            Apply filters
          </button>
          <button
            onClick={handleClearAll}
            className="px-3 py-2 text-xs text-gray-500 hover:text-white transition-colors"
          >
            Clear all
          </button>
        </div>
      </div>
    </>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /Users/hannaholsson/LeadforceCRM && npx tsc --noEmit 2>&1 | grep "QueueFilterDrawer"
```
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/dialer/QueueFilterDrawer.tsx
git commit -m "Add QueueFilterDrawer component with all filter groups"
```

---

## Task 6: QueueFilterChips component

**Files:**
- Create: `src/components/dialer/QueueFilterChips.tsx`

- [ ] **Step 1: Create `src/components/dialer/QueueFilterChips.tsx`**

```typescript
'use client'

import { X } from 'lucide-react'
import { useDialerStore } from '@/stores/dialer-store'
import { filterToChips } from '@/lib/dialer-filters'

interface QueueFilterChipsProps {
  users: { id: string; name: string }[]
}

export function QueueFilterChips({ users }: QueueFilterChipsProps) {
  const { queueFilters, removeFilter, clearFilters } = useDialerStore()
  const chips = filterToChips(queueFilters)

  if (chips.length === 0) return null

  // Resolve account owner ID to name for display
  const resolvedChips = chips.map((chip) => {
    if (
      chip.clearKeys.includes('accountOwnerId') &&
      queueFilters.accountOwnerId
    ) {
      const name = users.find((u) => u.id === queueFilters.accountOwnerId)?.name
      return name
        ? { ...chip, label: `Owner: ${name}` }
        : chip
    }
    return chip
  })

  return (
    <div className="flex flex-wrap items-center gap-1.5 px-4 py-2 border-b border-white/5 flex-shrink-0">
      {resolvedChips.map((chip, i) => (
        <span
          key={i}
          className="inline-flex items-center gap-1 bg-[#00d4ff]/10 border border-[#00d4ff]/20 text-[#00d4ff] rounded-lg px-2 py-0.5 text-[10px] font-medium"
        >
          {chip.label}
          <button
            onClick={() => removeFilter(chip.clearKeys)}
            className="hover:text-white transition-colors ml-0.5"
            aria-label={`Remove filter: ${chip.label}`}
          >
            <X className="w-2.5 h-2.5" />
          </button>
        </span>
      ))}
      <button
        onClick={() => clearFilters()}
        className="text-[10px] text-gray-500 hover:text-gray-300 transition-colors ml-1"
      >
        Clear all
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /Users/hannaholsson/LeadforceCRM && npx tsc --noEmit 2>&1 | grep "QueueFilterChips"
```
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/dialer/QueueFilterChips.tsx
git commit -m "Add QueueFilterChips component for active filter display"
```

---

## Task 7: Wire everything into QueuePanel

**Files:**
- Modify: `src/components/dialer/QueuePanel.tsx`

- [ ] **Step 1: Add imports to QueuePanel.tsx**

At the top of `src/components/dialer/QueuePanel.tsx`, add to the existing imports:

```typescript
import { Filter } from 'lucide-react'
import { QueueFilterDrawer } from './QueueFilterDrawer'
import { QueueFilterChips } from './QueueFilterChips'
import { activeFilterCount } from '@/lib/dialer-filters'
```

- [ ] **Step 2: Add filter drawer state and reset page on filter change**

In the `QueuePanel` function body, add after the existing `useState` declarations:

```typescript
const [filterDrawerOpen, setFilterDrawerOpen] = useState(false)
```

Add a new `useEffect` after the existing ones to reset page when filters change:

```typescript
const { queueFilters } = useDialerStore()
// ... existing destructuring ...

useEffect(() => {
  setPage(1)
}, [queueFilters])
```

Note: `queueFilters` needs to be added to the destructured values from `useDialerStore()` at line 321–325. The updated destructure should be:

```typescript
const {
  campaignId, currentContact, queue, calledToday, totalContacts,
  queueFilters,
  setCampaign, startSession, loadQueue, reorderQueue, syncQueue,
  resetCalledTodayIfStale,
} = useDialerStore()
```

- [ ] **Step 3: Refactor handleCampaignChange to use store's loadQueue**

Replace the existing `handleCampaignChange` function (lines ~400–410):

```typescript
const handleCampaignChange = async (id: string) => {
  setPage(1)
  setExpandedContactId(null)
  setLoadingContactId(null)
  setContactCache({})
  setCampaign(id, [], 0)   // resets campaignId + clears filters in store
  await loadQueue()         // fetches using new campaignId, empty filters
  await startSession(id)
}
```

- [ ] **Step 4: Add Filters button to the campaign selector header**

In the campaign selector `<div>` (currently at line ~433), replace:

```tsx
      <div className="p-4 border-b border-white/5 flex-shrink-0">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-2">Campaign</p>
        <Select value={campaignId ?? ''} onValueChange={(v) => handleCampaignChange(v ?? '')}>
```

with:

```tsx
      <div className="p-4 border-b border-white/5 flex-shrink-0">
        <div className="flex items-center justify-between mb-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">Campaign</p>
          {campaignId && (
            <button
              onClick={() => setFilterDrawerOpen(true)}
              className={cn(
                'flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-medium transition-colors',
                activeFilterCount(queueFilters) > 0
                  ? 'bg-[#00d4ff]/10 text-[#00d4ff] border border-[#00d4ff]/20'
                  : 'text-gray-500 hover:text-white hover:bg-white/5',
              )}
            >
              <Filter className="w-3 h-3" />
              Filters
              {activeFilterCount(queueFilters) > 0 && (
                <span className="bg-[#00d4ff] text-[#0b0e14] rounded-full w-3.5 h-3.5 flex items-center justify-center text-[9px] font-bold">
                  {activeFilterCount(queueFilters)}
                </span>
              )}
            </button>
          )}
        </div>
        <Select value={campaignId ?? ''} onValueChange={(v) => handleCampaignChange(v ?? '')}>
```

- [ ] **Step 5: Add chip strip and drawer to QueuePanel JSX**

After the closing `</div>` of the campaign selector section (the `border-b` div), and before the column headers block, add:

```tsx
      {/* Active filter chip strip */}
      {campaignId && <QueueFilterChips users={users} />}
```

At the very end of the returned JSX, just before the final closing `</div>` of the glass panel, add the drawer:

```tsx
      {/* Filter drawer — positioned within QueuePanel bounds */}
      {campaignId && (
        <QueueFilterDrawer
          open={filterDrawerOpen}
          onClose={() => setFilterDrawerOpen(false)}
          campaignId={campaignId}
          users={users}
        />
      )}
```

Also ensure the outer glass panel `<div>` has `relative` positioning — update line ~431:

```tsx
    <div className="glass-panel rounded-3xl flex flex-col w-2/3 flex-shrink-0 overflow-hidden relative">
```

- [ ] **Step 6: Run full test suite**

```bash
cd /Users/hannaholsson/LeadforceCRM && npx vitest run
```
Expected: All tests pass.

- [ ] **Step 7: TypeScript check**

```bash
cd /Users/hannaholsson/LeadforceCRM && npx tsc --noEmit
```
Expected: No errors.

- [ ] **Step 8: Commit**

```bash
git add src/components/dialer/QueuePanel.tsx
git commit -m "Wire filter drawer and chips into QueuePanel"
```

---

## Verification

1. Open the calling tab and select a campaign.
2. Confirm the **Filters** button appears in the campaign header row.
3. Click **Filters** — the drawer should slide in from the right within the QueuePanel, leaving CallControls and ScriptPanel visible.
4. Set a **Job title contains** filter (e.g., "Director") and click **Apply filters** — queue should re-fetch and show only Director contacts.
5. Confirm a chip appears below the header: `Title: Director`.
6. Click × on the chip — queue re-fetches showing all contacts again. Chip disappears.
7. Open filters, select two **Last call outcome** values (multi-select), apply — queue should show only contacts whose most recent call had one of those outcomes.
8. Set a **Dial attempts** filter with `> 3`, apply — confirm only contacts with more than 3 dial attempts appear.
9. Set an **Employee count** filter with `< 500`, apply — confirm only contacts at companies under 500 employees appear.
10. Click **Filters**, change values, then click X (close without applying) — confirm original filters are still active (chips unchanged).
11. Open filters, click **Clear all** in the footer — all fields reset to empty. Click Apply — queue shows unfiltered.
12. Change the campaign via the campaign selector — confirm all filter chips disappear and queue reloads unfiltered.
