# Queue Filter Drawer — Design Spec

**Date:** 2026-05-19
**Status:** Approved

---

## Context

SDRs working in the calling tab currently have no way to narrow the dialer queue beyond campaign selection. As contact lists grow, SDRs need to slice the queue by call history, contact attributes, company size, and location so they can work strategically — e.g., retry all voicemails in one pass, or focus on VP-level contacts at mid-market companies.

---

## Trigger & Active State

A **"Filters"** button is added to the QueuePanel header row (right side, alongside the existing campaign and user selectors). When one or more filters are active, the button shows a badge with the active count: `Filters · 3`.

Below the header row — above the first contact row — a **chip strip** appears only when filters are active. Each chip displays the filter name and value (e.g., `Last outcome: Voicemail, No Answer`, `Dial attempts: > 3`) and has an × to remove that filter individually. A "Clear all" link sits at the end of the strip. The strip takes no vertical space when empty.

The queue re-fetches (from page 1) whenever the drawer is closed via the Apply button.

---

## Filter Drawer

The drawer is **scoped to the QueuePanel** — it slides in from the right as an absolute-positioned panel within the QueuePanel bounds, not a full-page SlideDrawer. This keeps the CallControls and ScriptPanel fully visible during an active call.

### Header
- Title: "Filter queue"
- X close button (top right) — closes without applying, discards unsaved changes

### Footer
- **"Apply filters"** primary button — commits current filter state, closes drawer, triggers queue re-fetch
- **"Clear all"** ghost button — resets all filter fields to empty (does not close drawer)

### Filter Groups

Each group is a collapsible section with a chevron. Sections with active values start expanded; empty sections start collapsed.

---

#### Call History

| Filter | Control | Behavior |
|--------|---------|----------|
| Last call date | Date picker | "On or before" — contacts whose most recent CallRecord.createdAt ≤ selected date. Contacts with no call history are excluded when this filter is active. |
| Last call outcome | Multi-select checkboxes | Matches contacts whose most recent CallRecord.outcome is in the selected set. Contacts with no call history are excluded when this filter is active. |
| Dial attempts | Operator dropdown (`=` / `>` / `<` / `>=` / `<=`) + number input | Filters on Contact.dialAttempts |

**Curated outcome list for multi-select** (10 most actionable):
No Answer, Voicemail, Left Voicemail, Not Interested, Call Back Later, Bad Time to Speak, In a Meeting, Hung Up, Connected, Wrong Number

---

#### Phone

| Filter | Control | Behavior |
|--------|---------|----------|
| Number prefix | Text input | Matches Contact.mobilePhone starting with entered string (e.g., `+1`) |

---

#### Contact

| Filter | Control | Behavior |
|--------|---------|----------|
| Job title | Text input (contains) | Case-insensitive substring match on Contact.jobTitle |
| Company name | Text input (contains) | Case-insensitive substring match on Contact.companyName |
| Has notes | Toggle | Toggle ON = show only contacts with at least one note. Toggle OFF = no filter applied on this field. |

---

#### Company

| Filter | Control | Behavior |
|--------|---------|----------|
| Employee count | Operator dropdown (`=` / `>` / `<` / `>=` / `<=`) + number input | Filters on Contact.employeeCount |
| Industry | Multi-select checkboxes | Populated by fetching distinct `industry` values for the selected campaign on drawer open (cached per campaignId). A new `GET /api/dialer/queue/meta?campaignId=xxx` endpoint returns `{ industries: string[] }`. |

---

#### Location

| Filter | Control | Behavior |
|--------|---------|----------|
| City | Text input (contains) | Case-insensitive substring match on Contact.city |
| State | Text input (contains) | Case-insensitive substring match on Contact.state |
| Country | Text input (contains) | Case-insensitive substring match on Contact.country |

---

#### Assignment

| Filter | Control | Behavior |
|--------|---------|----------|
| Account owner | Single-select dropdown | Filters on Contact.accountOwnerId; populated from users list already passed to QueuePanel |

---

## Data Flow

### State

A new `queueFilters` object is added to `dialer-store.ts` alongside the existing `campaignId` and `queue` fields:

```typescript
interface QueueFilters {
  lastCallBefore?: string        // ISO date string
  lastCallOutcome?: CallOutcome[]
  dialAttemptsOp?: 'eq' | 'gt' | 'lt' | 'gte' | 'lte'
  dialAttemptsVal?: number
  phonePrefix?: string
  jobTitle?: string
  companyName?: string
  hasNotes?: boolean
  employeeCountOp?: 'eq' | 'gt' | 'lt' | 'gte' | 'lte'
  employeeCountVal?: number
  industry?: string[]
  city?: string
  state?: string
  country?: string
  accountOwnerId?: string
}
```

A separate `pendingFilters` field holds in-progress drawer state (not yet applied). When the drawer opens, `pendingFilters` is initialised from `queueFilters` so the current applied state is shown. On Apply, `pendingFilters` is copied to `queueFilters` and the queue re-fetches from skip=0. On X close, `pendingFilters` is reset to match `queueFilters` (discard changes).

### API

The existing `GET /api/dialer/queue` endpoint gains new optional query params:

```
lastCallBefore=2025-05-01
lastCallOutcome=no_answer,voicemail
dialAttemptsOp=gt&dialAttemptsVal=3
employeeCountOp=lt&employeeCountVal=500
phonePrefix=%2B1
jobTitle=Director
companyName=Acme
hasNotes=true
industry=SaaS,Fintech
city=Austin&state=TX&country=US
accountOwnerId=clx123
```

These stack as additional `where` clauses onto the existing Prisma filters (status, notInterestedUntil, soft delete). The `lastCallBefore` and `lastCallOutcome` filters use a subquery on `CallRecord` scoped to the most recent record per contact.

The `hasNotes` filter joins against the Contact's notes relation (a count check).

All new params are optional — omitting them preserves existing behavior exactly.

### Chip Strip

The chip strip reads from `queueFilters` (the applied state, not pending) in the Zustand store. Clicking × on a chip updates `queueFilters` directly and triggers a re-fetch. "Clear all" resets `queueFilters` to `{}` and re-fetches.

---

## Files to Create or Modify

| File | Change |
|------|--------|
| `src/stores/dialer-store.ts` | Add `queueFilters`, `pendingFilters`, and related actions |
| `src/components/dialer/QueuePanel.tsx` | Add Filters button, chip strip, drawer trigger |
| `src/components/dialer/QueueFilterDrawer.tsx` | New component — the filter drawer and all its controls |
| `src/components/dialer/QueueFilterChips.tsx` | New component — active filter chip strip |
| `src/app/api/dialer/queue/route.ts` | Add new optional query param handling and Prisma where clauses |
| `src/app/api/dialer/queue/meta/route.ts` | New endpoint — returns distinct industry values for a campaign |

---

## Out of Scope

- Saving named filter presets (future enhancement)
- Sorting controls (separate feature)
- Filters on corporate phone (mobilePhone only for dialer context)
