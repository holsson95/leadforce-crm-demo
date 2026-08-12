# Phase 6a — Client Portal Design

**Date:** 2026-05-08  
**Scope:** Client login, portal dashboard, and pipeline view. Part of Phase 6 (Polish & Client Portal). Email integration deferred.

---

## Overview

Clients (the companies that hire the SDR agency) get a read/write-limited view of their own campaigns and pipeline via an invite-based portal. The portal lives at `/client-portal/` under a separate layout. Access is controlled by a `portalPermissions` JSON field on the `Client` record, defaulting to full read/write.

---

## Schema Changes

Add two fields to the `Client` model in `prisma/schema.prisma`:

```prisma
clerkId           String?   @unique   // set after first portal sign-in via Clerk webhook
portalPermissions Json      @default("{}")
```

### Permission Resolution

A `getClientPermission(client, key)` helper resolves a dot-notation key (e.g. `"pipeline.write"`) against `portalPermissions`, returning `true` if the key is absent. Explicit restrictions require `false`:

```json
{ "pipeline": { "write": false } }
```

This means new permission keys never break existing clients — opt-out, not opt-in.

> **Future migration note:** When multi-user portal access per client is needed, extract to a `ClientPortalAccess` model with fields `(id, clientId, clerkId, permissions Json)` and migrate `clerkId` + `portalPermissions` there. The `getClientPermission` helper interface stays the same — only its data source changes.

---

## Invite Flow

### Sending the Invite

- A "Send Portal Invite" button appears on each client row in the clients table and inside `ClientDrawer`
- Visible only to `admin` and `manager` roles
- If `client.clerkId` is already set, show "Portal Active" badge instead (disabled state)
- Calls `POST /api/clients/[id]/portal-invite`

### API Route: `POST /api/clients/[id]/portal-invite`

1. Auth check: `admin` or `manager` role only
2. Fetch `Client` by id, scoped to tenant
3. If `clerkId` already set, return `409 Conflict`
4. If no `email` on the client record, return `400`
5. Create Clerk invitation via Clerk Backend SDK:
   ```ts
   clerkClient.invitations.createInvitation({
     emailAddress: client.email,
     publicMetadata: { role: 'client', clientId: client.id },
   })
   ```
6. Return `{ data: { sent: true } }`

### First Sign-In (Clerk Webhook)

The existing `/api/webhooks/clerk` handler processes `user.created` events. Extend it to:

1. Read `publicMetadata.clientId` from the Clerk user record
2. If present, find the `Client` by id — this gives us both the record to update and `client.tenantId`
3. Set `clerkId = event.data.id` on the `Client` record
4. Create a `User` row with `role: 'client'`, `tenantId: client.tenantId`, `clerkId: event.data.id` (same provisioning pattern as SDR creation)

---

## Routing & Middleware

Extend `src/middleware.ts` role-based routing:

| Role | Destination after sign-in |
|------|--------------------------|
| `admin` / `manager` / `sdr` | `/(dashboard)/` |
| `client` | `/client-portal/` |

Guard both route groups:
- `/(dashboard)/` — redirect `client` role to `/client-portal/`
- `/client-portal/` — redirect non-`client` roles to `/(dashboard)/`

---

## Client Portal Layout

**Route group:** `src/app/client-portal/`  
**Layout file:** `src/app/client-portal/layout.tsx`

Minimal shell — no sidebar. Header contains:
- LeadForce logo (left)
- Client company name (center, pulled from the `Client` record via `clerkId` lookup)
- Sign-out button (right)

Dark glass aesthetic identical to the main app. No `Toaster` duplication — reuse the one in root layout.

---

## Pages

### Dashboard — `/client-portal/`

Three `KpiCard` components in a row:

| Card | Value | Source |
|------|-------|--------|
| Active Campaigns | Count of campaigns where `status != archived` and `deletedAt = null` | `Campaign` filtered by `clientId` |
| Meetings Booked | Count of `CallRecord` rows with `outcome = MeetingBooked` | Across all client campaigns |
| Open Deals | Count + total value of `PipelineDeal` where `closedAt = null` | Filtered by `clientId` |

Below the KPIs: a compact read-only deals list grouped by pipeline stage (stage name as section header, deal title + value as rows), with a "View full pipeline →" link to `/client-portal/pipeline`.

### Pipeline — `/client-portal/pipeline`

Reuses `KanbanBoard` component, filtered to this client's deals only.

Permission check via `getClientPermission(client, "pipeline.write")`:
- `true` (default): drag-and-drop enabled, deal cards show an edit button for notes
- `false`: board rendered in read-only mode (no drag, no edit button)

Clients can only edit deal **notes** — not stage assignment via the edit form, not contact, not campaign. Stage changes happen only via drag-and-drop (when write is enabled).

---

## New Files

| File | Purpose |
|------|---------|
| `src/app/client-portal/layout.tsx` | Minimal portal shell with header |
| `src/app/client-portal/page.tsx` | Summary dashboard (KPIs + deals list) |
| `src/app/client-portal/pipeline/page.tsx` | Kanban board scoped to client |
| `src/app/api/clients/[id]/portal-invite/route.ts` | Send Clerk invitation |
| `src/lib/client-portal.ts` | `getClientPermission` helper + portal data fetchers |
| `src/components/client-portal/PortalHeader.tsx` | Minimal portal header component |
| `src/components/client-portal/PortalDealsList.tsx` | Compact deals list for dashboard |

---

## Modified Files

| File | Change |
|------|--------|
| `prisma/schema.prisma` | Add `clerkId`, `portalPermissions` to `Client` |
| `src/app/api/webhooks/clerk/route.ts` | Handle `user.created` → set `clerkId` on `Client` |
| `src/middleware.ts` | Route `client` role to `/client-portal/` |
| `src/components/clients/ClientDrawer.tsx` | Add "Send Portal Invite" / "Portal Active" UI |
| `src/components/clients/ClientsTable.tsx` | Add invite button column |
| `src/lib/auth.ts` | Add `portal:read`, `portal:write` permissions for `client` role if needed |

---

## Auth & Permissions

No new permission keys are needed for the portal itself — the `client` role already has `campaigns:read` and `pipeline:read`. The `portalPermissions` field on `Client` is checked **in addition to** the role-level permissions, not instead of them.

`pipeline:write` is **not** in the current `client` role permissions. Add it so that deal drag-and-drop and note editing can be gated properly via `hasPermission` + `getClientPermission`.

---

## Error & Loading States

- If a client arrives at the portal but their `clerkId` is not yet matched to a `Client` record (race condition or webhook delay), show a "Setting up your portal..." holding page that auto-refreshes every 5s.
- All data fetchers use the same skeleton + glass-panel loading pattern as the main app.

---

## Out of Scope (This Spec)

- Email integration (Gmail embed) — explicitly deferred
- Per-client permission UI in Settings — belongs to the Settings spec (Phase 6c)
- Multi-user portal access per client — future migration to `ClientPortalAccess` model
- PDF report export from the portal — future
