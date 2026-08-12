# Phase 6a — Client Portal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an invite-based client portal at `/client-portal/` where clients can view campaign KPIs and manage their pipeline, with permissions controlled by a `portalPermissions` JSON field on the `Client` record.

**Architecture:** Clients receive a Clerk invitation with `publicMetadata: { role: 'client', clientId }`. On first sign-in, the Clerk webhook links the Clerk user to the `Client` record and provisions a `User` row. The portal lives in a separate Next.js route group with its own minimal layout. The internal `KanbanBoard` is extended with `readOnly`/`hideHeader` props and read-only column/card variants so the portal can reuse it.

**Tech Stack:** Next.js 14 App Router, Prisma (PostgreSQL), Clerk (invitations + webhooks), @dnd-kit/core, Tailwind CSS, Shadcn/UI, Vitest

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Modify | `prisma/schema.prisma` | Add `clerkId`, `portalPermissions` to `Client` |
| Modify | `src/lib/auth.ts` | Add `pipeline:write` to `client` role |
| Modify | `src/lib/__tests__/auth.test.ts` | Cover new `client` pipeline:write permission |
| Create | `src/lib/client-portal.ts` | `getClientPermission`, `getCurrentClientRecord`, portal data fetchers |
| Create | `src/lib/__tests__/client-portal.test.ts` | Unit tests for `getClientPermission` |
| Create | `src/app/api/clients/[id]/portal-invite/route.ts` | Send Clerk invitation |
| Modify | `src/app/api/webhooks/clerk/route.ts` | Handle client portal `user.created` |
| Modify | `src/components/clients/ClientDrawer.tsx` | Portal invite section |
| Modify | `src/components/clients/ClientsTable.tsx` | Portal invite in row dropdown |
| Modify | `src/middleware.ts` | Route `client` role → `/client-portal/` |
| Create | `src/components/pipeline/ReadOnlyDealCard.tsx` | Static deal card (no DnD hooks) |
| Create | `src/components/pipeline/ReadOnlyKanbanColumn.tsx` | Static column (no DnD hooks) |
| Modify | `src/components/pipeline/KanbanBoard.tsx` | Add `readOnly`, `hideHeader` props |
| Create | `src/components/client-portal/PortalHeader.tsx` | Minimal portal header |
| Create | `src/components/client-portal/PortalPending.tsx` | Holding state while webhook fires |
| Create | `src/app/client-portal/layout.tsx` | Portal shell — auth guard + header |
| Create | `src/components/client-portal/PortalDealsList.tsx` | Compact deals list by stage |
| Create | `src/app/client-portal/page.tsx` | Portal dashboard — KPIs + deals list |
| Create | `src/app/client-portal/pipeline/page.tsx` | Portal pipeline — scoped KanbanBoard |

---

## Task 1: Schema — add portal fields to `Client`

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add fields to `Client` model**

Open `prisma/schema.prisma`. Find the `Client` model (starts around line 105) and add two fields after `deletedAt`:

```prisma
model Client {
  id          String     @id @default(cuid())
  tenantId    String
  name        String
  contactName String?
  email       String?
  phone       String?
  website     String?
  createdAt   DateTime   @default(now())
  updatedAt   DateTime   @updatedAt
  deletedAt   DateTime?
  // Future: migrate clerkId + portalPermissions to a ClientPortalAccess model
  // to support multiple portal users per client (Approach B from design doc).
  clerkId           String?   @unique
  portalPermissions Json      @default("{}")
  tenant      Tenant     @relation(fields: [tenantId], references: [id])
  campaigns   Campaign[]
  pipelineStages PipelineStage[]
  pipelineDeals  PipelineDeal[]
}
```

- [ ] **Step 2: Run migration**

```bash
npx prisma migrate dev --name add-client-portal-fields
```

Expected output: `The following migration(s) have been applied: .../add_client_portal_fields`

- [ ] **Step 3: Regenerate Prisma client**

```bash
npx prisma generate
```

Expected: `Generated Prisma Client`

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "Add clerkId and portalPermissions to Client model"
```

---

## Task 2: Auth — add `pipeline:write` to client role

**Files:**
- Modify: `src/lib/auth.ts`
- Modify: `src/lib/__tests__/auth.test.ts`

- [ ] **Step 1: Write failing test**

Open `src/lib/__tests__/auth.test.ts`. Find the `it('grants client only campaigns:read'` test and add an assertion:

```ts
it('grants client campaigns:read and pipeline:read and pipeline:write', () => {
  expect(hasPermission('client', 'campaigns:read')).toBe(true)
  expect(hasPermission('client', 'pipeline:read')).toBe(true)
  expect(hasPermission('client', 'pipeline:write')).toBe(true)
  expect(hasPermission('client', 'clients:read')).toBe(false)
  expect(hasPermission('client', 'contacts:read')).toBe(false)
})
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
npx vitest run src/lib/__tests__/auth.test.ts
```

Expected: FAIL — `hasPermission('client', 'pipeline:write')` returns false

- [ ] **Step 3: Update client permissions in `src/lib/auth.ts`**

Change line 25:

```ts
client:  ['campaigns:read', 'pipeline:read', 'pipeline:write'],
```

- [ ] **Step 4: Run test to confirm it passes**

```bash
npx vitest run src/lib/__tests__/auth.test.ts
```

Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth.ts src/lib/__tests__/auth.test.ts
git commit -m "Add pipeline:write permission to client role"
```

---

## Task 3: `getClientPermission` helper and portal data fetchers

**Files:**
- Create: `src/lib/client-portal.ts`
- Create: `src/lib/__tests__/client-portal.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/lib/__tests__/client-portal.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { getClientPermission } from '../client-portal'

describe('getClientPermission', () => {
  it('returns true for empty permissions (default allow-all)', () => {
    expect(getClientPermission({}, 'pipeline.write')).toBe(true)
  })

  it('returns true when the nested key is absent', () => {
    expect(getClientPermission({ pipeline: { read: true } }, 'pipeline.write')).toBe(true)
  })

  it('returns false when the nested key is explicitly false', () => {
    expect(getClientPermission({ pipeline: { write: false } }, 'pipeline.write')).toBe(false)
  })

  it('returns true when the nested key is explicitly true', () => {
    expect(getClientPermission({ pipeline: { write: true } }, 'pipeline.write')).toBe(true)
  })

  it('returns true for single-level key that is absent', () => {
    expect(getClientPermission({}, 'campaigns')).toBe(true)
  })

  it('returns false for single-level key explicitly set to false', () => {
    expect(getClientPermission({ campaigns: false }, 'campaigns')).toBe(false)
  })

  it('returns true when permissions is null', () => {
    expect(getClientPermission(null, 'pipeline.write')).toBe(true)
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx vitest run src/lib/__tests__/client-portal.test.ts
```

Expected: FAIL — `getClientPermission` not found

- [ ] **Step 3: Create `src/lib/client-portal.ts`**

```ts
import { currentUser } from '@clerk/nextjs/server'
import { db, withTenant } from '@/lib/db'
import type { Prisma } from '@prisma/client'

// Intentionally called outside withTenant — we look up by clerkId which is unique
// across all tenants. The result gives us tenantId for subsequent scoped queries.
export async function getCurrentClientRecord() {
  const user = await currentUser()
  if (!user) return null
  return db.client.findUnique({ where: { clerkId: user.id } })
}

// Resolves a dot-notation key against portalPermissions JSON.
// Returns true when the key is absent — restrictions must be explicitly set to false.
export function getClientPermission(permissions: Prisma.JsonValue, key: string): boolean {
  const parts = key.split('.')
  let current: unknown = permissions
  for (const part of parts) {
    if (typeof current !== 'object' || current === null) return true
    current = (current as Record<string, unknown>)[part]
  }
  if (current === undefined || current === null) return true
  return Boolean(current)
}

export async function getPortalSummary(clientId: string, tenantId: string) {
  return withTenant(tenantId, async () => {
    const [activeCampaigns, meetingsBooked, openDeals] = await Promise.all([
      db.campaign.count({ where: { clientId, status: 'active' } }),
      db.callRecord.count({ where: { campaign: { clientId }, outcome: 'meeting_booked' } }),
      db.pipelineDeal.findMany({
        where:  { clientId, closedAt: null },
        select: { id: true, value: true },
      }),
    ])
    const openDealCount = openDeals.length
    const openDealValue = openDeals.reduce((sum, d) => sum + (d.value ? Number(d.value) : 0), 0)
    return { activeCampaigns, meetingsBooked, openDealCount, openDealValue }
  })
}

export async function getPortalDealsGrouped(clientId: string, tenantId: string) {
  return withTenant(tenantId, async () => {
    const [stages, deals] = await Promise.all([
      db.pipelineStage.findMany({
        where:   { clientId },
        select:  { id: true, name: true, color: true, position: true },
        orderBy: { position: 'asc' },
      }),
      db.pipelineDeal.findMany({
        where:   { clientId, closedAt: null },
        select:  {
          id:      true,
          title:   true,
          value:   true,
          stageId: true,
          contact: { select: { firstName: true, lastName: true, companyName: true } },
        },
        orderBy: { createdAt: 'desc' },
        take:    20,
      }),
    ])
    // Convert Prisma Decimal to string so PortalDealsList receives string | null
    const deals = rawDeals.map((d) => ({ ...d, value: d.value != null ? d.value.toString() : null }))
    return { stages, deals }
  })
}

export async function getPortalPipelineData(clientId: string, tenantId: string) {
  return withTenant(tenantId, async () => {
    const [rawStages, rawDeals] = await Promise.all([
      db.pipelineStage.findMany({
        where:   { clientId },
        select:  { id: true, name: true, color: true, position: true },
        orderBy: { position: 'asc' },
      }),
      db.pipelineDeal.findMany({
        where:  { clientId },
        select: {
          id:        true,
          stageId:   true,
          clientId:  true,
          title:     true,
          value:     true,
          notes:     true,
          source:    true,
          createdAt: true,
          contact:   { select: { firstName: true, lastName: true, companyName: true } },
          campaign:  { select: { name: true } },
        },
      }),
    ])
    return { rawStages, rawDeals }
  })
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx vitest run src/lib/__tests__/client-portal.test.ts
```

Expected: 7 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/client-portal.ts src/lib/__tests__/client-portal.test.ts
git commit -m "Add client portal helpers: getClientPermission, data fetchers"
```

---

## Task 4: Portal invite API route

**Files:**
- Create: `src/app/api/clients/[id]/portal-invite/route.ts`

- [ ] **Step 1: Create the route file**

Create `src/app/api/clients/[id]/portal-invite/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { auth, clerkClient } from '@clerk/nextjs/server'
import { db, withTenant } from '@/lib/db'
import { getClerkMeta, hasPermission } from '@/lib/auth'

export async function POST(
  _req: NextRequest,
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

    const client = await withTenant(tenantId, () =>
      db.client.findUnique({ where: { id } })
    )

    if (!client)          return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (client.clerkId)   return NextResponse.json({ error: 'Portal already active' }, { status: 409 })
    if (!client.email)    return NextResponse.json({ error: 'Client has no email address' }, { status: 400 })

    const clerk = await clerkClient()
    await clerk.invitations.createInvitation({
      emailAddress:   client.email,
      publicMetadata: { role: 'client', clientId: client.id },
    })

    return NextResponse.json({ data: { sent: true } })
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/clients/[id]/portal-invite/route.ts
git commit -m "Add portal invite API route POST /api/clients/[id]/portal-invite"
```

---

## Task 5: Extend Clerk webhook for portal users

**Files:**
- Modify: `src/app/api/webhooks/clerk/route.ts`

- [ ] **Step 1: Replace the webhook handler**

Rewrite `src/app/api/webhooks/clerk/route.ts` in full:

```ts
import { headers } from 'next/headers'
import { Webhook } from 'svix'
import type { WebhookEvent } from '@clerk/nextjs/server'
import { clerkClient } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import type { UserRole } from '@prisma/client'

export async function POST(req: Request) {
  const WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SECRET
  if (!WEBHOOK_SECRET) {
    return new Response('CLERK_WEBHOOK_SECRET not configured', { status: 500 })
  }

  const headerPayload = await headers()
  const svixId        = headerPayload.get('svix-id')
  const svixTimestamp = headerPayload.get('svix-timestamp')
  const svixSignature = headerPayload.get('svix-signature')

  if (!svixId || !svixTimestamp || !svixSignature) {
    return new Response('Missing svix headers', { status: 400 })
  }

  const body = await req.text()

  const wh = new Webhook(WEBHOOK_SECRET)
  let evt: WebhookEvent

  try {
    evt = wh.verify(body, {
      'svix-id':        svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': svixSignature,
    }) as WebhookEvent
  } catch {
    return new Response('Invalid webhook signature', { status: 400 })
  }

  if (evt.type === 'user.created') {
    const { id, unsafe_metadata, public_metadata, email_addresses, first_name, last_name } = evt.data
    const email = email_addresses?.[0]?.email_address ?? ''
    const name  = [first_name, last_name].filter(Boolean).join(' ') || email

    // Client portal path: Clerk invitation carries publicMetadata.clientId
    const clientId = (public_metadata as Record<string, string> | undefined)?.clientId
    if (clientId) {
      const clientRecord = await db.client.findUnique({ where: { id: clientId } })
      if (clientRecord) {
        const clerk = await clerkClient()
        await clerk.users.updateUser(id, {
          publicMetadata: { role: 'client', tenantId: clientRecord.tenantId },
        })
        await db.client.update({ where: { id: clientId }, data: { clerkId: id } })
        await db.user.upsert({
          where:  { clerkId: id },
          create: { clerkId: id, tenantId: clientRecord.tenantId, email, name, role: 'client' },
          update: { email, name, role: 'client' },
        })
      }
      return new Response('OK', { status: 200 })
    }

    // Internal user path (SDR, manager, admin): unsafe_metadata carries role + tenantId
    const role     = ((unsafe_metadata?.role as string) ?? 'sdr') as UserRole
    const tenantId = (unsafe_metadata?.tenantId as string) ?? null

    const clerk = await clerkClient()
    await clerk.users.updateUser(id, {
      publicMetadata: { role, tenantId },
    })

    if (tenantId) {
      await db.user.upsert({
        where:  { clerkId: id },
        create: { clerkId: id, tenantId, email, name, role },
        update: { email, name, role },
      })
    }
  }

  return new Response('OK', { status: 200 })
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/webhooks/clerk/route.ts
git commit -m "Handle client portal user.created in Clerk webhook"
```

---

## Task 6: Invite UI in `ClientDrawer`

**Files:**
- Modify: `src/components/clients/ClientDrawer.tsx`

- [ ] **Step 1: Update the drawer**

Replace the full content of `src/components/clients/ClientDrawer.tsx`:

```tsx
'use client'

import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import type { z } from 'zod'
import { SlideDrawer } from '@/components/shared/SlideDrawer'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createClient, updateClient, ClientSchema } from '@/app/(dashboard)/clients/actions'
import type { ClientWithCampaignCount } from '@/types/models'

type ClientFormData = z.infer<typeof ClientSchema>

interface ClientDrawerProps {
  open: boolean
  onClose: () => void
  client: ClientWithCampaignCount | null
}

const inputClass =
  'bg-white/5 border-white/10 text-white placeholder:text-gray-600 focus:border-[#00d4ff]/50 focus:ring-1 focus:ring-[#00d4ff]/10 rounded-xl'

export function ClientDrawer({ open, onClose, client }: ClientDrawerProps) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ClientFormData>({ resolver: zodResolver(ClientSchema) })

  const [inviteLoading, setInviteLoading] = useState(false)
  const [inviteSent, setInviteSent]       = useState(false)

  useEffect(() => {
    reset({
      name:        client?.name ?? '',
      contactName: client?.contactName ?? '',
      email:       client?.email ?? '',
      phone:       client?.phone ?? '',
      website:     client?.website ?? '',
    })
    setInviteSent(false)
  }, [client, reset, open])

  const onSubmit = async (data: ClientFormData) => {
    if (client) {
      await updateClient(client.id, data)
    } else {
      await createClient(data)
    }
    onClose()
  }

  const handleSendInvite = async () => {
    if (!client) return
    setInviteLoading(true)
    try {
      const res = await fetch(`/api/clients/${client.id}/portal-invite`, { method: 'POST' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        toast.error((body as { error?: string }).error ?? 'Failed to send invite')
      } else {
        setInviteSent(true)
        toast.success('Portal invite sent!')
      }
    } finally {
      setInviteLoading(false)
    }
  }

  return (
    <SlideDrawer open={open} onClose={onClose} title={client ? 'Edit Client' : 'New Client'}>
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col flex-1 overflow-hidden">
        <div className="flex-1 overflow-y-auto p-6 space-y-5 custom-scrollbar">
          <div className="space-y-1.5">
            <Label className="text-xs text-gray-400">Company Name *</Label>
            <Input {...register('name')} placeholder="Acme Corporation" className={inputClass} />
            {errors.name && <p className="text-xs text-red-400">{errors.name.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-gray-400">Contact Name</Label>
            <Input {...register('contactName')} placeholder="John Smith" className={inputClass} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-gray-400">Email</Label>
            <Input {...register('email')} type="email" placeholder="john@acme.com" className={inputClass} />
            {errors.email && <p className="text-xs text-red-400">{errors.email.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-gray-400">Phone</Label>
            <Input {...register('phone')} placeholder="+1 555 000 0000" className={inputClass} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-gray-400">Website</Label>
            <Input {...register('website')} placeholder="https://acme.com" className={inputClass} />
            {errors.website && <p className="text-xs text-red-400">{errors.website.message}</p>}
          </div>

          {client && (
            <div className="border-t border-white/5 pt-5">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold text-gray-400">Client Portal</p>
                  <p className="text-xs text-gray-600 mt-0.5">
                    {client.clerkId
                      ? 'Portal access is active'
                      : 'Send an invite to grant portal access'}
                  </p>
                </div>
                {client.clerkId ? (
                  <Badge className="bg-emerald-500/10 text-emerald-400 border-0 text-[10px] flex-shrink-0">
                    Active
                  </Badge>
                ) : (
                  <Button
                    type="button"
                    size="sm"
                    disabled={!client.email || inviteLoading || inviteSent}
                    onClick={handleSendInvite}
                    className="flex-shrink-0 bg-white/5 border border-white/10 text-gray-300 hover:bg-white/10 rounded-xl text-xs disabled:opacity-40"
                  >
                    {inviteSent ? 'Invite Sent ✓' : inviteLoading ? 'Sending…' : 'Send Invite'}
                  </Button>
                )}
              </div>
              {!client.email && !client.clerkId && (
                <p className="text-[11px] text-amber-400/70 mt-2">
                  Add an email address to enable portal access
                </p>
              )}
            </div>
          )}
        </div>

        <div className="flex-shrink-0 border-t border-white/5 p-6 flex gap-3">
          <Button
            type="submit"
            disabled={isSubmitting}
            className="flex-1 bg-gradient-to-r from-[#00d4ff] to-cyan-600 text-black font-semibold rounded-xl shadow-xl hover:opacity-90"
          >
            {isSubmitting ? 'Saving…' : client ? 'Save Changes' : 'Create Client'}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            className="bg-white/5 border-white/10 text-gray-300 hover:bg-white/10 rounded-xl"
          >
            Cancel
          </Button>
        </div>
      </form>
    </SlideDrawer>
  )
}
```

- [ ] **Step 2: Add "Send Invite" to `ClientsTable` dropdown**

Open `src/components/clients/ClientsTable.tsx`. Add state and handler at the top of the component:

```tsx
const [invitingId, setInvitingId] = useState<string | null>(null)

const handleSendInvite = async (client: ClientWithCampaignCount, e: React.MouseEvent) => {
  e.stopPropagation()
  setInvitingId(client.id)
  try {
    const res = await fetch(`/api/clients/${client.id}/portal-invite`, { method: 'POST' })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      toast.error((body as { error?: string }).error ?? 'Failed to send invite')
    } else {
      toast.success('Portal invite sent!')
    }
  } finally {
    setInvitingId(null)
  }
}
```

Add `import { toast } from 'sonner'` at the top. Then inside the `DropdownMenuContent` for each row, add after the Edit item:

```tsx
{!client.clerkId && client.email && (
  <DropdownMenuItem
    onClick={(e) => handleSendInvite(client, e)}
    disabled={invitingId === client.id}
    className="text-gray-300 hover:text-white rounded-lg cursor-pointer"
  >
    {invitingId === client.id ? 'Sending…' : 'Send Portal Invite'}
  </DropdownMenuItem>
)}
{client.clerkId && (
  <DropdownMenuItem disabled className="text-emerald-400 rounded-lg text-xs">
    Portal Active
  </DropdownMenuItem>
)}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/clients/ClientDrawer.tsx src/components/clients/ClientsTable.tsx
git commit -m "Add portal invite UI to ClientDrawer and ClientsTable"
```

---

## Task 7: Middleware — route client role to portal

**Files:**
- Modify: `src/middleware.ts`

- [ ] **Step 1: Replace middleware**

Rewrite `src/middleware.ts` in full:

```ts
import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'

const isPublicRoute = createRouteMatcher([
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/invite(.*)',
  '/api/webhooks(.*)',
])

const isPortalRoute    = createRouteMatcher(['/client-portal(.*)'])
const isDashboardRoute = createRouteMatcher([
  '/',
  '/campaigns(.*)',
  '/contacts(.*)',
  '/calling(.*)',
  '/pipeline(.*)',
  '/schedule(.*)',
  '/reports(.*)',
  '/imports(.*)',
  '/clients(.*)',
  '/settings(.*)',
])

export default clerkMiddleware(async (auth, request) => {
  if (isPublicRoute(request)) return

  await auth.protect()

  const { sessionClaims } = await auth()
  const role = (sessionClaims?.publicMetadata as { role?: string } | undefined)?.role

  if (role === 'client' && isDashboardRoute(request)) {
    return NextResponse.redirect(new URL('/client-portal', request.url))
  }
  if (role && role !== 'client' && isPortalRoute(request)) {
    return NextResponse.redirect(new URL('/', request.url))
  }
})

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
}
```

- [ ] **Step 2: Commit**

```bash
git add src/middleware.ts
git commit -m "Route client role to /client-portal in middleware"
```

---

## Task 8: Read-only pipeline components

**Files:**
- Create: `src/components/pipeline/ReadOnlyDealCard.tsx`
- Create: `src/components/pipeline/ReadOnlyKanbanColumn.tsx`

These are visual clones of `DealCard` and `KanbanColumn` without DnD hooks.
They must not be used inside a `DndContext`.

- [ ] **Step 1: Create `ReadOnlyDealCard`**

Create `src/components/pipeline/ReadOnlyDealCard.tsx`:

```tsx
import type { PipelineDealRow } from '@/types/models'

interface ReadOnlyDealCardProps {
  deal:       PipelineDealRow
  stageColor: string
}

export function ReadOnlyDealCard({ deal, stageColor }: ReadOnlyDealCardProps) {
  return (
    <div
      style={{ borderLeftColor: stageColor }}
      className="glass-panel rounded-2xl p-4 border-l-2"
    >
      <div className="min-w-0">
        <p className="text-sm font-semibold text-white truncate">
          {deal.contact.firstName} {deal.contact.lastName}
        </p>
        {deal.contact.companyName && (
          <p className="text-xs text-gray-400 truncate mt-0.5">{deal.contact.companyName}</p>
        )}
      </div>
      <p className="text-[11px] text-gray-500 mt-2 truncate">{deal.campaign.name}</p>
      <div className="flex items-center justify-between mt-2">
        {deal.value ? (
          <span className="font-mono text-[11px] text-[#00d4ff]">£{deal.value}</span>
        ) : (
          <span />
        )}
        <span className="text-[10px] text-gray-600">
          {new Date(deal.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
        </span>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create `ReadOnlyKanbanColumn`**

Create `src/components/pipeline/ReadOnlyKanbanColumn.tsx`:

```tsx
import { ReadOnlyDealCard } from './ReadOnlyDealCard'
import type { PipelineStageRow, PipelineDealRow } from '@/types/models'

interface ReadOnlyKanbanColumnProps {
  stage: PipelineStageRow
  deals: PipelineDealRow[]
}

export function ReadOnlyKanbanColumn({ stage, deals }: ReadOnlyKanbanColumnProps) {
  return (
    <div className="flex-shrink-0 w-72">
      <div className="flex items-center gap-2 mb-3">
        <span
          className="w-2.5 h-2.5 rounded-full flex-shrink-0"
          style={{ backgroundColor: stage.color }}
        />
        <span className="text-sm font-semibold text-white">{stage.name}</span>
        <span className="ml-auto font-mono text-[10px] bg-[#00d4ff]/10 text-[#00d4ff] px-2 py-0.5 rounded-full">
          {deals.length}
        </span>
      </div>
      <div className="min-h-[200px] rounded-2xl p-2 space-y-2">
        {deals.map((deal) => (
          <ReadOnlyDealCard key={deal.id} deal={deal} stageColor={stage.color} />
        ))}
        {deals.length === 0 && (
          <div className="h-24 rounded-xl border border-dashed border-white/10 flex items-center justify-center">
            <span className="text-xs text-gray-600">No deals</span>
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/pipeline/ReadOnlyDealCard.tsx src/components/pipeline/ReadOnlyKanbanColumn.tsx
git commit -m "Add ReadOnlyDealCard and ReadOnlyKanbanColumn for portal pipeline"
```

---

## Task 9: Extend `KanbanBoard` with `readOnly` and `hideHeader` props

**Files:**
- Modify: `src/components/pipeline/KanbanBoard.tsx`

- [ ] **Step 1: Replace `KanbanBoard`**

Rewrite `src/components/pipeline/KanbanBoard.tsx` in full:

```tsx
'use client'

import { useState } from 'react'
import { DndContext, DragEndEvent, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import { Kanban } from 'lucide-react'
import { toast } from 'sonner'
import { KanbanColumn } from './KanbanColumn'
import { ReadOnlyKanbanColumn } from './ReadOnlyKanbanColumn'
import { ClientSelector } from './ClientSelector'
import type { PipelineStageRow, PipelineDealRow } from '@/types/models'

interface KanbanBoardProps {
  clients?:          { id: string; name: string }[]
  selectedClientId?: string
  stages:            PipelineStageRow[]
  initialDeals:      PipelineDealRow[]
  readOnly?:         boolean
  hideHeader?:       boolean
}

function groupByStage(deals: PipelineDealRow[]): Record<string, PipelineDealRow[]> {
  return deals.reduce<Record<string, PipelineDealRow[]>>((acc, deal) => {
    ;(acc[deal.stageId] ??= []).push(deal)
    return acc
  }, {})
}

export function KanbanBoard({
  clients,
  selectedClientId,
  stages,
  initialDeals,
  readOnly   = false,
  hideHeader = false,
}: KanbanBoardProps) {
  const [dealsByStage, setDealsByStage] = useState(() => groupByStage(initialDeals))

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  )

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over) return

    const dealId     = String(active.id)
    const newStageId = String(over.id)

    const currentStageId = Object.keys(dealsByStage).find((sid) =>
      dealsByStage[sid]?.some((d) => d.id === dealId)
    )
    if (!currentStageId || currentStageId === newStageId) return

    const deal = dealsByStage[currentStageId].find((d) => d.id === dealId)!

    setDealsByStage((prev) => {
      const next = { ...prev }
      next[currentStageId] = prev[currentStageId].filter((d) => d.id !== dealId)
      next[newStageId]     = [...(prev[newStageId] ?? []), { ...deal, stageId: newStageId }]
      return next
    })

    try {
      const res = await fetch(`/api/pipeline/deals/${dealId}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ stageId: newStageId }),
      })
      if (!res.ok) throw new Error()
    } catch {
      setDealsByStage((prev) => {
        const next = { ...prev }
        next[newStageId]     = prev[newStageId].filter((d) => d.id !== dealId)
        next[currentStageId] = [...(prev[currentStageId] ?? []), { ...deal, stageId: currentStageId }]
        return next
      })
      toast.error('Failed to move deal — please try again')
    }
  }

  return (
    <div>
      {!hideHeader && (
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-white">Pipeline</h1>
            <p className="text-sm text-gray-400 mt-0.5">Track deals through your sales stages</p>
          </div>
          {clients && selectedClientId && (
            <ClientSelector clients={clients} selectedClientId={selectedClientId} />
          )}
        </div>
      )}

      {stages.length === 0 ? (
        <div className="glass-panel rounded-3xl p-12 flex flex-col items-center justify-center gap-4 text-center">
          <Kanban className="w-10 h-10 text-gray-600" />
          <div>
            <p className="text-gray-400 text-sm font-medium">No pipeline stages configured</p>
            <p className="text-gray-600 text-xs mt-1">Add stages in Settings to get started.</p>
          </div>
        </div>
      ) : readOnly ? (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {stages.map((stage) => (
            <ReadOnlyKanbanColumn
              key={stage.id}
              stage={stage}
              deals={dealsByStage[stage.id] ?? []}
            />
          ))}
        </div>
      ) : (
        <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
          <div className="flex gap-4 overflow-x-auto pb-4">
            {stages.map((stage) => (
              <KanbanColumn
                key={stage.id}
                stage={stage}
                deals={dealsByStage[stage.id] ?? []}
              />
            ))}
          </div>
        </DndContext>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify the internal pipeline page still works**

The existing `src/app/(dashboard)/pipeline/page.tsx` passes `clients`, `selectedClientId`, `stages`, `initialDeals` — these are all still present in the props interface (now optional but still accepted). No changes needed there.

- [ ] **Step 3: Commit**

```bash
git add src/components/pipeline/KanbanBoard.tsx
git commit -m "Add readOnly and hideHeader props to KanbanBoard"
```

---

## Task 10: `PortalHeader` and `PortalPending` components

**Files:**
- Create: `src/components/client-portal/PortalHeader.tsx`
- Create: `src/components/client-portal/PortalPending.tsx`

- [ ] **Step 1: Create `PortalHeader`**

```bash
mkdir -p src/components/client-portal
```

Create `src/components/client-portal/PortalHeader.tsx`:

```tsx
'use client'

import { UserButton } from '@clerk/nextjs'

interface PortalHeaderProps {
  clientName: string
}

export function PortalHeader({ clientName }: PortalHeaderProps) {
  return (
    <header className="flex-shrink-0 h-20 sticky top-0 z-10 flex items-center justify-between px-8 border-b border-white/5 bg-dark">
      <div className="flex items-center gap-3">
        <span className="font-bold text-white text-lg tracking-tight">
          Lead<span className="text-[#00d4ff]">Force</span>
        </span>
        <span className="w-px h-5 bg-white/10" />
        <span className="text-sm text-gray-400 truncate max-w-xs">{clientName}</span>
      </div>
      <UserButton
        appearance={{
          elements: {
            avatarBox:                      'w-9 h-9 rounded-xl',
            userButtonPopoverCard:          'glass-panel border border-white/10 rounded-2xl',
            userButtonPopoverActionButton:  'text-gray-300 hover:text-white hover:bg-white/5 rounded-xl',
            userButtonPopoverActionButtonText: 'text-sm',
          },
        }}
      />
    </header>
  )
}
```

- [ ] **Step 2: Create `PortalPending`**

Create `src/components/client-portal/PortalPending.tsx`:

```tsx
'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'

export function PortalPending() {
  const router = useRouter()

  useEffect(() => {
    const timer = setInterval(() => router.refresh(), 5000)
    return () => clearInterval(timer)
  }, [router])

  return (
    <div className="min-h-screen bg-dark flex items-center justify-center">
      <div className="glass-panel rounded-3xl p-12 flex flex-col items-center gap-4 text-center max-w-sm">
        <Loader2 className="w-8 h-8 text-[#00d4ff] animate-spin" />
        <div>
          <p className="text-white font-semibold">Setting up your portal…</p>
          <p className="text-xs text-gray-500 mt-1">This only takes a moment.</p>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/client-portal/
git commit -m "Add PortalHeader and PortalPending components"
```

---

## Task 11: Client portal layout

**Files:**
- Create: `src/app/client-portal/layout.tsx`

- [ ] **Step 1: Create the layout**

```bash
mkdir -p src/app/client-portal
```

Create `src/app/client-portal/layout.tsx`:

```tsx
import { redirect } from 'next/navigation'
import { getCurrentUserRole } from '@/lib/auth'
import { getCurrentClientRecord } from '@/lib/client-portal'
import { PortalHeader } from '@/components/client-portal/PortalHeader'
import { PortalPending } from '@/components/client-portal/PortalPending'
import { Toaster } from '@/components/ui/sonner'

export default async function ClientPortalLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const role = await getCurrentUserRole()
  if (role !== 'client') redirect('/')

  const client = await getCurrentClientRecord()

  if (!client) {
    return <PortalPending />
  }

  return (
    <div className="flex flex-col min-h-screen bg-dark">
      <PortalHeader clientName={client.name} />
      <main className="flex-1 overflow-y-auto custom-scrollbar">
        {children}
      </main>
      <Toaster position="bottom-right" theme="dark" />
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/client-portal/layout.tsx
git commit -m "Add client portal layout with role guard and PortalHeader"
```

---

## Task 12: `PortalDealsList` component

**Files:**
- Create: `src/components/client-portal/PortalDealsList.tsx`

- [ ] **Step 1: Create the component**

Create `src/components/client-portal/PortalDealsList.tsx`:

```tsx
import Link from 'next/link'

interface PortalDeal {
  id:      string
  title:   string
  value:   string | null
  stageId: string
  contact: { firstName: string; lastName: string; companyName: string | null }
}

interface PortalStage {
  id:    string
  name:  string
  color: string
}

interface PortalDealsListProps {
  stages: PortalStage[]
  deals:  PortalDeal[]
}

export function PortalDealsList({ stages, deals }: PortalDealsListProps) {
  const dealsByStage = stages.reduce<Record<string, PortalDeal[]>>((acc, s) => {
    acc[s.id] = deals.filter((d) => d.stageId === s.id)
    return acc
  }, {})

  const stagesWithDeals = stages.filter((s) => (dealsByStage[s.id]?.length ?? 0) > 0)

  if (stagesWithDeals.length === 0) {
    return (
      <div className="glass-panel rounded-2xl p-8 flex flex-col items-center text-center">
        <p className="text-sm text-gray-500">No open deals yet</p>
      </div>
    )
  }

  return (
    <div className="glass-panel rounded-2xl overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/5">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500">Open Deals</h3>
        <Link href="/client-portal/pipeline" className="text-xs text-[#00d4ff] hover:underline">
          View full pipeline →
        </Link>
      </div>
      <div className="divide-y divide-white/5">
        {stagesWithDeals.map((stage) => (
          <div key={stage.id} className="px-5 py-3">
            <div className="flex items-center gap-2 mb-2">
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: stage.color }} />
              <span className="text-xs font-semibold text-gray-400">{stage.name}</span>
            </div>
            <div className="space-y-2">
              {dealsByStage[stage.id].map((deal) => (
                <div key={deal.id} className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <span className="text-sm text-white truncate block">
                      {deal.contact.firstName} {deal.contact.lastName}
                    </span>
                    {deal.contact.companyName && (
                      <span className="text-xs text-gray-500 truncate block">{deal.contact.companyName}</span>
                    )}
                  </div>
                  {deal.value && (
                    <span className="font-mono text-xs text-[#00d4ff] flex-shrink-0">£{deal.value}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/client-portal/PortalDealsList.tsx
git commit -m "Add PortalDealsList compact deals list component"
```

---

## Task 13: Portal dashboard page

**Files:**
- Create: `src/app/client-portal/page.tsx`

- [ ] **Step 1: Create the page**

Create `src/app/client-portal/page.tsx`:

```tsx
import { Target, PhoneCall, TrendingUp } from 'lucide-react'
import { KpiCard } from '@/components/dashboard/KpiCard'
import { PortalDealsList } from '@/components/client-portal/PortalDealsList'
import { getCurrentClientRecord, getPortalSummary, getPortalDealsGrouped } from '@/lib/client-portal'

export default async function ClientPortalDashboard() {
  const client = await getCurrentClientRecord()
  if (!client) return null  // layout shows PortalPending in this case

  const [summary, { stages, deals }] = await Promise.all([
    getPortalSummary(client.id, client.tenantId),
    getPortalDealsGrouped(client.id, client.tenantId),
  ])

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Overview</h1>
        <p className="text-sm text-gray-400 mt-0.5">Your campaign and pipeline summary</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiCard
          title="Active Campaigns"
          value={summary.activeCampaigns}
          format="number"
          sparkline={[]}
          trend={0}
          icon={<Target className="w-4 h-4" />}
        />
        <KpiCard
          title="Meetings Booked"
          value={summary.meetingsBooked}
          format="number"
          sparkline={[]}
          trend={0}
          icon={<PhoneCall className="w-4 h-4" />}
        />
        <KpiCard
          title="Open Deals"
          value={summary.openDealCount}
          format="number"
          sparkline={[]}
          trend={0}
          icon={<TrendingUp className="w-4 h-4" />}
        />
      </div>

      <PortalDealsList stages={stages} deals={deals} />
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/client-portal/page.tsx
git commit -m "Add portal dashboard page with KPI cards and deals list"
```

---

## Task 14: Portal pipeline page

**Files:**
- Create: `src/app/client-portal/pipeline/page.tsx`

- [ ] **Step 1: Create the page**

```bash
mkdir -p src/app/client-portal/pipeline
```

Create `src/app/client-portal/pipeline/page.tsx`:

```tsx
import { KanbanBoard } from '@/components/pipeline/KanbanBoard'
import { getCurrentClientRecord, getPortalPipelineData, getClientPermission } from '@/lib/client-portal'
import type { PipelineDealRow, PipelineStageRow } from '@/types/models'

export default async function ClientPortalPipelinePage() {
  const client = await getCurrentClientRecord()
  if (!client) return null  // layout shows PortalPending in this case

  const canWrite = getClientPermission(client.portalPermissions, 'pipeline.write')
  const { rawStages, rawDeals } = await getPortalPipelineData(client.id, client.tenantId)

  const stages: PipelineStageRow[] = rawStages

  const initialDeals: PipelineDealRow[] = rawDeals.map((d) => ({
    id:        d.id,
    stageId:   d.stageId,
    clientId:  d.clientId,
    title:     d.title,
    value:     d.value != null ? d.value.toString() : null,
    notes:     d.notes,
    source:    d.source,
    createdAt: d.createdAt.toISOString(),
    contact:   d.contact,
    campaign:  d.campaign,
  }))

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Pipeline</h1>
        <p className="text-sm text-gray-400 mt-0.5">Your open deals by stage</p>
      </div>
      <KanbanBoard
        stages={stages}
        initialDeals={initialDeals}
        readOnly={!canWrite}
        hideHeader
      />
    </div>
  )
}
```

- [ ] **Step 2: Run all tests**

```bash
npx vitest run
```

Expected: All tests PASS

- [ ] **Step 3: Commit**

```bash
git add src/app/client-portal/pipeline/page.tsx
git commit -m "Add portal pipeline page with permission-gated drag-and-drop"
```

---

## Verification checklist

After all tasks are complete:

- [ ] TypeScript build passes: `npx tsc --noEmit`
- [ ] Internal pipeline page (`/pipeline`) still works — `KanbanBoard` is backward-compatible (clients/selectedClientId are optional)
- [ ] A `client`-role user hitting `/campaigns` is redirected to `/client-portal`
- [ ] An `admin`-role user hitting `/client-portal` is redirected to `/`
- [ ] "Send Invite" button in `ClientDrawer` is hidden for clients without an email
- [ ] "Send Invite" button shows "Portal Active" badge when `client.clerkId` is set
