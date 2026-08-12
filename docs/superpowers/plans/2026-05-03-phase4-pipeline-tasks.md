# Phase 4: Pipeline & Tasks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Pipeline Kanban board (per-client stages, drag-and-drop, auto-deal on Meeting Booked) and a Task management page (/schedule) with color-coded tasks and a slide-in create/edit drawer.

**Architecture:** Feature-by-feature — Pipeline + auto-deal first (Tasks 1–8), Tasks management second (Tasks 9–11). Schema lands in Task 1. Auto-deal logic is extracted into a testable helper (`src/lib/auto-deal.ts`) and integrated synchronously into the existing log-outcome transaction. Pipeline Kanban uses @dnd-kit with optimistic UI. Task list reuses the existing SlideDrawer component.

**Tech Stack:** Next.js 16 App Router, Prisma/PostgreSQL, @dnd-kit/core + @dnd-kit/utilities (already installed), react-hook-form + zod, sonner (toast — to install), Tailwind CSS, Shadcn/UI, Vitest

---

## File Map

**New files:**
- `src/lib/auto-deal.ts` — upsert PipelineDeal on meeting_booked; accepts tx client
- `src/lib/__tests__/auto-deal.test.ts` — unit tests for auto-deal helper
- `src/app/api/pipeline/stages/route.ts` — GET stages by clientId
- `src/app/api/pipeline/deals/route.ts` — GET deals by clientId
- `src/app/api/pipeline/deals/[id]/route.ts` — PATCH deal (stageId, notes, value)
- `src/components/pipeline/DealCard.tsx` — useDraggable card
- `src/components/pipeline/KanbanColumn.tsx` — useDroppable column
- `src/components/pipeline/ClientSelector.tsx` — client dropdown (navigates via router.push)
- `src/components/pipeline/KanbanBoard.tsx` — DndContext, optimistic dealsByStage state
- `src/app/(dashboard)/pipeline/page.tsx` — server component: fetch clients/stages/deals
- `src/app/api/tasks/route.ts` — GET + POST tasks
- `src/app/api/tasks/[id]/route.ts` — PATCH + DELETE task
- `src/components/schedule/TaskRow.tsx` — single task row with optimistic checkbox
- `src/components/schedule/TaskList.tsx` — filter tabs, task list, optimistic toggle
- `src/components/schedule/TaskDrawer.tsx` — create/edit slide-in drawer
- `src/app/(dashboard)/schedule/page.tsx` — server component: initial task fetch

**Modified files:**
- `prisma/schema.prisma` — add PipelineStage, PipelineDeal, Task, TaskStatus enum + back-relations
- `src/lib/db.ts` — add PipelineStage, PipelineDeal, Task to TENANT_MODELS; Task to SOFT_DELETE_MODELS
- `src/lib/auth.ts` — add pipeline:read, pipeline:write, tasks:read, tasks:write permissions
- `src/types/enums.ts` — add TaskStatus enum mirror
- `src/types/models.ts` — add PipelineStageRow, PipelineDealRow, TaskRow types
- `src/app/api/dialer/log-outcome/route.ts` — call autoCreateDeal inside transaction after meeting_booked
- `src/app/(dashboard)/layout.tsx` — add `<Toaster />` from sonner

---

### Task 1: Schema + Migration

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add TaskStatus enum and three new models to prisma/schema.prisma**

After the last existing model (`ContactNote`), append:

```prisma
enum TaskStatus {
  pending
  in_progress
  completed
}

model PipelineStage {
  id        String         @id @default(cuid())
  tenantId  String
  clientId  String
  name      String
  color     String
  position  Int
  createdAt DateTime       @default(now())
  updatedAt DateTime       @updatedAt
  tenant    Tenant         @relation(fields: [tenantId], references: [id])
  client    Client         @relation(fields: [clientId], references: [id])
  deals     PipelineDeal[]

  @@index([tenantId, clientId])
}

model PipelineDeal {
  id         String        @id @default(cuid())
  tenantId   String
  clientId   String
  stageId    String
  contactId  String
  campaignId String
  title      String
  value      Decimal?
  notes      String?
  source     String        @default("auto")
  closedAt   DateTime?
  createdAt  DateTime      @default(now())
  updatedAt  DateTime      @updatedAt
  tenant     Tenant        @relation(fields: [tenantId], references: [id])
  client     Client        @relation(fields: [clientId], references: [id])
  stage      PipelineStage @relation(fields: [stageId], references: [id])
  contact    Contact       @relation(fields: [contactId], references: [id])
  campaign   Campaign      @relation(fields: [campaignId], references: [id])

  @@unique([contactId, campaignId])
  @@index([tenantId, clientId])
  @@index([tenantId, stageId])
}

model Task {
  id          String     @id @default(cuid())
  tenantId    String
  assigneeId  String
  contactId   String?
  campaignId  String?
  title       String
  description String?
  color       String
  dueDate     DateTime?
  status      TaskStatus @default(pending)
  createdAt   DateTime   @default(now())
  updatedAt   DateTime   @updatedAt
  deletedAt   DateTime?
  tenant      Tenant     @relation(fields: [tenantId], references: [id])
  assignee    User       @relation(fields: [assigneeId], references: [id])
  contact     Contact?   @relation(fields: [contactId], references: [id])
  campaign    Campaign?  @relation(fields: [campaignId], references: [id])

  @@index([tenantId, assigneeId])
  @@index([tenantId, status])
}
```

- [ ] **Step 2: Add back-relations to Tenant model**

In the `Tenant` model, after the existing `contactNotes ContactNote[]` line, add:

```prisma
  pipelineStages PipelineStage[]
  pipelineDeals  PipelineDeal[]
  tasks          Task[]
```

- [ ] **Step 3: Add back-relations to Client model**

In the `Client` model, after the existing `campaigns Campaign[]` line, add:

```prisma
  pipelineStages PipelineStage[]
  pipelineDeals  PipelineDeal[]
```

- [ ] **Step 4: Add back-relations to Contact model**

In the `Contact` model, after the existing `notes ContactNote[]` line, add:

```prisma
  pipelineDeals PipelineDeal[]
  tasks         Task[]
```

- [ ] **Step 5: Add back-relations to Campaign model**

In the `Campaign` model, after the existing `scripts Script[]` line, add:

```prisma
  pipelineDeals PipelineDeal[]
  tasks         Task[]
```

- [ ] **Step 6: Add back-relation to User model**

In the `User` model, after the existing `contactNotes ContactNote[]` line, add:

```prisma
  tasks Task[]
```

- [ ] **Step 7: Run migration**

```bash
cd /Users/hannaholsson/LeadforceCRM
npx prisma migrate dev --name add_pipeline_and_tasks
```

Expected: migration file created, client regenerated, no errors.

- [ ] **Step 8: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "Add PipelineStage, PipelineDeal, Task schema models"
```

---

### Task 2: db.ts + auth.ts + TypeScript types + sonner

**Files:**
- Modify: `src/lib/db.ts`
- Modify: `src/lib/auth.ts`
- Modify: `src/types/enums.ts`
- Modify: `src/types/models.ts`
- Modify: `src/app/(dashboard)/layout.tsx`

- [ ] **Step 1: Add new models to TENANT_MODELS and SOFT_DELETE_MODELS in src/lib/db.ts**

Replace:
```typescript
const TENANT_MODELS = new Set(['User', 'Client', 'Campaign', 'Contact', 'CallRecord', 'Session', 'Script', 'ContactNote'])
const SOFT_DELETE_MODELS = new Set(['Campaign', 'Contact', 'ContactNote', 'Script'])
```

With:
```typescript
const TENANT_MODELS = new Set(['User', 'Client', 'Campaign', 'Contact', 'CallRecord', 'Session', 'Script', 'ContactNote', 'PipelineStage', 'PipelineDeal', 'Task'])
const SOFT_DELETE_MODELS = new Set(['Campaign', 'Contact', 'ContactNote', 'Script', 'Task'])
```

- [ ] **Step 2: Add pipeline and task permissions to src/lib/auth.ts**

Replace the `Permission` type:
```typescript
export type Permission =
  | 'clients:read'
  | 'clients:write'
  | 'campaigns:read'
  | 'campaigns:write'
  | 'sdrs:manage'
  | 'contacts:read'
  | 'contacts:write'
  | 'calls:write'
  | 'pipeline:read'
  | 'pipeline:write'
  | 'tasks:read'
  | 'tasks:write'
```

Replace the `ROLE_PERMISSIONS` map:
```typescript
const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  admin:   ['clients:read', 'clients:write', 'campaigns:read', 'campaigns:write', 'sdrs:manage', 'contacts:read', 'contacts:write', 'calls:write', 'pipeline:read', 'pipeline:write', 'tasks:read', 'tasks:write'],
  manager: ['clients:read', 'clients:write', 'campaigns:read', 'campaigns:write', 'sdrs:manage', 'contacts:read', 'contacts:write', 'calls:write', 'pipeline:read', 'pipeline:write', 'tasks:read', 'tasks:write'],
  sdr:     ['campaigns:read', 'contacts:read', 'contacts:write', 'calls:write', 'pipeline:read', 'tasks:read', 'tasks:write'],
  client:  ['campaigns:read', 'pipeline:read'],
}
```

- [ ] **Step 3: Add TaskStatus enum mirror to src/types/enums.ts**

Append to the file:
```typescript
export enum TaskStatus {
  pending = 'pending',
  in_progress = 'in_progress',
  completed = 'completed',
}
```

- [ ] **Step 4: Add pipeline and task types to src/types/models.ts**

Append to the file:
```typescript
export type PipelineStageRow = {
  id: string
  name: string
  color: string
  position: number
}

export type PipelineDealRow = {
  id: string
  stageId: string
  clientId: string
  title: string
  value: string | null
  notes: string | null
  source: string
  createdAt: string
  contact: {
    firstName: string
    lastName: string
    companyName: string | null
  }
  campaign: {
    name: string
  }
}

export type TaskRow = {
  id: string
  title: string
  description: string | null
  color: string
  dueDate: string | null
  status: 'pending' | 'in_progress' | 'completed'
  contactId: string | null
  campaignId: string | null
  assigneeId: string
  createdAt: string
  assignee: { id: string; name: string }
  contact: { id: string; firstName: string; lastName: string } | null
  campaign: { id: string; name: string } | null
}
```

- [ ] **Step 5: Install sonner for toast notifications**

```bash
npx shadcn@latest add sonner
```

Expected: installs sonner package and creates `src/components/ui/sonner.tsx`.

- [ ] **Step 6: Add Toaster to dashboard layout**

In `src/app/(dashboard)/layout.tsx`, add the import and component:
```typescript
import { Toaster } from '@/components/ui/sonner'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden bg-dark">
      <Sidebar />
      <main className="flex-1 overflow-y-auto custom-scrollbar">
        {children}
      </main>
      <Toaster position="bottom-right" theme="dark" />
    </div>
  )
}
```

- [ ] **Step 7: Commit**

```bash
git add src/lib/db.ts src/lib/auth.ts src/types/enums.ts src/types/models.ts src/app/\(dashboard\)/layout.tsx src/components/ui/sonner.tsx package.json package-lock.json
git commit -m "Add pipeline/task permissions, types, sonner toast"
```

---

### Task 3: Pipeline Stages API

**Files:**
- Create: `src/app/api/pipeline/stages/route.ts`

- [ ] **Step 1: Create the route file**

Create `src/app/api/pipeline/stages/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { db, withTenant } from '@/lib/db'
import { hasPermission, getClerkMeta } from '@/lib/auth'

export async function GET(req: NextRequest) {
  try {
    const { role, tenantId } = await getClerkMeta()
    if (!hasPermission(role, 'pipeline:read') || !tenantId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const clientId = req.nextUrl.searchParams.get('clientId')
    if (!clientId) {
      return NextResponse.json({ error: 'clientId required' }, { status: 400 })
    }

    const stages = await withTenant(tenantId, () =>
      db.pipelineStage.findMany({
        where: { clientId },
        orderBy: { position: 'asc' },
        select: { id: true, name: true, color: true, position: true },
      })
    )

    return NextResponse.json({ data: stages })
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/pipeline/stages/route.ts
git commit -m "Add GET /api/pipeline/stages"
```

---

### Task 4: Pipeline Deals API

**Files:**
- Create: `src/app/api/pipeline/deals/route.ts`
- Create: `src/app/api/pipeline/deals/[id]/route.ts`

- [ ] **Step 1: Create GET deals route**

Create `src/app/api/pipeline/deals/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { db, withTenant } from '@/lib/db'
import { hasPermission, getClerkMeta } from '@/lib/auth'

export async function GET(req: NextRequest) {
  try {
    const { role, tenantId } = await getClerkMeta()
    if (!hasPermission(role, 'pipeline:read') || !tenantId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const clientId = req.nextUrl.searchParams.get('clientId')
    if (!clientId) {
      return NextResponse.json({ error: 'clientId required' }, { status: 400 })
    }

    const deals = await withTenant(tenantId, () =>
      db.pipelineDeal.findMany({
        where: { clientId },
        include: {
          contact: { select: { firstName: true, lastName: true, companyName: true } },
          campaign: { select: { name: true } },
        },
        orderBy: { createdAt: 'asc' },
      })
    )

    const serialized = deals.map((d) => ({
      id: d.id,
      stageId: d.stageId,
      clientId: d.clientId,
      title: d.title,
      value: d.value !== null ? d.value.toString() : null,
      notes: d.notes,
      source: d.source,
      createdAt: d.createdAt.toISOString(),
      contact: d.contact,
      campaign: d.campaign,
    }))

    return NextResponse.json({ data: serialized })
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
```

- [ ] **Step 2: Create PATCH deal route**

Create `src/app/api/pipeline/deals/[id]/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db, withTenant } from '@/lib/db'
import { hasPermission, getClerkMeta } from '@/lib/auth'

const PatchSchema = z.object({
  stageId: z.string().min(1).optional(),
  notes:   z.string().nullable().optional(),
  value:   z.number().nonnegative().nullable().optional(),
})

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { role, tenantId } = await getClerkMeta()
    if (!hasPermission(role, 'pipeline:write') || !tenantId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params
    const body = await req.json()
    const parsed = PatchSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid body', details: parsed.error.flatten() }, { status: 400 })
    }

    const deal = await withTenant(tenantId, () =>
      db.pipelineDeal.update({
        where: { id },
        data: {
          ...(parsed.data.stageId !== undefined && { stageId: parsed.data.stageId }),
          ...(parsed.data.notes !== undefined    && { notes: parsed.data.notes }),
          ...(parsed.data.value !== undefined    && { value: parsed.data.value }),
        },
        select: { id: true, stageId: true },
      })
    )

    return NextResponse.json({ data: deal })
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/pipeline/deals/route.ts src/app/api/pipeline/deals/\[id\]/route.ts
git commit -m "Add GET /api/pipeline/deals and PATCH /api/pipeline/deals/[id]"
```

---

### Task 5: Auto-Deal Helper + Unit Tests

**Files:**
- Create: `src/lib/__tests__/auto-deal.test.ts`
- Create: `src/lib/auto-deal.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/__tests__/auto-deal.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { autoCreateDeal } from '../auto-deal'

const mockCampaignFindUnique = vi.fn()
const mockContactFindUnique  = vi.fn()
const mockStageFindFirst     = vi.fn()
const mockDealUpsert         = vi.fn()

const mockTx = {
  campaign:      { findUnique: mockCampaignFindUnique },
  contact:       { findUnique: mockContactFindUnique },
  pipelineStage: { findFirst: mockStageFindFirst },
  pipelineDeal:  { upsert: mockDealUpsert },
} as any

const campaign = { clientId: 'client1' }
const contact  = { firstName: 'John', lastName: 'Smith', companyName: 'Acme Corp' }
const stage    = { id: 'stage1' }

describe('autoCreateDeal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCampaignFindUnique.mockResolvedValue(campaign)
    mockContactFindUnique.mockResolvedValue(contact)
    mockStageFindFirst.mockResolvedValue(stage)
  })

  it('upserts a deal in the first stage', async () => {
    await autoCreateDeal({ contactId: 'c1', campaignId: 'camp1', tenantId: 't1' }, mockTx)
    expect(mockDealUpsert).toHaveBeenCalledWith({
      where:  { contactId_campaignId: { contactId: 'c1', campaignId: 'camp1' } },
      create: {
        tenantId:   't1',
        clientId:   'client1',
        stageId:    'stage1',
        contactId:  'c1',
        campaignId: 'camp1',
        title:      'John Smith — Acme Corp',
        source:     'auto',
      },
      update: { stageId: 'stage1' },
    })
  })

  it('skips when no stages exist for the client', async () => {
    mockStageFindFirst.mockResolvedValue(null)
    await autoCreateDeal({ contactId: 'c1', campaignId: 'camp1', tenantId: 't1' }, mockTx)
    expect(mockDealUpsert).not.toHaveBeenCalled()
  })

  it('generates title without company when companyName is null', async () => {
    mockContactFindUnique.mockResolvedValue({ firstName: 'Jane', lastName: 'Doe', companyName: null })
    await autoCreateDeal({ contactId: 'c1', campaignId: 'camp1', tenantId: 't1' }, mockTx)
    const args = mockDealUpsert.mock.calls[0][0]
    expect(args.create.title).toBe('Jane Doe')
  })

  it('skips when campaign is not found', async () => {
    mockCampaignFindUnique.mockResolvedValue(null)
    await autoCreateDeal({ contactId: 'c1', campaignId: 'camp1', tenantId: 't1' }, mockTx)
    expect(mockDealUpsert).not.toHaveBeenCalled()
  })

  it('skips when contact is not found', async () => {
    mockContactFindUnique.mockResolvedValue(null)
    await autoCreateDeal({ contactId: 'c1', campaignId: 'camp1', tenantId: 't1' }, mockTx)
    expect(mockDealUpsert).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx vitest run src/lib/__tests__/auto-deal.test.ts
```

Expected: all 5 tests fail with "Cannot find module '../auto-deal'".

- [ ] **Step 3: Implement the helper**

Create `src/lib/auto-deal.ts`:

```typescript
import { db } from '@/lib/db'

type TxClient = Parameters<Parameters<typeof db.$transaction>[0]>[0]

interface AutoCreateDealParams {
  contactId:  string
  campaignId: string
  tenantId:   string
}

export async function autoCreateDeal(
  { contactId, campaignId, tenantId }: AutoCreateDealParams,
  tx: TxClient
): Promise<void> {
  const [campaign, contact] = await Promise.all([
    tx.campaign.findUnique({
      where:  { id: campaignId },
      select: { clientId: true },
    }),
    tx.contact.findUnique({
      where:  { id: contactId },
      select: { firstName: true, lastName: true, companyName: true },
    }),
  ])

  if (!campaign || !contact) return

  const firstStage = await tx.pipelineStage.findFirst({
    where:   { clientId: campaign.clientId },
    orderBy: { position: 'asc' },
    select:  { id: true },
  })

  if (!firstStage) return

  const title = contact.companyName
    ? `${contact.firstName} ${contact.lastName} — ${contact.companyName}`
    : `${contact.firstName} ${contact.lastName}`

  await tx.pipelineDeal.upsert({
    where:  { contactId_campaignId: { contactId, campaignId } },
    create: {
      tenantId,
      clientId:   campaign.clientId,
      stageId:    firstStage.id,
      contactId,
      campaignId,
      title,
      source: 'auto',
    },
    update: { stageId: firstStage.id },
  })
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx vitest run src/lib/__tests__/auto-deal.test.ts
```

Expected: all 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/auto-deal.ts src/lib/__tests__/auto-deal.test.ts
git commit -m "Add autoCreateDeal helper with unit tests"
```

---

### Task 6: Wire Auto-Deal into log-outcome Route

**Files:**
- Modify: `src/app/api/dialer/log-outcome/route.ts`

- [ ] **Step 1: Import autoCreateDeal and call it inside the transaction**

At the top of `src/app/api/dialer/log-outcome/route.ts`, add:

```typescript
import { autoCreateDeal } from '@/lib/auto-deal'
```

Inside the `db.$transaction` callback, after both the `manual` and `non-manual` branches call `routeOutcome`, add the auto-deal call. Replace the entire transaction block:

```typescript
const record = await withTenant(tenantId, () =>
  db.$transaction(async (tx) => {
    if (manual) {
      const created = await tx.callRecord.create({
        data: {
          tenantId,
          campaignId:          campaignId!,
          contactId,
          userId:              dbUser.id,
          outcome:             typedOutcome,
          notes:               notes ?? null,
          durationSecs:        0,
          conversationTagged,
        },
        select: { id: true, createdAt: true },
      })
      await routeOutcome(contactId, typedOutcome, tx)
      if (typedOutcome === 'meeting_booked') {
        await autoCreateDeal({ contactId, campaignId: campaignId!, tenantId }, tx)
      }
      return created
    } else {
      const updated = await tx.callRecord.update({
        where: { id: callRecordId! },
        data:  { outcome: typedOutcome, notes: notes ?? null, conversationTagged },
        select: { id: true, campaignId: true, createdAt: true },
      })
      await routeOutcome(contactId, typedOutcome, tx)
      if (typedOutcome === 'meeting_booked') {
        await autoCreateDeal({ contactId, campaignId: updated.campaignId, tenantId }, tx)
      }
      return updated
    }
  })
)
```

Note: for the non-manual (live call) branch, `campaignId` comes from the saved `CallRecord`, not the request body (the request body has `campaignId` as optional). Add `campaignId: true` to the `select` on the `callRecord.update` call so we can pass it to `autoCreateDeal`.

- [ ] **Step 2: Run the outcome-router tests to confirm nothing is broken**

```bash
npx vitest run src/lib/__tests__/outcome-router.test.ts
```

Expected: all existing tests pass.

- [ ] **Step 3: Run all tests**

```bash
npx vitest run
```

Expected: all tests pass (outcome-router + auto-deal).

- [ ] **Step 4: Commit**

```bash
git add src/app/api/dialer/log-outcome/route.ts
git commit -m "Auto-create PipelineDeal on meeting_booked outcome"
```

---

### Task 7: DealCard + KanbanColumn Components

**Files:**
- Create: `src/components/pipeline/DealCard.tsx`
- Create: `src/components/pipeline/KanbanColumn.tsx`

- [ ] **Step 1: Create DealCard**

Create `src/components/pipeline/DealCard.tsx`:

```typescript
'use client'

import { useDraggable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical } from 'lucide-react'
import type { PipelineDealRow } from '@/types/models'

interface DealCardProps {
  deal: PipelineDealRow
  stageColor: string
}

export function DealCard({ deal, stageColor }: DealCardProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: deal.id,
    data: { stageId: deal.stageId },
  })

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), borderLeftColor: stageColor }}
      className={`
        glass-panel rounded-2xl p-4 border-l-2 cursor-grab active:cursor-grabbing
        hover:border-[#00d4ff]/20 transition-colors duration-200
        ${isDragging ? 'opacity-50 shadow-2xl' : ''}
      `}
      {...attributes}
      {...listeners}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-white truncate">
            {deal.contact.firstName} {deal.contact.lastName}
          </p>
          {deal.contact.companyName && (
            <p className="text-xs text-gray-400 truncate mt-0.5">{deal.contact.companyName}</p>
          )}
        </div>
        <GripVertical className="w-4 h-4 text-gray-600 flex-shrink-0 mt-0.5" />
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

- [ ] **Step 2: Create KanbanColumn**

Create `src/components/pipeline/KanbanColumn.tsx`:

```typescript
'use client'

import { useDroppable } from '@dnd-kit/core'
import { DealCard } from './DealCard'
import type { PipelineStageRow, PipelineDealRow } from '@/types/models'

interface KanbanColumnProps {
  stage: PipelineStageRow
  deals: PipelineDealRow[]
}

export function KanbanColumn({ stage, deals }: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id })

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

      <div
        ref={setNodeRef}
        className={`
          min-h-[200px] rounded-2xl p-2 space-y-2 transition-colors duration-150
          ${isOver ? 'bg-white/[0.04]' : 'bg-transparent'}
        `}
      >
        {deals.map((deal) => (
          <DealCard key={deal.id} deal={deal} stageColor={stage.color} />
        ))}

        {deals.length === 0 && !isOver && (
          <div className="h-24 rounded-xl border border-dashed border-white/10 flex items-center justify-center">
            <span className="text-xs text-gray-600">Drop deals here</span>
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/pipeline/DealCard.tsx src/components/pipeline/KanbanColumn.tsx
git commit -m "Add DealCard and KanbanColumn components"
```

---

### Task 8: KanbanBoard + ClientSelector + Pipeline Page

**Files:**
- Create: `src/components/pipeline/ClientSelector.tsx`
- Create: `src/components/pipeline/KanbanBoard.tsx`
- Create: `src/app/(dashboard)/pipeline/page.tsx`

- [ ] **Step 1: Create ClientSelector**

Create `src/components/pipeline/ClientSelector.tsx`:

```typescript
'use client'

import { useRouter } from 'next/navigation'

interface ClientSelectorProps {
  clients: { id: string; name: string }[]
  selectedClientId: string
}

export function ClientSelector({ clients, selectedClientId }: ClientSelectorProps) {
  const router = useRouter()

  return (
    <select
      value={selectedClientId}
      onChange={(e) => router.push(`/pipeline?clientId=${e.target.value}`)}
      className="bg-[#0b0e14] border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#00d4ff]/30"
    >
      {clients.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
        </option>
      ))}
    </select>
  )
}
```

- [ ] **Step 2: Create KanbanBoard**

Create `src/components/pipeline/KanbanBoard.tsx`:

```typescript
'use client'

import { useState } from 'react'
import { DndContext, DragEndEvent, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import { toast } from 'sonner'
import { KanbanColumn } from './KanbanColumn'
import { ClientSelector } from './ClientSelector'
import type { PipelineStageRow, PipelineDealRow } from '@/types/models'

interface KanbanBoardProps {
  clients: { id: string; name: string }[]
  selectedClientId: string
  stages: PipelineStageRow[]
  initialDeals: PipelineDealRow[]
}

function groupByStage(deals: PipelineDealRow[]): Record<string, PipelineDealRow[]> {
  return deals.reduce<Record<string, PipelineDealRow[]>>((acc, deal) => {
    ;(acc[deal.stageId] ??= []).push(deal)
    return acc
  }, {})
}

export function KanbanBoard({ clients, selectedClientId, stages, initialDeals }: KanbanBoardProps) {
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
      next[newStageId] = [...(prev[newStageId] ?? []), { ...deal, stageId: newStageId }]
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
        next[newStageId] = prev[newStageId].filter((d) => d.id !== dealId)
        next[currentStageId] = [...(prev[currentStageId] ?? []), { ...deal, stageId: currentStageId }]
        return next
      })
      toast.error('Failed to move deal — please try again')
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Pipeline</h1>
          <p className="text-sm text-gray-400 mt-0.5">Track deals through your sales stages</p>
        </div>
        <ClientSelector clients={clients} selectedClientId={selectedClientId} />
      </div>

      {stages.length === 0 ? (
        <div className="glass-panel rounded-3xl p-12 text-center">
          <p className="text-gray-400 text-sm">No pipeline stages configured for this client.</p>
          <p className="text-gray-600 text-xs mt-1">Add stages in Settings to get started.</p>
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

- [ ] **Step 3: Create pipeline page**

Create `src/app/(dashboard)/pipeline/page.tsx`:

```typescript
import { redirect } from 'next/navigation'
import { db, withTenant } from '@/lib/db'
import { getCurrentTenantId, getCurrentUserRole, hasPermission } from '@/lib/auth'
import { KanbanBoard } from '@/components/pipeline/KanbanBoard'
import { Header } from '@/components/layout/Header'
import { PageShell } from '@/components/layout/PageShell'
import type { PipelineDealRow } from '@/types/models'

export default async function PipelinePage({
  searchParams,
}: {
  searchParams: Promise<{ clientId?: string }>
}) {
  const tenantId = await getCurrentTenantId()
  if (!tenantId) redirect('/sign-in')

  const role = await getCurrentUserRole()
  if (!role || !hasPermission(role, 'pipeline:read')) redirect('/')

  const sp = await searchParams

  const clients = await withTenant(tenantId, () =>
    db.client.findMany({
      where:   { deletedAt: null },
      select:  { id: true, name: true },
      orderBy: { createdAt: 'asc' },
    })
  )

  const selectedClientId = sp.clientId ?? clients[0]?.id

  if (!selectedClientId) {
    return (
      <>
        <Header title="Pipeline" subtitle="Track deals through your sales stages" />
        <PageShell>
          <div className="glass-panel rounded-3xl p-12 text-center">
            <p className="text-gray-400 text-sm">No clients found. Create a client first.</p>
          </div>
        </PageShell>
      </>
    )
  }

  const [stages, rawDeals] = await withTenant(tenantId, async () =>
    Promise.all([
      db.pipelineStage.findMany({
        where:   { clientId: selectedClientId },
        orderBy: { position: 'asc' },
        select:  { id: true, name: true, color: true, position: true },
      }),
      db.pipelineDeal.findMany({
        where:   { clientId: selectedClientId },
        include: {
          contact:  { select: { firstName: true, lastName: true, companyName: true } },
          campaign: { select: { name: true } },
        },
        orderBy: { createdAt: 'asc' },
      }),
    ])
  )

  const deals: PipelineDealRow[] = rawDeals.map((d) => ({
    id:        d.id,
    stageId:   d.stageId,
    clientId:  d.clientId,
    title:     d.title,
    value:     d.value !== null ? d.value.toString() : null,
    notes:     d.notes,
    source:    d.source,
    createdAt: d.createdAt.toISOString(),
    contact:   d.contact,
    campaign:  d.campaign,
  }))

  return (
    <>
      <Header title="Pipeline" subtitle="Track deals through your sales stages" />
      <PageShell>
        <KanbanBoard
          clients={clients}
          selectedClientId={selectedClientId}
          stages={stages}
          initialDeals={deals}
        />
      </PageShell>
    </>
  )
}
```

- [ ] **Step 4: Seed pipeline stages for manual testing**

Before testing in the browser, create at least one client's pipeline stages using Prisma Studio or by running this one-time snippet in a `ts-node` script. Open Prisma Studio and add 3 `PipelineStage` records for an existing client:
- Position 0: name "Meeting Booked", color "#00d4ff"
- Position 1: name "Meeting Confirmed", color "#22c55e"
- Position 2: name "Proposal Sent", color "#f59e0b"

Then log a Meeting Booked outcome on a contact in that client's campaign to verify a deal auto-creates and appears on the board.

- [ ] **Step 5: Commit**

```bash
git add src/components/pipeline/ src/app/\(dashboard\)/pipeline/
git commit -m "Add Pipeline Kanban page with drag-and-drop deal cards"
```

---

### Task 9: Tasks API

**Files:**
- Create: `src/app/api/tasks/route.ts`
- Create: `src/app/api/tasks/[id]/route.ts`

- [ ] **Step 1: Create tasks collection route (GET + POST)**

Create `src/app/api/tasks/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { db, withTenant } from '@/lib/db'
import { hasPermission, getClerkMeta } from '@/lib/auth'

const CreateTaskSchema = z.object({
  title:       z.string().min(1),
  description: z.string().optional(),
  color:       z.string().min(1),
  dueDate:     z.string().datetime().optional(),
  status:      z.enum(['pending', 'in_progress', 'completed']).default('pending'),
  contactId:   z.string().optional(),
  campaignId:  z.string().optional(),
  assigneeId:  z.string().optional(),
})

export async function GET(req: NextRequest) {
  try {
    const { userId: clerkId } = await auth()
    if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { role, tenantId } = await getClerkMeta()
    if (!hasPermission(role, 'tasks:read') || !tenantId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const sp         = req.nextUrl.searchParams
    const status     = sp.get('status') ?? undefined
    const contactId  = sp.get('contactId') ?? undefined
    const campaignId = sp.get('campaignId') ?? undefined
    const cursor     = sp.get('cursor') ?? undefined
    const limit      = Math.min(100, parseInt(sp.get('limit') ?? '25'))

    const dbUser = await withTenant(tenantId, () =>
      db.user.findFirst({ where: { clerkId }, select: { id: true } })
    )
    if (!dbUser) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    const isSdr = role === 'sdr'

    const tasks = await withTenant(tenantId, () =>
      db.task.findMany({
        where: {
          ...(isSdr  && { assigneeId: dbUser.id }),
          ...(status && { status: status as 'pending' | 'in_progress' | 'completed' }),
          ...(contactId  && { contactId }),
          ...(campaignId && { campaignId }),
        },
        include: {
          assignee: { select: { id: true, name: true } },
          contact:  { select: { id: true, firstName: true, lastName: true } },
          campaign: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
        take:    limit + 1,
        ...(cursor && { cursor: { id: cursor }, skip: 1 }),
      })
    )

    const hasMore  = tasks.length > limit
    const data     = hasMore ? tasks.slice(0, limit) : tasks
    const nextCursor = hasMore ? data[data.length - 1].id : null

    const serialized = data.map((t) => ({
      id:          t.id,
      title:       t.title,
      description: t.description,
      color:       t.color,
      dueDate:     t.dueDate?.toISOString() ?? null,
      status:      t.status,
      contactId:   t.contactId,
      campaignId:  t.campaignId,
      assigneeId:  t.assigneeId,
      createdAt:   t.createdAt.toISOString(),
      assignee:    t.assignee,
      contact:     t.contact,
      campaign:    t.campaign,
    }))

    return NextResponse.json({ data: serialized, nextCursor })
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const { userId: clerkId } = await auth()
    if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { role, tenantId } = await getClerkMeta()
    if (!hasPermission(role, 'tasks:write') || !tenantId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body   = await req.json()
    const parsed = CreateTaskSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid body', details: parsed.error.flatten() }, { status: 400 })
    }

    const dbUser = await withTenant(tenantId, () =>
      db.user.findFirst({ where: { clerkId }, select: { id: true } })
    )
    if (!dbUser) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    const isSdr    = role === 'sdr'
    const assigneeId = isSdr ? dbUser.id : (parsed.data.assigneeId ?? dbUser.id)

    const task = await withTenant(tenantId, () =>
      db.task.create({
        data: {
          tenantId,
          assigneeId,
          title:       parsed.data.title,
          description: parsed.data.description ?? null,
          color:       parsed.data.color,
          dueDate:     parsed.data.dueDate ? new Date(parsed.data.dueDate) : null,
          status:      parsed.data.status,
          contactId:   parsed.data.contactId ?? null,
          campaignId:  parsed.data.campaignId ?? null,
        },
        select: { id: true },
      })
    )

    return NextResponse.json({ data: task }, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
```

- [ ] **Step 2: Create task item route (PATCH + DELETE)**

Create `src/app/api/tasks/[id]/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db, withTenant } from '@/lib/db'
import { hasPermission, getClerkMeta } from '@/lib/auth'

const PatchTaskSchema = z.object({
  title:       z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  color:       z.string().min(1).optional(),
  dueDate:     z.string().datetime().nullable().optional(),
  status:      z.enum(['pending', 'in_progress', 'completed']).optional(),
  contactId:   z.string().nullable().optional(),
  campaignId:  z.string().nullable().optional(),
  assigneeId:  z.string().optional(),
})

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { role, tenantId } = await getClerkMeta()
    if (!hasPermission(role, 'tasks:write') || !tenantId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params
    const body   = await req.json()
    const parsed = PatchTaskSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid body', details: parsed.error.flatten() }, { status: 400 })
    }

    const { dueDate, ...rest } = parsed.data
    const task = await withTenant(tenantId, () =>
      db.task.update({
        where: { id },
        data: {
          ...rest,
          ...(dueDate !== undefined && { dueDate: dueDate ? new Date(dueDate) : null }),
        },
        select: { id: true, status: true },
      })
    )

    return NextResponse.json({ data: task })
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { role, tenantId } = await getClerkMeta()
    if (!hasPermission(role, 'tasks:write') || !tenantId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params
    await withTenant(tenantId, () =>
      db.task.update({
        where: { id },
        data:  { deletedAt: new Date() },
      })
    )

    return NextResponse.json({ data: { success: true } })
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/tasks/
git commit -m "Add tasks API: GET, POST, PATCH, DELETE"
```

---

### Task 10: TaskRow + TaskList + Schedule Page

**Files:**
- Create: `src/components/schedule/TaskRow.tsx`
- Create: `src/components/schedule/TaskList.tsx`
- Create: `src/app/(dashboard)/schedule/page.tsx`

- [ ] **Step 1: Create TaskRow**

Create `src/components/schedule/TaskRow.tsx`:

```typescript
'use client'

import { Pencil, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { TaskRow } from '@/types/models'

interface TaskRowProps {
  task: TaskRow
  checked: boolean
  showAssignee: boolean
  onToggle: (id: string) => void
  onEdit: (task: TaskRow) => void
  onDelete: (id: string) => void
}

export function TaskRow({ task, checked, showAssignee, onToggle, onEdit, onDelete }: TaskRowProps) {
  const isOverdue = task.dueDate && !checked && new Date(task.dueDate) < new Date()

  return (
    <div className="group flex items-center gap-3 p-2.5 rounded-xl hover:bg-white/5 border border-transparent hover:border-white/10 transition-colors duration-150">
      <span
        className="w-3 h-3 rounded-full flex-shrink-0"
        style={{ backgroundColor: task.color }}
      />

      <button
        type="button"
        onClick={() => onToggle(task.id)}
        className={cn(
          'w-5 h-5 rounded border flex-shrink-0 flex items-center justify-center transition-colors duration-150',
          checked
            ? 'border-[#00d4ff] bg-[#00d4ff]/20'
            : 'border-white/20 bg-white/5 hover:border-[#00d4ff]/50'
        )}
        aria-label={checked ? 'Mark incomplete' : 'Mark complete'}
      >
        {checked && (
          <svg className="w-3 h-3 text-[#00d4ff]" viewBox="0 0 12 12" fill="none">
            <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>

      <div className="flex-1 min-w-0">
        <span
          className={cn(
            'text-sm transition-colors duration-150',
            checked ? 'line-through text-gray-500 decoration-gray-600' : 'text-gray-300 group-hover:text-white'
          )}
        >
          {task.title}
        </span>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          {task.contact && (
            <span className="text-[10px] bg-white/5 text-gray-400 px-1.5 py-0.5 rounded-full">
              {task.contact.firstName} {task.contact.lastName}
            </span>
          )}
          {task.campaign && (
            <span className="text-[10px] bg-white/5 text-gray-400 px-1.5 py-0.5 rounded-full">
              {task.campaign.name}
            </span>
          )}
          {task.dueDate && (
            <span className={cn('text-[10px]', isOverdue ? 'text-red-400' : 'text-gray-600')}>
              {new Date(task.dueDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
            </span>
          )}
          {showAssignee && (
            <span className="text-[10px] text-gray-600">{task.assignee.name}</span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150 flex-shrink-0">
        <button
          type="button"
          onClick={() => onEdit(task)}
          className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/10 transition-colors duration-150"
          aria-label="Edit task"
        >
          <Pencil className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() => onDelete(task.id)}
          className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:text-red-400 hover:bg-red-500/10 transition-colors duration-150"
          aria-label="Delete task"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create TaskList**

Create `src/components/schedule/TaskList.tsx`:

```typescript
'use client'

import { useState } from 'react'
import { Plus, CheckSquare } from 'lucide-react'
import { toast } from 'sonner'
import { TaskRow } from './TaskRow'
import { TaskDrawer } from './TaskDrawer'
import { cn } from '@/lib/utils'
import type { TaskRow as TaskRowType } from '@/types/models'

type StatusFilter = 'all' | 'pending' | 'in_progress' | 'completed'

const STATUS_TABS: { label: string; value: StatusFilter }[] = [
  { label: 'All',         value: 'all' },
  { label: 'Pending',     value: 'pending' },
  { label: 'In Progress', value: 'in_progress' },
  { label: 'Completed',   value: 'completed' },
]

interface TaskListProps {
  initialTasks: TaskRowType[]
  isManager: boolean
  currentUserId: string
}

export function TaskList({ initialTasks, isManager, currentUserId }: TaskListProps) {
  const [tasks, setTasks]           = useState<TaskRowType[]>(initialTasks)
  const [statusFilter, setFilter]   = useState<StatusFilter>('all')
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [editingTask, setEditingTask] = useState<TaskRowType | null>(null)

  const filtered = tasks.filter((t) => {
    if (statusFilter === 'all') return true
    return t.status === statusFilter
  })

  async function handleToggle(id: string) {
    const task = tasks.find((t) => t.id === id)
    if (!task) return

    const newStatus = task.status === 'completed' ? 'pending' : 'completed'

    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, status: newStatus } : t))
    )

    try {
      const res = await fetch(`/api/tasks/${id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ status: newStatus }),
      })
      if (!res.ok) throw new Error()
    } catch {
      setTasks((prev) =>
        prev.map((t) => (t.id === id ? { ...t, status: task.status } : t))
      )
      toast.error('Failed to update task')
    }
  }

  async function handleDelete(id: string) {
    const task = tasks.find((t) => t.id === id)
    setTasks((prev) => prev.filter((t) => t.id !== id))

    try {
      const res = await fetch(`/api/tasks/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
    } catch {
      if (task) setTasks((prev) => [task, ...prev])
      toast.error('Failed to delete task')
    }
  }

  function handleSaved(task: TaskRowType) {
    setTasks((prev) => {
      const exists = prev.find((t) => t.id === task.id)
      return exists
        ? prev.map((t) => (t.id === task.id ? task : t))
        : [task, ...prev]
    })
    setDrawerOpen(false)
    setEditingTask(null)
  }

  function handleEdit(task: TaskRowType) {
    setEditingTask(task)
    setDrawerOpen(true)
  }

  function handleNewTask() {
    setEditingTask(null)
    setDrawerOpen(true)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div className="flex items-center gap-1 bg-white/5 rounded-xl p-1">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => setFilter(tab.value)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors duration-150',
                statusFilter === tab.value
                  ? 'bg-[#00d4ff]/10 text-[#00d4ff]'
                  : 'text-gray-400 hover:text-white'
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={handleNewTask}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-[#00d4ff] to-cyan-600 text-black text-sm font-semibold shadow-xl shadow-[#00d4ff]/30"
        >
          <Plus className="w-4 h-4" />
          New Task
        </button>
      </div>

      <div className="glass-panel rounded-2xl p-2">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <CheckSquare className="w-8 h-8 text-gray-600" />
            <p className="text-sm text-gray-400">No tasks yet</p>
            <button
              type="button"
              onClick={handleNewTask}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-[#00d4ff] to-cyan-600 text-black text-sm font-semibold"
            >
              <Plus className="w-4 h-4" />
              New Task
            </button>
          </div>
        ) : (
          <div className="space-y-0.5">
            {filtered.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                checked={task.status === 'completed'}
                showAssignee={isManager}
                onToggle={handleToggle}
                onEdit={handleEdit}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </div>

      <TaskDrawer
        open={drawerOpen}
        task={editingTask}
        isManager={isManager}
        currentUserId={currentUserId}
        onClose={() => { setDrawerOpen(false); setEditingTask(null) }}
        onSaved={handleSaved}
      />
    </div>
  )
}
```

- [ ] **Step 3: Create schedule page**

Create `src/app/(dashboard)/schedule/page.tsx`:

```typescript
import { redirect } from 'next/navigation'
import { auth } from '@clerk/nextjs/server'
import { db, withTenant } from '@/lib/db'
import { getCurrentTenantId, getCurrentUserRole, hasPermission } from '@/lib/auth'
import { TaskList } from '@/components/schedule/TaskList'
import { Header } from '@/components/layout/Header'
import { PageShell } from '@/components/layout/PageShell'
import type { TaskRow } from '@/types/models'

export default async function SchedulePage() {
  const tenantId = await getCurrentTenantId()
  if (!tenantId) redirect('/sign-in')

  const role = await getCurrentUserRole()
  if (!role || !hasPermission(role, 'tasks:read')) redirect('/')

  const { userId: clerkId } = await auth()
  if (!clerkId) redirect('/sign-in')

  const dbUser = await withTenant(tenantId, () =>
    db.user.findFirst({ where: { clerkId }, select: { id: true } })
  )
  if (!dbUser) redirect('/sign-in')

  const isManager = role === 'admin' || role === 'manager'

  const rawTasks = await withTenant(tenantId, () =>
    db.task.findMany({
      where: {
        ...(!isManager && { assigneeId: dbUser.id }),
      },
      include: {
        assignee: { select: { id: true, name: true } },
        contact:  { select: { id: true, firstName: true, lastName: true } },
        campaign: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    })
  )

  const tasks: TaskRow[] = rawTasks.map((t) => ({
    id:          t.id,
    title:       t.title,
    description: t.description,
    color:       t.color,
    dueDate:     t.dueDate?.toISOString() ?? null,
    status:      t.status,
    contactId:   t.contactId,
    campaignId:  t.campaignId,
    assigneeId:  t.assigneeId,
    createdAt:   t.createdAt.toISOString(),
    assignee:    t.assignee,
    contact:     t.contact,
    campaign:    t.campaign,
  }))

  return (
    <>
      <Header title="Schedule" subtitle="Your tasks and to-dos" />
      <PageShell>
        <TaskList
          initialTasks={tasks}
          isManager={isManager}
          currentUserId={dbUser.id}
        />
      </PageShell>
    </>
  )
}
```

- [ ] **Step 4: Commit**

```bash
git add src/components/schedule/TaskRow.tsx src/components/schedule/TaskList.tsx src/app/\(dashboard\)/schedule/
git commit -m "Add Schedule page with task list and optimistic checkbox"
```

---

### Task 11: TaskDrawer Component

**Files:**
- Create: `src/components/schedule/TaskDrawer.tsx`

- [ ] **Step 1: Create TaskDrawer**

Create `src/components/schedule/TaskDrawer.tsx`:

```typescript
'use client'

import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { SlideDrawer } from '@/components/shared/SlideDrawer'
import type { TaskRow } from '@/types/models'

const PRESET_COLORS = [
  '#00d4ff', '#22c55e', '#f59e0b', '#ef4444',
  '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16',
  '#f97316', '#64748b', '#e2e8f0', '#ffffff',
]

const TaskSchema = z.object({
  title:       z.string().min(1, 'Title is required'),
  description: z.string().optional(),
  color:       z.string().min(1),
  dueDate:     z.string().optional(),
  status:      z.enum(['pending', 'in_progress', 'completed']),
  contactId:   z.string().optional(),
  campaignId:  z.string().optional(),
})

type TaskFormValues = z.infer<typeof TaskSchema>

interface TaskDrawerProps {
  open:          boolean
  task:          TaskRow | null
  isManager:     boolean
  currentUserId: string
  onClose:       () => void
  onSaved:       (task: TaskRow) => void
}

export function TaskDrawer({ open, task, isManager, currentUserId, onClose, onSaved }: TaskDrawerProps) {
  const [saving, setSaving] = useState(false)

  const { register, handleSubmit, setValue, watch, reset, formState: { errors } } = useForm<TaskFormValues>({
    resolver: zodResolver(TaskSchema),
    defaultValues: {
      title:       '',
      description: '',
      color:       PRESET_COLORS[0],
      status:      'pending',
    },
  })

  const selectedColor = watch('color')

  useEffect(() => {
    if (open) {
      if (task) {
        reset({
          title:       task.title,
          description: task.description ?? '',
          color:       task.color,
          dueDate:     task.dueDate ? task.dueDate.slice(0, 10) : '',
          status:      task.status,
          contactId:   task.contactId ?? '',
          campaignId:  task.campaignId ?? '',
        })
      } else {
        reset({
          title:       '',
          description: '',
          color:       PRESET_COLORS[0],
          status:      'pending',
          dueDate:     '',
          contactId:   '',
          campaignId:  '',
        })
      }
    }
  }, [open, task, reset])

  async function onSubmit(values: TaskFormValues) {
    setSaving(true)
    try {
      const url    = task ? `/api/tasks/${task.id}` : '/api/tasks'
      const method = task ? 'PATCH' : 'POST'

      const body = {
        ...values,
        dueDate:   values.dueDate ? new Date(values.dueDate).toISOString() : undefined,
        contactId:  values.contactId  || undefined,
        campaignId: values.campaignId || undefined,
        ...(!task && !isManager && { assigneeId: currentUserId }),
      }

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      })

      if (!res.ok) throw new Error()

      if (task) {
        onSaved({ ...task, ...values, dueDate: values.dueDate ? new Date(values.dueDate).toISOString() : null })
      } else {
        const { data } = await res.json()
        onSaved({
          id:          data.id,
          title:       values.title,
          description: values.description ?? null,
          color:       values.color,
          dueDate:     values.dueDate ? new Date(values.dueDate).toISOString() : null,
          status:      values.status,
          contactId:   values.contactId  ?? null,
          campaignId:  values.campaignId ?? null,
          assigneeId:  currentUserId,
          createdAt:   new Date().toISOString(),
          assignee:    { id: currentUserId, name: 'You' },
          contact:     null,
          campaign:    null,
        })
      }

      toast.success(task ? 'Task updated' : 'Task created')
    } catch {
      toast.error('Failed to save task')
    } finally {
      setSaving(false)
    }
  }

  return (
    <SlideDrawer open={open} onClose={onClose} title={task ? 'Edit Task' : 'New Task'}>
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col flex-1 overflow-hidden">
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">

          {/* Title */}
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5">Title *</label>
            <input
              {...register('title')}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[#00d4ff]/50"
              placeholder="Task title"
            />
            {errors.title && <p className="text-red-400 text-xs mt-1">{errors.title.message}</p>}
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5">Description</label>
            <textarea
              {...register('description')}
              rows={3}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[#00d4ff]/50 resize-none"
              placeholder="Optional details..."
            />
          </div>

          {/* Color */}
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5">Color</label>
            <div className="flex flex-wrap gap-2 mb-2">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setValue('color', c)}
                  className={`w-6 h-6 rounded-full transition-transform duration-150 ${selectedColor === c ? 'scale-125 ring-2 ring-white/30' : 'hover:scale-110'}`}
                  style={{ backgroundColor: c }}
                  aria-label={c}
                />
              ))}
            </div>
            <div className="flex items-center gap-2">
              <span className="w-5 h-5 rounded-full flex-shrink-0" style={{ backgroundColor: selectedColor }} />
              <input
                {...register('color')}
                className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-[#00d4ff]/50"
                placeholder="#00d4ff"
              />
            </div>
          </div>

          {/* Status */}
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5">Status</label>
            <select
              {...register('status')}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-[#00d4ff]/50"
            >
              <option value="pending">Pending</option>
              <option value="in_progress">In Progress</option>
              <option value="completed">Completed</option>
            </select>
          </div>

          {/* Due Date */}
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5">Due Date</label>
            <input
              type="date"
              {...register('dueDate')}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-[#00d4ff]/50"
            />
          </div>

        </div>

        {/* Footer */}
        <div className="flex-shrink-0 flex items-center justify-end gap-3 px-6 py-4 border-t border-white/5">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-gray-300 text-sm hover:bg-white/10 transition-colors duration-150"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#00d4ff] to-cyan-600 text-black text-sm font-semibold shadow-xl shadow-[#00d4ff]/30 disabled:opacity-50"
          >
            {saving ? 'Saving…' : task ? 'Save Changes' : 'Create Task'}
          </button>
        </div>
      </form>
    </SlideDrawer>
  )
}
```

- [ ] **Step 2: Install @hookform/resolvers if not already installed**

```bash
npm ls @hookform/resolvers 2>/dev/null || npm install @hookform/resolvers
```

- [ ] **Step 3: Verify the build compiles**

```bash
npx tsc --noEmit
```

Expected: no type errors. Fix any that appear before committing.

- [ ] **Step 4: Commit**

```bash
git add src/components/schedule/TaskDrawer.tsx package.json package-lock.json
git commit -m "Add TaskDrawer component with color picker and form"
```

---

## Self-Review Notes

- All TypeScript types defined in Task 2 before first use in Tasks 3–11 ✓
- `autoCreateDeal` helper tested before being integrated into log-outcome ✓  
- `PipelineDeal.upsert` passes `tenantId` explicitly in `create` since db.ts middleware does not intercept `upsert` operations ✓
- `CallRecord.update` select extended to include `campaignId` in Task 6 (needed for the non-manual branch auto-deal call) ✓
- `searchParams: Promise<SearchParams>` pattern matches Next.js 16 and existing page conventions ✓
- Sidebar already contains `/pipeline` and `/schedule` nav links — no sidebar changes needed ✓
- `sonner` installed via shadcn to stay consistent with the existing UI component approach ✓
