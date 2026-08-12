# Team Settings — All Members + Role Editing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show all team members (admin, manager, SDR) in Settings → Team with inline role editing gated by viewer role, role filter pills, and include admin/manager users in the campaign SDR assignment selector.

**Architecture:** Extract permission logic to a pure helper (`src/lib/team-permissions.ts`) tested with Vitest. Update the delegation API routes to handle all roles and accept role changes. Refactor `TeamDelegationPanel` to use filter pills, inline role selects, and optimistic updates. One-line change to the campaigns page SDR query.

**Tech Stack:** Next.js 14 App Router, Prisma, Zod, React (useState), Sonner toasts, Tailwind/glass-panel, Vitest

---

## File Map

| File | Action | What changes |
|------|--------|--------------|
| `src/lib/team-permissions.ts` | **Create** | Pure permission-check helpers |
| `src/lib/__tests__/team-permissions.test.ts` | **Create** | Vitest unit tests for helpers |
| `src/app/api/settings/delegation/route.ts` | **Modify** | Return all roles, include `role` + `managerId` fields |
| `src/app/api/settings/delegation/[userId]/route.ts` | **Modify** | Accept `role` in PATCH body, enforce permission rules |
| `src/app/(dashboard)/settings/team/page.tsx` | **Modify** | Fetch all roles, pass `role`/`managerId`/`viewerDbId` to panel |
| `src/components/settings/TeamDelegationPanel.tsx` | **Modify** | Filter pills, role select/badge, permission-gated toggles |
| `src/app/(dashboard)/campaigns/page.tsx` | **Modify** | Extend SDR fetch to include admin + manager roles |

---

## Task 1: Extract permission helpers to `src/lib/team-permissions.ts`

**Files:**
- Create: `src/lib/team-permissions.ts`

- [ ] **Step 1: Write the failing test first**

Create `src/lib/__tests__/team-permissions.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import {
  canEditUserRole,
  allowedRolesToAssign,
  canEditUserPermissions,
} from '../team-permissions'

describe('canEditUserRole', () => {
  it('admin can edit an admin', () =>
    expect(canEditUserRole('admin', 'admin')).toBe(true))
  it('admin can edit a manager', () =>
    expect(canEditUserRole('admin', 'manager')).toBe(true))
  it('admin can edit an sdr', () =>
    expect(canEditUserRole('admin', 'sdr')).toBe(true))
  it('manager can edit an sdr', () =>
    expect(canEditUserRole('manager', 'sdr')).toBe(true))
  it('manager cannot edit an admin', () =>
    expect(canEditUserRole('manager', 'admin')).toBe(false))
  it('manager cannot edit another manager', () =>
    expect(canEditUserRole('manager', 'manager')).toBe(false))
  it('sdr cannot edit anyone', () => {
    expect(canEditUserRole('sdr', 'sdr')).toBe(false)
    expect(canEditUserRole('sdr', 'admin')).toBe(false)
  })
})

describe('allowedRolesToAssign', () => {
  it('admin can assign any role', () => {
    const roles = allowedRolesToAssign('admin')
    expect(roles).toContain('admin')
    expect(roles).toContain('manager')
    expect(roles).toContain('sdr')
  })
  it('manager can assign sdr or manager but not admin', () => {
    const roles = allowedRolesToAssign('manager')
    expect(roles).toContain('sdr')
    expect(roles).toContain('manager')
    expect(roles).not.toContain('admin')
  })
  it('sdr cannot assign any role', () =>
    expect(allowedRolesToAssign('sdr')).toHaveLength(0))
})

describe('canEditUserPermissions', () => {
  it('admin can edit any sdr permissions regardless of managerId', () => {
    expect(canEditUserPermissions('admin', 'sdr', null,     'admin-id')).toBe(true)
    expect(canEditUserPermissions('admin', 'sdr', 'mgr-2',  'admin-id')).toBe(true)
  })
  it('admin cannot edit permissions of a non-sdr', () => {
    expect(canEditUserPermissions('admin', 'manager', null, 'admin-id')).toBe(false)
    expect(canEditUserPermissions('admin', 'admin',   null, 'admin-id')).toBe(false)
  })
  it('manager can edit permissions of their own sdr', () =>
    expect(canEditUserPermissions('manager', 'sdr', 'mgr-1', 'mgr-1')).toBe(true))
  it('manager cannot edit permissions of sdr under a different manager', () =>
    expect(canEditUserPermissions('manager', 'sdr', 'mgr-2', 'mgr-1')).toBe(false))
  it('manager cannot edit permissions of sdr with no manager', () =>
    expect(canEditUserPermissions('manager', 'sdr', null, 'mgr-1')).toBe(false))
  it('sdr cannot edit anyone permissions', () =>
    expect(canEditUserPermissions('sdr', 'sdr', null, 'sdr-id')).toBe(false))
})
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
npx vitest run src/lib/__tests__/team-permissions.test.ts
```

Expected: fail with "Cannot find module '../team-permissions'"

- [ ] **Step 3: Create `src/lib/team-permissions.ts`**

```typescript
export type UserRole = 'admin' | 'manager' | 'sdr' | 'client'

export function canEditUserRole(
  viewerRole: UserRole,
  targetCurrentRole: UserRole,
): boolean {
  if (viewerRole === 'admin') return true
  if (viewerRole === 'manager') return targetCurrentRole === 'sdr'
  return false
}

export function allowedRolesToAssign(viewerRole: UserRole): UserRole[] {
  if (viewerRole === 'admin')   return ['admin', 'manager', 'sdr']
  if (viewerRole === 'manager') return ['manager', 'sdr']
  return []
}

// targetManagerId: the managerId field stored on the target User row
// viewerDbId: the DB primary key (not clerkId) of the viewer
export function canEditUserPermissions(
  viewerRole:       UserRole,
  targetCurrentRole: UserRole,
  targetManagerId:  string | null,
  viewerDbId:       string,
): boolean {
  if (targetCurrentRole !== 'sdr') return false
  if (viewerRole === 'admin')       return true
  if (viewerRole === 'manager')     return targetManagerId === viewerDbId
  return false
}
```

- [ ] **Step 4: Run the test to confirm it passes**

```bash
npx vitest run src/lib/__tests__/team-permissions.test.ts
```

Expected: all tests pass

- [ ] **Step 5: Commit**

```bash
git add src/lib/team-permissions.ts src/lib/__tests__/team-permissions.test.ts
git commit -m "Add team-permissions helpers with Vitest coverage"
```

---

## Task 2: Update `GET /api/settings/delegation` to return all roles

**Files:**
- Modify: `src/app/api/settings/delegation/route.ts`

- [ ] **Step 1: Replace the route file content**

Replace the entire file with:

```typescript
import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db, withTenant } from '@/lib/db'
import { getClerkMeta } from '@/lib/auth'

export async function GET() {
  try {
    const { userId: clerkId } = await auth()
    if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { role, tenantId } = await getClerkMeta()
    if ((role !== 'admin' && role !== 'manager') || !tenantId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const members = await withTenant(tenantId, () =>
      db.user.findMany({
        where: {
          deletedAt: null,
          role: { in: ['admin', 'manager', 'sdr'] },
        },
        select: {
          id:        true,
          name:      true,
          email:     true,
          role:      true,
          managerId: true,
          sdrPermissions: {
            select: {
              canManageCampaigns: true,
              canAccessDashboard: true,
              canWritePipeline:   true,
            },
            take: 1,
          },
        },
        orderBy: [{ role: 'asc' }, { name: 'asc' }],
      })
    )

    const normalized = members.map(m => ({
      id:            m.id,
      name:          m.name,
      email:         m.email,
      role:          m.role,
      managerId:     m.managerId,
      sdrPermission: m.sdrPermissions[0] ?? null,
    }))

    return NextResponse.json({ data: normalized })
  } catch (e) {
    if (process.env.NODE_ENV !== 'production') console.error('[settings/delegation GET]', e)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/app/api/settings/delegation/route.ts
git commit -m "Return all team members (not just SDRs) from delegation GET"
```

---

## Task 3: Update `PATCH /api/settings/delegation/[userId]` to accept role changes

**Files:**
- Modify: `src/app/api/settings/delegation/[userId]/route.ts`

- [ ] **Step 1: Replace the route file content**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { db, withTenant } from '@/lib/db'
import { getClerkMeta } from '@/lib/auth'
import {
  canEditUserRole,
  allowedRolesToAssign,
  canEditUserPermissions,
} from '@/lib/team-permissions'
import type { UserRole } from '@/lib/team-permissions'

const PatchSchema = z.object({
  canManageCampaigns: z.boolean().optional(),
  canAccessDashboard: z.boolean().optional(),
  canWritePipeline:   z.boolean().optional(),
  role:               z.enum(['admin', 'manager', 'sdr']).optional(),
})

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const { userId: clerkId } = await auth()
    if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { role, tenantId } = await getClerkMeta()
    if ((role !== 'admin' && role !== 'manager') || !tenantId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { userId: targetUserId } = await params

    const body   = await req.json()
    const parsed = PatchSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid body', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const callerDbUser = await withTenant(tenantId, () =>
      db.user.findFirst({ where: { clerkId }, select: { id: true } })
    )
    if (!callerDbUser) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    const targetUser = await withTenant(tenantId, () =>
      db.user.findFirst({
        where:  { id: targetUserId, deletedAt: null },
        select: { id: true, role: true, managerId: true },
      })
    )
    if (!targetUser) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    const { role: newRole, ...permissionData } = parsed.data
    const hasPermissionChanges = Object.keys(permissionData).length > 0

    if (newRole !== undefined) {
      if (!canEditUserRole(role as UserRole, targetUser.role as UserRole)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
      const allowed = allowedRolesToAssign(role as UserRole)
      if (!allowed.includes(newRole)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
      await withTenant(tenantId, () =>
        db.user.update({ where: { id: targetUserId }, data: { role: newRole } })
      )
    }

    if (hasPermissionChanges) {
      const effectiveRole = (newRole ?? targetUser.role) as UserRole
      if (
        !canEditUserPermissions(
          role as UserRole,
          effectiveRole,
          targetUser.managerId,
          callerDbUser.id,
        )
      ) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
      await db.sdrPermission.upsert({
        where:  { tenantId_userId: { tenantId, userId: targetUserId } },
        create: { tenantId, userId: targetUserId, ...permissionData },
        update: permissionData,
      })
    }

    return NextResponse.json({ data: { ok: true } })
  } catch (e) {
    if (process.env.NODE_ENV !== 'production') console.error('[settings/delegation PATCH]', e)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/app/api/settings/delegation/[userId]/route.ts
git commit -m "Support role changes in delegation PATCH with permission enforcement"
```

---

## Task 4: Update `settings/team/page.tsx` to fetch all roles

**Files:**
- Modify: `src/app/(dashboard)/settings/team/page.tsx`

- [ ] **Step 1: Replace the page file content**

```typescript
import { redirect } from 'next/navigation'
import { currentUser } from '@clerk/nextjs/server'
import { db, withTenant } from '@/lib/db'
import { getCurrentUserRole, getCurrentTenantId } from '@/lib/auth'
import { TeamDelegationPanel } from '@/components/settings/TeamDelegationPanel'

type SdrPermission = {
  canManageCampaigns: boolean
  canAccessDashboard: boolean
  canWritePipeline:   boolean
}

export type MemberRow = {
  id:            string
  name:          string
  email:         string
  role:          'admin' | 'manager' | 'sdr'
  managerId:     string | null
  sdrPermission: SdrPermission | null
}

export default async function TeamSettingsPage() {
  const tenantId = await getCurrentTenantId()
  if (!tenantId) redirect('/sign-in')

  const role = await getCurrentUserRole()
  if (role !== 'admin' && role !== 'manager') redirect('/settings/account')

  const clerkUser = await currentUser()
  if (!clerkUser) redirect('/sign-in')

  const callerDbUser = await withTenant(tenantId, () =>
    db.user.findFirst({ where: { clerkId: clerkUser.id }, select: { id: true } })
  )
  if (!callerDbUser) redirect('/sign-in')

  const rawMembers = await withTenant(tenantId, () =>
    db.user.findMany({
      where: {
        deletedAt: null,
        role: { in: ['admin', 'manager', 'sdr'] },
      },
      select: {
        id:        true,
        name:      true,
        email:     true,
        role:      true,
        managerId: true,
        sdrPermissions: {
          select: {
            canManageCampaigns: true,
            canAccessDashboard: true,
            canWritePipeline:   true,
          },
          take: 1,
        },
      },
      orderBy: [{ role: 'asc' }, { name: 'asc' }],
    })
  )

  const members: MemberRow[] = rawMembers.map(m => ({
    id:            m.id,
    name:          m.name,
    email:         m.email,
    role:          m.role as 'admin' | 'manager' | 'sdr',
    managerId:     m.managerId,
    sdrPermission: m.sdrPermissions[0] ?? null,
  }))

  return (
    <TeamDelegationPanel
      initialMembers={members}
      viewerRole={role as 'admin' | 'manager'}
      viewerDbId={callerDbUser.id}
    />
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: error about `TeamDelegationPanel` props mismatch — this is expected; it will be fixed in Task 5.

- [ ] **Step 3: Move on to Task 5 — do not commit yet**

---

## Task 5: Refactor `TeamDelegationPanel` with filter pills, role select, and permission-gated controls

**Files:**
- Modify: `src/components/settings/TeamDelegationPanel.tsx`

- [ ] **Step 1: Replace the entire component**

```typescript
'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import {
  canEditUserRole,
  allowedRolesToAssign,
  canEditUserPermissions,
} from '@/lib/team-permissions'
import type { UserRole } from '@/lib/team-permissions'

type SdrPermission = {
  canManageCampaigns: boolean
  canAccessDashboard: boolean
  canWritePipeline:   boolean
}

type MemberRow = {
  id:            string
  name:          string
  email:         string
  role:          UserRole
  managerId:     string | null
  sdrPermission: SdrPermission | null
}

interface TeamDelegationPanelProps {
  initialMembers: MemberRow[]
  viewerRole:     'admin' | 'manager'
  viewerDbId:     string
}

type PermKey = keyof SdrPermission
type FilterRole = 'all' | 'admin' | 'manager' | 'sdr'

const ROLE_ORDER: Record<string, number> = { admin: 0, manager: 1, sdr: 2 }

const ROLE_LABELS: Record<string, string> = {
  admin:   'Admin',
  manager: 'Manager',
  sdr:     'SDR',
}

const TOGGLES: { key: PermKey; label: string; description: string }[] = [
  {
    key:         'canManageCampaigns',
    label:       'Campaign management',
    description: 'Can create and edit campaigns',
  },
  {
    key:         'canAccessDashboard',
    label:       'Dashboard access',
    description: 'Can view the main dashboard',
  },
  {
    key:         'canWritePipeline',
    label:       'Pipeline write',
    description: 'Can move deals between stages',
  },
]

const FILTER_PILLS: { label: string; value: FilterRole }[] = [
  { label: 'All',     value: 'all' },
  { label: 'Admin',   value: 'admin' },
  { label: 'Manager', value: 'manager' },
  { label: 'SDR',     value: 'sdr' },
]

function getPermValue(perm: SdrPermission | null, key: PermKey): boolean {
  if (!perm) return key === 'canAccessDashboard'
  return perm[key]
}

export function TeamDelegationPanel({
  initialMembers,
  viewerRole,
  viewerDbId,
}: TeamDelegationPanelProps) {
  const [members, setMembers]         = useState(initialMembers)
  const [saving, setSaving]           = useState<string | null>(null)
  const [filterRole, setFilterRole]   = useState<FilterRole>('all')
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole]   = useState<'sdr' | 'manager'>('sdr')
  const [inviting, setInviting]       = useState(false)

  const sorted = [...members].sort((a, b) => {
    const roleDiff = (ROLE_ORDER[a.role] ?? 99) - (ROLE_ORDER[b.role] ?? 99)
    return roleDiff !== 0 ? roleDiff : a.name.localeCompare(b.name)
  })

  const filtered =
    filterRole === 'all' ? sorted : sorted.filter(m => m.role === filterRole)

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!inviteEmail.trim()) return
    setInviting(true)
    try {
      const res = await fetch('/api/settings/invitation', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email: inviteEmail.trim(), role: inviteRole }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        toast.error((body as { error?: string }).error ?? 'Failed to send invite')
        return
      }
      toast.success(`Invite sent to ${inviteEmail.trim()}`)
      setInviteEmail('')
    } finally {
      setInviting(false)
    }
  }

  const handleRoleChange = async (userId: string, newRole: UserRole) => {
    const prev = members.find(m => m.id === userId)
    if (!prev) return
    setSaving(`${userId}-role`)
    setMembers(ms => ms.map(m => m.id === userId ? { ...m, role: newRole } : m))
    try {
      const res = await fetch(`/api/settings/delegation/${userId}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ role: newRole }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        toast.error((body as { error?: string }).error ?? 'Failed to update role')
        setMembers(ms => ms.map(m => m.id === userId ? prev : m))
        return
      }
      toast.success('Role updated')
    } finally {
      setSaving(null)
    }
  }

  const handleToggle = async (userId: string, key: PermKey, value: boolean) => {
    setSaving(`${userId}-${key}`)
    try {
      const res = await fetch(`/api/settings/delegation/${userId}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ [key]: value }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        toast.error((body as { error?: string }).error ?? 'Failed to save')
        return
      }
      setMembers(prev =>
        prev.map(m =>
          m.id === userId
            ? {
                ...m,
                sdrPermission: {
                  canManageCampaigns: getPermValue(m.sdrPermission, 'canManageCampaigns'),
                  canAccessDashboard: getPermValue(m.sdrPermission, 'canAccessDashboard'),
                  canWritePipeline:   getPermValue(m.sdrPermission, 'canWritePipeline'),
                  [key]: value,
                },
              }
            : m
        )
      )
      toast.success('Saved')
    } finally {
      setSaving(null)
    }
  }

  const inviteForm = (
    <form onSubmit={handleInvite} className="glass-panel rounded-2xl p-5">
      <p className="text-xs font-semibold uppercase tracking-wider text-gray-600 mb-3">
        Invite team member
      </p>
      <div className="flex gap-2">
        <input
          type="email"
          required
          placeholder="colleague@company.com"
          value={inviteEmail}
          onChange={e => setInviteEmail(e.target.value)}
          className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-accent/50"
        />
        {viewerRole === 'admin' && (
          <select
            value={inviteRole}
            onChange={e => setInviteRole(e.target.value as 'sdr' | 'manager')}
            className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-accent/50"
          >
            <option value="sdr">SDR</option>
            <option value="manager">Manager</option>
          </select>
        )}
        <Button
          type="submit"
          size="sm"
          disabled={inviting || !inviteEmail.trim()}
          className="bg-accent/10 border border-accent/20 text-accent hover:bg-accent/20 rounded-xl text-xs disabled:opacity-40"
        >
          {inviting ? 'Sending…' : 'Send Invite'}
        </Button>
      </div>
    </form>
  )

  return (
    <div className="space-y-4 max-w-2xl">
      {inviteForm}

      <div className="flex gap-2 flex-wrap">
        {FILTER_PILLS.map(pill => (
          <button
            key={pill.value}
            onClick={() => setFilterRole(pill.value)}
            className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
              filterRole === pill.value
                ? 'bg-accent/20 text-accent border border-accent/30'
                : 'bg-white/5 text-gray-400 border border-white/10 hover:bg-white/10'
            }`}
          >
            {pill.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="glass-panel rounded-2xl p-8 text-center">
          <p className="text-gray-500 text-sm">No team members found.</p>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-gray-500">
            {viewerRole === 'admin'
              ? 'Edit any role inline. SDR permission toggles save automatically.'
              : 'Edit SDR roles inline. SDR permission toggles save automatically.'}
          </p>
          {filtered.map(member => {
            const canEditRole  = canEditUserRole(viewerRole, member.role)
            const roleOptions  = allowedRolesToAssign(viewerRole)
            const canEditPerms = canEditUserPermissions(
              viewerRole,
              member.role,
              member.managerId,
              viewerDbId,
            )
            return (
              <div key={member.id} className="glass-panel rounded-2xl p-5">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-8 h-8 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-xs font-semibold text-gray-300">
                    {member.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white">{member.name}</p>
                    <p className="text-xs text-gray-500">{member.email}</p>
                  </div>
                  {canEditRole ? (
                    <select
                      value={member.role}
                      disabled={saving === `${member.id}-role`}
                      onChange={e => handleRoleChange(member.id, e.target.value as UserRole)}
                      className="bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-xs text-white focus:outline-none focus:border-accent/50 disabled:opacity-40 cursor-pointer"
                    >
                      {roleOptions.map(r => (
                        <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                      ))}
                      {!roleOptions.includes(member.role) && (
                        <option value={member.role}>{ROLE_LABELS[member.role]}</option>
                      )}
                    </select>
                  ) : (
                    <span className="px-2 py-1 rounded-lg text-xs font-medium bg-white/5 border border-white/10 text-gray-400">
                      {ROLE_LABELS[member.role]}
                    </span>
                  )}
                </div>
                {member.role === 'sdr' && (
                  <div className="space-y-3 pt-1 border-t border-white/5">
                    {TOGGLES.map(({ key, label, description }) => {
                      const savingKey = `${member.id}-${key}`
                      const checked   = getPermValue(member.sdrPermission, key)
                      return (
                        <div key={key} className="flex items-center justify-between gap-4 pt-3">
                          <div>
                            <Label className="text-sm text-gray-300">{label}</Label>
                            <p className="text-[11px] text-gray-600">{description}</p>
                          </div>
                          <Switch
                            checked={checked}
                            disabled={!canEditPerms || saving === savingKey}
                            onCheckedChange={val => handleToggle(member.id, key, val)}
                            className="data-[checked]:bg-accent"
                          />
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 3: Commit Tasks 4 and 5 together**

```bash
git add src/app/(dashboard)/settings/team/page.tsx src/components/settings/TeamDelegationPanel.tsx
git commit -m "Show all team members in settings with filter pills and inline role editing"
```

---

## Task 6: Extend campaign SDR selector to include admin and manager roles

**Files:**
- Modify: `src/app/(dashboard)/campaigns/page.tsx` (line 43)

- [ ] **Step 1: Update the SDR fetch query**

In `src/app/(dashboard)/campaigns/page.tsx`, find the SDR fetch inside `getPageData`. Change:

```typescript
      hasPermission(role, 'sdrs:manage')
        ? db.user.findMany({
            where: { role: 'sdr', tenantId },
            select: { id: true, name: true, email: true, role: true },
            orderBy: { name: 'asc' },
          })
        : Promise.resolve([]),
```

To:

```typescript
      hasPermission(role, 'sdrs:manage')
        ? db.user.findMany({
            where: { role: { in: ['sdr', 'manager', 'admin'] }, tenantId },
            select: { id: true, name: true, email: true, role: true },
            orderBy: { name: 'asc' },
          })
        : Promise.resolve([]),
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 3: Run the full test suite**

```bash
npx vitest run
```

Expected: all tests pass (including the new team-permissions tests from Task 1)

- [ ] **Step 4: Commit**

```bash
git add src/app/(dashboard)/campaigns/page.tsx
git commit -m "Include admin and manager roles in campaign SDR assignment selector"
```

---

## Manual Verification Checklist

After all tasks are committed, test the following in the browser (run `npm run dev`):

**Settings → Team tab (as Admin):**
- [ ] All users appear (admin, manager, SDR rows visible)
- [ ] Filter pills work: clicking "SDR" shows only SDR-role cards; "All" shows everyone
- [ ] Admin-role cards show a role `<select>` dropdown with options Admin / Manager / SDR
- [ ] Manager-role cards show a role `<select>` dropdown
- [ ] SDR-role cards show a role `<select>` dropdown
- [ ] Changing a role updates the card instantly (optimistic) and shows "Role updated" toast
- [ ] SDR cards show the three permission toggles; non-SDR cards do not
- [ ] Toggling an SDR permission shows "Saved" toast

**Settings → Team tab (as Manager):**
- [ ] All users appear
- [ ] Admin and Manager-role cards show a static role badge (no dropdown)
- [ ] SDR-role cards show a role `<select>` with options SDR / Manager only (no Admin)
- [ ] SDR permission toggles are interactive only for SDRs where managerId matches the viewer

**Campaigns → Create / Edit campaign:**
- [ ] Admin and Manager users appear in the SDR assignment selector alongside SDR users
