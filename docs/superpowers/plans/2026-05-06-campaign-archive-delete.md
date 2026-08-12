# Campaign Archive & Delete Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the silent soft-delete on campaigns with a two-path lifecycle system — archive (permanent, keeps data in reports, always recoverable) and delete (72-hour restore window, then hard-purged).

**Architecture:** `archivedAt DateTime?` is added alongside the existing `deletedAt` on Campaign. Campaign is removed from `SOFT_DELETE_MODELS` in `src/lib/db.ts` so all existing queries must declare explicit lifecycle filters. Three new API routes handle archive/unarchive/restore. The campaigns page gains two collapsible sections (Archived, Recently Deleted) below the main table, and a delete/archive modal replaces the `window.confirm`.

**Tech Stack:** Next.js 14 App Router, Prisma/PostgreSQL, Clerk auth, server actions, Shadcn/UI Dialog, Tailwind CSS, Vitest.

---

## File Map

### New files
| File | Purpose |
|------|---------|
| `src/app/api/campaigns/[id]/archive/route.ts` | POST — set archivedAt |
| `src/app/api/campaigns/[id]/unarchive/route.ts` | POST — clear archivedAt |
| `src/app/api/campaigns/[id]/restore/route.ts` | POST — clear deletedAt (72h check) |
| `src/lib/jobs/purge-deleted-campaigns.ts` | Core hard-delete purge logic |
| `src/app/api/cron/purge-campaigns/route.ts` | Secured cron endpoint calling purge |
| `src/app/(dashboard)/campaigns/actions.ts` | Server actions: delete, archive, unarchive, restore |
| `src/components/campaigns/ArchiveDeleteModal.tsx` | Archive/Delete choice modal |
| `src/components/campaigns/ArchivedSection.tsx` | Collapsible archived campaigns section |
| `src/components/campaigns/RecentlyDeletedSection.tsx` | Collapsible recently deleted section |

### Modified files
| File | Change |
|------|--------|
| `prisma/schema.prisma` | Add `archivedAt DateTime?` to Campaign |
| `src/lib/db.ts` | Remove Campaign from SOFT_DELETE_MODELS |
| `src/lib/reports.ts` | Add explicit lifecycle filters to getCampaignHealth, getDailyTargetStats (both paths), getMBBreakdown |
| `src/app/api/campaigns/route.ts` | Add `?section=` param, explicit `archivedAt: null, deletedAt: null` in default query |
| `src/app/api/campaigns/[id]/route.ts` | PATCH and DELETE use `updateMany` with `archivedAt: null, deletedAt: null` |
| `src/app/(dashboard)/campaigns/page.tsx` | Fetch all three sections; render ArchivedSection + RecentlyDeletedSection |
| `src/components/campaigns/CampaignsTable.tsx` | Replace `window.confirm` with ArchiveDeleteModal; add Archive menu item; accept `canManage` prop |
| `src/components/reports/CampaignFilter.tsx` | Accept `archivedAt` on campaign options; render "(archived)" label |
| `src/app/(dashboard)/reports/page.tsx` | Campaign query uses `deletedAt: null`; pass `archivedAt` to CampaignFilter |
| `src/types/models.ts` | Add `ArchivedCampaign` and `RecentlyDeletedCampaign` types |

---

## Important Patterns

**SOFT_DELETE_MODELS middleware** (in `src/lib/db.ts`) auto-injects `deletedAt: null` into `findMany`/`findFirst`/`findFirstOrThrow` for listed models. After removing Campaign from this set, **every** Campaign `findMany` query must declare `deletedAt: null` (and `archivedAt: null` where appropriate) explicitly or it will return deleted/archived campaigns.

**`count`, `aggregate`, `groupBy` are NOT covered by the tenant middleware** — any such call on a tenant-scoped model needs `tenantId` in its where clause explicitly. Existing calls in `reports.ts` already include this via a comment; preserve the pattern.

**`updateMany` vs `update`** — Prisma's `update` only accepts unique fields in `where`. To enforce lifecycle conditions (e.g., `archivedAt: null`), use `updateMany` which accepts arbitrary where clauses. Check `result.count === 0` to detect 404.

**Server actions auth pattern** — server actions call `auth()` from `@clerk/nextjs/server` to get `sessionClaims`, then read `publicMetadata` to extract `role` and `tenantId`. This is the same pattern used in API routes, but defined inline in the actions file.

---

### Task 1: Schema — add archivedAt to Campaign

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add archivedAt field**

In `prisma/schema.prisma`, find the Campaign model (line 122). Add `archivedAt DateTime?` after `deletedAt DateTime?`:

```prisma
model Campaign {
  id               String         @id @default(cuid())
  tenantId         String
  clientId         String
  name             String
  status           CampaignStatus @default(draft)
  dailyTargetCalls Int?
  targetLists      Json           @default("[]")
  createdAt        DateTime       @default(now())
  updatedAt        DateTime       @updatedAt
  deletedAt        DateTime?
  archivedAt       DateTime?
  tenant           Tenant         @relation(fields: [tenantId], references: [id])
  client           Client         @relation(fields: [clientId], references: [id])
  sdrs             CampaignSDR[]
  contacts         Contact[]
  callRecords      CallRecord[]
  sessions         Session[]
  scripts          Script[]
  pipelineDeals    PipelineDeal[]
  tasks            Task[]
}
```

- [ ] **Step 2: Create and apply migration**

```bash
npx prisma migrate dev --name add-campaign-archived-at
```

Expected output includes: `✔ Generated Prisma Client` and a new migration file in `prisma/migrations/`.

- [ ] **Step 3: Verify generated types include archivedAt**

```bash
grep -c "archivedAt" node_modules/.prisma/client/index.d.ts
```

Expected: at least 1 (the field on the Campaign model).

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "Add archivedAt field to Campaign model"
```

---

### Task 2: Remove Campaign from SOFT_DELETE_MODELS and fix existing queries

After this change, any `db.campaign.findMany` that relied on the middleware auto-adding `deletedAt: null` must declare it explicitly. There are five affected call sites across two files.

**Files:**
- Modify: `src/lib/db.ts`
- Modify: `src/lib/reports.ts`
- Modify: `src/app/(dashboard)/reports/page.tsx`

- [ ] **Step 1: Remove Campaign from SOFT_DELETE_MODELS**

In `src/lib/db.ts` line 11, change:

```typescript
const SOFT_DELETE_MODELS = new Set(['Campaign', 'Contact', 'ContactNote', 'Script', 'Task'])
```

to:

```typescript
const SOFT_DELETE_MODELS = new Set(['Contact', 'ContactNote', 'Script', 'Task'])
```

- [ ] **Step 2: Fix getCampaignHealth in reports.ts**

The Campaign Health grid must only show active, non-archived, non-deleted campaigns. In `src/lib/reports.ts` around line 156, update the `where` clause:

```typescript
const campaigns = await withTenant(tenantId, () =>
  db.campaign.findMany({
    where: { status: 'active', archivedAt: null, deletedAt: null, dailyTargetCalls: { not: null } },
    select: {
      id: true,
      name: true,
      dailyTargetCalls: true,
      client: { select: { name: true } },
      callRecords: {
        where: { createdAt: { gte: weekStart } },
        select: { conversationTagged: true, outcome: true },
      },
    },
  })
)
```

- [ ] **Step 3: Fix getDailyTargetStats — manager path**

In `src/lib/reports.ts` around line 342, the manager campaign query has no lifecycle filters. Add `archivedAt: null, deletedAt: null`:

```typescript
const [count, campaigns] = await withTenant(tenantId, () =>
  Promise.all([
    // count is not covered by tenant middleware — explicit tenantId required
    db.callRecord.count({ where: { tenantId, createdAt: { gte: todayStart } } }),
    db.campaign.findMany({
      where: { status: 'active', archivedAt: null, deletedAt: null, dailyTargetCalls: { not: null } },
      select: { dailyTargetCalls: true },
    }),
  ])
)
const target = campaigns.reduce((sum, c) => sum + (c.dailyTargetCalls ?? 0), 0)
return { count, target }
```

- [ ] **Step 4: Fix getDailyTargetStats — SDR path**

The SDR path queries campaigns via CampaignSDR and filters by `status === 'active'` in application code. Archived/deleted campaigns could still have `status: 'active'`, so we need to select and filter those fields too. Around line 322:

```typescript
const [count, assignments] = await withTenant(tenantId, () =>
  Promise.all([
    // count is not covered by tenant middleware — explicit tenantId required
    db.callRecord.count({ where: { userId, tenantId, createdAt: { gte: todayStart } } }),
    db.campaignSDR.findMany({
      where: { userId },
      select: {
        campaign: {
          select: { dailyTargetCalls: true, status: true, archivedAt: true, deletedAt: true },
        },
      },
    }),
  ])
)
const target = assignments
  .filter(
    a =>
      a.campaign.status === 'active' &&
      a.campaign.archivedAt === null &&
      a.campaign.deletedAt === null &&
      a.campaign.dailyTargetCalls
  )
  .reduce((sum, a) => sum + (a.campaign.dailyTargetCalls ?? 0), 0)
return { count, target }
```

- [ ] **Step 5: Fix getMBBreakdown to exclude deleted campaign call records**

The spec requires that call records from deleted campaigns are excluded from reports immediately, even during the 72-hour restore window. Add a relational filter on `campaign.deletedAt`. In `src/lib/reports.ts` around line 269:

```typescript
const records = await withTenant(tenantId, () =>
  db.callRecord.findMany({
    where: {
      outcome: 'meeting_booked',
      mbLeadStatus: { not: null },
      createdAt: { gte: start, lte: end },
      campaign: { deletedAt: null },
      ...(campaignId ? { campaignId } : {}),
    },
    select: {
      id: true,
      mbLeadStatus: true,
      createdAt: true,
      contact:  { select: { firstName: true, lastName: true, companyName: true } },
      user:     { select: { name: true } },
      campaign: { select: { name: true } },
    },
    orderBy: { createdAt: 'desc' },
  })
)
```

- [ ] **Step 6: Fix reports page campaign query**

In `src/app/(dashboard)/reports/page.tsx`, the campaign dropdown must show both active and archived campaigns (`deletedAt: null`) — not just `status: 'active'`. Also select `archivedAt` so CampaignFilter can render the "(archived)" label.

Replace the campaign query inside the `Promise.all`:

```typescript
withTenant(tenantId, () =>
  db.campaign.findMany({
    where:   { deletedAt: null },
    select:  { id: true, name: true, archivedAt: true },
    orderBy: { name: 'asc' },
  })
),
```

- [ ] **Step 7: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -30
```

Expected: no new errors. (Existing errors unrelated to this task are acceptable — check that the error count has not grown.)

- [ ] **Step 8: Run existing tests**

```bash
npx vitest run src/lib/__tests__/reports.test.ts
```

Expected: all tests pass (these test pure formula functions, not the DB queries).

- [ ] **Step 9: Commit**

```bash
git add src/lib/db.ts src/lib/reports.ts src/app/\(dashboard\)/reports/page.tsx
git commit -m "Remove Campaign from SOFT_DELETE_MODELS and add explicit lifecycle filters"
```

---

### Task 3: New lifecycle API routes (archive, unarchive, restore)

All three routes follow the same auth pattern as the existing `src/app/api/campaigns/[id]/route.ts` — a local `getClerkMeta(sessionClaims)` function reads from Clerk's `publicMetadata`.

**Files:**
- Create: `src/app/api/campaigns/[id]/archive/route.ts`
- Create: `src/app/api/campaigns/[id]/unarchive/route.ts`
- Create: `src/app/api/campaigns/[id]/restore/route.ts`

- [ ] **Step 1: Create archive route**

Create `src/app/api/campaigns/[id]/archive/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db, withTenant } from '@/lib/db'
import { hasPermission } from '@/lib/auth'

function getClerkMeta(sessionClaims: unknown) {
  const meta = (sessionClaims as Record<string, unknown>)?.publicMetadata as
    | { role?: string; tenantId?: string }
    | undefined
  return { role: meta?.role ?? '', tenantId: meta?.tenantId }
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId, sessionClaims } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { role, tenantId } = getClerkMeta(sessionClaims)
  if (!hasPermission(role, 'campaigns:write') || !tenantId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params

  const result = await withTenant(tenantId, () =>
    db.campaign.updateMany({
      where: { id, archivedAt: null, deletedAt: null },
      data: { archivedAt: new Date() },
    })
  )

  if (result.count === 0) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  return NextResponse.json({ data: { success: true } })
}
```

- [ ] **Step 2: Create unarchive route**

Create `src/app/api/campaigns/[id]/unarchive/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db, withTenant } from '@/lib/db'
import { hasPermission } from '@/lib/auth'

function getClerkMeta(sessionClaims: unknown) {
  const meta = (sessionClaims as Record<string, unknown>)?.publicMetadata as
    | { role?: string; tenantId?: string }
    | undefined
  return { role: meta?.role ?? '', tenantId: meta?.tenantId }
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId, sessionClaims } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { role, tenantId } = getClerkMeta(sessionClaims)
  if (!hasPermission(role, 'campaigns:write') || !tenantId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params

  const result = await withTenant(tenantId, () =>
    db.campaign.updateMany({
      where: { id, archivedAt: { not: null }, deletedAt: null },
      data: { archivedAt: null },
    })
  )

  if (result.count === 0) {
    return NextResponse.json({ error: 'Not found or not archived' }, { status: 404 })
  }

  return NextResponse.json({ data: { success: true } })
}
```

- [ ] **Step 3: Create restore route**

Create `src/app/api/campaigns/[id]/restore/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db, withTenant } from '@/lib/db'
import { hasPermission } from '@/lib/auth'

function getClerkMeta(sessionClaims: unknown) {
  const meta = (sessionClaims as Record<string, unknown>)?.publicMetadata as
    | { role?: string; tenantId?: string }
    | undefined
  return { role: meta?.role ?? '', tenantId: meta?.tenantId }
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId, sessionClaims } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { role, tenantId } = getClerkMeta(sessionClaims)
  if (!hasPermission(role, 'campaigns:write') || !tenantId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params

  const campaign = await withTenant(tenantId, () =>
    db.campaign.findFirst({
      where: { id, deletedAt: { not: null } },
      select: { id: true, deletedAt: true },
    })
  )

  if (!campaign) {
    return NextResponse.json({ error: 'Not found or not deleted' }, { status: 404 })
  }

  const cutoff = new Date(Date.now() - 72 * 60 * 60 * 1000)
  if (campaign.deletedAt! < cutoff) {
    return NextResponse.json(
      { error: 'Restore window has expired (72 hours)' },
      { status: 409 }
    )
  }

  await withTenant(tenantId, () =>
    db.campaign.update({
      where: { id },
      data: { deletedAt: null },
    })
  )

  return NextResponse.json({ data: { success: true } })
}
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | grep "api/campaigns" | head -10
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/campaigns/
git commit -m "Add archive, unarchive, restore API routes for campaigns"
```

---

### Task 4: Modify existing campaign API routes

**Files:**
- Modify: `src/app/api/campaigns/route.ts`
- Modify: `src/app/api/campaigns/[id]/route.ts`

- [ ] **Step 1: Add ?section= param to GET /api/campaigns**

In `src/app/api/campaigns/route.ts`, replace the GET handler's `where` construction. The full updated GET handler:

```typescript
export async function GET(request: Request) {
  const { userId, sessionClaims } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { role, tenantId } = getClerkMeta(sessionClaims)
  if (!hasPermission(role, 'campaigns:read') || !tenantId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const cursor = searchParams.get('cursor')
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '25', 10), 100)
  const section = searchParams.get('section')

  const cutoff = new Date(Date.now() - 72 * 60 * 60 * 1000)
  const where =
    section === 'archived'
      ? { archivedAt: { not: null as Date | null }, deletedAt: null }
      : section === 'deleted'
      ? { deletedAt: { gt: cutoff } }
      : { archivedAt: null, deletedAt: null }

  const campaigns = await withTenant(tenantId, () =>
    db.campaign.findMany({
      where,
      take: limit,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { createdAt: 'desc' },
      include: {
        client: { select: { id: true, name: true } },
        sdrs: { include: { user: { select: { id: true, name: true, email: true } } } },
      },
    })
  )

  const nextCursor = campaigns.length === limit ? campaigns[campaigns.length - 1].id : null
  return NextResponse.json({ data: campaigns, nextCursor })
}
```

- [ ] **Step 2: Update PATCH to use updateMany with lifecycle check**

In `src/app/api/campaigns/[id]/route.ts`, removing Campaign from SOFT_DELETE_MODELS means archived/deleted campaigns can be PATCHed again. Use `updateMany` with explicit `archivedAt: null, deletedAt: null` to prevent this. Replace the PATCH handler:

```typescript
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId, sessionClaims } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { role, tenantId } = getClerkMeta(sessionClaims)
  if (!hasPermission(role, 'campaigns:write') || !tenantId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const body = await request.json()
  const result = UpdateCampaignSchema.safeParse(body)
  if (!result.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: result.error.flatten() },
      { status: 400 }
    )
  }

  const updated = await withTenant(tenantId, () =>
    db.campaign.updateMany({
      where: { id, archivedAt: null, deletedAt: null },
      data: result.data,
    })
  )

  if (updated.count === 0) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  return NextResponse.json({ data: { success: true } })
}
```

- [ ] **Step 3: Update DELETE to enforce mutual exclusivity**

Replace the DELETE handler in `src/app/api/campaigns/[id]/route.ts`:

```typescript
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId, sessionClaims } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { role, tenantId } = getClerkMeta(sessionClaims)
  if (!hasPermission(role, 'campaigns:write') || !tenantId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const result = await withTenant(tenantId, () =>
    db.campaign.updateMany({
      where: { id, archivedAt: null, deletedAt: null },
      data: { deletedAt: new Date() },
    })
  )

  if (result.count === 0) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  return NextResponse.json({ data: { success: true } })
}
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | grep "api/campaigns" | head -10
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/campaigns/route.ts src/app/api/campaigns/\[id\]/route.ts
git commit -m "Add section param to GET campaigns, fix PATCH/DELETE where clauses"
```

---

### Task 5: Purge job

The core purge function lives in `src/lib/jobs/` and is called by a secured cron API route. This is called by an external scheduler (Vercel cron, Railway cron, etc.) with the `CRON_SECRET` env var.

The purge function runs outside `withTenant` — it queries all tenants directly, which works because the tenant middleware only activates when `tenantStore` has a value.

**FK-safe delete order:** ScriptVersion → ContactNote → Task → PipelineDeal → CallRecord → Session → Script → CampaignSDR → Contact → Campaign.

**Files:**
- Create: `src/lib/jobs/purge-deleted-campaigns.ts`
- Create: `src/app/api/cron/purge-campaigns/route.ts`

- [ ] **Step 1: Create purge logic**

Create `src/lib/jobs/purge-deleted-campaigns.ts`:

```typescript
import { db } from '@/lib/db'

export async function purgeDeletedCampaigns(): Promise<number> {
  const cutoff = new Date(Date.now() - 72 * 60 * 60 * 1000)

  const expired = await db.campaign.findMany({
    where: { deletedAt: { not: null, lt: cutoff } },
    select: { id: true },
  })

  if (expired.length === 0) return 0

  const ids = expired.map(c => c.id)

  await db.$transaction([
    db.scriptVersion.deleteMany({ where: { script: { campaignId: { in: ids } } } }),
    db.contactNote.deleteMany({ where: { contact: { campaignId: { in: ids } } } }),
    db.task.deleteMany({ where: { campaignId: { in: ids } } }),
    db.pipelineDeal.deleteMany({ where: { campaignId: { in: ids } } }),
    db.callRecord.deleteMany({ where: { campaignId: { in: ids } } }),
    db.session.deleteMany({ where: { campaignId: { in: ids } } }),
    db.script.deleteMany({ where: { campaignId: { in: ids } } }),
    db.campaignSDR.deleteMany({ where: { campaignId: { in: ids } } }),
    db.contact.deleteMany({ where: { campaignId: { in: ids } } }),
    db.campaign.deleteMany({ where: { id: { in: ids } } }),
  ])

  return ids.length
}
```

- [ ] **Step 2: Create cron route**

Create `src/app/api/cron/purge-campaigns/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { purgeDeletedCampaigns } from '@/lib/jobs/purge-deleted-campaigns'

export async function POST(request: Request) {
  const secret = request.headers.get('x-cron-secret')
  if (!secret || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const purged = await purgeDeletedCampaigns()
  return NextResponse.json({ data: { purged } })
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | grep "purge\|cron" | head -10
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/jobs/ src/app/api/cron/
git commit -m "Add campaign purge job and secured cron endpoint"
```

---

### Task 6: Campaign server actions

The `CampaignsTable` client component already imports `deleteCampaign` from `@/app/(dashboard)/campaigns/actions` — this file does not exist yet and is causing a build error. Create it with all four lifecycle server actions.

**Files:**
- Create: `src/app/(dashboard)/campaigns/actions.ts`

- [ ] **Step 1: Create actions file**

Create `src/app/(dashboard)/campaigns/actions.ts`:

```typescript
'use server'

import { revalidatePath } from 'next/cache'
import { auth } from '@clerk/nextjs/server'
import { db, withTenant } from '@/lib/db'
import { hasPermission } from '@/lib/auth'

async function getClerkMeta() {
  const { sessionClaims } = await auth()
  const meta = (sessionClaims as Record<string, unknown>)?.publicMetadata as
    | { role?: string; tenantId?: string }
    | undefined
  return { role: meta?.role ?? '', tenantId: meta?.tenantId }
}

export async function deleteCampaign(id: string): Promise<void> {
  const { role, tenantId } = await getClerkMeta()
  if (!hasPermission(role, 'campaigns:write') || !tenantId) throw new Error('Forbidden')

  await withTenant(tenantId, () =>
    db.campaign.updateMany({
      where: { id, archivedAt: null, deletedAt: null },
      data: { deletedAt: new Date() },
    })
  )
  revalidatePath('/campaigns')
}

export async function archiveCampaign(id: string): Promise<void> {
  const { role, tenantId } = await getClerkMeta()
  if (!hasPermission(role, 'campaigns:write') || !tenantId) throw new Error('Forbidden')

  await withTenant(tenantId, () =>
    db.campaign.updateMany({
      where: { id, archivedAt: null, deletedAt: null },
      data: { archivedAt: new Date() },
    })
  )
  revalidatePath('/campaigns')
}

export async function unarchiveCampaign(id: string): Promise<void> {
  const { role, tenantId } = await getClerkMeta()
  if (!hasPermission(role, 'campaigns:write') || !tenantId) throw new Error('Forbidden')

  await withTenant(tenantId, () =>
    db.campaign.updateMany({
      where: { id, archivedAt: { not: null }, deletedAt: null },
      data: { archivedAt: null },
    })
  )
  revalidatePath('/campaigns')
}

export async function restoreCampaign(id: string): Promise<void> {
  const { role, tenantId } = await getClerkMeta()
  if (!hasPermission(role, 'campaigns:write') || !tenantId) throw new Error('Forbidden')

  const cutoff = new Date(Date.now() - 72 * 60 * 60 * 1000)
  const campaign = await withTenant(tenantId, () =>
    db.campaign.findFirst({
      where: { id, deletedAt: { not: null } },
      select: { deletedAt: true },
    })
  )

  if (!campaign) throw new Error('Not found or not deleted')
  if (campaign.deletedAt! < cutoff) throw new Error('Restore window has expired')

  await withTenant(tenantId, () =>
    db.campaign.update({ where: { id }, data: { deletedAt: null } })
  )
  revalidatePath('/campaigns')
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | grep "campaigns/actions" | head -10
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(dashboard)/campaigns/actions.ts"
git commit -m "Add campaign lifecycle server actions"
```

---

### Task 7: ArchiveDeleteModal component

Shown when a manager clicks Archive or Delete from the campaigns table action menu. Archive is pre-selected by default; the `initialChoice` prop lets the caller pre-select Delete when that menu item is clicked.

**Files:**
- Create: `src/components/campaigns/ArchiveDeleteModal.tsx`

- [ ] **Step 1: Create the modal**

Create `src/components/campaigns/ArchiveDeleteModal.tsx`:

```typescript
'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { archiveCampaign, deleteCampaign } from '@/app/(dashboard)/campaigns/actions'

interface Props {
  campaignId: string
  campaignName: string
  open: boolean
  onClose: () => void
  initialChoice?: 'archive' | 'delete'
}

export function ArchiveDeleteModal({
  campaignId,
  campaignName,
  open,
  onClose,
  initialChoice = 'archive',
}: Props) {
  const [choice, setChoice] = useState<'archive' | 'delete'>(initialChoice)
  const [pending, setPending] = useState(false)

  const handleConfirm = async () => {
    setPending(true)
    try {
      if (choice === 'archive') {
        await archiveCampaign(campaignId)
      } else {
        await deleteCampaign(campaignId)
      }
      onClose()
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="glass-panel border-white/10 max-w-md">
        <DialogHeader>
          <DialogTitle className="text-white">Remove this campaign?</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-gray-400 -mt-2 mb-2">{campaignName}</p>

        <div className="space-y-3">
          <label
            className={`flex gap-3 p-4 rounded-xl border cursor-pointer transition-colors ${
              choice === 'archive'
                ? 'border-accent/40 bg-accent/5'
                : 'border-white/10 hover:border-white/20'
            }`}
          >
            <input
              type="radio"
              name="lifecycle-choice"
              value="archive"
              checked={choice === 'archive'}
              onChange={() => setChoice('archive')}
              className="mt-0.5 accent-[#00d4ff]"
            />
            <div>
              <p className="text-sm font-semibold text-white flex items-center gap-2">
                Archive
                <span className="text-[10px] font-normal text-emerald-400 px-1.5 py-0.5 bg-emerald-500/10 rounded-full">
                  recommended
                </span>
              </p>
              <p className="text-xs text-gray-400 mt-1">
                Closes the campaign. All data is kept and continues to appear in reports. You can
                unarchive at any time.
              </p>
            </div>
          </label>

          <label
            className={`flex gap-3 p-4 rounded-xl border cursor-pointer transition-colors ${
              choice === 'delete'
                ? 'border-red-500/40 bg-red-500/5'
                : 'border-white/10 hover:border-white/20'
            }`}
          >
            <input
              type="radio"
              name="lifecycle-choice"
              value="delete"
              checked={choice === 'delete'}
              onChange={() => setChoice('delete')}
              className="mt-0.5"
            />
            <div>
              <p className="text-sm font-semibold text-white">Delete permanently</p>
              <p className="text-xs text-gray-400 mt-1">
                Removes all campaign data after 3 days. You have a 72-hour window to restore.
              </p>
            </div>
          </label>
        </div>

        <div className="flex gap-3 justify-end mt-2">
          <Button
            variant="ghost"
            onClick={onClose}
            disabled={pending}
            className="text-gray-400 hover:text-white rounded-xl"
          >
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={pending}
            className={
              choice === 'delete'
                ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/20 rounded-xl'
                : 'bg-gradient-to-r from-[#00d4ff] to-cyan-600 text-black font-semibold rounded-xl hover:opacity-90'
            }
          >
            {pending ? 'Working…' : 'Confirm'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | grep "ArchiveDeleteModal" | head -10
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/campaigns/ArchiveDeleteModal.tsx
git commit -m "Add ArchiveDeleteModal component"
```

---

### Task 8: Update CampaignsTable

Replace `window.confirm` with the new modal. Add separate Archive and Delete menu items, each pre-selecting the appropriate modal choice. Accept a `canManage` prop to hide write actions from SDRs.

**Files:**
- Modify: `src/components/campaigns/CampaignsTable.tsx`

- [ ] **Step 1: Replace CampaignsTable**

Replace the entire contents of `src/components/campaigns/CampaignsTable.tsx`:

```typescript
'use client'

import { useState } from 'react'
import { Plus, MoreHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { CampaignModal } from './CampaignModal'
import { ArchiveDeleteModal } from './ArchiveDeleteModal'
import type { CampaignWithDetails, UserSummary } from '@/types/models'
import type { Client } from '@prisma/client'

const STATUS_STYLES: Record<string, string> = {
  draft:     'bg-gray-500/10 text-gray-400',
  active:    'bg-emerald-500/10 text-emerald-400',
  paused:    'bg-amber-500/10 text-amber-400',
  completed: 'bg-blue-500/10 text-blue-400',
}

interface CampaignsTableProps {
  campaigns: CampaignWithDetails[]
  clients: Pick<Client, 'id' | 'name'>[]
  sdrs: UserSummary[]
  canManage: boolean
}

export function CampaignsTable({ campaigns, clients, sdrs, canManage }: CampaignsTableProps) {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [selected, setSelected] = useState<CampaignWithDetails | null>(null)
  const [lifecycleModal, setLifecycleModal] = useState<{
    id: string
    name: string
    initialChoice: 'archive' | 'delete'
  } | null>(null)

  const openEdit = (campaign: CampaignWithDetails) => {
    setSelected(campaign)
    setDrawerOpen(true)
  }
  const openCreate = () => {
    setSelected(null)
    setDrawerOpen(true)
  }

  return (
    <div className="glass-panel rounded-3xl overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/5">
        <h2 className="text-sm font-semibold text-white">
          All Campaigns
          <span className="ml-2 font-mono text-[10px] bg-accent/10 text-[#00d4ff] px-2 py-0.5 rounded-full">
            {campaigns.length}
          </span>
        </h2>
        {canManage && (
          <Button
            type="button"
            onClick={openCreate}
            size="sm"
            className="bg-gradient-to-r from-[#00d4ff] to-cyan-600 text-black font-semibold rounded-xl hover:opacity-90"
          >
            <Plus className="w-4 h-4 mr-1.5" />
            New Campaign
          </Button>
        )}
      </div>

      <div className="grid grid-cols-[2fr_1.5fr_100px_120px_100px_44px] gap-4 px-6 py-3 border-b border-white/5">
        {['Name', 'Client', 'Status', 'SDRs', 'Target', ''].map((col) => (
          <span key={col} className="text-xs font-bold uppercase tracking-wider text-gray-500">{col}</span>
        ))}
      </div>

      {campaigns.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20">
          <p className="text-sm text-gray-500 mb-4">No campaigns yet</p>
          {canManage && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={openCreate}
              className="border-dashed border-white/10 text-gray-500 hover:text-white hover:border-white/20 rounded-xl"
            >
              <Plus className="w-4 h-4 mr-1.5" />
              Create your first campaign
            </Button>
          )}
        </div>
      )}

      <div className="divide-y divide-white/5">
        {campaigns.map((campaign) => {
          const visibleSdrs = campaign.sdrs.slice(0, 3)
          const overflowCount = campaign.sdrs.length - visibleSdrs.length

          return (
            <div
              key={campaign.id}
              onClick={() => canManage && openEdit(campaign)}
              className={`grid grid-cols-[2fr_1.5fr_100px_120px_100px_44px] gap-4 px-6 py-4 items-center transition-colors duration-200 ${
                canManage ? 'cursor-pointer hover:bg-white/[0.02]' : ''
              }`}
            >
              <span className="text-sm font-medium text-white truncate">{campaign.name}</span>
              <span className="text-sm text-gray-400 truncate">{campaign.client.name}</span>
              <Badge className={`text-[10px] font-semibold uppercase border-0 w-fit ${STATUS_STYLES[campaign.status]}`}>
                {campaign.status}
              </Badge>
              <div className="flex items-center -space-x-2">
                {visibleSdrs.map((s) => (
                  <Avatar key={s.userId} className="w-7 h-7 rounded-full border border-dark">
                    <AvatarFallback className="text-[10px] bg-white/10 text-gray-300">
                      {s.user.name.slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                ))}
                {overflowCount > 0 && (
                  <div className="w-7 h-7 rounded-full border border-dark bg-white/10 flex items-center justify-center">
                    <span className="text-[10px] text-gray-400 font-mono">+{overflowCount}</span>
                  </div>
                )}
                {campaign.sdrs.length === 0 && <span className="text-xs text-gray-600">—</span>}
              </div>
              <span className="font-mono text-sm text-gray-400">{campaign.dailyTargetCalls ?? '—'}</span>
              {canManage ? (
                <DropdownMenu>
                  <DropdownMenuTrigger
                    className="w-8 h-8 rounded-lg text-gray-500 hover:text-white flex items-center justify-center"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <MoreHorizontal className="w-4 h-4" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="rounded-xl border-white/10 bg-card-solid">
                    <DropdownMenuItem
                      onClick={(e) => { e.stopPropagation(); openEdit(campaign) }}
                      className="text-gray-300 hover:text-white rounded-lg cursor-pointer"
                    >
                      Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={(e) => {
                        e.stopPropagation()
                        setLifecycleModal({ id: campaign.id, name: campaign.name, initialChoice: 'archive' })
                      }}
                      className="text-gray-300 hover:text-white rounded-lg cursor-pointer"
                    >
                      Archive
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={(e) => {
                        e.stopPropagation()
                        setLifecycleModal({ id: campaign.id, name: campaign.name, initialChoice: 'delete' })
                      }}
                      className="text-red-400 hover:text-red-300 focus:text-red-300 rounded-lg cursor-pointer"
                    >
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <div />
              )}
            </div>
          )
        })}
      </div>

      {canManage && (
        <CampaignModal
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          campaign={selected}
          clients={clients}
          sdrs={sdrs}
        />
      )}

      {lifecycleModal && (
        <ArchiveDeleteModal
          key={`${lifecycleModal.id}-${lifecycleModal.initialChoice}`}
          campaignId={lifecycleModal.id}
          campaignName={lifecycleModal.name}
          open={true}
          onClose={() => setLifecycleModal(null)}
          initialChoice={lifecycleModal.initialChoice}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | grep "CampaignsTable" | head -10
```

Expected: no errors (the campaigns page will have a type error for the missing `canManage` prop until Task 11).

- [ ] **Step 3: Commit**

```bash
git add src/components/campaigns/CampaignsTable.tsx
git commit -m "Replace window.confirm with ArchiveDeleteModal in CampaignsTable"
```

---

### Task 9: ArchivedSection component

Collapsible section showing archived campaigns with campaign name, client, archive date, and an Unarchive button. No edit, no action menu — archived campaigns cannot be called.

**Files:**
- Modify: `src/types/models.ts`
- Create: `src/components/campaigns/ArchivedSection.tsx`

- [ ] **Step 1: Add ArchivedCampaign type to models.ts**

In `src/types/models.ts`, add after the `CampaignWithDetails` type definition (after line 13):

```typescript
export type ArchivedCampaign = {
  id: string
  name: string
  clientName: string
  archivedAt: string  // ISO string — serialized by the server component before passing to client
}
```

- [ ] **Step 2: Create ArchivedSection**

Create `src/components/campaigns/ArchivedSection.tsx`:

```typescript
'use client'

import { useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { unarchiveCampaign } from '@/app/(dashboard)/campaigns/actions'
import type { ArchivedCampaign } from '@/types/models'

interface Props {
  campaigns: ArchivedCampaign[]
}

export function ArchivedSection({ campaigns }: Props) {
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState<string | null>(null)

  if (campaigns.length === 0) return null

  return (
    <div className="glass-panel rounded-3xl overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-6 py-4 w-full text-left hover:bg-white/[0.02] transition-colors"
      >
        <ChevronRight
          className={`w-4 h-4 text-gray-500 transition-transform duration-200 ${open ? 'rotate-90' : ''}`}
        />
        <span className="text-sm font-semibold text-gray-400">Archived</span>
        <span className="ml-1 font-mono text-[10px] bg-white/5 text-gray-500 px-2 py-0.5 rounded-full">
          {campaigns.length}
        </span>
      </button>

      {open && (
        <>
          <div className="grid grid-cols-[2fr_1.5fr_160px_120px] gap-4 px-6 py-3 border-t border-white/5">
            {['Campaign', 'Client', 'Archived', ''].map((col) => (
              <span key={col} className="text-xs font-bold uppercase tracking-wider text-gray-600">
                {col}
              </span>
            ))}
          </div>
          <div className="divide-y divide-white/5">
            {campaigns.map((campaign) => (
              <div
                key={campaign.id}
                className="grid grid-cols-[2fr_1.5fr_160px_120px] gap-4 px-6 py-4 items-center"
              >
                <span className="text-sm text-gray-400 truncate">{campaign.name}</span>
                <span className="text-sm text-gray-500 truncate">{campaign.clientName}</span>
                <span className="text-xs text-gray-500 font-mono">
                  {new Date(campaign.archivedAt).toLocaleDateString('en-GB', {
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric',
                  })}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending === campaign.id}
                  onClick={async () => {
                    setPending(campaign.id)
                    try {
                      await unarchiveCampaign(campaign.id)
                    } finally {
                      setPending(null)
                    }
                  }}
                  className="text-xs border-white/10 text-gray-400 hover:text-white hover:border-white/20 rounded-lg"
                >
                  {pending === campaign.id ? 'Working…' : 'Unarchive'}
                </Button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | grep "ArchivedSection" | head -10
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/types/models.ts src/components/campaigns/ArchivedSection.tsx
git commit -m "Add ArchivedSection component and ArchivedCampaign type"
```

---

### Task 10: RecentlyDeletedSection component

Collapsible section showing campaigns deleted within the last 72 hours. Shows a countdown label and a Restore button.

**Files:**
- Modify: `src/types/models.ts`
- Create: `src/components/campaigns/RecentlyDeletedSection.tsx`
- Create: `src/lib/__tests__/time-remaining.test.ts`

- [ ] **Step 1: Add RecentlyDeletedCampaign type to models.ts**

In `src/types/models.ts`, add after `ArchivedCampaign`:

```typescript
export type RecentlyDeletedCampaign = {
  id: string
  name: string
  clientName: string
  deletedAt: string  // ISO string
}
```

- [ ] **Step 2: Write failing test for timeRemaining helper**

Create `src/lib/__tests__/time-remaining.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'

function timeRemaining(deletedAtIso: string, now = new Date()): string {
  const expiresAt = new Date(new Date(deletedAtIso).getTime() + 72 * 60 * 60 * 1000)
  const msLeft = expiresAt.getTime() - now.getTime()
  if (msLeft <= 0) return 'Expired'
  const totalHours = Math.floor(msLeft / (60 * 60 * 1000))
  const days = Math.floor(totalHours / 24)
  const hours = totalHours % 24
  return days > 0 ? `${days}d ${hours}h remaining` : `${totalHours}h remaining`
}

describe('timeRemaining', () => {
  it('returns "Expired" when window has passed', () => {
    const deletedAt = new Date(Date.now() - 80 * 60 * 60 * 1000).toISOString()
    expect(timeRemaining(deletedAt)).toBe('Expired')
  })

  it('shows hours only when less than 24h remain', () => {
    const now = new Date('2026-05-06T12:00:00Z')
    const deletedAt = new Date('2026-05-05T20:00:00Z').toISOString() // 16h ago → 56h left
    expect(timeRemaining(deletedAt, now)).toBe('56h remaining')
  })

  it('shows days and hours when more than 24h remain', () => {
    const now = new Date('2026-05-06T12:00:00Z')
    const deletedAt = new Date('2026-05-06T00:00:00Z').toISOString() // 12h ago → 60h left = 2d 12h
    expect(timeRemaining(deletedAt, now)).toBe('2d 12h remaining')
  })

  it('returns "Expired" at exactly 72h boundary', () => {
    const now = new Date('2026-05-06T12:00:00Z')
    const deletedAt = new Date('2026-05-03T12:00:00Z').toISOString() // exactly 72h ago
    expect(timeRemaining(deletedAt, now)).toBe('Expired')
  })
})
```

- [ ] **Step 3: Run test to verify it fails (function not yet in component)**

```bash
npx vitest run src/lib/__tests__/time-remaining.test.ts
```

Expected: PASS — this test file defines and tests the function inline. The test verifies the formula before we embed it in the component.

- [ ] **Step 4: Create RecentlyDeletedSection**

Create `src/components/campaigns/RecentlyDeletedSection.tsx`:

```typescript
'use client'

import { useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { restoreCampaign } from '@/app/(dashboard)/campaigns/actions'
import type { RecentlyDeletedCampaign } from '@/types/models'

function timeRemaining(deletedAtIso: string): string {
  const expiresAt = new Date(new Date(deletedAtIso).getTime() + 72 * 60 * 60 * 1000)
  const msLeft = expiresAt.getTime() - Date.now()
  if (msLeft <= 0) return 'Expired'
  const totalHours = Math.floor(msLeft / (60 * 60 * 1000))
  const days = Math.floor(totalHours / 24)
  const hours = totalHours % 24
  return days > 0 ? `${days}d ${hours}h remaining` : `${totalHours}h remaining`
}

interface Props {
  campaigns: RecentlyDeletedCampaign[]
}

export function RecentlyDeletedSection({ campaigns }: Props) {
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState<string | null>(null)

  if (campaigns.length === 0) return null

  return (
    <div className="glass-panel rounded-3xl overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-6 py-4 w-full text-left hover:bg-white/[0.02] transition-colors"
      >
        <ChevronRight
          className={`w-4 h-4 text-gray-500 transition-transform duration-200 ${open ? 'rotate-90' : ''}`}
        />
        <span className="text-sm font-semibold text-gray-400">Recently Deleted</span>
        <span className="ml-1 font-mono text-[10px] bg-white/5 text-gray-500 px-2 py-0.5 rounded-full">
          {campaigns.length}
        </span>
      </button>

      {open && (
        <>
          <div className="grid grid-cols-[2fr_1.5fr_200px_120px] gap-4 px-6 py-3 border-t border-white/5">
            {['Campaign', 'Client', 'Restore Window', ''].map((col) => (
              <span key={col} className="text-xs font-bold uppercase tracking-wider text-gray-600">
                {col}
              </span>
            ))}
          </div>
          <div className="divide-y divide-white/5">
            {campaigns.map((campaign) => (
              <div
                key={campaign.id}
                className="grid grid-cols-[2fr_1.5fr_200px_120px] gap-4 px-6 py-4 items-center"
              >
                <span className="text-sm text-gray-400 truncate">{campaign.name}</span>
                <span className="text-sm text-gray-500 truncate">{campaign.clientName}</span>
                <span className="text-xs text-amber-400/80 font-mono">
                  {timeRemaining(campaign.deletedAt)}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending === campaign.id}
                  onClick={async () => {
                    setPending(campaign.id)
                    try {
                      await restoreCampaign(campaign.id)
                    } finally {
                      setPending(null)
                    }
                  }}
                  className="text-xs border-white/10 text-gray-400 hover:text-white hover:border-white/20 rounded-lg"
                >
                  {pending === campaign.id ? 'Working…' : 'Restore'}
                </Button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | grep "RecentlyDeleted\|time-remaining" | head -10
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/types/models.ts src/components/campaigns/RecentlyDeletedSection.tsx src/lib/__tests__/time-remaining.test.ts
git commit -m "Add RecentlyDeletedSection component and RecentlyDeletedCampaign type"
```

---

### Task 11: Wire the campaigns page and update CampaignFilter

Update the campaigns page to fetch all three sections and pass `canManage` to CampaignsTable. Update CampaignFilter to render "(archived)" labels.

**Files:**
- Modify: `src/app/(dashboard)/campaigns/page.tsx`
- Modify: `src/components/reports/CampaignFilter.tsx`

- [ ] **Step 1: Replace campaigns page**

Replace the entire contents of `src/app/(dashboard)/campaigns/page.tsx`:

```typescript
import { redirect } from 'next/navigation'
import { Header } from '@/components/layout/Header'
import { PageShell } from '@/components/layout/PageShell'
import { CampaignsTable } from '@/components/campaigns/CampaignsTable'
import { ArchivedSection } from '@/components/campaigns/ArchivedSection'
import { RecentlyDeletedSection } from '@/components/campaigns/RecentlyDeletedSection'
import { db, withTenant } from '@/lib/db'
import { getCurrentTenantId, getCurrentUserRole, hasPermission } from '@/lib/auth'
import type { ArchivedCampaign, RecentlyDeletedCampaign } from '@/types/models'

async function getPageData(tenantId: string, role: string) {
  const cutoff = new Date(Date.now() - 72 * 60 * 60 * 1000)

  return withTenant(tenantId, async () => {
    const [campaigns, archivedRaw, recentlyDeletedRaw, clients, sdrs] = await Promise.all([
      db.campaign.findMany({
        where: { archivedAt: null, deletedAt: null },
        orderBy: { createdAt: 'desc' },
        include: {
          client: { select: { id: true, name: true } },
          sdrs: { include: { user: { select: { id: true, name: true, email: true } } } },
        },
      }),
      db.campaign.findMany({
        where: { archivedAt: { not: null }, deletedAt: null },
        orderBy: { archivedAt: 'desc' },
        select: { id: true, name: true, archivedAt: true, client: { select: { name: true } } },
      }),
      db.campaign.findMany({
        where: { deletedAt: { gt: cutoff } },
        orderBy: { deletedAt: 'desc' },
        select: { id: true, name: true, deletedAt: true, client: { select: { name: true } } },
      }),
      hasPermission(role, 'clients:read')
        ? db.client.findMany({
            where: { deletedAt: null },
            select: { id: true, name: true },
            orderBy: { name: 'asc' },
          })
        : Promise.resolve([]),
      hasPermission(role, 'sdrs:manage')
        ? db.user.findMany({
            where: { role: 'sdr', tenantId },
            select: { id: true, name: true, email: true, role: true },
            orderBy: { name: 'asc' },
          })
        : Promise.resolve([]),
    ])

    const archived: ArchivedCampaign[] = archivedRaw.map(c => ({
      id: c.id,
      name: c.name,
      clientName: c.client.name,
      archivedAt: c.archivedAt!.toISOString(),
    }))

    const recentlyDeleted: RecentlyDeletedCampaign[] = recentlyDeletedRaw.map(c => ({
      id: c.id,
      name: c.name,
      clientName: c.client.name,
      deletedAt: c.deletedAt!.toISOString(),
    }))

    return { campaigns, archived, recentlyDeleted, clients, sdrs }
  })
}

export default async function CampaignsPage() {
  const tenantId = await getCurrentTenantId()
  if (!tenantId) redirect('/sign-in')

  const role = await getCurrentUserRole()
  if (!role || !hasPermission(role, 'campaigns:read')) redirect('/')

  const canManage = hasPermission(role, 'campaigns:write')
  const { campaigns, archived, recentlyDeleted, clients, sdrs } = await getPageData(tenantId, role)

  return (
    <>
      <Header title="Campaigns" subtitle="Manage outreach campaigns and SDR assignments" />
      <PageShell>
        <div className="space-y-4">
          <CampaignsTable
            campaigns={campaigns}
            clients={clients}
            sdrs={sdrs}
            canManage={canManage}
          />
          {canManage && <ArchivedSection campaigns={archived} />}
          {canManage && <RecentlyDeletedSection campaigns={recentlyDeleted} />}
        </div>
      </PageShell>
    </>
  )
}
```

- [ ] **Step 2: Update CampaignFilter**

Replace the entire contents of `src/components/reports/CampaignFilter.tsx`:

```typescript
'use client'

import { useRouter } from 'next/navigation'

interface CampaignOption {
  id: string
  name: string
  archivedAt: string | null
}

interface CampaignFilterProps {
  campaigns: CampaignOption[]
  selected: string | undefined
  period: 'week' | 'month'
}

export function CampaignFilter({ campaigns, selected, period }: CampaignFilterProps) {
  const router = useRouter()

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const params = new URLSearchParams({ period })
    if (e.target.value) params.set('campaignId', e.target.value)
    router.push(`/reports?${params.toString()}`)
  }

  return (
    <select
      value={selected ?? ''}
      onChange={handleChange}
      className="bg-white/5 border border-white/10 rounded-xl px-3 py-1.5 text-sm text-gray-300 focus:outline-none focus:border-white/30 cursor-pointer"
    >
      <option value="" className="bg-[#161c26]">All campaigns</option>
      {campaigns.map((c) => (
        <option key={c.id} value={c.id} className="bg-[#161c26]">
          {c.name}{c.archivedAt ? ' (archived)' : ''}
        </option>
      ))}
    </select>
  )
}
```

- [ ] **Step 3: Verify full TypeScript compilation**

```bash
npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors.

- [ ] **Step 4: Run all tests**

```bash
npx vitest run
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(dashboard)/campaigns/page.tsx" src/components/reports/CampaignFilter.tsx
git commit -m "Wire campaigns page archive/delete sections and update CampaignFilter"
```

---

## Spec Coverage Check

| Spec requirement | Task |
|---|---|
| `archivedAt DateTime?` added to Campaign | Task 1 |
| Campaign removed from SOFT_DELETE_MODELS | Task 2 |
| All existing Campaign findMany get explicit lifecycle filters | Task 2 |
| getCampaignHealth: active + archivedAt: null + deletedAt: null | Task 2 |
| MB Breakdown call records from deleted campaigns excluded | Task 2 |
| MB Breakdown campaign dropdown: deletedAt: null (includes archived) | Tasks 2, 11 |
| POST archive endpoint; validation: not already deleted | Task 3 |
| POST unarchive endpoint; validation: must be archived | Task 3 |
| POST restore endpoint; 409 if 72h window expired | Task 3 |
| GET ?section=archived / ?section=deleted params | Task 4 |
| DELETE where clause: archivedAt: null (can't delete archived) | Task 4 |
| PATCH where clause: archivedAt: null, deletedAt: null | Task 4 |
| Purge job: hard-delete campaigns older than 72h with FK-safe cascades | Task 5 |
| Only admin/manager can archive/delete/restore/unarchive | Tasks 3, 4, 6 |
| Archive/Delete choice modal, Archive pre-selected | Task 7 |
| Archive menu item → modal pre-selects Archive | Task 8 |
| Delete menu item → modal pre-selects Delete | Task 8 |
| Archived section in campaigns page (collapsible) | Task 9 |
| Unarchive button in archived section | Task 9 |
| Recently Deleted section (collapsible, countdown, Restore button) | Task 10 |
| Campaign filter dropdown "(archived)" label | Task 11 |
| All three sections fetched with explicit lifecycle filters | Task 11 |
