# Pipeline Settings & Permissions Design

**Date:** 2026-05-12
**Status:** Approved

---

## Overview

Two new settings sections that make the pipeline page functional:

1. `/settings/pipeline` — per-client stage CRUD and reordering (admin, manager, SDR)
2. `/settings/permissions` — generic permission override system, starting with `pipeline:write` (admin only)

---

## Schema

### New model: `PermissionOverride`

```prisma
model PermissionOverride {
  id          String   @id @default(cuid())
  tenantId    String
  subjectType String   // "user" | "role"
  subjectId   String   // userId  OR  "manager" | "sdr"
  permission  String   // e.g., "pipeline:write"
  granted     Boolean
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  tenant      Tenant   @relation(fields: [tenantId], references: [id])

  @@unique([tenantId, subjectType, subjectId, permission])
  @@index([tenantId])
}
```

The `Tenant` model also needs `permissionOverrides PermissionOverride[]` added as the inverse relation.

`SdrPermission.canWritePipeline` is left in place (not removed — breaking change). `PermissionOverride` takes precedence for pipeline write checks going forward.

### Default stage seeding

`src/lib/pipeline-defaults.ts` exports `DEFAULT_STAGES: { name, color, position }[]`. Called from `POST /api/clients` after client creation via `db.pipelineStage.createMany()`.

Default set:
- Prospecting (blue, position 0)
- Qualified (purple, position 1)
- Demo Scheduled (cyan, position 2)
- Proposal Sent (amber, position 3)
- Won (green, position 4)
- Lost (red, position 5)

Existing clients with zero stages are not backfilled — users configure those manually.

---

## Permission Resolution

New async function `resolvePermission(userId, tenantId, permission): Promise<boolean | null>` in `src/lib/auth.ts`.

Resolution order:
1. Admin → always `true` (no DB hit)
2. User-level override (`subjectType: "user"`, `subjectId: userId`) → wins if present
3. Role-level override (`subjectType: "role"`, `subjectId: role`) → wins if present
4. Returns `null` → caller falls back to hardcoded role default

Hardcoded role defaults for `pipeline:write`: `admin: true`, `manager: true`, `sdr: false`.

The existing synchronous `hasPermission(role, permission)` is unchanged — still used for coarse role-based gates. `resolvePermission` is called only where fine-grained overrides apply (pipeline stage write routes, pipeline settings page).

---

## Settings Pages

### `/settings/pipeline`

Accessible to: admin, manager, SDR (subject to `pipeline:write` permission check).

**Layout:**
- Client selector dropdown at the top (same pattern as the pipeline Kanban page)
- Drag-to-reorder stage list using `@dnd-kit` (already installed)
- Each row: colored dot, stage name (inline-editable on click), drag handle, delete button
- "Add stage" inline form at bottom of list — name field + 12-color swatch picker, no drawer
- Color picker: 12 predefined swatches (not a full hex picker)
- Delete blocked if stage has active deals → inline error: "Stage has active deals — move or close them first"
- Empty state if client has no stages: prompt with "Add your first stage" CTA

**Components:**
- `src/app/(dashboard)/settings/pipeline/page.tsx` — server component, fetches clients + stages for selected client
- `src/components/settings/PipelineStagesPanel.tsx` — client component, handles DnD + CRUD
- `src/components/settings/StageRow.tsx` — individual stage row (inline edit, color dot, drag handle)
- `src/components/settings/AddStageForm.tsx` — inline add form with swatch picker
- `src/components/settings/ColorSwatchPicker.tsx` — 12-swatch color selector

### `/settings/permissions`

Accessible to: admin only.

**Layout — two sections on one page:**

**Role Defaults:**
Toggle rows for each non-admin role × each permission:
- "Managers can edit pipeline" → role-level `PermissionOverride { subjectType: "role", subjectId: "manager", permission: "pipeline:write" }`
- "SDRs can edit pipeline" → role-level `PermissionOverride { subjectType: "role", subjectId: "sdr", permission: "pipeline:write" }`

Toggling off creates/updates the override with `granted: false`. Toggling back on deletes the override (reverts to default).

**Member Overrides:**
Table of all non-admin team members. Columns: Name, Role, Pipeline Edit toggle.
- Toggle shows current resolved state (user override → role override → default)
- When no user-level override exists: toggle is greyed with "Inherited" label showing the inherited value
- Toggling creates a user-level `PermissionOverride`; toggling back to match the inherited value deletes it

**Components:**
- `src/app/(dashboard)/settings/permissions/page.tsx` — server component, fetches team members + all overrides
- `src/components/settings/PermissionsPanel.tsx` — client component with role defaults + member table
- `src/components/settings/PermissionToggleRow.tsx` — single member row with toggle

---

## API Routes

### Pipeline stages (new write routes)

All write routes call `resolvePermission(userId, tenantId, 'pipeline:write')` before proceeding → `403` if denied.

| Method | Route | Purpose |
|--------|-------|---------|
| `POST` | `/api/pipeline/stages` | Create a stage for a client |
| `PATCH` | `/api/pipeline/stages/[id]` | Update name or color |
| `DELETE` | `/api/pipeline/stages/[id]` | Delete — `409` if stage has deals |
| `PATCH` | `/api/pipeline/stages/reorder` | Batch-update `position` for all stages in a client |

Existing `GET /api/pipeline/stages` — unchanged.

### Permissions

| Method | Route | Purpose |
|--------|-------|---------|
| `GET` | `/api/settings/permissions` | Fetch all `PermissionOverride` rows for the tenant |
| `PUT` | `/api/settings/permissions` | Upsert a role-level or user-level override |
| `DELETE` | `/api/settings/permissions/[id]` | Remove an override (reverts to inherited default) |

---

## Navigation Changes

**`src/components/settings/SettingsNav.tsx`:**
Add two entries:
- `{ href: '/settings/pipeline', label: 'Pipeline', icon: Kanban }`
- `{ href: '/settings/permissions', label: 'Permissions', icon: Shield }`

**`src/app/(dashboard)/settings/layout.tsx` — `ROLE_SECTIONS`:**
```typescript
admin:   [...existing, '/settings/pipeline', '/settings/permissions'],
manager: [...existing, '/settings/pipeline'],
sdr:     ['/settings/account', '/settings/pipeline'],
```

SDR access to `/settings/pipeline` is gated by `resolvePermission` server-side. The nav entry appears in SDR settings (since an admin may have granted access), but if `pipeline:write` resolves to `false`, the page renders a glass-panel "no access" empty state rather than redirecting — so the experience is graceful when access is later granted without a confusing bounce.

---

## Error Handling

| Scenario | Response |
|----------|----------|
| Delete stage with active deals | `409` — "Stage has active deals — move or close them first" |
| Reorder with mismatched stage IDs | `400 Bad Request` |
| Permission override for unknown userId | `404` |
| Stage write without `pipeline:write` | `403 Forbidden` |

---

## Testing

- Unit tests for `resolvePermission()`: user override wins over role, role wins over default, no override returns `null`
- Unit tests for `DEFAULT_STAGES` constant and seeding logic in `pipeline-defaults.ts`
- Existing pipeline Kanban E2E test updated to seed at least one stage before running

---

## Out of Scope

- Backfilling default stages for existing clients with zero stages
- Full hex color picker (12 swatches only)
- Permissions UI for anything other than `pipeline:write` (model supports it; UI deferred)
- Email notifications when pipeline access is revoked
