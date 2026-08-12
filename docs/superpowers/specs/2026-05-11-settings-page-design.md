# Settings Page Design

**Date:** 2026-05-11
**Phase:** 6 (Polish & Client Portal)
**Status:** Approved — ready for implementation planning

---

## Overview

A settings page at `/settings` using nested routes (Next.js App Router). A shared layout renders a left nav sidebar; each section is its own server component route. Role gating is enforced at both the layout level (nav visibility) and the individual route level (direct URL access).

---

## Role Access Matrix

| Section | Admin | Manager | SDR |
|---|---|---|---|
| Company | ✓ | — | — |
| Dialer | ✓ | — | — |
| Team | ✓ | ✓ (their reports only) | — |
| Portal | ✓ | ✓ (invite only; no permission config) | — |
| Account | ✓ | ✓ | ✓ |

`settings/page.tsx` redirects to the first accessible section: `/settings/company` for admin, `/settings/team` for manager, `/settings/account` for SDR.

---

## Route & File Structure

```
src/app/(dashboard)/settings/
├── layout.tsx              ← settings shell: left nav + content area; role-gates nav items
├── page.tsx                ← redirect to first accessible section
├── company/page.tsx        ← admin only
├── dialer/page.tsx         ← admin only
├── team/page.tsx           ← admin + manager
├── portal/page.tsx         ← admin + manager
└── account/page.tsx        ← all roles

src/components/settings/
├── SettingsNav.tsx          ← client component (active link state)
├── CompanyForm.tsx
├── DialerThresholdsForm.tsx
├── TeamDelegationPanel.tsx
├── PortalPermissionsPanel.tsx
└── AccountForm.tsx

src/app/api/settings/
├── company/route.ts                  ← GET + PATCH (admin)
├── company/logo/route.ts             ← POST multipart upload to R2 (admin)
├── dialer/route.ts                   ← GET + PATCH (admin)
├── delegation/route.ts               ← GET (admin + manager)
├── delegation/[userId]/route.ts      ← PATCH (admin + manager)
└── account/route.ts                  ← GET + PATCH (all roles)
                                         (portal section reuses /api/clients/ routes — no new routes)
```

---

## Database Changes

### New model: `TenantSettings`

One row per tenant. Stores company branding and dialer thresholds.

```prisma
model TenantSettings {
  id                        String   @id @default(cuid())
  tenantId                  String   @unique
  logoUrl                   String?
  timezone                  String   @default("UTC")
  dialUnresponsiveLimit     Int      @default(8)
  dialFutureReentryDays     Int      @default(90)
  dialFutureReattempts      Int      @default(3)
  notInterestedCooldownDays Int      @default(7)
  createdAt                 DateTime @default(now())
  updatedAt                 DateTime @updatedAt
  tenant                    Tenant   @relation(fields: [tenantId], references: [id])
}
```

`companyName` is not duplicated here — it reads/writes directly to `Tenant.name`.

### New model: `SdrPermission`

One row per `(tenantId, userId)` pair. Stores delegated permission overrides for SDRs. Additive on top of the SDR base role.

```prisma
model SdrPermission {
  id                  String   @id @default(cuid())
  tenantId            String
  userId              String
  canManageCampaigns  Boolean  @default(false)
  canAccessDashboard  Boolean  @default(true)
  canWritePipeline    Boolean  @default(false)
  createdAt           DateTime @default(now())
  updatedAt           DateTime @updatedAt
  tenant              Tenant   @relation(fields: [tenantId], references: [id])
  user                User     @relation(fields: [userId], references: [id])

  @@unique([tenantId, userId])
}
```

### New column: `User.timezone`

```prisma
timezone  String?   // null = inherit from TenantSettings.timezone
```

### Tenant model additions

Add the `TenantSettings` relation and `SdrPermission` relation to the `Tenant` model, and `SdrPermission` relation to the `User` model.

---

## Section: Company (admin only)

**Fields:**
- Company name — reads/writes `Tenant.name`
- Logo — file upload to Cloudflare R2; stored as `TenantSettings.logoUrl`. Displayed in the sidebar header in place of the cyan square when set.
- Timezone — IANA timezone string dropdown; stored as `TenantSettings.timezone`

**API:**
- `GET /api/settings/company` — returns merged `Tenant.name` + `TenantSettings` fields. Upserts `TenantSettings` row if it doesn't exist yet.
- `PATCH /api/settings/company` — upserts `TenantSettings` and updates `Tenant.name` in a single transaction. Validates with Zod.

**Logo upload flow:** Client sends a `multipart/form-data` POST to a separate `POST /api/settings/company/logo` route that uploads to R2 and returns the URL. The main PATCH then stores the URL.

---

## Section: Dialer Thresholds (admin only)

Configures the tenant-wide defaults for contact routing logic. The existing `outcome-router.ts` has these hardcoded — after implementation it will read from `TenantSettings` instead.

**Fields (all positive integers):**
- Unanswered dial limit before Future list — `dialUnresponsiveLimit` (min 1, default 8)
- Days before Future contact re-enters prospect queue — `dialFutureReentryDays` (min 30, default 90)
- Max re-dial attempts after re-entry — `dialFutureReattempts` (min 1, default 3)
- Not Interested cooldown days — `notInterestedCooldownDays` (min 1, default 7)

Each field has a plain-English description below it explaining the business effect.

A note at the bottom reads: *"Individual campaigns can override these defaults in their campaign settings."* No per-campaign override UI is built in this phase.

**API:**
- `GET /api/settings/dialer` — reads `TenantSettings` (upserts with defaults if not set)
- `PATCH /api/settings/dialer` — validates all values with Zod, upserts `TenantSettings`

---

## Section: Team / Delegation (admin + manager)

**Who is shown:**
- Admin: all SDRs in the tenant
- Manager: only SDRs where `User.managerId` = current user's DB id

**Per-SDR row:** name, email, avatar initial, three toggle switches.

**Delegable permissions:**

| Toggle | DB column | Effect |
|---|---|---|
| Campaign management | `canManageCampaigns` | Grants `campaigns:write` |
| Dashboard access | `canAccessDashboard` | Grants access to dashboard page |
| Pipeline write | `canWritePipeline` | Upgrades `pipeline:read` → `pipeline:write` |

Toggles save immediately on change (no submit button) via `PATCH /api/settings/delegation/[userId]`. A brief inline "Saved" confirmation appears per row.

**Auth helper change:** `hasPermission()` in `src/lib/auth.ts` will be extended to accept an optional `SdrPermission` object. When present and the user is an SDR, it checks the override columns before falling back to base role permissions.

**Manager scope enforcement:** The PATCH handler checks that the target user's `managerId` matches the caller's DB id (or caller is admin). Returns 403 otherwise.

**API:**
- `GET /api/settings/delegation` — returns SDRs with their `SdrPermission` rows (manager-scoped)
- `PATCH /api/settings/delegation/[userId]` — upserts `SdrPermission` row; enforces manager scope

---

## Section: Client Portal (admin + manager)

A table of all clients in the tenant.

**Per-client row:** client name, contact name, email, portal status badge.

**Status badges:**
- `Active` (green) — client has a `clerkId`
- `Not Invited` (gray) — no `clerkId`, has email
- `No Email` (amber) — no email address

**Actions:**
- Not invited + has email: "Send Invite" button → `POST /api/clients/[id]/portal-invite` (existing)
- Active: "Active" badge + "Resend" button → same endpoint with `?resend=true` param (skips the 409 check, re-sends Clerk invitation)
- No email: disabled state with *"Add email first"* hint that opens `ClientDrawer`

**Permission toggles (admin only, shown beneath active client rows as an expandable):**

| Toggle | `portalPermissions` key | Default |
|---|---|---|
| View pipeline | `viewPipeline` | true |
| Move deals | `movePipeline` | false |
| View reports | `viewReports` | true |

Writes to `Client.portalPermissions` JSON via existing `PATCH /api/clients/[id]`.

**No new API routes** for this section — reuses:
- `GET /api/clients` — existing
- `POST /api/clients/[id]/portal-invite` — existing (+ `?resend=true` support added)
- `PATCH /api/clients/[id]` — existing

---

## Section: Account (all roles)

**Profile sub-section:**
- Display name — reads/writes `User.name`
- Timezone — personal IANA timezone override; stored as `User.timezone`. Falls back to `TenantSettings.timezone` when null.

**Notifications sub-section:**
- Placeholder toggles for email notifications and in-app notifications
- Rendered with a subtle "Coming soon" badge
- No API wiring — reserves space for the future notification system

**Account security sub-section:**
- "Manage password & security" button — links to Clerk's hosted account management. Clerk owns credential management; no custom form here.

**API:**
- `GET /api/settings/account` — returns current user's `name` and `timezone`
- `PATCH /api/settings/account` — updates `User.name` and `User.timezone`; Zod validates name is non-empty string, timezone is valid IANA string or null

---

## Styling

Follows the LeadForce style guide throughout:
- Settings layout: left nav `w-56`, `glass-panel` card on active nav item, content area fills remaining width
- Section forms: `glass-panel` containers, `bg-white/5` inputs, `rounded-xl` borders
- Toggle switches: use Shadcn/UI `Switch` component styled with accent color `#00d4ff`
- Section headings: `text-xs font-semibold uppercase tracking-wider text-gray-500`

---

## Out of Scope (this phase)

- Per-campaign dialer threshold overrides — UI deferred; API designed to support it later
- Multi-user portal access per client — future `ClientPortalAccess` model migration
- Notification system wiring in Account section — placeholder UI only
- Billing / subscription settings
