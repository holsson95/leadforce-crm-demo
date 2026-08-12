# Calling Section Enhancements — Design Spec

**Date:** 2026-05-01  
**Status:** Approved

---

## Overview

Eight targeted enhancements to the calling page. All changes are confined to the calling section — no other pages are affected. The goal is a more usable, information-dense queue panel with correct selection behaviour, drag-to-reorder, a "calls made today" audit trail, and a manual call log option in the notes modal.

---

## 1. Page Layout

**Current:** Three horizontal panels — `QueuePanel` (`w-[30%]`) | `CallControls` (`flex-1`) | `ScriptPanel` (`w-[30%]`).

**New:** Two horizontal columns.

- **Left column (`w-2/3`):** `QueuePanel`
- **Right column (`w-1/3 flex flex-col gap-4`):**
  - `CallControls` (`flex-1`) — expands to fill available height
  - `ScriptPanel` (`h-48` or similar fixed min-height) — stacked below

**File changed:** `src/app/(dashboard)/calling/page.tsx` only.

---

## 2. Row Redesign — Phone Columns + Number Selector

### Grid

New row grid: `grid-cols-[auto_1fr_auto_auto_auto_auto_auto]`

| Col | Content | Notes |
|-----|---------|-------|
| 1 | Drag handle (`GripVertical`) | `auto`, only visible on hover |
| 2 | Contact info (name, title, company, employee count) | `1fr` |
| 3 | Call history dots | `auto` |
| 4 | Notes button | `auto` |
| 5 | Mobile number | `auto`, `font-mono text-[10px]`, truncated |
| 6 | Corporate number | `auto`, `font-mono text-[10px]`, truncated, empty cell if absent |
| 7 | Call button | `auto` |

### Number selection

- `selectedPhone: 'mobile' | 'corporate'` lives in row component state (not the store).
- Default: `'mobile'`. If mobile is absent but corporate is present, defaults to `'corporate'`.
- When both numbers are present, clicking either phone number column makes it the active selection (cyan text + underline). The unselected number stays in muted gray.
- When only one number exists, no selection UI — that number is used with no visual affordance.
- The call button passes the selected number to `startCall()`. The dialer store's `startCall` is updated to accept an optional `phoneNumber` override.

---

## 3. Tooltip Fix — Radix UI Portal

**Problem:** The custom hover `<span>` tooltip in `CallHistoryDots.tsx` uses `absolute bottom-full` positioning inside a scroll container that clips it at the top of the list panel.

**Fix:** Replace the custom tooltip with the shadcn `<Tooltip>` / `<TooltipContent>` components, which use `Radix UI` and portal their content to `<body>`. This means the tooltip renders outside the scroll container and can never be clipped.

**Tooltip content unchanged:** caller name, date, outcome label (coloured), notes (line-clamped to 2).

**Files changed:** `src/components/dialer/CallHistoryDots.tsx` only.

---

## 4. Row Selection Fix

**Problem:** `currentContact` is set to the first queue contact when a campaign loads, so the first row is always highlighted regardless of what the SDR wants to call.

**Fix:** On campaign load (`setCampaign` in the store), `currentContact` is set to `null`. The SDR clicks any row to select it, which calls `selectContact(contact)` and highlights that row. `CallControls` shows the "select a contact" empty state until a row is clicked.

No new actions needed — `selectContact` already exists in the store.

---

## 5. Drag-to-Reorder

**Library:** `@dnd-kit/core` + `@dnd-kit/sortable` (new dependency).

**Behaviour:**
- A `GripVertical` drag handle appears at the left of each queue row, visible on hover.
- Dragging reorders the `queue` array in the Zustand store via a new `reorderQueue(oldIndex, newIndex)` action.
- The "calls made today" section is **not** draggable.
- Order is **session-only** — not written to the DB, resets when the user navigates away or re-selects a campaign.

**Implementation:** `QueuePanel`'s contact list is wrapped in `<DndContext>` + `<SortableContext>`. Each `ContactRow` uses `useSortable`. On `onDragEnd`, the store's `reorderQueue` action is called with `arrayMove(queue, oldIndex, newIndex)`.

---

## 6. "Calls Made Today" Section

**Location:** Inside `QueuePanel`, below the queue list, separated by a divider.

**Header:** `"Calls made today (N)"` — clicking toggles the section open/closed. **Collapsed by default.**

**Row format:** Identical to the queue rows (drag handle hidden, all other columns present). The call button re-dials the contact.

**Data source:** Session-only Zustand state. A new `calledToday: ContactSummary[]` array is added to the dialer store. When `logOutcome` completes successfully, the contact (with its refreshed `callHistory` including the new record) is pushed to `calledToday` and removed from `queue`.

On page load and on campaign re-selection, `calledToday` resets to `[]`.

If a manual outcome is logged for a contact that is already in `calledToday` (e.g., the SDR opens notes from that section and logs another outcome), the contact is updated in-place in `calledToday` rather than duplicated — its `callHistory` is refreshed from the API response.

---

## 7. Queue Filtering — Already Called Today

**Problem:** Navigating away and back reloads the queue from the API, which could return contacts already called today (those whose status wasn't changed by the outcome, e.g. `connected`).

**Fix:** The queue API (`/api/dialer/queue/route.ts`) adds a Prisma `where` clause:

```prisma
callRecords: {
  none: {
    campaignId: campaignId,
    createdAt: { gte: startOfToday }
  }
}
```

`startOfToday` is computed server-side as `new Date()` set to `00:00:00.000` UTC. This filter runs on every queue fetch, so contacts called today are excluded regardless of their status. The filter resets naturally at midnight UTC.

---

## 8. Manual Outcome Override in Notes Modal

**UI change:** The footer of `ContactNotesModal` gains two tabs/toggle buttons: **"Add Note"** (existing behaviour) and **"Log Outcome"** (new). Toggling to "Log Outcome" replaces the textarea + Add Note button with a `DispositionForm` (outcome dropdown + notes textarea + Log Outcome button).

**API:** Reuses the existing `POST /api/dialer/log-outcome` endpoint with two additions:
- `manual: true` flag in the request body (Zod schema updated to accept it, optional, defaults to false)
- `durationSecs: 0` set server-side when `manual` is true (no actual call duration)

The endpoint creates a real `CallRecord` and runs the full outcome router (contact status changes, DNC logic, etc.).

**Store update:** On successful manual outcome log, the contact is moved from `queue` to `calledToday` (same as a regular call outcome), or updated in-place if already in `calledToday`. The modal closes automatically after submission.

**Call history dots:** The API response from `log-outcome` returns the updated `CallRecord`. The store appends it to the contact's `callHistory` so the dot appears immediately without a page reload — no separate fetch required.

---

## Data Model Changes

| Change | Reason |
|--------|--------|
| `POST /api/dialer/log-outcome` Zod schema: add `manual?: boolean` | Manual outcome flag |
| Queue API: add `callRecords.none` filter for today | Prevent re-showing called contacts |
| Dialer store: add `calledToday: ContactSummary[]` | Calls made today section |
| Dialer store: add `reorderQueue(oldIndex, newIndex)` | Drag-to-reorder |
| Dialer store: `setCampaign` sets `currentContact: null` | Row selection fix |
| Dialer store: `startCall` accepts optional `phoneNumber` override | Phone number selector |

No new Prisma models or migrations required.

---

## Dependencies

| Package | Purpose | New? |
|---------|---------|------|
| `@dnd-kit/core` | Drag-and-drop core | Yes |
| `@dnd-kit/sortable` | Sortable list utilities | Yes |
| `@dnd-kit/utilities` | `arrayMove` helper | Yes |

---

## Files Affected

| File | Change |
|------|--------|
| `src/app/(dashboard)/calling/page.tsx` | New 2-column layout |
| `src/components/dialer/QueuePanel.tsx` | New grid, phone columns, drag, calledToday section |
| `src/components/dialer/CallHistoryDots.tsx` | Radix Tooltip replacement |
| `src/components/dialer/ContactNotesModal.tsx` | Add "Log Outcome" tab |
| `src/stores/dialer-store.ts` | calledToday, reorderQueue, setCampaign null fix, startCall phone override |
| `src/app/api/dialer/queue/route.ts` | Add "called today" filter |
| `src/app/api/dialer/log-outcome/route.ts` | Accept `manual` flag, set durationSecs=0 |

---

## Out of Scope

- Script panel content (still Phase 6 placeholder)
- Reporting changes for manual call records
- Mobile/tablet responsive layout
