# Queue Contact Expand Panel — Design Spec

**Date:** 2026-05-13  
**Feature:** Expandable contact detail panel in the calling queue  
**Status:** Approved

---

## Overview

Each row in the calling queue (`QueuePanel`) gets a chevron button next to the contact name. Clicking it expands an inline panel directly below the row showing all contact fields. The panel has an Edit button that switches the entire panel into an inline form. Only one panel can be open at a time.

---

## Component Structure

### `QueuePanel` changes
- Add `expandedContactId: string | null` state — tracks which row's panel is open. Setting a new ID auto-closes the previous one.
- Add `contactCache: Record<string, ContactWithCampaign>` state — caches full contact data keyed by contact ID to avoid re-fetching on re-open.
- Pass three new props to each `ContactRow`: `isExpanded: boolean`, `onToggle: (id: string) => void`, `cachedContact: ContactWithCampaign | null`.

### `ContactRow` changes
- Add a `ChevronDown` button inside the name cell (rotates 180° when expanded).
- Clicking the chevron calls `onToggle(contact.id)` and stops event propagation (does not trigger row-select).
- When `isExpanded` is true, render `<ContactExpandPanel>` below the row grid. The panel sits inside the sortable item but has no drag listeners — the grip handle already scopes drag to the icon only, so panel interactions won't initiate a drag.

### New: `ContactExpandPanel` (`src/components/dialer/ContactExpandPanel.tsx`)
- Owns `isEditing: boolean` state.
- Renders read view or edit form based on `isEditing`.
- Receives `contact: ContactWithCampaign`, `onClose: () => void`, `onSaved: (updated: ContactWithCampaign) => void`.

---

## Data Layer

### New `GET /api/contacts/[id]`
Added to the existing `src/app/api/contacts/[id]/route.ts`. Returns the full contact including:
```ts
include: {
  campaign: { select: { id: true, name: true } },
  accountOwner: { select: { id: true, name: true } },
}
```
Response shape: `{ data: ContactWithCampaign }`. Requires `contacts:read` permission.

### Fetch strategy in `QueuePanel`
1. Chevron clicked → check `contactCache[id]`
2. Cache hit → set `expandedContactId` immediately
3. Cache miss → fetch `GET /api/contacts/${id}`, store in cache, then set `expandedContactId`
4. After successful save → update `contactCache[id]` with the returned contact

### Queue store sync on save
After a successful save, directly patch the matching `ContactSummary` entry in the dialer store's `queue` array and `currentContact` (if it matches) with the updated firstName, lastName, companyName, jobTitle, mobilePhone, and status fields. Do not call `syncQueue()` — that re-fetches the entire queue and is unnecessary for a single-field update. Add a `patchContact(id, partial)` action to the dialer store for this purpose.

---

## Read Panel Layout

**Container:** Full-width block below the row. Styled with the glass-panel dark aesthetic: `bg-[rgba(22,28,38,0.6)] border-t border-white/10 rounded-b-2xl px-6 py-4`. Animate open/close with `max-h` transition.

**Header:** Contact full name (large, white) on the left. "Edit" ghost button and "×" close button on the right.

**Field grid:** Two-column layout. Fields grouped into four sections separated by a subtle divider label:

| Section | Fields |
|---|---|
| Personal | Email, Mobile Phone, Corporate Phone, Job Title |
| Company | Company Name, Industry, Employee Count, Website, LinkedIn URL |
| Location | Address, City, State, ZIP, Country, Company Address, Company City |
| Assignment | Status (badge), DNC Reason (if status = dnc), Account Owner, Campaign, Dial Attempts |

Each field: `text-[10px] uppercase tracking-wider text-gray-500` label above `text-sm text-white` value. Null/empty fields render `—` in `text-gray-600`.

---

## Edit Form

**Trigger:** Clicking "Edit" in the panel header sets `isEditing = true`. The read view is replaced by the form in place (no modal, no navigation).

**Form library:** `react-hook-form` + `zodResolver` using `UpdateContactSchema` (the `.partial()` variant of `ContactSchema`) from `src/app/(dashboard)/contacts/schemas`. The `campaignId` field is excluded from the form entirely — it is shown as a read-only text label in the Assignment section since the contact is already scoped to a campaign in the queue context.

**Input style:** `bg-white/5 border-white/10 text-white placeholder:text-gray-600 focus:border-[#00d4ff]/50 focus:ring-1 focus:ring-[#00d4ff]/10 rounded-xl` — identical to `ContactModal`.

**Field layout:** Same four-section grouping as read mode. DNC Reason field appears conditionally when status dropdown value is `dnc`.

**Actions:**
- **Save** — submits `PATCH /api/contacts/${id}`. On success: calls `onSaved(updatedContact)`, exits edit mode (back to read view). On error: shows toast notification (`text-red-400`), stays in edit mode.
- **Cancel** — sets `isEditing = false`, resets form to original values, no API call.

**Save button style:** `bg-gradient-to-r from-[#00d4ff] to-cyan-600 text-black font-semibold rounded-xl` (matches ContactModal).

---

## Files To Create / Modify

| File | Change |
|---|---|
| `src/app/api/contacts/[id]/route.ts` | Add `GET` handler |
| `src/components/dialer/QueuePanel.tsx` | Add `expandedContactId`, `contactCache` state; pass props to `ContactRow` |
| `src/components/dialer/ContactRow` (within `QueuePanel.tsx`) | Add chevron button, render `ContactExpandPanel` when expanded |
| `src/stores/dialer-store.ts` | Add `patchContact(id, partial)` action |
| `src/components/dialer/ContactExpandPanel.tsx` | New file — read view + inline edit form |

---

## Out of Scope

- `CalledTodayRow` does not get the expand panel (called contacts are historical, not actionable).
- No changes to `ContactSummary` type or dialer queue API.
- No changes to the existing `ContactModal` used on the Contacts page.
