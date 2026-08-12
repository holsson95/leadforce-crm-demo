# Settings Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a role-gated settings page at `/settings` with five sections — Company, Dialer Thresholds, Team Delegation, Client Portal, and Account — accessible to different roles.

**Architecture:** Nested Next.js App Router routes under `(dashboard)/settings/` share a layout with a left nav; each section is an isolated server component that fetches its own data. Client forms use react-hook-form + Zod. Role gating is enforced at both layout and individual route level. Two new Prisma models (`TenantSettings`, `SdrPermission`) store configuration; `User.timezone` gets a new nullable column.

**Tech Stack:** Next.js 14 App Router, Prisma, Clerk, Zod, react-hook-form, Shadcn/UI (Switch added), Tailwind CSS, Vitest

---

## File Map

**New files:**
- `prisma/schema.prisma` — add `TenantSettings`, `SdrPermission`, `User.timezone`
- `src/components/ui/switch.tsx` — Shadcn Switch component
- `src/app/(dashboard)/settings/layout.tsx` — settings shell with left nav
- `src/app/(dashboard)/settings/page.tsx` — redirect to first accessible section
- `src/app/(dashboard)/settings/company/page.tsx` — admin only
- `src/app/(dashboard)/settings/dialer/page.tsx` — admin only
- `src/app/(dashboard)/settings/team/page.tsx` — admin + manager
- `src/app/(dashboard)/settings/portal/page.tsx` — admin + manager
- `src/app/(dashboard)/settings/account/page.tsx` — all roles
- `src/components/settings/SettingsNav.tsx` — left nav (client component)
- `src/components/settings/CompanyForm.tsx` — company name + timezone form
- `src/components/settings/DialerThresholdsForm.tsx` — threshold numeric inputs
- `src/components/settings/TeamDelegationPanel.tsx` — SDR toggle rows
- `src/components/settings/PortalPermissionsPanel.tsx` — client invite + permission toggles
- `src/components/settings/AccountForm.tsx` — display name + timezone form
- `src/app/api/settings/company/route.ts` — GET + PATCH
- `src/app/api/settings/dialer/route.ts` — GET + PATCH
- `src/app/api/settings/delegation/route.ts` — GET
- `src/app/api/settings/delegation/[userId]/route.ts` — PATCH
- `src/app/api/settings/account/route.ts` — GET + PATCH

**Modified files:**
- `prisma/schema.prisma` — existing models get new relations
- `src/lib/auth.ts` — add `SdrPermissionOverrides` type + optional overrides param to `hasPermission`
- `src/lib/__tests__/auth.test.ts` — add override tests
- `src/lib/outcome-router.ts` — accept `DialerThresholds` param instead of hardcoded values
- `src/lib/__tests__/outcome-router.test.ts` — update threshold tests to pass explicit thresholds
- `src/app/api/dialer/log-outcome/route.ts` — fetch `TenantSettings` and pass thresholds to `routeOutcome`
- `src/app/api/clients/[id]/portal-invite/route.ts` — support `?resend=true` query param
- `src/components/layout/Sidebar.tsx` — show logo from `TenantSettings` if set

---

## Task 1: Schema changes + migration

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add new models and field to schema**

Open `prisma/schema.prisma` and make the following additions.

Add after the last model:

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
  @@index([tenantId])
}
```

Add `timezone String?` to the `User` model (after `managerId`):

```prisma
  managerId String?
  timezone  String?
```

Add relations to the `Tenant` model (after the existing `tasks` relation):

```prisma
  tasks          Task[]
  tenantSettings TenantSettings?
  sdrPermissions SdrPermission[]
```

Add relation to the `User` model (after the existing `tasks` relation):

```prisma
  tasks         Task[]
  sdrPermission SdrPermission?
```

- [ ] **Step 2: Run migration**

```bash
cd /Users/hannaholsson/LeadforceCRM && npx prisma migrate dev --name add-tenant-settings-sdr-permission-user-timezone
```

Expected: migration created and applied, Prisma client regenerated. You should see "Your database is now in sync with your schema."

- [ ] **Step 3: Verify types are available**

```bash
cd /Users/hannaholsson/LeadforceCRM && npx prisma generate
```

Expected: no errors, "Generated Prisma Client" message.

- [ ] **Step 4: Commit**

```bash
git -C /Users/hannaholsson/LeadforceCRM add prisma/schema.prisma prisma/migrations/
git -C /Users/hannaholsson/LeadforceCRM commit -m "Add TenantSettings, SdrPermission, User.timezone to schema"
```

---

## Task 2: Add Switch UI component

**Files:**
- Create: `src/components/ui/switch.tsx`

- [ ] **Step 1: Install via shadcn CLI**

```bash
cd /Users/hannaholsson/LeadforceCRM && npx shadcn@latest add switch
```

Expected: `src/components/ui/switch.tsx` created.

- [ ] **Step 2: Verify the file exists**

```bash
ls /Users/hannaholsson/LeadforceCRM/src/components/ui/switch.tsx
```

Expected: file present.

- [ ] **Step 3: Commit**

```bash
git -C /Users/hannaholsson/LeadforceCRM add src/components/ui/switch.tsx
git -C /Users/hannaholsson/LeadforceCRM commit -m "Add Shadcn Switch component"
```

---

## Task 3: Extend hasPermission with SdrPermission overrides (TDD)

**Files:**
- Modify: `src/lib/auth.ts`
- Modify: `src/lib/__tests__/auth.test.ts`

- [ ] **Step 1: Write failing tests**

Open `src/lib/__tests__/auth.test.ts` and add a new `describe` block at the bottom:

```typescript
describe('hasPermission with SdrPermissionOverrides', () => {
  it('returns false for sdr campaigns:write without override', () => {
    expect(hasPermission('sdr', 'campaigns:write')).toBe(false)
  })

  it('returns true for sdr campaigns:write when canManageCampaigns is true', () => {
    expect(hasPermission('sdr', 'campaigns:write', { canManageCampaigns: true })).toBe(true)
  })

  it('returns false for sdr campaigns:write when canManageCampaigns is false', () => {
    expect(hasPermission('sdr', 'campaigns:write', { canManageCampaigns: false })).toBe(false)
  })

  it('returns false for sdr pipeline:write without override', () => {
    expect(hasPermission('sdr', 'pipeline:write')).toBe(false)
  })

  it('returns true for sdr pipeline:write when canWritePipeline is true', () => {
    expect(hasPermission('sdr', 'pipeline:write', { canWritePipeline: true })).toBe(true)
  })

  it('does not apply overrides to non-sdr roles', () => {
    expect(hasPermission('manager', 'pipeline:write', { canWritePipeline: false })).toBe(true)
  })

  it('does not grant unknown permissions via override', () => {
    expect(hasPermission('sdr', 'clients:write', { canManageCampaigns: true })).toBe(false)
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd /Users/hannaholsson/LeadforceCRM && npx vitest run src/lib/__tests__/auth.test.ts
```

Expected: the new `hasPermission with SdrPermissionOverrides` tests fail with "Expected 2 arguments but got 3" (TypeScript error) or similar.

- [ ] **Step 3: Implement the override**

Open `src/lib/auth.ts`. Add the type and update `hasPermission`:

```typescript
export type SdrPermissionOverrides = {
  canManageCampaigns?: boolean
  canAccessDashboard?: boolean
  canWritePipeline?: boolean
}

export function hasPermission(
  role: string,
  permission: Permission,
  overrides?: SdrPermissionOverrides
): boolean {
  if (role === 'sdr' && overrides) {
    if (permission === 'campaigns:write' && overrides.canManageCampaigns) return true
    if (permission === 'pipeline:write' && overrides.canWritePipeline) return true
  }
  const perms = ROLE_PERMISSIONS[role as UserRole]
  return perms?.includes(permission) ?? false
}
```

- [ ] **Step 4: Run all auth tests**

```bash
cd /Users/hannaholsson/LeadforceCRM && npx vitest run src/lib/__tests__/auth.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git -C /Users/hannaholsson/LeadforceCRM add src/lib/auth.ts src/lib/__tests__/auth.test.ts
git -C /Users/hannaholsson/LeadforceCRM commit -m "Extend hasPermission to accept SdrPermission overrides"
```

---

## Task 4: Settings layout + nav + redirect page

**Files:**
- Create: `src/components/settings/SettingsNav.tsx`
- Create: `src/app/(dashboard)/settings/layout.tsx`
- Create: `src/app/(dashboard)/settings/page.tsx`

- [ ] **Step 1: Create SettingsNav**

Create `src/components/settings/SettingsNav.tsx`:

```typescript
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Building2, Phone, Users, Globe, User } from 'lucide-react'
import { cn } from '@/lib/utils'

export type SettingsSection = {
  href: string
  label: string
  icon: React.ElementType
}

const ALL_SECTIONS: SettingsSection[] = [
  { href: '/settings/company',  label: 'Company',          icon: Building2 },
  { href: '/settings/dialer',   label: 'Dialer Thresholds', icon: Phone },
  { href: '/settings/team',     label: 'Team',             icon: Users },
  { href: '/settings/portal',   label: 'Client Portal',    icon: Globe },
  { href: '/settings/account',  label: 'Account',          icon: User },
]

interface SettingsNavProps {
  allowedSections: string[]
}

export function SettingsNav({ allowedSections }: SettingsNavProps) {
  const pathname = usePathname()
  const sections = ALL_SECTIONS.filter(s => allowedSections.includes(s.href))

  return (
    <nav className="w-56 flex-shrink-0 space-y-0.5">
      {sections.map(({ href, label, icon: Icon }) => {
        const active = pathname.startsWith(href)
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-colors duration-200',
              active
                ? 'bg-white/5 text-[#00d4ff]'
                : 'text-gray-400 hover:text-white hover:bg-white/5'
            )}
          >
            <Icon className="w-4 h-4 flex-shrink-0" />
            <span>{label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
```

- [ ] **Step 2: Create settings layout**

Create `src/app/(dashboard)/settings/layout.tsx`:

```typescript
import { redirect } from 'next/navigation'
import { Header } from '@/components/layout/Header'
import { SettingsNav } from '@/components/settings/SettingsNav'
import { getCurrentUserRole, getCurrentTenantId } from '@/lib/auth'
import type { ReactNode } from 'react'

const ROLE_SECTIONS: Record<string, string[]> = {
  admin:   ['/settings/company', '/settings/dialer', '/settings/team', '/settings/portal', '/settings/account'],
  manager: ['/settings/team', '/settings/portal', '/settings/account'],
  sdr:     ['/settings/account'],
}

export default async function SettingsLayout({ children }: { children: ReactNode }) {
  const tenantId = await getCurrentTenantId()
  if (!tenantId) redirect('/sign-in')

  const role = await getCurrentUserRole()
  if (!role || role === 'client') redirect('/')

  const allowedSections = ROLE_SECTIONS[role] ?? ['/settings/account']

  return (
    <>
      <Header title="Settings" subtitle="Manage your workspace configuration" />
      <div className="p-8 flex gap-8">
        <SettingsNav allowedSections={allowedSections} />
        <div className="flex-1 min-w-0">{children}</div>
      </div>
    </>
  )
}
```

- [ ] **Step 3: Create redirect page**

Create `src/app/(dashboard)/settings/page.tsx`:

```typescript
import { redirect } from 'next/navigation'
import { getCurrentUserRole } from '@/lib/auth'

export default async function SettingsPage() {
  const role = await getCurrentUserRole()
  if (role === 'admin') redirect('/settings/company')
  if (role === 'manager') redirect('/settings/team')
  redirect('/settings/account')
}
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd /Users/hannaholsson/LeadforceCRM && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors related to the new settings files.

- [ ] **Step 5: Commit**

```bash
git -C /Users/hannaholsson/LeadforceCRM add src/components/settings/SettingsNav.tsx src/app/\(dashboard\)/settings/layout.tsx src/app/\(dashboard\)/settings/page.tsx
git -C /Users/hannaholsson/LeadforceCRM commit -m "Add settings layout, nav, and redirect page"
```

---

## Task 5: Account section — API + form + page

**Files:**
- Create: `src/app/api/settings/account/route.ts`
- Create: `src/components/settings/AccountForm.tsx`
- Create: `src/app/(dashboard)/settings/account/page.tsx`

- [ ] **Step 1: Create account API route**

Create `src/app/api/settings/account/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { db, withTenant } from '@/lib/db'
import { getClerkMeta } from '@/lib/auth'

const IANA_REGEX = /^[A-Za-z_]+\/[A-Za-z_]+(?:\/[A-Za-z_]+)?$/

const PatchSchema = z.object({
  name:     z.string().min(1).optional(),
  timezone: z.string().regex(IANA_REGEX, 'Must be a valid IANA timezone').nullable().optional(),
})

export async function GET() {
  try {
    const { userId: clerkId } = await auth()
    if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { tenantId } = await getClerkMeta()
    if (!tenantId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const user = await withTenant(tenantId, () =>
      db.user.findFirst({
        where:  { clerkId },
        select: { id: true, name: true, email: true, timezone: true, role: true },
      })
    )
    if (!user) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    return NextResponse.json({ data: user })
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { userId: clerkId } = await auth()
    if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { tenantId } = await getClerkMeta()
    if (!tenantId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const body   = await req.json()
    const parsed = PatchSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid body', details: parsed.error.flatten() }, { status: 400 })
    }

    const user = await withTenant(tenantId, () =>
      db.user.findFirst({ where: { clerkId }, select: { id: true } })
    )
    if (!user) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const updated = await withTenant(tenantId, () =>
      db.user.update({
        where:  { id: user.id },
        data:   parsed.data,
        select: { id: true, name: true, email: true, timezone: true },
      })
    )

    return NextResponse.json({ data: updated })
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
```

- [ ] **Step 2: Create AccountForm component**

Create `src/components/settings/AccountForm.tsx`:

```typescript
'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { ExternalLink, Bell } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'

const IANA_REGEX = /^[A-Za-z_]+\/[A-Za-z_]+(?:\/[A-Za-z_]+)?$/

const Schema = z.object({
  name:     z.string().min(1, 'Name is required'),
  timezone: z.string().regex(IANA_REGEX, 'Must be a valid IANA timezone (e.g. Europe/London)').or(z.literal('')),
})

type FormValues = z.infer<typeof Schema>

interface AccountFormProps {
  initialName:     string
  initialTimezone: string | null
  clerkProfileUrl: string
}

const inputClass = 'bg-white/5 border-white/10 text-white placeholder:text-gray-600 focus:border-[#00d4ff]/50 focus:ring-1 focus:ring-[#00d4ff]/10 rounded-xl'

export function AccountForm({ initialName, initialTimezone, clerkProfileUrl }: AccountFormProps) {
  const [saving, setSaving] = useState(false)

  const { register, handleSubmit, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(Schema),
    defaultValues: { name: initialName, timezone: initialTimezone ?? '' },
  })

  const onSubmit = async (data: FormValues) => {
    setSaving(true)
    try {
      const res = await fetch('/api/settings/account', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ name: data.name, timezone: data.timezone || null }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        toast.error((body as { error?: string }).error ?? 'Failed to save')
        return
      }
      toast.success('Account updated')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-8 max-w-xl">
      {/* Profile */}
      <section className="glass-panel rounded-2xl p-6 space-y-5">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500">Profile</h2>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs text-gray-400">Display name</Label>
            <Input {...register('name')} className={inputClass} placeholder="Your name" />
            {errors.name && <p className="text-xs text-red-400">{errors.name.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-gray-400">Timezone</Label>
            <Input {...register('timezone')} className={inputClass} placeholder="e.g. Europe/London" />
            <p className="text-[11px] text-gray-600">Leave blank to use the workspace timezone.</p>
            {errors.timezone && <p className="text-xs text-red-400">{errors.timezone.message}</p>}
          </div>
          <Button
            type="submit"
            disabled={saving}
            className="bg-gradient-to-r from-[#00d4ff] to-cyan-600 text-black font-semibold rounded-xl shadow-xl hover:opacity-90"
          >
            {saving ? 'Saving…' : 'Save changes'}
          </Button>
        </form>
      </section>

      {/* Notifications placeholder */}
      <section className="glass-panel rounded-2xl p-6 space-y-4">
        <div className="flex items-center gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500">Notifications</h2>
          <Badge className="bg-white/5 border-0 text-[10px] text-gray-500">Coming soon</Badge>
        </div>
        <div className="space-y-3 opacity-40 pointer-events-none">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-gray-400" />
              <Label className="text-sm text-gray-300">Email notifications</Label>
            </div>
            <Switch disabled />
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-gray-400" />
              <Label className="text-sm text-gray-300">In-app notifications</Label>
            </div>
            <Switch disabled />
          </div>
        </div>
      </section>

      {/* Account security */}
      <section className="glass-panel rounded-2xl p-6 space-y-4">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500">Account Security</h2>
        <p className="text-sm text-gray-400">Manage your password, MFA, and connected accounts via Clerk.</p>
        <a href={clerkProfileUrl} target="_blank" rel="noopener noreferrer">
          <Button
            type="button"
            variant="outline"
            className="bg-white/5 border-white/10 text-gray-300 hover:bg-white/10 rounded-xl flex items-center gap-2"
          >
            <ExternalLink className="w-4 h-4" />
            Manage password &amp; security
          </Button>
        </a>
      </section>
    </div>
  )
}
```

- [ ] **Step 3: Create account page**

Create `src/app/(dashboard)/settings/account/page.tsx`:

```typescript
import { redirect } from 'next/navigation'
import { currentUser } from '@clerk/nextjs/server'
import { db, withTenant } from '@/lib/db'
import { getCurrentTenantId } from '@/lib/auth'
import { AccountForm } from '@/components/settings/AccountForm'

export default async function AccountSettingsPage() {
  const tenantId = await getCurrentTenantId()
  if (!tenantId) redirect('/sign-in')

  const clerkUser = await currentUser()
  if (!clerkUser) redirect('/sign-in')

  const user = await withTenant(tenantId, () =>
    db.user.findFirst({
      where:  { clerkId: clerkUser.id },
      select: { name: true, timezone: true },
    })
  )
  if (!user) redirect('/sign-in')

  const clerkProfileUrl = clerkUser.externalAccounts?.[0]?.profileImageUrl
    ? `https://accounts.clerk.dev/user`
    : 'https://accounts.clerk.dev/user'

  return (
    <AccountForm
      initialName={user.name}
      initialTimezone={user.timezone}
      clerkProfileUrl={clerkProfileUrl}
    />
  )
}
```

- [ ] **Step 4: Verify TypeScript**

```bash
cd /Users/hannaholsson/LeadforceCRM && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git -C /Users/hannaholsson/LeadforceCRM add src/app/api/settings/account/route.ts src/components/settings/AccountForm.tsx src/app/\(dashboard\)/settings/account/page.tsx
git -C /Users/hannaholsson/LeadforceCRM commit -m "Add Account settings section"
```

---

## Task 6: Company section — API + form + page + sidebar logo

**Files:**
- Create: `src/app/api/settings/company/route.ts`
- Create: `src/components/settings/CompanyForm.tsx`
- Create: `src/app/(dashboard)/settings/company/page.tsx`
- Modify: `src/components/layout/Sidebar.tsx`
- Modify: `src/app/(dashboard)/layout.tsx`

- [ ] **Step 1: Create company API route**

Create `src/app/api/settings/company/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { db, withTenant } from '@/lib/db'
import { getClerkMeta, hasPermission } from '@/lib/auth'

const IANA_REGEX = /^[A-Za-z_]+\/[A-Za-z_]+(?:\/[A-Za-z_]+)?$/

const PatchSchema = z.object({
  name:     z.string().min(1).optional(),
  timezone: z.string().regex(IANA_REGEX, 'Must be a valid IANA timezone').optional(),
})

async function getOrCreateSettings(tenantId: string) {
  const existing = await db.tenantSettings.findUnique({ where: { tenantId } })
  if (existing) return existing
  return db.tenantSettings.create({ data: { tenantId } })
}

export async function GET() {
  try {
    const { userId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { role, tenantId } = await getClerkMeta()
    if (role !== 'admin' || !tenantId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const [tenant, settings] = await Promise.all([
      db.tenant.findUnique({ where: { id: tenantId }, select: { name: true } }),
      getOrCreateSettings(tenantId),
    ])

    return NextResponse.json({ data: { name: tenant?.name ?? '', timezone: settings.timezone, logoUrl: settings.logoUrl } })
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { userId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { role, tenantId } = await getClerkMeta()
    if (role !== 'admin' || !tenantId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body   = await req.json()
    const parsed = PatchSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid body', details: parsed.error.flatten() }, { status: 400 })
    }

    const { name, timezone } = parsed.data

    await db.$transaction(async (tx) => {
      if (name) {
        await tx.tenant.update({ where: { id: tenantId }, data: { name } })
      }
      await tx.tenantSettings.upsert({
        where:  { tenantId },
        create: { tenantId, ...(timezone && { timezone }) },
        update: { ...(timezone && { timezone }) },
      })
    })

    return NextResponse.json({ data: { success: true } })
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
```

- [ ] **Step 2: Create CompanyForm component**

Create `src/components/settings/CompanyForm.tsx`:

```typescript
'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ImageIcon } from 'lucide-react'

const IANA_REGEX = /^[A-Za-z_]+\/[A-Za-z_]+(?:\/[A-Za-z_]+)?$/

const Schema = z.object({
  name:     z.string().min(1, 'Company name is required'),
  timezone: z.string().regex(IANA_REGEX, 'Must be a valid IANA timezone (e.g. Europe/London)'),
})

type FormValues = z.infer<typeof Schema>

interface CompanyFormProps {
  initialName:     string
  initialTimezone: string
}

const inputClass = 'bg-white/5 border-white/10 text-white placeholder:text-gray-600 focus:border-[#00d4ff]/50 focus:ring-1 focus:ring-[#00d4ff]/10 rounded-xl'

export function CompanyForm({ initialName, initialTimezone }: CompanyFormProps) {
  const [saving, setSaving] = useState(false)

  const { register, handleSubmit, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(Schema),
    defaultValues: { name: initialName, timezone: initialTimezone },
  })

  const onSubmit = async (data: FormValues) => {
    setSaving(true)
    try {
      const res = await fetch('/api/settings/company', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(data),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        toast.error((body as { error?: string }).error ?? 'Failed to save')
        return
      }
      toast.success('Company settings saved')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-8 max-w-xl">
      {/* Company info */}
      <section className="glass-panel rounded-2xl p-6 space-y-5">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500">Company</h2>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs text-gray-400">Company name</Label>
            <Input {...register('name')} className={inputClass} placeholder="Acme Corp" />
            {errors.name && <p className="text-xs text-red-400">{errors.name.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-gray-400">Workspace timezone</Label>
            <Input {...register('timezone')} className={inputClass} placeholder="e.g. Europe/London" />
            <p className="text-[11px] text-gray-600">Used as the default for reports and session timestamps.</p>
            {errors.timezone && <p className="text-xs text-red-400">{errors.timezone.message}</p>}
          </div>
          <Button
            type="submit"
            disabled={saving}
            className="bg-gradient-to-r from-[#00d4ff] to-cyan-600 text-black font-semibold rounded-xl shadow-xl hover:opacity-90"
          >
            {saving ? 'Saving…' : 'Save changes'}
          </Button>
        </form>
      </section>

      {/* Logo placeholder */}
      <section className="glass-panel rounded-2xl p-6 space-y-4">
        <div className="flex items-center gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500">Logo</h2>
          <Badge className="bg-white/5 border-0 text-[10px] text-gray-500">Coming soon</Badge>
        </div>
        <div className="flex items-center gap-4 opacity-40 pointer-events-none">
          <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
            <ImageIcon className="w-6 h-6 text-gray-600" />
          </div>
          <div>
            <p className="text-sm text-gray-400">Upload a company logo</p>
            <p className="text-[11px] text-gray-600 mt-0.5">PNG or SVG, max 1 MB</p>
          </div>
        </div>
      </section>
    </div>
  )
}
```

- [ ] **Step 3: Create company page**

Create `src/app/(dashboard)/settings/company/page.tsx`:

```typescript
import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { getCurrentUserRole, getCurrentTenantId } from '@/lib/auth'
import { CompanyForm } from '@/components/settings/CompanyForm'

export default async function CompanySettingsPage() {
  const tenantId = await getCurrentTenantId()
  if (!tenantId) redirect('/sign-in')

  const role = await getCurrentUserRole()
  if (role !== 'admin') redirect('/settings/account')

  const [tenant, settings] = await Promise.all([
    db.tenant.findUnique({ where: { id: tenantId }, select: { name: true } }),
    db.tenantSettings.findUnique({ where: { tenantId } }),
  ])

  return (
    <CompanyForm
      initialName={tenant?.name ?? ''}
      initialTimezone={settings?.timezone ?? 'UTC'}
    />
  )
}
```

- [ ] **Step 4: Update Sidebar to accept and show logoUrl**

Open `src/components/layout/Sidebar.tsx`. Update the `SidebarProps` interface and the logo area:

Change the interface (currently only has `dailyStats`) to also accept `logoUrl`:

```typescript
interface SidebarProps {
  dailyStats: DailyTargetStats
  logoUrl?: string | null
}
```

Update the component signature:

```typescript
export function Sidebar({ dailyStats, logoUrl }: SidebarProps) {
```

Replace the logo/brand block at the top (the `<div>` with the cyan square and "LeadForce" text):

```typescript
<div className={cn('flex items-center p-6 flex-shrink-0', sidebarCollapsed && 'justify-center px-0')}>
  {logoUrl ? (
    <img
      src={logoUrl}
      alt="Company logo"
      className="w-8 h-8 rounded-xl object-contain flex-shrink-0"
    />
  ) : (
    <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#00d4ff] to-cyan-600 flex-shrink-0" />
  )}
  {!sidebarCollapsed && (
    <span className="ml-3 text-xl font-bold bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent select-none">
      LeadForce
    </span>
  )}
</div>
```

- [ ] **Step 5: Pass logoUrl to Sidebar from dashboard layout**

Open `src/app/(dashboard)/layout.tsx`. After the existing `dailyStats` fetch, add a `TenantSettings` fetch:

```typescript
import { db, withTenant } from '@/lib/db'
import { getClerkMeta } from '@/lib/auth'
import { getDailyTargetStats } from '@/lib/reports'
import { Sidebar } from '@/components/layout/Sidebar'
import { Toaster } from '@/components/ui/sonner'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  let dailyStats = { count: 0, target: 0 }
  let logoUrl: string | null = null

  try {
    const { userId: clerkId } = await auth()
    const { role, tenantId } = await getClerkMeta()

    if (clerkId && tenantId && role) {
      const [dbUser, tenantSettings] = await Promise.all([
        withTenant(tenantId, () =>
          db.user.findFirst({ where: { clerkId }, select: { id: true } })
        ),
        db.tenantSettings.findUnique({ where: { tenantId }, select: { logoUrl: true } }),
      ])
      if (dbUser) {
        dailyStats = await getDailyTargetStats(tenantId, dbUser.id, role)
      }
      logoUrl = tenantSettings?.logoUrl ?? null
    }
  } catch (e) {
    if (process.env.NODE_ENV !== 'production') console.error('[DashboardLayout]', e)
  }

  return (
    <div className="flex h-screen overflow-hidden bg-dark">
      <Sidebar dailyStats={dailyStats} logoUrl={logoUrl} />
      <main className="flex-1 overflow-y-auto custom-scrollbar">
        {children}
      </main>
      <Toaster position="bottom-right" theme="dark" />
    </div>
  )
}
```

(Keep the existing `auth` import at the top — it's already there.)

- [ ] **Step 6: Verify TypeScript**

```bash
cd /Users/hannaholsson/LeadforceCRM && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git -C /Users/hannaholsson/LeadforceCRM add src/app/api/settings/company/route.ts src/components/settings/CompanyForm.tsx src/app/\(dashboard\)/settings/company/page.tsx src/components/layout/Sidebar.tsx src/app/\(dashboard\)/layout.tsx
git -C /Users/hannaholsson/LeadforceCRM commit -m "Add Company settings section and sidebar logo support"
```

---

## Task 7: Dialer thresholds — TDD on outcome-router + API + form + page

**Files:**
- Modify: `src/lib/outcome-router.ts`
- Modify: `src/lib/__tests__/outcome-router.test.ts`
- Create: `src/app/api/settings/dialer/route.ts`
- Create: `src/components/settings/DialerThresholdsForm.tsx`
- Create: `src/app/(dashboard)/settings/dialer/page.tsx`
- Modify: `src/app/api/dialer/log-outcome/route.ts`

- [ ] **Step 1: Write failing test for configurable thresholds**

Open `src/lib/__tests__/outcome-router.test.ts`. The current tests call `routeOutcome(contactId, outcome, tx)` with 3 args. We're adding a 4th `thresholds` argument. Add a new describe block and update existing threshold tests.

First, add an import for the `DialerThresholds` type at the top (will be defined in outcome-router.ts):

```typescript
import { routeOutcome, CONVERSATION_TAGGED_OUTCOMES, DEFAULT_DIALER_THRESHOLDS } from '../outcome-router'
import type { DialerThresholds } from '../outcome-router'
```

Add a new describe block for configurable thresholds:

```typescript
describe('routeOutcome with custom thresholds', () => {
  it('moves to future list at custom dialUnresponsiveLimit', async () => {
    const thresholds: DialerThresholds = { ...DEFAULT_DIALER_THRESHOLDS, dialUnresponsiveLimit: 3 }
    mockFindUnique.mockResolvedValue({ ...baseContact, dialAttempts: 2 })
    await routeOutcome('c1', CallOutcome.no_answer, mockTx, thresholds)
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data:  { dialAttempts: 3, status: 'future' },
    })
  })

  it('does not move to future at dialAttempts below custom limit', async () => {
    const thresholds: DialerThresholds = { ...DEFAULT_DIALER_THRESHOLDS, dialUnresponsiveLimit: 5 }
    mockFindUnique.mockResolvedValue({ ...baseContact, dialAttempts: 2 })
    await routeOutcome('c1', CallOutcome.no_answer, mockTx, thresholds)
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data:  { dialAttempts: 3 },
    })
  })

  it('uses custom notInterestedCooldownDays', async () => {
    const thresholds: DialerThresholds = { ...DEFAULT_DIALER_THRESHOLDS, notInterestedCooldownDays: 14 }
    mockFindUnique.mockResolvedValue(baseContact)
    const before = Date.now()
    await routeOutcome('c1', CallOutcome.not_interested, mockTx, thresholds)
    const call = mockUpdate.mock.calls[0][0]
    const diffDays = (call.data.notInterestedUntil.getTime() - before) / (1000 * 60 * 60 * 24)
    expect(diffDays).toBeGreaterThanOrEqual(13.9)
    expect(diffDays).toBeLessThanOrEqual(14.1)
  })
})
```

Also update the existing test that checks the hardcoded `>= 8` threshold — find it and update the call to pass thresholds:

```typescript
// In the existing 'no_answer' describe block, update calls to pass thresholds:
await routeOutcome('c1', CallOutcome.no_answer, mockTx, DEFAULT_DIALER_THRESHOLDS)
```

Do this for ALL existing calls to `routeOutcome` in the test file — they all need the 4th arg.

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd /Users/hannaholsson/LeadforceCRM && npx vitest run src/lib/__tests__/outcome-router.test.ts 2>&1 | tail -20
```

Expected: compilation errors or test failures because `DEFAULT_DIALER_THRESHOLDS` and `DialerThresholds` don't exist yet.

- [ ] **Step 3: Update outcome-router.ts**

Open `src/lib/outcome-router.ts` and make these changes:

Add the type and defaults at the top (after imports):

```typescript
export type DialerThresholds = {
  dialUnresponsiveLimit:     number
  dialFutureReentryDays:     number
  dialFutureReattempts:      number
  notInterestedCooldownDays: number
}

export const DEFAULT_DIALER_THRESHOLDS: DialerThresholds = {
  dialUnresponsiveLimit:     8,
  dialFutureReentryDays:     90,
  dialFutureReattempts:      3,
  notInterestedCooldownDays: 7,
}
```

Update `incrementDialAttempts` to accept the limit:

```typescript
async function incrementDialAttempts(
  contactId: string,
  currentAttempts: number,
  limit: number,
  tx: TxClient
) {
  const newCount = currentAttempts + 1
  await tx.contact.update({
    where: { id: contactId },
    data: {
      dialAttempts: newCount,
      ...(newCount >= limit ? { status: 'future' } : {}),
    },
  })
}
```

Update `routeOutcome` signature and body to accept and use thresholds:

```typescript
export async function routeOutcome(
  contactId: string,
  outcome: CallOutcome,
  tx: TxClient,
  thresholds: DialerThresholds = DEFAULT_DIALER_THRESHOLDS
): Promise<void> {
```

In the switch, update the `incrementDialAttempts` calls to pass the limit:

```typescript
  case CallOutcome.no_answer:
  // ... other unresponsive outcomes
  case CallOutcome.other: {
    await incrementDialAttempts(contactId, contact.dialAttempts, thresholds.dialUnresponsiveLimit, tx)
    break
  }
```

Update the `not_interested` case to use the cooldown from thresholds:

```typescript
  case CallOutcome.not_interested: {
    const notInterestedUntil = new Date(
      Date.now() + thresholds.notInterestedCooldownDays * 24 * 60 * 60 * 1000
    )
    await tx.contact.update({
      where: { id: contactId },
      data:  { notInterestedUntil },
    })
    break
  }
```

- [ ] **Step 4: Run outcome-router tests**

```bash
cd /Users/hannaholsson/LeadforceCRM && npx vitest run src/lib/__tests__/outcome-router.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Update log-outcome route to fetch and pass thresholds**

Open `src/app/api/dialer/log-outcome/route.ts`. Add the import:

```typescript
import { routeOutcome, CONVERSATION_TAGGED_OUTCOMES, DEFAULT_DIALER_THRESHOLDS } from '@/lib/outcome-router'
import type { DialerThresholds } from '@/lib/outcome-router'
```

Before the `db.$transaction` call, fetch the thresholds:

```typescript
    const tenantSettingsRow = await db.tenantSettings.findUnique({
      where:  { tenantId },
      select: {
        dialUnresponsiveLimit:     true,
        dialFutureReentryDays:     true,
        dialFutureReattempts:      true,
        notInterestedCooldownDays: true,
      },
    })

    const thresholds: DialerThresholds = tenantSettingsRow ?? DEFAULT_DIALER_THRESHOLDS
```

Update both `routeOutcome` calls inside the transaction to pass thresholds:

```typescript
await routeOutcome(contactId, typedOutcome, tx, thresholds)
```

(There are two — one in the `manual` branch and one in the `else` branch.)

- [ ] **Step 6: Create dialer API route**

Create `src/app/api/settings/dialer/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { getClerkMeta } from '@/lib/auth'

const PatchSchema = z.object({
  dialUnresponsiveLimit:     z.number().int().min(1).optional(),
  dialFutureReentryDays:     z.number().int().min(30).optional(),
  dialFutureReattempts:      z.number().int().min(1).optional(),
  notInterestedCooldownDays: z.number().int().min(1).optional(),
})

export async function GET() {
  try {
    const { userId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { role, tenantId } = await getClerkMeta()
    if (role !== 'admin' || !tenantId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const settings = await db.tenantSettings.findUnique({ where: { tenantId } })

    return NextResponse.json({
      data: {
        dialUnresponsiveLimit:     settings?.dialUnresponsiveLimit     ?? 8,
        dialFutureReentryDays:     settings?.dialFutureReentryDays     ?? 90,
        dialFutureReattempts:      settings?.dialFutureReattempts      ?? 3,
        notInterestedCooldownDays: settings?.notInterestedCooldownDays ?? 7,
      },
    })
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { userId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { role, tenantId } = await getClerkMeta()
    if (role !== 'admin' || !tenantId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body   = await req.json()
    const parsed = PatchSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid body', details: parsed.error.flatten() }, { status: 400 })
    }

    await db.tenantSettings.upsert({
      where:  { tenantId },
      create: { tenantId, ...parsed.data },
      update: parsed.data,
    })

    return NextResponse.json({ data: { success: true } })
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
```

- [ ] **Step 7: Create DialerThresholdsForm component**

Create `src/components/settings/DialerThresholdsForm.tsx`:

```typescript
'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const Schema = z.object({
  dialUnresponsiveLimit:     z.coerce.number().int().min(1, 'Min 1'),
  dialFutureReentryDays:     z.coerce.number().int().min(30, 'Min 30 days'),
  dialFutureReattempts:      z.coerce.number().int().min(1, 'Min 1'),
  notInterestedCooldownDays: z.coerce.number().int().min(1, 'Min 1'),
})

type FormValues = z.infer<typeof Schema>

interface DialerThresholdsFormProps {
  initialValues: FormValues
}

const inputClass = 'bg-white/5 border-white/10 text-white placeholder:text-gray-600 focus:border-[#00d4ff]/50 focus:ring-1 focus:ring-[#00d4ff]/10 rounded-xl w-24'

const FIELDS: { key: keyof FormValues; label: string; description: string }[] = [
  {
    key:         'dialUnresponsiveLimit',
    label:       'Unanswered dial limit',
    description: 'After this many unanswered dials, the contact moves to the Future list.',
  },
  {
    key:         'dialFutureReentryDays',
    label:       'Future list re-entry (days)',
    description: 'Days before a Future contact re-enters the prospect queue for another attempt.',
  },
  {
    key:         'dialFutureReattempts',
    label:       'Max re-dial attempts after re-entry',
    description: 'If still unresponsive after this many re-attempts, the contact is permanently marked DNC.',
  },
  {
    key:         'notInterestedCooldownDays',
    label:       'Not Interested cooldown (days)',
    description: 'Days before a Not Interested contact re-enters the Lead queue.',
  },
]

export function DialerThresholdsForm({ initialValues }: DialerThresholdsFormProps) {
  const [saving, setSaving] = useState(false)

  const { register, handleSubmit, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(Schema),
    defaultValues: initialValues,
  })

  const onSubmit = async (data: FormValues) => {
    setSaving(true)
    try {
      const res = await fetch('/api/settings/dialer', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(data),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        toast.error((body as { error?: string }).error ?? 'Failed to save')
        return
      }
      toast.success('Dialer thresholds saved')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-xl">
      <section className="glass-panel rounded-2xl p-6 space-y-6">
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500">Dialer Thresholds</h2>
          <p className="text-xs text-gray-600 mt-1">Workspace-wide defaults. Individual campaigns can override these in their settings.</p>
        </div>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {FIELDS.map(({ key, label, description }) => (
            <div key={key} className="flex items-start justify-between gap-6">
              <div className="flex-1">
                <Label className="text-sm text-gray-300">{label}</Label>
                <p className="text-[11px] text-gray-600 mt-0.5">{description}</p>
                {errors[key] && <p className="text-xs text-red-400 mt-1">{errors[key]?.message}</p>}
              </div>
              <Input
                {...register(key)}
                type="number"
                min={key === 'dialFutureReentryDays' ? 30 : 1}
                className={inputClass}
              />
            </div>
          ))}
          <Button
            type="submit"
            disabled={saving}
            className="bg-gradient-to-r from-[#00d4ff] to-cyan-600 text-black font-semibold rounded-xl shadow-xl hover:opacity-90"
          >
            {saving ? 'Saving…' : 'Save thresholds'}
          </Button>
        </form>
      </section>
    </div>
  )
}
```

- [ ] **Step 8: Create dialer settings page**

Create `src/app/(dashboard)/settings/dialer/page.tsx`:

```typescript
import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { getCurrentUserRole, getCurrentTenantId } from '@/lib/auth'
import { DialerThresholdsForm } from '@/components/settings/DialerThresholdsForm'

export default async function DialerSettingsPage() {
  const tenantId = await getCurrentTenantId()
  if (!tenantId) redirect('/sign-in')

  const role = await getCurrentUserRole()
  if (role !== 'admin') redirect('/settings/account')

  const settings = await db.tenantSettings.findUnique({ where: { tenantId } })

  return (
    <DialerThresholdsForm
      initialValues={{
        dialUnresponsiveLimit:     settings?.dialUnresponsiveLimit     ?? 8,
        dialFutureReentryDays:     settings?.dialFutureReentryDays     ?? 90,
        dialFutureReattempts:      settings?.dialFutureReattempts      ?? 3,
        notInterestedCooldownDays: settings?.notInterestedCooldownDays ?? 7,
      }}
    />
  )
}
```

- [ ] **Step 9: Run all tests**

```bash
cd /Users/hannaholsson/LeadforceCRM && npx vitest run 2>&1 | tail -20
```

Expected: all tests pass.

- [ ] **Step 10: Commit**

```bash
git -C /Users/hannaholsson/LeadforceCRM add src/lib/outcome-router.ts src/lib/__tests__/outcome-router.test.ts src/app/api/dialer/log-outcome/route.ts src/app/api/settings/dialer/route.ts src/components/settings/DialerThresholdsForm.tsx src/app/\(dashboard\)/settings/dialer/page.tsx
git -C /Users/hannaholsson/LeadforceCRM commit -m "Add Dialer Thresholds settings section; make outcome-router thresholds configurable"
```

---

## Task 8: Team delegation — API + panel + page

**Files:**
- Create: `src/app/api/settings/delegation/route.ts`
- Create: `src/app/api/settings/delegation/[userId]/route.ts`
- Create: `src/components/settings/TeamDelegationPanel.tsx`
- Create: `src/app/(dashboard)/settings/team/page.tsx`

- [ ] **Step 1: Create delegation GET route**

Create `src/app/api/settings/delegation/route.ts`:

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

    const dbUser = await withTenant(tenantId, () =>
      db.user.findFirst({ where: { clerkId }, select: { id: true } })
    )
    if (!dbUser) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    const sdrs = await withTenant(tenantId, () =>
      db.user.findMany({
        where: {
          role:      'sdr',
          deletedAt: null,
          ...(role === 'manager' ? { managerId: dbUser.id } : {}),
        },
        select: {
          id:    true,
          name:  true,
          email: true,
          sdrPermission: {
            select: {
              canManageCampaigns: true,
              canAccessDashboard: true,
              canWritePipeline:   true,
            },
          },
        },
        orderBy: { name: 'asc' },
      })
    )

    return NextResponse.json({ data: sdrs })
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
```

- [ ] **Step 2: Create delegation PATCH route**

Create `src/app/api/settings/delegation/[userId]/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { db, withTenant } from '@/lib/db'
import { getClerkMeta } from '@/lib/auth'

const PatchSchema = z.object({
  canManageCampaigns: z.boolean().optional(),
  canAccessDashboard: z.boolean().optional(),
  canWritePipeline:   z.boolean().optional(),
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
      return NextResponse.json({ error: 'Invalid body', details: parsed.error.flatten() }, { status: 400 })
    }

    const callerDbUser = await withTenant(tenantId, () =>
      db.user.findFirst({ where: { clerkId }, select: { id: true } })
    )
    if (!callerDbUser) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    const targetUser = await withTenant(tenantId, () =>
      db.user.findFirst({
        where: { id: targetUserId, role: 'sdr' },
        select: { id: true, managerId: true },
      })
    )
    if (!targetUser) return NextResponse.json({ error: 'SDR not found' }, { status: 404 })

    if (role === 'manager' && targetUser.managerId !== callerDbUser.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const permission = await db.sdrPermission.upsert({
      where:  { tenantId_userId: { tenantId, userId: targetUserId } },
      create: { tenantId, userId: targetUserId, ...parsed.data },
      update: parsed.data,
      select: { canManageCampaigns: true, canAccessDashboard: true, canWritePipeline: true },
    })

    return NextResponse.json({ data: permission })
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
```

- [ ] **Step 3: Create TeamDelegationPanel component**

Create `src/components/settings/TeamDelegationPanel.tsx`:

```typescript
'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'

type SdrPermission = {
  canManageCampaigns: boolean
  canAccessDashboard: boolean
  canWritePipeline:   boolean
}

type SdrRow = {
  id:            string
  name:          string
  email:         string
  sdrPermission: SdrPermission | null
}

interface TeamDelegationPanelProps {
  initialSdrs: SdrRow[]
}

type PermKey = keyof SdrPermission

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

function getPermValue(perm: SdrPermission | null, key: PermKey): boolean {
  if (!perm) return key === 'canAccessDashboard'
  return perm[key]
}

export function TeamDelegationPanel({ initialSdrs }: TeamDelegationPanelProps) {
  const [sdrs, setSdrs] = useState(initialSdrs)
  const [saving, setSaving] = useState<string | null>(null)

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
      setSdrs(prev =>
        prev.map(sdr =>
          sdr.id === userId
            ? {
                ...sdr,
                sdrPermission: {
                  canManageCampaigns: getPermValue(sdr.sdrPermission, 'canManageCampaigns'),
                  canAccessDashboard: getPermValue(sdr.sdrPermission, 'canAccessDashboard'),
                  canWritePipeline:   getPermValue(sdr.sdrPermission, 'canWritePipeline'),
                  [key]: value,
                },
              }
            : sdr
        )
      )
      toast.success('Saved')
    } finally {
      setSaving(null)
    }
  }

  if (sdrs.length === 0) {
    return (
      <div className="glass-panel rounded-2xl p-8 text-center max-w-xl">
        <p className="text-gray-500 text-sm">No SDRs assigned to you yet.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4 max-w-2xl">
      <p className="text-xs text-gray-500">Toggle permissions for each SDR. Changes save automatically.</p>
      {sdrs.map(sdr => (
        <div key={sdr.id} className="glass-panel rounded-2xl p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-8 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-xs font-semibold text-gray-300">
              {sdr.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <p className="text-sm font-medium text-white">{sdr.name}</p>
              <p className="text-xs text-gray-500">{sdr.email}</p>
            </div>
          </div>
          <div className="space-y-3">
            {TOGGLES.map(({ key, label, description }) => {
              const savingKey = `${sdr.id}-${key}`
              const checked   = getPermValue(sdr.sdrPermission, key)
              return (
                <div key={key} className="flex items-center justify-between gap-4">
                  <div>
                    <Label className="text-sm text-gray-300">{label}</Label>
                    <p className="text-[11px] text-gray-600">{description}</p>
                  </div>
                  <Switch
                    checked={checked}
                    disabled={saving === savingKey}
                    onCheckedChange={(val) => handleToggle(sdr.id, key, val)}
                    className="data-[state=checked]:bg-[#00d4ff]"
                  />
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 4: Create team settings page**

Create `src/app/(dashboard)/settings/team/page.tsx`:

```typescript
import { redirect } from 'next/navigation'
import { currentUser } from '@clerk/nextjs/server'
import { db, withTenant } from '@/lib/db'
import { getCurrentUserRole, getCurrentTenantId } from '@/lib/auth'
import { TeamDelegationPanel } from '@/components/settings/TeamDelegationPanel'

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

  const sdrs = await withTenant(tenantId, () =>
    db.user.findMany({
      where: {
        role:      'sdr',
        deletedAt: null,
        ...(role === 'manager' ? { managerId: callerDbUser.id } : {}),
      },
      select: {
        id:    true,
        name:  true,
        email: true,
        sdrPermission: {
          select: {
            canManageCampaigns: true,
            canAccessDashboard: true,
            canWritePipeline:   true,
          },
        },
      },
      orderBy: { name: 'asc' },
    })
  )

  return <TeamDelegationPanel initialSdrs={sdrs} />
}
```

- [ ] **Step 5: Verify TypeScript**

```bash
cd /Users/hannaholsson/LeadforceCRM && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git -C /Users/hannaholsson/LeadforceCRM add src/app/api/settings/delegation/route.ts src/app/api/settings/delegation/\[userId\]/route.ts src/components/settings/TeamDelegationPanel.tsx src/app/\(dashboard\)/settings/team/page.tsx
git -C /Users/hannaholsson/LeadforceCRM commit -m "Add Team Delegation settings section"
```

---

## Task 9: Client portal section

**Files:**
- Modify: `src/app/api/clients/[id]/portal-invite/route.ts`
- Create: `src/components/settings/PortalPermissionsPanel.tsx`
- Create: `src/app/(dashboard)/settings/portal/page.tsx`

- [ ] **Step 1: Add resend support to portal-invite route**

Open `src/app/api/clients/[id]/portal-invite/route.ts`. Replace the body of the function:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { auth, clerkClient } from '@clerk/nextjs/server'
import { db, withTenant } from '@/lib/db'
import { getClerkMeta, hasPermission } from '@/lib/auth'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { role, tenantId } = await getClerkMeta()
    if (!hasPermission(role, 'clients:write') || !tenantId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params
    const resend  = req.nextUrl.searchParams.get('resend') === 'true'

    const client = await withTenant(tenantId, () =>
      db.client.findUnique({ where: { id } })
    )

    if (!client) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (client.clerkId && !resend) return NextResponse.json({ error: 'Portal already active' }, { status: 409 })
    if (!client.email) return NextResponse.json({ error: 'Client has no email address' }, { status: 400 })

    const clerk = await clerkClient()
    await clerk.invitations.createInvitation({
      emailAddress: client.email,
      publicMetadata: { role: 'client', clientId: client.id },
    })

    return NextResponse.json({ data: { sent: true } })
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
```

- [ ] **Step 2: Create PortalPermissionsPanel component**

Create `src/components/settings/PortalPermissionsPanel.tsx`:

```typescript
'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { ChevronDown, ChevronUp } from 'lucide-react'

type PortalPermissions = {
  viewPipeline:  boolean
  movePipeline:  boolean
  viewReports:   boolean
}

type ClientRow = {
  id:               string
  name:             string
  contactName:      string | null
  email:            string | null
  clerkId:          string | null
  portalPermissions: PortalPermissions
}

interface PortalPermissionsPanelProps {
  clients:  ClientRow[]
  isAdmin:  boolean
}

const DEFAULT_PERMISSIONS: PortalPermissions = {
  viewPipeline: true,
  movePipeline: false,
  viewReports:  true,
}

const PERMISSION_TOGGLES: { key: keyof PortalPermissions; label: string }[] = [
  { key: 'viewPipeline', label: 'View pipeline' },
  { key: 'movePipeline', label: 'Move deals' },
  { key: 'viewReports',  label: 'View reports' },
]

function parsePermissions(raw: unknown): PortalPermissions {
  const p = raw as Partial<PortalPermissions> ?? {}
  return {
    viewPipeline: p.viewPipeline ?? DEFAULT_PERMISSIONS.viewPipeline,
    movePipeline: p.movePipeline ?? DEFAULT_PERMISSIONS.movePipeline,
    viewReports:  p.viewReports  ?? DEFAULT_PERMISSIONS.viewReports,
  }
}

export function PortalPermissionsPanel({ clients, isAdmin }: PortalPermissionsPanelProps) {
  const [rows, setRows]           = useState(clients)
  const [inviting, setInviting]   = useState<string | null>(null)
  const [expanded, setExpanded]   = useState<string | null>(null)
  const [permSaving, setPermSaving] = useState<string | null>(null)

  const handleInvite = async (clientId: string, resend = false) => {
    setInviting(clientId)
    try {
      const url = `/api/clients/${clientId}/portal-invite${resend ? '?resend=true' : ''}`
      const res = await fetch(url, { method: 'POST' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        toast.error((body as { error?: string }).error ?? 'Failed to send invite')
        return
      }
      toast.success(resend ? 'Invite resent!' : 'Invite sent!')
    } finally {
      setInviting(null)
    }
  }

  const handlePermToggle = async (clientId: string, key: keyof PortalPermissions, value: boolean) => {
    setPermSaving(`${clientId}-${key}`)
    try {
      const client = rows.find(r => r.id === clientId)
      if (!client) return
      const current = parsePermissions(client.portalPermissions)
      const updated = { ...current, [key]: value }

      const res = await fetch(`/api/clients/${clientId}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ portalPermissions: updated }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        toast.error((body as { error?: string }).error ?? 'Failed to save')
        return
      }
      setRows(prev =>
        prev.map(r => r.id === clientId ? { ...r, portalPermissions: updated } : r)
      )
      toast.success('Saved')
    } finally {
      setPermSaving(null)
    }
  }

  if (rows.length === 0) {
    return (
      <div className="glass-panel rounded-2xl p-8 text-center max-w-xl">
        <p className="text-gray-500 text-sm">No clients yet. Create one from the Clients page first.</p>
      </div>
    )
  }

  return (
    <div className="space-y-3 max-w-2xl">
      <p className="text-xs text-gray-500">Manage portal access and permissions for each client.</p>
      {rows.map(client => {
        const perms   = parsePermissions(client.portalPermissions)
        const isOpen  = expanded === client.id
        const hasEmail = !!client.email

        return (
          <div key={client.id} className="glass-panel rounded-2xl overflow-hidden">
            <div className="flex items-center justify-between p-4">
              <div>
                <p className="text-sm font-medium text-white">{client.name}</p>
                {client.contactName && (
                  <p className="text-xs text-gray-500">{client.contactName}</p>
                )}
              </div>
              <div className="flex items-center gap-3">
                {client.clerkId ? (
                  <>
                    <Badge className="bg-emerald-500/10 text-emerald-400 border-0 text-[10px]">Active</Badge>
                    <Button
                      type="button"
                      size="sm"
                      disabled={inviting === client.id}
                      onClick={() => handleInvite(client.id, true)}
                      className="bg-white/5 border border-white/10 text-gray-300 hover:bg-white/10 rounded-xl text-xs disabled:opacity-40"
                    >
                      {inviting === client.id ? 'Sending…' : 'Resend'}
                    </Button>
                  </>
                ) : hasEmail ? (
                  <Button
                    type="button"
                    size="sm"
                    disabled={inviting === client.id}
                    onClick={() => handleInvite(client.id)}
                    className="bg-white/5 border border-white/10 text-gray-300 hover:bg-white/10 rounded-xl text-xs disabled:opacity-40"
                  >
                    {inviting === client.id ? 'Sending…' : 'Send Invite'}
                  </Button>
                ) : (
                  <span className="text-xs text-amber-400/70">Add email first</span>
                )}
                {isAdmin && client.clerkId && (
                  <button
                    type="button"
                    onClick={() => setExpanded(isOpen ? null : client.id)}
                    className="text-gray-500 hover:text-white transition-colors"
                  >
                    {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                )}
              </div>
            </div>

            {isAdmin && isOpen && client.clerkId && (
              <div className="border-t border-white/5 px-4 pb-4 pt-3 space-y-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-600">Portal permissions</p>
                {PERMISSION_TOGGLES.map(({ key, label }) => (
                  <div key={key} className="flex items-center justify-between">
                    <Label className="text-sm text-gray-400">{label}</Label>
                    <Switch
                      checked={perms[key]}
                      disabled={permSaving === `${client.id}-${key}`}
                      onCheckedChange={(val) => handlePermToggle(client.id, key, val)}
                      className="data-[state=checked]:bg-[#00d4ff]"
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 3: Update PATCH /api/clients/[id] to accept portalPermissions**

Open `src/app/api/clients/[id]/route.ts`. Add `portalPermissions` to the `UpdateClientSchema`:

```typescript
const UpdateClientSchema = z.object({
  name:               z.string().min(1).optional(),
  contactName:        z.string().optional().nullable(),
  email:              z.string().email().optional().nullable(),
  phone:              z.string().optional().nullable(),
  website:            z.string().url().optional().nullable(),
  portalPermissions:  z.record(z.boolean()).optional(),
})
```

- [ ] **Step 4: Create portal settings page**

Create `src/app/(dashboard)/settings/portal/page.tsx`:

```typescript
import { redirect } from 'next/navigation'
import { db, withTenant } from '@/lib/db'
import { getCurrentUserRole, getCurrentTenantId } from '@/lib/auth'
import { PortalPermissionsPanel } from '@/components/settings/PortalPermissionsPanel'

export default async function PortalSettingsPage() {
  const tenantId = await getCurrentTenantId()
  if (!tenantId) redirect('/sign-in')

  const role = await getCurrentUserRole()
  if (role !== 'admin' && role !== 'manager') redirect('/settings/account')

  const clients = await withTenant(tenantId, () =>
    db.client.findMany({
      where:   { deletedAt: null },
      select:  {
        id:               true,
        name:             true,
        contactName:      true,
        email:            true,
        clerkId:          true,
        portalPermissions: true,
      },
      orderBy: { name: 'asc' },
    })
  )

  const clientRows = clients.map(c => ({
    id:               c.id,
    name:             c.name,
    contactName:      c.contactName,
    email:            c.email,
    clerkId:          c.clerkId,
    portalPermissions: (c.portalPermissions ?? {}) as {
      viewPipeline?: boolean
      movePipeline?: boolean
      viewReports?:  boolean
    },
  }))

  return (
    <PortalPermissionsPanel
      clients={clientRows}
      isAdmin={role === 'admin'}
    />
  )
}
```

- [ ] **Step 5: Verify TypeScript and run all tests**

```bash
cd /Users/hannaholsson/LeadforceCRM && npx tsc --noEmit 2>&1 | head -20
cd /Users/hannaholsson/LeadforceCRM && npx vitest run 2>&1 | tail -10
```

Expected: no TypeScript errors, all tests pass.

- [ ] **Step 6: Commit**

```bash
git -C /Users/hannaholsson/LeadforceCRM add src/app/api/clients/\[id\]/portal-invite/route.ts src/app/api/clients/\[id\]/route.ts src/components/settings/PortalPermissionsPanel.tsx src/app/\(dashboard\)/settings/portal/page.tsx
git -C /Users/hannaholsson/LeadforceCRM commit -m "Add Client Portal settings section with invite and permission management"
```

---

## Self-Review Checklist

**Spec coverage:**
- [x] Company section: name, timezone, logo placeholder — Tasks 6
- [x] Dialer thresholds: all 4 configurable values — Task 7
- [x] outcome-router reads from TenantSettings — Task 7
- [x] Team delegation: canManageCampaigns, canAccessDashboard, canWritePipeline — Task 8
- [x] Client portal: invite, resend, permission toggles — Task 9
- [x] Account: display name, timezone, notification placeholder, Clerk link — Task 5
- [x] Role gating: admin-only sections redirect non-admins — Tasks 4, 6, 7
- [x] Manager sees only their SDRs in Team section — Tasks 8
- [x] SdrPermissionOverrides added to hasPermission — Task 3
- [x] Sidebar shows logo when set — Task 6

**Type consistency:**
- `DialerThresholds` type defined in Task 7 Step 3, used in Step 5 and Step 6
- `SdrPermissionOverrides` defined in Task 3, exported from auth.ts
- `DEFAULT_DIALER_THRESHOLDS` exported from outcome-router.ts, used in log-outcome route and tests
- `PortalPermissions` type used consistently in Task 9
- `tenantId_userId` compound key in `db.sdrPermission.upsert` matches `@@unique([tenantId, userId])` in schema
