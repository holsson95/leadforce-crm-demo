# Team Settings — All Members + Role Editing Design

**Date:** 2026-05-18
**Status:** Approved

---

## Problem

The Settings → Team tab currently fetches only users with `role: 'sdr'`, so admins and managers are invisible. There is no role-editing UI. The campaign SDR selector also filters `role: 'sdr'`, preventing admins and managers from being assigned as callers on campaigns.

---

## Goals

1. Show all team members (admin, manager, sdr) in the Team tab
2. Allow inline role editing gated by viewer role
3. Allow filtering and sorting the member list by role
4. Allow admins and managers to appear in the campaign SDR assignment selector

---

## Section 1: Team Tab UI

### Layout

- **Role filter pills** at the top: `All | Admin | Manager | SDR` — client-side only, no refetch
- **Default view:** All users, sorted by role order (admin → manager → sdr) then name A–Z within each group
- Each user renders as a **glass-panel card** (same style as existing SDR cards)

### Card anatomy

```
[ Avatar ]  Name                          [ role select / badge ]
            email@company.com
            ─────────────────────────────────────────────────────
            [permission toggles — SDR-role users only]
```

- **Role control (right side of header):**
  - Viewer *can* edit this user → inline `<select>` with allowed role options, saves on change
  - Viewer *cannot* edit → static role badge pill
- **Permission toggles** (canManageCampaigns, canAccessDashboard, canWritePipeline): only rendered when `card.role === 'sdr'`; only interactive if the viewer can edit that user

### Edit permission matrix

| Viewer | Can edit Admins | Can edit Managers | Can edit SDRs |
|--------|----------------|-------------------|---------------|
| Admin  | Yes — any role  | Yes — any role    | Yes — any role |
| Manager | No            | No                | Yes — sdr or manager only (cannot assign admin) |
| SDR    | No             | No                | No |

---

## Section 2: API Changes

### `GET /api/settings/delegation`

- Remove `role: 'sdr'` filter — return all non-deleted tenant users
- Remove managerId scoping — all roles (admin, manager, SDR) see all team members
- Add `role` to selected fields
- Response shape per user: `{ id, name, email, role, sdrPermission: { ... } | null }`

### `PATCH /api/settings/delegation/[userId]`

- Accept optional `role` field alongside existing permission toggles
- **Server enforcement for role changes:**
  - Admin: can update `role` to any value for any tenant user
  - Manager: can only update users currently `role: 'sdr'`; can only assign `sdr` or `manager` (cannot assign `admin`)
- **Server enforcement for permission toggle changes (existing behaviour):**
  - Admin: can toggle permissions for any SDR
  - Manager: can only toggle permissions for SDRs where `managerId = dbUser.id`
  - Toggle updates only applied when target user has `role: 'sdr'`
- Role change writes to `User.role` in Prisma

---

## Section 3: Campaign SDR Selector

- In `src/app/(dashboard)/campaigns/page.tsx`, change the SDR fetch query:
  - **Before:** `where: { role: 'sdr', tenantId }`
  - **After:** `where: { role: { in: ['sdr', 'manager', 'admin'] }, tenantId }`
- No changes to `SDRSelector.tsx` — already generic
- Empty-state message unchanged

---

## Section 4: Client-Side State

### Component rename

`TeamDelegationPanel` props rename: `initialSdrs` → `initialMembers`, type `SdrRow` → `MemberRow` (adds `role` field).

### Role change flow

1. User changes inline `<select>` → optimistic local state update
2. `PATCH /api/settings/delegation/[userId]` fires with `{ role: newRole }`
3. Success: toast "Role updated"
4. Failure: revert local state + toast error
5. If changed user was `sdr` and role changed away → permission toggles collapse immediately from optimistic state

### Filter/sort

- Filter pills and sort operate on local React state — recompute on every role change
- A user promoted from SDR to Manager disappears from the SDR filter without a page reload

---

## Files Affected

| File | Change |
|------|--------|
| `src/app/(dashboard)/settings/team/page.tsx` | Fetch all roles; pass `role` in member data |
| `src/components/settings/TeamDelegationPanel.tsx` | Add filter pills, sort, role select/badge, permission-gate edits |
| `src/app/api/settings/delegation/route.ts` | Remove `role: 'sdr'` filter; add `role` to select |
| `src/app/api/settings/delegation/[userId]/route.ts` | Accept + enforce `role` field in PATCH |
| `src/app/(dashboard)/campaigns/page.tsx` | Extend SDR fetch to include admin and manager roles |
