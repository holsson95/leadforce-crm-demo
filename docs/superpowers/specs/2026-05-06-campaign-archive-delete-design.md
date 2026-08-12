# Campaign Archive & Delete Redesign — Design Spec

**Date:** 2026-05-06
**Scope:** Campaign lifecycle management — archive (permanent soft, recoverable anytime), hard delete with 3-day restore window, campaigns page UI with three sections, reports and dashboard filtering.

---

## Goals

- Give managers a clear choice between archiving (keeps data, always recoverable) and deleting (purges after 72h) instead of a silent soft-delete.
- Surface archived and recently-deleted campaigns in the campaigns page without requiring navigation to a separate page.
- Ensure reports include active + archived campaigns only (deleted campaigns are excluded immediately). Dashboard shows active campaigns only.

---

## Data Model

### Schema change

Add `archivedAt DateTime?` to the `Campaign` model, following the same pattern as the existing `deletedAt` field.

```prisma
model Campaign {
  // ... existing fields ...
  archivedAt  DateTime?
  deletedAt   DateTime?
}
```

### Lifecycle states

A campaign has three mutually-exclusive lifecycle states determined by the two date fields:

| State | `archivedAt` | `deletedAt` | Callable | In reports | In dashboard health |
|-------|-------------|-------------|----------|------------|---------------------|
| Live (draft/active/paused/completed) | null | null | Yes | Yes | Active only |
| Archived | set | null | No | Yes (labelled) | No |
| Deleted | null | set | No | No | No |

The `status` field (`draft/active/paused/completed`) remains untouched — it describes operational state within a live campaign's workflow. `archivedAt` is a separate lifecycle concern.

### Middleware change

Campaign is currently in `SOFT_DELETE_MODELS` in `src/lib/db.ts`, which auto-injects `deletedAt: null` on all `findMany` queries. Campaign must be **removed from `SOFT_DELETE_MODELS`** so queries for the archived and recently-deleted sections can work. Every existing Campaign `findMany` query must then explicitly declare `deletedAt: null` (and `archivedAt: null` where appropriate).

### Purge job

A BullMQ scheduled job runs nightly. Any campaign where `deletedAt < now - 72 hours` is hard-deleted along with its cascade:
- All `Contact` rows for that campaign
- All `CallRecord` rows for that campaign
- All `PipelineDeal` rows for that campaign
- All `CampaignSDR` rows for that campaign

---

## API

### New endpoints

| Method | Path | Action | Validation |
|--------|------|--------|------------|
| `POST` | `/api/campaigns/[id]/archive` | Sets `archivedAt: now()` | Campaign must exist and not be deleted |
| `POST` | `/api/campaigns/[id]/unarchive` | Clears `archivedAt: null` | Campaign must be archived |
| `POST` | `/api/campaigns/[id]/restore` | Clears `deletedAt: null` | `deletedAt` must be within 72h; returns 409 if window expired |

### Modified endpoints

**`GET /api/campaigns`** gains a `section` query param:

- No param (default) — `archivedAt: null, deletedAt: null` — live campaigns
- `?section=archived` — `archivedAt: { not: null }, deletedAt: null`
- `?section=deleted` — `deletedAt: { not: null }`, filtered to `deletedAt > now - 72h`

**`DELETE /api/campaigns/[id]`** — Sets `deletedAt: now()`. The where clause must include `archivedAt: null, deletedAt: null` so that archived campaigns cannot be deleted via the API (returns 404). The UI enforces this too — archived campaigns have no Delete action — but the API must not trust the UI.

### Permissions

Only `admin` and `manager` roles can archive, unarchive, delete, or restore. SDRs have read-only visibility of archived campaigns in reports; they cannot change lifecycle state.

---

## Campaigns Page UI

The campaigns page (`/campaigns`) gets three stacked sections:

### Main list

Unchanged visually. Shows campaigns where `archivedAt: null` and `deletedAt: null`. Each row's action menu (managers/admins only) adds:
- **Archive** — opens the delete/archive choice modal with Archive pre-selected
- **Delete** — opens the delete/archive choice modal with Delete pre-selected

### Archived section

A collapsible section below the main list:

```
▶ Archived (3)
```

Clicking expands a table with columns: Campaign Name, Client, Archived date, Unarchive button. Collapsed by default. No action menu — only "Unarchive" available. Calling cannot be initiated from archived campaigns.

### Recently Deleted section

A collapsible section below archived:

```
▶ Recently Deleted (1)
```

Each row shows: Campaign Name, Client, a countdown label ("Restores available for 2d 14h"), and a "Restore" button. Rows disappear once the 72h window passes (the purge job handles actual data removal). Collapsed by default.

### Delete/Archive confirmation modal

Triggered when a manager clicks "Archive" or "Delete" from the action menu. Presents two options with Archive pre-selected:

> **Remove this campaign?**
>
> ◉ **Archive** *(recommended)* — Closes the campaign. All data is kept and continues to appear in reports. You can unarchive at any time.
>
> ○ **Delete permanently** — Removes all campaign data after 3 days. You have a 72-hour window to restore.
>
> [Cancel] [Confirm]

The user must actively select "Delete permanently" before the destructive path is available.

---

## Reports & Dashboard Filtering

### Dashboard — Campaign Health Grid

Query: `status: 'active', archivedAt: null, deletedAt: null`

Archived and deleted campaigns are excluded immediately. No visual change.

### Reports — SDR Leaderboard

Queries SDR users and their call records directly. No campaign-level filter needed — works correctly as-is for both active and archived campaign data.

### Reports — MB Breakdown campaign filter dropdown

Fetches campaigns where `deletedAt: null` (both active and archived). Archived campaigns display with a suffix:

```
Acme Corp — Q1 Outreach
Acme Corp — 2024 Reactivation (archived)
```

Deleted campaigns never appear in the dropdown, even during the 3-day restore window.

### Reports — MB Breakdown detail table

Call records from archived campaigns display normally. Call records from deleted campaigns are excluded immediately — once a campaign is deleted, its data is excluded from all reports regardless of the restore window.

---

## File Map

### New files
| File | Purpose |
|------|---------|
| `src/app/api/campaigns/[id]/archive/route.ts` | POST — set archivedAt |
| `src/app/api/campaigns/[id]/unarchive/route.ts` | POST — clear archivedAt |
| `src/app/api/campaigns/[id]/restore/route.ts` | POST — clear deletedAt (72h check) |
| `src/lib/jobs/purge-deleted-campaigns.ts` | BullMQ nightly purge job |

### Modified files
| File | Change |
|------|--------|
| `prisma/schema.prisma` | Add `archivedAt DateTime?` to Campaign |
| `src/lib/db.ts` | Remove Campaign from `SOFT_DELETE_MODELS` |
| `src/app/api/campaigns/route.ts` | Support `?section=` param; add explicit `deletedAt: null, archivedAt: null` to default query |
| `src/app/api/campaigns/[id]/route.ts` | Add explicit `deletedAt: null` to PATCH/DELETE where clauses |
| `src/app/(dashboard)/campaigns/page.tsx` | Add archived + recently deleted sections; delete/archive modal |
| `src/lib/reports.ts` | `getCampaignHealth`: add `archivedAt: null`; `getMBBreakdown` campaign fetch: add `deletedAt: null` (remove archivedAt filter to include archived) |
| `src/app/(dashboard)/reports/page.tsx` | Campaign dropdown label: append "(archived)" for archived campaigns |

---

## Out of Scope

- Client portal visibility of archived campaigns
- Bulk archive / bulk delete
- Archiving contacts or scripts independently of their campaign
