# Queue All Statuses + Manual Log Pipeline Option — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show all non-DNC contacts in the calling queue by default with a status filter, and fix the manual call log modal so the pipeline section appears for the 4 eligible outcomes.

**Architecture:** Four isolated file changes — one component prop fix, one pure-function library update (TDD), one API route query change, one filter drawer UI addition. No new files needed; all changes slot into existing patterns.

**Tech Stack:** Next.js App Router, TypeScript, Prisma, Zustand, Tailwind, Vitest

---

## File Map

| File | Change |
|---|---|
| `src/components/dialer/ContactNotesModal.tsx` | Read `campaignId` from dialer store; pass to `DispositionForm` |
| `src/lib/dialer-filters.ts` | Add `contactStatus` to `QueueFilters`; add `CONTACT_STATUSES_FOR_FILTER`; update `buildQueueUrl`, `activeFilterCount`, `filterToChips` |
| `src/lib/__tests__/dialer-filters.test.ts` | Add tests for new `contactStatus` behaviour |
| `src/app/api/dialer/queue/route.ts` | Change default status filter to exclude only `dnc`; add `contactStatus` query param |
| `src/components/dialer/QueueFilterDrawer.tsx` | Add Contact Status filter section at the top |

---

## Task 1: Fix ContactNotesModal — pass campaignId from store to DispositionForm

**Files:**
- Modify: `src/components/dialer/ContactNotesModal.tsx`

The "Log Outcome" tab passes `campaignId={null}` to `DispositionForm`, which prevents the pipeline section from ever appearing. `ContactNotesModal` already imports `useDialerStore`; we just need to pull `campaignId` out of it.

- [ ] **Step 1: Update the store selector in ContactNotesModal**

Open `src/components/dialer/ContactNotesModal.tsx`. Find line 37:

```ts
const logManualOutcome = useDialerStore((s) => s.logManualOutcome)
```

Replace with:

```ts
const { logManualOutcome, campaignId } = useDialerStore((s) => ({
  logManualOutcome: s.logManualOutcome,
  campaignId:       s.campaignId,
}))
```

- [ ] **Step 2: Pass campaignId to DispositionForm**

Find line 210 (inside the `tab === 'outcome'` branch):

```tsx
<DispositionForm campaignId={null} onSubmit={handleLogOutcome} loading={outcomeLoading} />
```

Replace with:

```tsx
<DispositionForm campaignId={campaignId} onSubmit={handleLogOutcome} loading={outcomeLoading} />
```

- [ ] **Step 3: Verify it compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Manual smoke test**

1. Run `npm run dev`
2. Go to the calling page, select a campaign, open the notes modal for any queue contact
3. Click "Log Outcome", select "Lead" (or Connected / Call Back Later / Meeting Booked)
4. Confirm the "Add to pipeline" toggle now appears
5. Select "No Answer" — confirm the toggle does NOT appear (only 4 eligible outcomes show it)

- [ ] **Step 5: Commit**

```bash
git add src/components/dialer/ContactNotesModal.tsx
git commit -m "Fix manual call log modal to show pipeline option for eligible outcomes"
```

---

## Task 2: Update dialer-filters.ts — add contactStatus support

**Files:**
- Modify: `src/lib/dialer-filters.ts`
- Modify: `src/lib/__tests__/dialer-filters.test.ts`

Add `contactStatus?: ContactStatus[]` to `QueueFilters`, a `CONTACT_STATUSES_FOR_FILTER` constant, and wire it through `buildQueueUrl`, `activeFilterCount`, and `filterToChips`. Use TDD.

- [ ] **Step 1: Write failing tests**

Open `src/lib/__tests__/dialer-filters.test.ts`. Add to the **end** of the file (after the existing `filterToChips` describe block):

```ts
describe('contactStatus filter', () => {
  it('buildQueueUrl includes contactStatus as comma-separated when set', () => {
    const url = buildQueueUrl('c1', { contactStatus: ['prospect', 'lead'] })
    expect(url).toContain('contactStatus=prospect%2Clead')
  })

  it('buildQueueUrl omits contactStatus when undefined', () => {
    expect(buildQueueUrl('c1', {})).not.toContain('contactStatus')
  })

  it('buildQueueUrl omits contactStatus when empty array', () => {
    expect(buildQueueUrl('c1', { contactStatus: [] })).not.toContain('contactStatus')
  })

  it('activeFilterCount counts contactStatus as +1 when non-empty', () => {
    expect(activeFilterCount({ contactStatus: ['prospect'] })).toBe(1)
    expect(activeFilterCount({ contactStatus: ['prospect', 'lead'] })).toBe(1)
  })

  it('activeFilterCount does not count contactStatus when empty or undefined', () => {
    expect(activeFilterCount({ contactStatus: [] })).toBe(0)
    expect(activeFilterCount({})).toBe(0)
  })

  it('filterToChips returns a chip for contactStatus with correct clearKeys', () => {
    const chips = filterToChips({ contactStatus: ['lead', 'call_back'] })
    expect(chips).toHaveLength(1)
    expect(chips[0].label).toBe('Status: Lead, Call Back')
    expect(chips[0].clearKeys).toEqual(['contactStatus'])
  })

  it('filterToChips returns no chip when contactStatus is empty', () => {
    expect(filterToChips({ contactStatus: [] })).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx vitest run src/lib/__tests__/dialer-filters.test.ts
```

Expected: the new `contactStatus filter` describe block fails with type errors or assertion failures. (The existing tests should still pass.)

- [ ] **Step 3: Update dialer-filters.ts**

Open `src/lib/dialer-filters.ts`. Make the following changes:

**3a — Add ContactStatus import at the top:**

```ts
import type { CallOutcome, ContactStatus } from '@prisma/client'
```

**3b — Add `contactStatus` to `QueueFilters` interface** (after `accountOwnerId`):

```ts
export interface QueueFilters {
  lastCallBefore?:   string
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
  contactStatus?:    ContactStatus[]
}
```

**3c — Add `CONTACT_STATUSES_FOR_FILTER` constant** (after `CALL_OUTCOMES_FOR_FILTER`):

```ts
export const CONTACT_STATUSES_FOR_FILTER: { value: ContactStatus; label: string }[] = [
  { value: 'prospect',       label: 'Prospect' },
  { value: 'lead',           label: 'Lead' },
  { value: 'call_back',      label: 'Call Back' },
  { value: 'future',         label: 'Future' },
  { value: 'meeting_booked', label: 'Meeting Booked' },
]
```

**3d — Update `buildQueueUrl`** — add after the `accountOwnerId` line (before the `return`):

```ts
if (filters.contactStatus?.length) params.set('contactStatus', filters.contactStatus.join(','))
```

**3e — Update `activeFilterCount`** — add after the `accountOwnerId` line:

```ts
if (filters.contactStatus?.length) count++
```

**3f — Update `filterToChips`** — add after the `accountOwnerId` chip block (before `return chips`):

```ts
if (filters.contactStatus?.length) {
  const labels = filters.contactStatus
    .map(v => CONTACT_STATUSES_FOR_FILTER.find(s => s.value === v)?.label ?? v)
    .join(', ')
  chips.push({ label: `Status: ${labels}`, clearKeys: ['contactStatus'] })
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx vitest run src/lib/__tests__/dialer-filters.test.ts
```

Expected: all tests pass, including the new `contactStatus filter` block.

- [ ] **Step 5: Commit**

```bash
git add src/lib/dialer-filters.ts src/lib/__tests__/dialer-filters.test.ts
git commit -m "Add contactStatus filter to QueueFilters, buildQueueUrl, activeFilterCount, filterToChips"
```

---

## Task 3: Update queue API route — default to all non-DNC, add contactStatus param

**Files:**
- Modify: `src/app/api/dialer/queue/route.ts`

- [ ] **Step 1: Add ContactStatus to the import**

Find the existing import at the top of the file:

```ts
import type { Prisma, CallOutcome } from '@prisma/client'
```

Replace with:

```ts
import type { Prisma, CallOutcome, ContactStatus } from '@prisma/client'
```

- [ ] **Step 2: Add contactStatus to QuerySchema**

Find the `QuerySchema` object. Add `contactStatus` after `accountOwnerId`:

```ts
const QuerySchema = z.object({
  campaignId:       z.string().min(1),
  skip:             z.coerce.number().int().min(0).optional().default(0),
  lastCallBefore:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  lastCallOutcome:  z.string().max(500).optional(),
  dialAttemptsOp:   NumericOp.optional(),
  dialAttemptsVal:  z.coerce.number().int().min(0).optional(),
  phonePrefix:      z.string().max(20).optional(),
  jobTitle:         z.string().max(200).optional(),
  companyName:      z.string().max(200).optional(),
  hasNotes:         z.enum(['true']).optional(),
  employeeCountOp:  NumericOp.optional(),
  employeeCountVal: z.coerce.number().int().min(0).optional(),
  industry:         z.string().max(500).optional(),
  city:             z.string().max(100).optional(),
  state:            z.string().max(100).optional(),
  country:          z.string().max(100).optional(),
  accountOwnerId:   z.string().optional(),
  contactStatus:    z.string().max(200).optional(),
})
```

- [ ] **Step 3: Destructure contactStatus from parsed data**

Find the destructuring block after `parsed.data`. Add `contactStatus` to it:

```ts
const {
  campaignId, skip,
  lastCallBefore, lastCallOutcome,
  dialAttemptsOp, dialAttemptsVal,
  phonePrefix, jobTitle, companyName,
  hasNotes, employeeCountOp, employeeCountVal,
  industry, city, state, country, accountOwnerId,
  contactStatus,
} = parsed.data
```

- [ ] **Step 4: Parse contactStatus and update the where clause**

Directly after the destructuring block, add:

```ts
const VALID_CONTACT_STATUSES = new Set<string>(['prospect', 'lead', 'call_back', 'future', 'meeting_booked'])
const parsedContactStatuses: ContactStatus[] | undefined = contactStatus
  ? (contactStatus.split(',').filter((v) => VALID_CONTACT_STATUSES.has(v)) as ContactStatus[])
  : undefined
```

Then find the `where` block and replace the hardcoded status line:

```ts
// Before:
status: { in: ['call_back', 'prospect'] },

// After:
status: parsedContactStatuses?.length
  ? { in: parsedContactStatuses }
  : { not: 'dnc' as ContactStatus },
```

- [ ] **Step 5: Verify it compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Smoke test the API change**

1. Run `npm run dev`
2. Go to the calling page, select a campaign
3. Confirm the queue now shows contacts with statuses beyond `prospect` and `call_back` (e.g. `lead`, `future`, `meeting_booked` if any exist)
4. Confirm DNC contacts do not appear

- [ ] **Step 7: Commit**

```bash
git add src/app/api/dialer/queue/route.ts
git commit -m "Queue defaults to all non-DNC contacts; add contactStatus filter param"
```

---

## Task 4: Add Contact Status filter section to QueueFilterDrawer

**Files:**
- Modify: `src/components/dialer/QueueFilterDrawer.tsx`

- [ ] **Step 1: Add import for CONTACT_STATUSES_FOR_FILTER**

Find the existing import from `@/lib/dialer-filters`:

```ts
import { CALL_OUTCOMES_FOR_FILTER } from '@/lib/dialer-filters'
import type { QueueFilters, NumericOp } from '@/lib/dialer-filters'
```

Replace with:

```ts
import { CALL_OUTCOMES_FOR_FILTER, CONTACT_STATUSES_FOR_FILTER } from '@/lib/dialer-filters'
import type { QueueFilters, NumericOp } from '@/lib/dialer-filters'
```

- [ ] **Step 2: Add toggleContactStatus handler**

Find the `toggleIndustry` function and add `toggleContactStatus` directly after it:

```ts
const toggleContactStatus = (value: string, checked: boolean) => {
  const curr = f.contactStatus ?? []
  const next = checked
    ? [...curr, value as NonNullable<QueueFilters['contactStatus']>[number]]
    : curr.filter((v) => v !== value)
  upd({ contactStatus: next.length ? next : undefined })
}
```

- [ ] **Step 3: Add Contact Status FilterSection**

In the scrollable filter groups `<div>`, add a new `FilterSection` **before** the existing `<FilterSection title="Call History">` block:

```tsx
<FilterSection title="Contact Status">
  <div className="space-y-1.5">
    {CONTACT_STATUSES_FOR_FILTER.map(({ value, label }) => (
      <label key={value} className="flex items-center gap-2 cursor-pointer group">
        <input
          type="checkbox"
          checked={f.contactStatus?.includes(value) ?? false}
          onChange={(e) => toggleContactStatus(value, e.target.checked)}
          className="accent-[#00d4ff]"
        />
        <span className="text-xs text-gray-400 group-hover:text-white transition-colors">
          {label}
        </span>
      </label>
    ))}
  </div>
</FilterSection>
```

- [ ] **Step 4: Verify it compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Manual smoke test**

1. Run `npm run dev`
2. Go to calling page, select a campaign, open the filter drawer
3. Confirm "Contact Status" section appears at the top with 5 checkboxes: Prospect, Lead, Call Back, Future, Meeting Booked
4. Check "Lead" only — apply filters — confirm only lead-status contacts appear in the queue
5. Clear filters — confirm all non-DNC contacts return
6. Confirm the filter badge count on the Filters button increments when Contact Status is selected
7. Confirm a "Status: Lead" chip appears in the filter chip bar above the queue

- [ ] **Step 6: Run full test suite**

```bash
npx vitest run
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/components/dialer/QueueFilterDrawer.tsx
git commit -m "Add Contact Status filter section to queue filter drawer"
```
