# Spec: Queue All Statuses + Manual Log Pipeline Option

**Date:** 2026-05-22
**Status:** Approved

---

## Overview

Two focused enhancements to the calling page:

1. **Pipeline option in manual call log** — The "Log Outcome" tab in the Contact Notes modal currently cannot offer the pipeline section because it passes `campaignId={null}` to `DispositionForm`. Fix: read `campaignId` from the dialer store and pass it through.

2. **Queue shows all non-DNC contacts** — The queue API currently hardcodes `status: { in: ['call_back', 'prospect'] }`. Change the default to exclude only `dnc`, and add a Contact Status filter to the filter drawer so SDRs can narrow down by status.

---

## Feature 1 — Pipeline Option in Manual Call Log

### Problem

`ContactNotesModal` renders `DispositionForm` with `campaignId={null}`:

```tsx
// ContactNotesModal.tsx:210
<DispositionForm campaignId={null} onSubmit={handleLogOutcome} loading={outcomeLoading} />
```

`DispositionForm` gates the pipeline section on `campaignId !== null`, so the pipeline toggle never appears when logging outcomes through the notes modal.

### Solution

`ContactNotesModal` already imports `useDialerStore`. Add `campaignId` to the store selector and pass it to `DispositionForm`:

```tsx
// Before
const logManualOutcome = useDialerStore((s) => s.logManualOutcome)

// After
const { logManualOutcome, campaignId } = useDialerStore((s) => ({
  logManualOutcome: s.logManualOutcome,
  campaignId:       s.campaignId,
}))

// DispositionForm call
<DispositionForm campaignId={campaignId} onSubmit={handleLogOutcome} loading={outcomeLoading} />
```

### Behaviour unchanged

- Pipeline section still only appears for the 4 eligible outcomes: `connected`, `lead`, `call_back_later`, `meeting_booked` (governed by `PIPELINE_ELIGIBLE_OUTCOMES` in `outcome-router.ts`).
- If no campaign is selected in the dialer store, `campaignId` is `null` and the pipeline section stays hidden — same as before.
- `DispositionForm` logic, `PipelineAction` type, and the pipeline-stages API are untouched.

---

## Feature 2 — Queue Shows All Non-DNC Contacts + Status Filter

### Contact statuses (from Prisma schema)

| Status | Shown by default | Selectable in filter |
|---|---|---|
| `prospect` | yes | yes |
| `lead` | yes | yes |
| `call_back` | yes | yes |
| `future` | yes | yes |
| `meeting_booked` | yes | yes |
| `dnc` | **never** | no |

### A — Queue API (`src/app/api/dialer/queue/route.ts`)

**Default where clause change:**

```ts
// Before
status: { in: ['call_back', 'prospect'] },

// After
status: { not: 'dnc' },
```

**New query param:** Add `contactStatus` (optional, comma-separated) to `QuerySchema`:

```ts
contactStatus: z.string().max(200).optional(),
```

When `contactStatus` is provided, parse and validate against the 5 selectable values (`prospect`, `lead`, `call_back`, `future`, `meeting_booked`) and use `status: { in: parsedStatuses }` instead of the default `status: { not: 'dnc' }`.

All existing filters (`notInterestedUntil`, `calledToday` exclusion, `dialAttempts`, etc.) remain unchanged.

### B — Filter type and URL builder (`src/lib/dialer-filters.ts`)

Add `contactStatus` to `QueueFilters`:

```ts
export interface QueueFilters {
  // ... existing fields ...
  contactStatus?: ContactStatus[]
}
```

Update `buildQueueUrl` to serialize `contactStatus` as a comma-joined string when set.

Update `activeFilterCount` to count `contactStatus` as +1 when the array is non-empty — same pattern as `lastCallOutcome` and `industry`.

### C — Filter drawer UI (`src/components/dialer/QueueFilterDrawer.tsx`)

Add a new `FilterSection` titled **"Contact Status"** at the top of the drawer (above "Call History"), with checkboxes for the 5 selectable statuses:

| Label | Value |
|---|---|
| Prospect | `prospect` |
| Lead | `lead` |
| Call Back | `call_back` |
| Future | `future` |
| Meeting Booked | `meeting_booked` |

Same checkbox + label pattern as the existing "Last call outcome" section. No selection = show all non-DNC (default). Toggle logic mirrors `toggleOutcome`.

Import `ContactStatus` from `@prisma/client` for the constant list.

---

## Files Changed

| File | Change |
|---|---|
| `src/components/dialer/ContactNotesModal.tsx` | Read `campaignId` from store; pass to `DispositionForm` |
| `src/app/api/dialer/queue/route.ts` | Default to `status: { not: 'dnc' }`; add `contactStatus` param |
| `src/lib/dialer-filters.ts` | Add `contactStatus` to `QueueFilters`; update `buildQueueUrl` and `activeFilterCount` |
| `src/components/dialer/QueueFilterDrawer.tsx` | Add Contact Status filter section |

---

## Out of Scope

- No changes to `PIPELINE_ELIGIBLE_OUTCOMES` or `DispositionForm` logic.
- No changes to the `notInterestedUntil` cooldown or "called today" exclusion logic.
- No changes to `QuickLogDropdown` (quick log in queue rows does not support pipeline — it's a fast one-tap action).
- DNC contacts are never surfaced in the queue UI or filter options.
