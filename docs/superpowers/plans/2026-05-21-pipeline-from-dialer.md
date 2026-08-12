# Pipeline from Dialer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let SDRs optionally add a contact to a pipeline stage (or pending queue) when logging a call outcome, replace Meeting Booked auto-deal creation with this explicit UI, show pending contacts on the pipeline page, and add an expanded read-only contact panel to deal cards.

**Architecture:** A new `PendingPipelineDeal` Prisma model holds contacts queued without a stage. The disposition form gains a pipeline toggle for four qualifying outcomes; submission sends an optional `stageId` or `addToQueue` flag to the existing log-outcome API route. The pipeline page fetches pending deals and renders them above the Kanban columns. Deal cards expand inline to show full contact data fetched on demand.

**Tech Stack:** Next.js 14 App Router, Prisma, TypeScript, Zustand, Shadcn/UI, Tailwind, Vitest, `@dnd-kit/core`

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Modify | `prisma/schema.prisma` | Add `PendingPipelineDeal` model and back-relations |
| Modify | `src/lib/outcome-router.ts` | Export `PIPELINE_ELIGIBLE_OUTCOMES` set |
| Modify | `src/types/models.ts` | Add `contactId` to `PipelineDealRow`; add `PendingPipelineDealRow` type |
| Create | `src/app/api/dialer/pipeline-stages/route.ts` | GET stages by campaignId for disposition form |
| Modify | `src/app/api/dialer/log-outcome/route.ts` | Accept `stageId`/`addToQueue`/`clientId`; create deal or pending record; remove autoCreateDeal call |
| Create | `src/app/api/pipeline/pending/route.ts` | GET pending deals by clientId |
| Create | `src/app/api/pipeline/pending/[id]/place/route.ts` | POST — create deal, delete pending |
| Create | `src/app/api/pipeline/pending/[id]/route.ts` | DELETE — dismiss pending |
| Modify | `src/components/dialer/DispositionForm.tsx` | Add `campaignId` prop, pipeline toggle, stage selector |
| Modify | `src/components/dialer/CallControls.tsx` | Pass `campaignId` from store to DispositionForm; forward pipeline params |
| Modify | `src/stores/dialer-store.ts` | Update `logOutcome` and `logManualOutcome` to accept optional pipeline params |
| Modify | `src/app/(dashboard)/pipeline/page.tsx` | Fetch pending deals + pending count; add empty-stages state |
| Create | `src/components/pipeline/PendingPipelineSection.tsx` | Collapsible pending queue with place/dismiss |
| Modify | `src/components/pipeline/KanbanBoard.tsx` | Accept + render `PendingPipelineSection`; render empty-stages state |
| Modify | `src/app/(dashboard)/pipeline/page.tsx` | (second pass) pass pending data to KanbanBoard |
| Create | `src/components/pipeline/DealExpandPanel.tsx` | Read-only contact info fetched on demand |
| Modify | `src/components/pipeline/DealCard.tsx` | Click-to-expand toggle; render `DealExpandPanel` |
| Modify | `src/app/(dashboard)/layout.tsx` | Fetch pending count; pass to Sidebar |
| Modify | `src/components/layout/Sidebar.tsx` | Accept `pendingPipelineCount` prop; show badge on Pipeline nav item |

---

## Task 1: Database schema — PendingPipelineDeal

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add the PendingPipelineDeal model and its back-relations**

Open `prisma/schema.prisma`. Add after the `PipelineDeal` model block:

```prisma
model PendingPipelineDeal {
  id         String      @id @default(cuid())
  tenantId   String
  clientId   String
  contactId  String
  campaignId String
  outcome    CallOutcome
  createdAt  DateTime    @default(now())

  tenant     Tenant      @relation(fields: [tenantId], references: [id])
  client     Client      @relation(fields: [clientId], references: [id])
  contact    Contact     @relation(fields: [contactId], references: [id])
  campaign   Campaign    @relation(fields: [campaignId], references: [id])

  @@unique([contactId, campaignId])
  @@index([tenantId, clientId])
}
```

Also add back-relations to the four models that reference it. In each model, add one line:

- **Tenant** (around line 64): `pendingPipelineDeals PendingPipelineDeal[]`
- **Client** (around line 110): `pendingPipelineDeals PendingPipelineDeal[]`
- **Contact** (around line 164): `pendingPipelineDeals PendingPipelineDeal[]`
- **Campaign** (around line 131): `pendingPipelineDeals PendingPipelineDeal[]`

- [ ] **Step 2: Generate Prisma client and create migration**

```bash
npx prisma migrate dev --name add_pending_pipeline_deal
```

Expected: migration file created, Prisma client regenerated with `PendingPipelineDeal` type available.

- [ ] **Step 3: Verify**

```bash
npx prisma studio
```

Confirm `PendingPipelineDeal` table appears. Then close Studio (Ctrl+C).

- [ ] **Step 4: Commit**

```bash
git add prisma/
git commit -m "Add PendingPipelineDeal schema model"
```

---

## Task 2: Types and pipeline-eligible outcomes constant

**Files:**
- Modify: `src/lib/outcome-router.ts`
- Modify: `src/types/models.ts`
- Create: `src/lib/__tests__/pipeline-eligible.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/__tests__/pipeline-eligible.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { PIPELINE_ELIGIBLE_OUTCOMES } from '../outcome-router'

describe('PIPELINE_ELIGIBLE_OUTCOMES', () => {
  it('includes connected, lead, call_back_later, meeting_booked', () => {
    expect(PIPELINE_ELIGIBLE_OUTCOMES.has('connected')).toBe(true)
    expect(PIPELINE_ELIGIBLE_OUTCOMES.has('lead')).toBe(true)
    expect(PIPELINE_ELIGIBLE_OUTCOMES.has('call_back_later')).toBe(true)
    expect(PIPELINE_ELIGIBLE_OUTCOMES.has('meeting_booked')).toBe(true)
  })

  it('does not include no_answer, voicemail, disqualified', () => {
    expect(PIPELINE_ELIGIBLE_OUTCOMES.has('no_answer')).toBe(false)
    expect(PIPELINE_ELIGIBLE_OUTCOMES.has('voicemail')).toBe(false)
    expect(PIPELINE_ELIGIBLE_OUTCOMES.has('disqualified')).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/lib/__tests__/pipeline-eligible.test.ts
```

Expected: FAIL — `PIPELINE_ELIGIBLE_OUTCOMES` is not exported.

- [ ] **Step 3: Export the constant from outcome-router.ts**

Open `src/lib/outcome-router.ts`. Add near the top alongside `CONVERSATION_TAGGED_OUTCOMES`:

```typescript
export const PIPELINE_ELIGIBLE_OUTCOMES = new Set<CallOutcome>([
  'connected',
  'lead',
  'call_back_later',
  'meeting_booked',
])
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/lib/__tests__/pipeline-eligible.test.ts
```

Expected: PASS

- [ ] **Step 5: Update PipelineDealRow and add PendingPipelineDealRow in types/models.ts**

Open `src/types/models.ts`. In the `PipelineDealRow` type, add `contactId`:

```typescript
export type PipelineDealRow = {
  id:        string
  stageId:   string
  clientId:  string
  contactId: string          // ← add this
  title:     string
  value:     string | null
  notes:     string | null
  source:    string
  createdAt: string
  contact: {
    firstName:   string
    lastName:    string
    companyName: string | null
  }
  campaign: {
    name: string
  }
}
```

Then add the new type after `PipelineDealRow`:

```typescript
export type PendingPipelineDealRow = {
  id:          string
  clientId:    string
  contactId:   string
  campaignId:  string
  outcome:     string
  createdAt:   string
  contact: {
    firstName:   string
    lastName:    string
    companyName: string | null
    jobTitle:    string | null
  }
  campaign: {
    name: string
  }
}
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/outcome-router.ts src/types/models.ts src/lib/__tests__/pipeline-eligible.test.ts
git commit -m "Add PIPELINE_ELIGIBLE_OUTCOMES constant and PendingPipelineDealRow type"
```

---

## Task 3: New API endpoint — GET /api/dialer/pipeline-stages

**Files:**
- Create: `src/app/api/dialer/pipeline-stages/route.ts`

- [ ] **Step 1: Create the route file**

Create `src/app/api/dialer/pipeline-stages/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db, withTenant } from '@/lib/db'
import { hasPermission, getClerkMeta } from '@/lib/auth'

export async function GET(req: NextRequest) {
  try {
    const { userId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { role, tenantId } = await getClerkMeta()
    if (!hasPermission(role, 'calls:write') || !tenantId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const campaignId = req.nextUrl.searchParams.get('campaignId')
    if (!campaignId) {
      return NextResponse.json({ error: 'campaignId required' }, { status: 400 })
    }

    const campaign = await withTenant(tenantId, () =>
      db.campaign.findUnique({
        where:  { id: campaignId },
        select: { clientId: true },
      })
    )

    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
    }

    const stages = await withTenant(tenantId, () =>
      db.pipelineStage.findMany({
        where:   { clientId: campaign.clientId },
        select:  { id: true, name: true, color: true },
        orderBy: { position: 'asc' },
      })
    )

    return NextResponse.json({ data: { clientId: campaign.clientId, stages } })
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
```

- [ ] **Step 2: Verify the route exists and TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors related to this file.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/dialer/pipeline-stages/
git commit -m "Add GET /api/dialer/pipeline-stages endpoint"
```

---

## Task 4: Update log-outcome API — stageId, addToQueue, remove auto-deal

**Files:**
- Modify: `src/app/api/dialer/log-outcome/route.ts`

- [ ] **Step 1: Update the body schema**

Open `src/app/api/dialer/log-outcome/route.ts`. Replace the `BodySchema` definition with:

```typescript
const BodySchema = z.object({
  manual:       z.boolean().optional().default(false),
  callRecordId: z.string().min(1).optional(),
  campaignId:   z.string().min(1).optional(),
  outcome:      z.enum(OUTCOME_ENUM),
  notes:        z.string().optional(),
  contactId:    z.string().min(1),
  stageId:      z.string().min(1).optional(),
  addToQueue:   z.boolean().optional().default(false),
  clientId:     z.string().min(1).optional(),
})
```

- [ ] **Step 2: Remove the autoCreateDeal import and its call**

Remove this import at the top of the file:

```typescript
import { autoCreateDeal } from '@/lib/auto-deal'
```

Inside the transaction, remove both `autoCreateDeal` calls (there are two — one in the `manual` branch, one in the `else` branch):

```typescript
// DELETE both of these blocks:
if (isMeetingBooked) {
  await autoCreateDeal({ contactId, campaignId: campaignId!, tenantId }, tx)
}
// and
if (isMeetingBooked) {
  await autoCreateDeal({ contactId, campaignId: updated.campaignId, tenantId }, tx)
}
```

Also remove `const isMeetingBooked = typedOutcome === 'meeting_booked'` since it's no longer used (the `mbLeadStatus` block still uses it; keep the variable if `isMeetingBooked` is still referenced, otherwise remove it).

- [ ] **Step 3: Add pipeline deal / pending creation after outcome routing**

Destructure the new fields from `parsed.data`:

```typescript
const { manual, callRecordId, campaignId, outcome, notes, contactId, stageId, addToQueue, clientId } = parsed.data
```

After the transaction block (after `const record = await withTenant(...)`), add:

```typescript
// Pipeline action — outside main transaction so outcome is committed first
if (stageId && clientId) {
  const contact = await withTenant(tenantId, () =>
    db.contact.findUnique({
      where:  { id: contactId },
      select: { firstName: true, lastName: true, companyName: true },
    })
  )
  if (contact) {
    const resolvedCampaignId = manual ? campaignId! : (record as { campaignId: string }).campaignId
    const title = contact.companyName
      ? `${contact.firstName} ${contact.lastName} — ${contact.companyName}`
      : `${contact.firstName} ${contact.lastName}`

    await withTenant(tenantId, () =>
      db.pipelineDeal.upsert({
        where:  { contactId_campaignId: { contactId, campaignId: resolvedCampaignId } },
        create: {
          tenantId,
          clientId,
          stageId,
          contactId,
          campaignId: resolvedCampaignId,
          title,
          notes:  notes ?? null,
          source: 'manual',
        },
        update: { stageId, notes: notes ?? null },
      })
    )
  }
} else if (addToQueue && clientId) {
  const resolvedCampaignId = manual ? campaignId! : (record as { campaignId: string }).campaignId
  const typedOutcomeForQueue = typedOutcome

  await withTenant(tenantId, () =>
    db.pendingPipelineDeal.upsert({
      where:  { contactId_campaignId: { contactId, campaignId: resolvedCampaignId } },
      create: {
        tenantId,
        clientId,
        contactId,
        campaignId: resolvedCampaignId,
        outcome:    typedOutcomeForQueue,
      },
      update: { outcome: typedOutcomeForQueue, clientId },
    })
  )
}
```

Note: the `record` returned by the transaction for the non-manual branch has shape `{ id, campaignId, createdAt }`. For the manual branch it has `{ id, createdAt }` (no campaignId). The type cast handles this — campaignId comes from `campaignId!` in the manual branch.

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Run existing outcome-router tests to confirm nothing broke**

```bash
npx vitest run src/lib/__tests__/outcome-router.test.ts
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/dialer/log-outcome/route.ts
git commit -m "Update log-outcome to support stageId/addToQueue; remove auto-deal creation"
```

---

## Task 5: Pending pipeline API endpoints

**Files:**
- Create: `src/app/api/pipeline/pending/route.ts`
- Create: `src/app/api/pipeline/pending/[id]/place/route.ts`
- Create: `src/app/api/pipeline/pending/[id]/route.ts`

- [ ] **Step 1: Create GET /api/pipeline/pending**

Create `src/app/api/pipeline/pending/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db, withTenant } from '@/lib/db'
import { hasPermission, getClerkMeta } from '@/lib/auth'

export async function GET(req: NextRequest) {
  try {
    const { userId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { role, tenantId } = await getClerkMeta()
    if (!hasPermission(role, 'pipeline:read') || !tenantId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const clientId = req.nextUrl.searchParams.get('clientId')
    if (!clientId) {
      return NextResponse.json({ error: 'clientId required' }, { status: 400 })
    }

    const pending = await withTenant(tenantId, () =>
      db.pendingPipelineDeal.findMany({
        where:   { clientId },
        select: {
          id:        true,
          clientId:  true,
          contactId: true,
          campaignId: true,
          outcome:   true,
          createdAt: true,
          contact: { select: { firstName: true, lastName: true, companyName: true, jobTitle: true } },
          campaign: { select: { name: true } },
        },
        orderBy: { createdAt: 'asc' },
      })
    )

    const serialized = pending.map((p) => ({
      ...p,
      createdAt: p.createdAt.toISOString(),
    }))

    return NextResponse.json({ data: serialized })
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
```

- [ ] **Step 2: Create POST /api/pipeline/pending/[id]/place**

Create `src/app/api/pipeline/pending/[id]/place/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { db, withTenant } from '@/lib/db'
import { hasPermission, getClerkMeta } from '@/lib/auth'

const BodySchema = z.object({ stageId: z.string().min(1) })

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { role, tenantId } = await getClerkMeta()
    if (!hasPermission(role, 'pipeline:write') || !tenantId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params
    const body   = await req.json()
    const parsed = BodySchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
    }

    const pending = await withTenant(tenantId, () =>
      db.pendingPipelineDeal.findUnique({
        where:  { id },
        select: { id: true, tenantId: true, clientId: true, contactId: true, campaignId: true },
      })
    )

    if (!pending) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const contact = await withTenant(tenantId, () =>
      db.contact.findUnique({
        where:  { id: pending.contactId },
        select: { firstName: true, lastName: true, companyName: true },
      })
    )

    if (!contact) {
      return NextResponse.json({ error: 'Contact not found' }, { status: 404 })
    }

    const title = contact.companyName
      ? `${contact.firstName} ${contact.lastName} — ${contact.companyName}`
      : `${contact.firstName} ${contact.lastName}`

    await withTenant(tenantId, () =>
      db.$transaction([
        db.pipelineDeal.upsert({
          where:  { contactId_campaignId: { contactId: pending.contactId, campaignId: pending.campaignId } },
          create: {
            tenantId:   pending.tenantId,
            clientId:   pending.clientId,
            stageId:    parsed.data.stageId,
            contactId:  pending.contactId,
            campaignId: pending.campaignId,
            title,
            source:     'manual',
          },
          update: { stageId: parsed.data.stageId },
        }),
        db.pendingPipelineDeal.delete({ where: { id } }),
      ])
    )

    return NextResponse.json({ data: { success: true } })
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
```

- [ ] **Step 3: Create DELETE /api/pipeline/pending/[id]**

Create `src/app/api/pipeline/pending/[id]/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db, withTenant } from '@/lib/db'
import { hasPermission, getClerkMeta } from '@/lib/auth'

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { role, tenantId } = await getClerkMeta()
    if (!hasPermission(role, 'pipeline:write') || !tenantId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params

    await withTenant(tenantId, () =>
      db.pendingPipelineDeal.deleteMany({ where: { id } })
    )

    return NextResponse.json({ data: { success: true } })
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/pipeline/pending/
git commit -m "Add pending pipeline CRUD API endpoints"
```

---

## Task 6: Update DispositionForm — pipeline toggle and stage selector

**Files:**
- Modify: `src/components/dialer/DispositionForm.tsx`

- [ ] **Step 1: Replace DispositionForm.tsx with the updated version**

```typescript
'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { CallOutcome } from '@prisma/client'
import { OUTCOME_COLOR, OUTCOME_LABEL, DOT_CLASS } from './outcome-colors'
import { PIPELINE_ELIGIBLE_OUTCOMES } from '@/lib/outcome-router'
import { cn } from '@/lib/utils'

const OUTCOME_OPTIONS: CallOutcome[] = [
  CallOutcome.connected,
  CallOutcome.not_interested,
  CallOutcome.lead,
  CallOutcome.meeting_booked,
  CallOutcome.left_voicemail,
  CallOutcome.bad_time_to_speak,
  CallOutcome.in_a_meeting,
  CallOutcome.call_back_later,
  CallOutcome.on_holiday,
  CallOutcome.hung_up,
  CallOutcome.does_not_take_cold_calls,
  CallOutcome.not_relevant_contact,
  CallOutcome.ai_assistant,
  CallOutcome.voicemail,
  CallOutcome.no_answer,
  CallOutcome.line_engaged,
  CallOutcome.wrong_number,
  CallOutcome.mobile_switched_off,
  CallOutcome.foreign_dial_tone,
  CallOutcome.not_available,
  CallOutcome.other,
]

type PipelineStage = { id: string; name: string; color: string }

export interface PipelineAction {
  stageId:    string | null   // null = queue for later
  addToQueue: boolean
  clientId:   string
}

interface DispositionFormProps {
  campaignId: string | null
  onSubmit:   (outcome: CallOutcome, notes: string, pipeline?: PipelineAction) => Promise<void>
  loading:    boolean
}

const QUEUE_FOR_LATER = '__queue__'

export function DispositionForm({ campaignId, onSubmit, loading }: DispositionFormProps) {
  const [outcome,        setOutcome]        = useState<CallOutcome | ''>('')
  const [notes,          setNotes]          = useState('')
  const [addToPipeline,  setAddToPipeline]  = useState(false)
  const [selectedStage,  setSelectedStage]  = useState('')
  const [stages,         setStages]         = useState<PipelineStage[]>([])
  const [clientId,       setClientId]       = useState<string | null>(null)
  const [stagesLoading,  setStagesLoading]  = useState(false)
  const [stagesError,    setStagesError]    = useState(false)

  const showPipelineSection = outcome !== '' && PIPELINE_ELIGIBLE_OUTCOMES.has(outcome as CallOutcome)

  useEffect(() => {
    if (!showPipelineSection) {
      setAddToPipeline(false)
      setSelectedStage('')
    }
  }, [showPipelineSection])

  useEffect(() => {
    if (!addToPipeline || !campaignId) return
    setStagesLoading(true)
    setStagesError(false)
    fetch(`/api/dialer/pipeline-stages?campaignId=${campaignId}`)
      .then((r) => r.json())
      .then(({ data }) => {
        setStages(data.stages ?? [])
        setClientId(data.clientId ?? null)
      })
      .catch(() => setStagesError(true))
      .finally(() => setStagesLoading(false))
  }, [addToPipeline, campaignId])

  const handleSubmit = async () => {
    if (!outcome) return

    let pipelineAction: PipelineAction | undefined
    if (addToPipeline && clientId && selectedStage) {
      if (selectedStage === QUEUE_FOR_LATER) {
        pipelineAction = { stageId: null, addToQueue: true, clientId }
      } else {
        pipelineAction = { stageId: selectedStage, addToQueue: false, clientId }
      }
    }

    await onSubmit(outcome as CallOutcome, notes, pipelineAction)
    setOutcome('')
    setNotes('')
    setAddToPipeline(false)
    setSelectedStage('')
  }

  const submitDisabled =
    !outcome ||
    loading ||
    (addToPipeline && !selectedStage) ||
    (addToPipeline && stagesLoading)

  return (
    <div className="space-y-4 w-full animate-in slide-in-from-bottom-4 duration-300">
      {/* Outcome select */}
      <div className="space-y-1.5">
        <Label className="text-xs text-gray-400">Outcome *</Label>
        <Select
          value={outcome}
          onValueChange={(v) => {
            setOutcome((v ?? '') as CallOutcome | '')
            setAddToPipeline(false)
            setSelectedStage('')
          }}
        >
          <SelectTrigger className="bg-white/5 border-white/10 text-white rounded-xl">
            <SelectValue>
              {(v: string | null) => {
                if (!v) return <span className="text-gray-500">Select outcome…</span>
                const color = OUTCOME_COLOR[v as CallOutcome]
                return (
                  <span className="flex items-center gap-2">
                    <span className={cn('w-2 h-2 rounded-full flex-shrink-0', DOT_CLASS[color])} />
                    {OUTCOME_LABEL[v as CallOutcome]}
                  </span>
                )
              }}
            </SelectValue>
          </SelectTrigger>
          <SelectContent className="rounded-xl border-white/10 bg-[#161c26] max-h-72 overflow-y-auto">
            {OUTCOME_OPTIONS.map((value) => {
              const color = OUTCOME_COLOR[value]
              return (
                <SelectItem
                  key={value}
                  value={value}
                  className="text-gray-300 focus:bg-white/5 focus:text-white rounded-lg"
                >
                  <span className="flex items-center gap-2">
                    <span className={cn('w-2 h-2 rounded-full flex-shrink-0', DOT_CLASS[color])} />
                    {OUTCOME_LABEL[value]}
                  </span>
                </SelectItem>
              )
            })}
          </SelectContent>
        </Select>
      </div>

      {/* Notes */}
      <div className="space-y-1.5">
        <Label className="text-xs text-gray-400">Notes</Label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Optional notes…"
          rows={3}
          className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-gray-600 resize-none focus:outline-none focus:border-[#00d4ff]/50 focus:ring-1 focus:ring-[#00d4ff]/10"
        />
      </div>

      {/* Add to pipeline section */}
      {showPipelineSection && (
        <div className="border border-white/10 rounded-xl p-3 space-y-3 bg-white/[0.02]">
          <div className="flex items-center justify-between">
            <Label className="text-xs text-gray-400 cursor-pointer" htmlFor="pipeline-toggle">
              Add to pipeline
            </Label>
            <button
              id="pipeline-toggle"
              type="button"
              role="switch"
              aria-checked={addToPipeline}
              onClick={() => {
                setAddToPipeline((v) => !v)
                setSelectedStage('')
              }}
              className={cn(
                'relative w-9 h-5 rounded-full transition-colors duration-200 flex-shrink-0',
                addToPipeline ? 'bg-[#00d4ff]' : 'bg-white/10'
              )}
            >
              <span
                className={cn(
                  'absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200',
                  addToPipeline ? 'translate-x-4' : 'translate-x-0.5'
                )}
              />
            </button>
          </div>

          {addToPipeline && (
            <div className="space-y-1.5">
              {stagesLoading ? (
                <div className="h-9 bg-white/5 rounded-xl animate-pulse" />
              ) : stagesError ? (
                <div className="flex items-center justify-between">
                  <p className="text-xs text-red-400">Failed to load stages</p>
                  <button
                    type="button"
                    onClick={() => {
                      setAddToPipeline(false)
                      setTimeout(() => setAddToPipeline(true), 0)
                    }}
                    className="text-xs text-[#00d4ff] hover:underline"
                  >
                    Retry
                  </button>
                </div>
              ) : (
                <Select value={selectedStage} onValueChange={setSelectedStage}>
                  <SelectTrigger className="bg-white/5 border-white/10 text-white rounded-xl">
                    <SelectValue>
                      {(v: string | null) => {
                        if (!v) return <span className="text-gray-500">Select stage…</span>
                        if (v === QUEUE_FOR_LATER) return <span className="text-gray-300">Queue for later</span>
                        const stage = stages.find((s) => s.id === v)
                        return <span className="text-gray-300">{stage?.name ?? v}</span>
                      }}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent className="rounded-xl border-white/10 bg-[#161c26]">
                    <SelectItem
                      value={QUEUE_FOR_LATER}
                      className="text-gray-400 focus:bg-white/5 focus:text-white rounded-lg italic"
                    >
                      Queue for later
                    </SelectItem>
                    {stages.map((s) => (
                      <SelectItem
                        key={s.id}
                        value={s.id}
                        className="text-gray-300 focus:bg-white/5 focus:text-white rounded-lg"
                      >
                        <span className="flex items-center gap-2">
                          <span
                            className="w-2 h-2 rounded-full flex-shrink-0"
                            style={{ backgroundColor: s.color }}
                          />
                          {s.name}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}
        </div>
      )}

      <Button
        type="button"
        onClick={handleSubmit}
        disabled={submitDisabled}
        className="w-full bg-gradient-to-r from-[#00d4ff] to-cyan-600 text-black font-semibold rounded-xl hover:opacity-90 disabled:opacity-50"
      >
        {loading ? 'Logging…' : 'Log Outcome'}
      </Button>
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/dialer/DispositionForm.tsx
git commit -m "Add pipeline toggle and stage selector to DispositionForm"
```

---

## Task 7: Update CallControls — wire campaign and pipeline params

**Files:**
- Modify: `src/components/dialer/CallControls.tsx`

- [ ] **Step 1: Read campaignId from store and forward pipeline params**

Open `src/components/dialer/CallControls.tsx`. Update the destructured store values to include `campaignId`:

```typescript
const {
  currentContact,
  callStatus,
  elapsedSeconds,
  sessionId,
  campaignId,      // ← add this
  startCall,
  endCall,
  logOutcome,
  tickTimer,
} = useDialerStore()
```

Update `handleLogOutcome` to accept and forward the optional pipeline action:

```typescript
import type { PipelineAction } from './DispositionForm'

const handleLogOutcome = async (outcome: CallOutcome, notes: string, pipeline?: PipelineAction) => {
  setLogLoading(true)
  try {
    await logOutcome(outcome, notes, pipeline)
  } finally {
    setLogLoading(false)
  }
}
```

Update the `DispositionForm` usage (in the `callStatus === 'ended'` branch) to pass `campaignId`:

```typescript
<DispositionForm
  campaignId={campaignId}
  onSubmit={handleLogOutcome}
  loading={logLoading}
/>
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors (store update comes next, so ignore `logOutcome` arity errors for now — fix in Task 8).

- [ ] **Step 3: Commit after Task 8 passes tsc**

Hold this commit — do it together with Task 8.

---

## Task 8: Update dialer store — pipeline params on logOutcome

**Files:**
- Modify: `src/stores/dialer-store.ts`

- [ ] **Step 1: Update the logOutcome signature in the interface**

Open `src/stores/dialer-store.ts`. In the `DialerState` interface, update:

```typescript
import type { PipelineAction } from '@/components/dialer/DispositionForm'

// in DialerState interface:
logOutcome(outcome: CallOutcome, notes: string, pipeline?: PipelineAction): Promise<void>
logManualOutcome(contactId: string, outcome: CallOutcome, notes: string, pipeline?: PipelineAction): Promise<void>
```

- [ ] **Step 2: Update the logOutcome implementation**

Find the `async logOutcome(outcome, notes)` implementation. Replace with:

```typescript
async logOutcome(outcome, notes, pipeline) {
  const { activeCallRecordId, currentContact, queue, calledToday } = get()
  if (!activeCallRecordId || !currentContact) return

  const res = await fetch('/api/dialer/log-outcome', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({
      callRecordId: activeCallRecordId,
      outcome,
      notes,
      contactId:  currentContact.id,
      ...(pipeline?.addToQueue
        ? { addToQueue: true, clientId: pipeline.clientId }
        : pipeline?.stageId
          ? { stageId: pipeline.stageId, clientId: pipeline.clientId }
          : {}),
    }),
  })

  const json        = await res.json()
  const newRecord   = json.data?.callRecord as CallHistoryRecord | undefined
  const doneContact = prependRecord(currentContact, newRecord)
  const nextContact = queue[0] ?? null

  set({
    callStatus:         'idle',
    currentContact:     nextContact,
    queue:              queue.slice(1),
    activeCallRecordId: null,
    callStartedAt:      null,
    calledToday:        [...calledToday, doneContact],
    calledTodayDate:    getTodayString(),
  })

  if (queue.length < 5) get().loadQueue()
},
```

- [ ] **Step 3: Update logManualOutcome implementation**

Find `async logManualOutcome(contactId, outcome, notes)`. Replace with:

```typescript
async logManualOutcome(contactId, outcome, notes, pipeline) {
  const { campaignId, queue, currentContact, calledToday } = get()
  if (!campaignId) return

  const res = await fetch('/api/dialer/log-outcome', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({
      manual: true,
      outcome,
      notes,
      contactId,
      campaignId,
      ...(pipeline?.addToQueue
        ? { addToQueue: true, clientId: pipeline.clientId }
        : pipeline?.stageId
          ? { stageId: pipeline.stageId, clientId: pipeline.clientId }
          : {}),
    }),
  })
  if (!res.ok) throw new Error('Failed to log manual outcome')
  // ... rest of the existing implementation stays the same
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit (Tasks 7 + 8 together)**

```bash
git add src/components/dialer/CallControls.tsx src/stores/dialer-store.ts
git commit -m "Wire pipeline params through CallControls and dialer store"
```

---

## Task 9: Update pipeline page — contactId in query, pending fetch, empty-stages state

**Files:**
- Modify: `src/app/(dashboard)/pipeline/page.tsx`

- [ ] **Step 1: Add contactId to the PipelineDeal select and fetch pending deals**

Open `src/app/(dashboard)/pipeline/page.tsx`. Update the `db.pipelineDeal.findMany` select to include `contactId`:

```typescript
db.pipelineDeal.findMany({
  where: { clientId: selectedClientId },
  select: {
    id:        true,
    stageId:   true,
    clientId:  true,
    contactId: true,    // ← add this
    title:     true,
    value:     true,
    notes:     true,
    source:    true,
    createdAt: true,
    contact: {
      select: { firstName: true, lastName: true, companyName: true },
    },
    campaign: {
      select: { name: true },
    },
  },
}),
```

Update the `initialDeals` mapping to include `contactId`:

```typescript
const initialDeals: PipelineDealRow[] = rawDeals.map((d) => ({
  id:        d.id,
  stageId:   d.stageId,
  clientId:  d.clientId,
  contactId: d.contactId,   // ← add this
  title:     d.title,
  value:     d.value != null ? d.value.toString() : null,
  notes:     d.notes,
  source:    d.source,
  createdAt: d.createdAt.toISOString(),
  contact:   d.contact,
  campaign:  d.campaign,
}))
```

- [ ] **Step 2: Fetch pending deals and check canWrite permission**

Update the imports at the top to include auth and permission helpers already present. Update the Promise.all to also fetch pending deals and stages for empty-state check:

```typescript
import { auth } from '@clerk/nextjs/server'
import { getCurrentTenantId, getCurrentUserRole, hasPermission, resolvePermission } from '@/lib/auth'
import type { PipelineDealRow, PipelineStageRow, PendingPipelineDealRow } from '@/types/models'
```

Replace the existing `[rawStages, rawDeals]` Promise.all with a three-way fetch:

```typescript
const { userId } = await auth()
const canWrite = userId
  ? await resolvePermission(userId, tenantId, role, 'pipeline:write')
  : null
const userCanWrite = canWrite !== null ? canWrite : (role === 'admin' || role === 'manager')

const [rawStages, rawDeals, rawPending] = await withTenant(tenantId, () =>
  Promise.all([
    db.pipelineStage.findMany({
      where:   { clientId: selectedClientId },
      select:  { id: true, name: true, color: true, position: true },
      orderBy: { position: 'asc' },
    }),
    db.pipelineDeal.findMany({
      where: { clientId: selectedClientId },
      select: {
        id: true, stageId: true, clientId: true, contactId: true,
        title: true, value: true, notes: true, source: true, createdAt: true,
        contact:  { select: { firstName: true, lastName: true, companyName: true } },
        campaign: { select: { name: true } },
      },
    }),
    db.pendingPipelineDeal.findMany({
      where:   { clientId: selectedClientId },
      select: {
        id: true, clientId: true, contactId: true, campaignId: true,
        outcome: true, createdAt: true,
        contact:  { select: { firstName: true, lastName: true, companyName: true, jobTitle: true } },
        campaign: { select: { name: true } },
      },
      orderBy: { createdAt: 'asc' },
    }),
  ])
)
```

Add serialization for pending:

```typescript
const pendingDeals: PendingPipelineDealRow[] = rawPending.map((p) => ({
  ...p,
  createdAt: p.createdAt.toISOString(),
}))
```

- [ ] **Step 3: Add empty-stages state and pass pending to KanbanBoard**

Replace the `return` at the bottom with:

```typescript
if (rawStages.length === 0) {
  return (
    <div className="p-8 space-y-4">
      {pendingDeals.length > 0 && (
        <PendingPipelineSection
          pending={pendingDeals}
          stages={[]}
          canWrite={userCanWrite}
        />
      )}
      <div className="glass-panel rounded-3xl p-12 flex flex-col items-center justify-center gap-4 text-center">
        <Kanban className="w-10 h-10 text-gray-600" />
        <div>
          <p className="text-gray-400 text-sm font-medium">
            No pipeline stages configured for this client
          </p>
          <p className="text-gray-600 text-xs mt-1">
            Add stages to start tracking deals.
          </p>
        </div>
        {userCanWrite && (
          <a
            href={`/settings/pipeline?clientId=${selectedClientId}`}
            className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#00d4ff] to-cyan-600 text-black text-sm font-semibold shadow-xl shadow-[#00d4ff]/30"
          >
            Configure pipeline →
          </a>
        )}
      </div>
    </div>
  )
}

return (
  <div className="p-8">
    <KanbanBoard
      clients={clients}
      selectedClientId={selectedClientId}
      stages={stages}
      initialDeals={initialDeals}
      pendingDeals={pendingDeals}
      canWrite={userCanWrite}
    />
  </div>
)
```

Add the import for `PendingPipelineSection` at the top:

```typescript
import { PendingPipelineSection } from '@/components/pipeline/PendingPipelineSection'
```

- [ ] **Step 4: Verify TypeScript compiles (ignore KanbanBoard prop errors — fixed in Task 11)**

```bash
npx tsc --noEmit 2>&1 | grep -v "KanbanBoard\|PendingPipelineSection"
```

Expected: no other errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/(dashboard)/pipeline/page.tsx
git commit -m "Update pipeline page: add contactId, fetch pending, empty-stages state"
```

---

## Task 10: PendingPipelineSection component

**Files:**
- Create: `src/components/pipeline/PendingPipelineSection.tsx`

- [ ] **Step 1: Create the component**

Create `src/components/pipeline/PendingPipelineSection.tsx`:

```typescript
'use client'

import { useState } from 'react'
import { ChevronDown, ChevronUp, X } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import type { PendingPipelineDealRow, PipelineStageRow } from '@/types/models'

const OUTCOME_LABEL: Record<string, string> = {
  connected:      'Connected',
  lead:           'Lead',
  call_back_later: 'Call Back Later',
  meeting_booked: 'Meeting Booked',
}

const OUTCOME_COLOR: Record<string, string> = {
  connected:      'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  lead:           'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
  call_back_later: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  meeting_booked: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
}

interface PendingPipelineSectionProps {
  pending:    PendingPipelineDealRow[]
  stages:     PipelineStageRow[]
  canWrite:   boolean
}

export function PendingPipelineSection({ pending: initialPending, stages, canWrite }: PendingPipelineSectionProps) {
  const [open,    setOpen]    = useState(true)
  const [pending, setPending] = useState(initialPending)
  const [placing, setPlacing] = useState<Record<string, boolean>>({})
  const [selected, setSelected] = useState<Record<string, string>>({})

  if (pending.length === 0) return null

  async function handlePlace(id: string) {
    const stageId = selected[id]
    if (!stageId) return
    setPlacing((p) => ({ ...p, [id]: true }))
    try {
      const res = await fetch(`/api/pipeline/pending/${id}/place`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ stageId }),
      })
      if (!res.ok) throw new Error()
      setPending((prev) => prev.filter((p) => p.id !== id))
      toast.success('Contact added to pipeline')
    } catch {
      toast.error('Failed to place contact — try again')
    } finally {
      setPlacing((p) => ({ ...p, [id]: false }))
    }
  }

  async function handleDismiss(id: string) {
    try {
      const res = await fetch(`/api/pipeline/pending/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      setPending((prev) => prev.filter((p) => p.id !== id))
      toast.success('Removed from pending queue')
    } catch {
      toast.error('Failed to remove — try again')
    }
  }

  return (
    <div className="glass-panel rounded-2xl mb-4 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-3 text-sm font-semibold text-white hover:bg-white/5 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span>Pending Pipeline</span>
          <span className="px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400 text-[10px] font-bold">
            {pending.length}
          </span>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
      </button>

      {open && (
        <div className="border-t border-white/5">
          {pending.map((p) => (
            <div
              key={p.id}
              className="flex items-center gap-4 px-5 py-3 border-b border-white/5 last:border-0 hover:bg-white/[0.02] transition-colors"
            >
              {/* Contact info */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">
                  {p.contact.firstName} {p.contact.lastName}
                </p>
                <p className="text-xs text-gray-500 truncate">
                  {p.contact.companyName ?? p.contact.jobTitle ?? '—'} · {p.campaign.name}
                </p>
              </div>

              {/* Outcome badge */}
              <span className={cn(
                'flex-shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full border',
                OUTCOME_COLOR[p.outcome] ?? 'bg-gray-500/10 text-gray-400 border-gray-500/20'
              )}>
                {OUTCOME_LABEL[p.outcome] ?? p.outcome}
              </span>

              {/* Date */}
              <span className="flex-shrink-0 text-[11px] text-gray-600">
                {new Date(p.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
              </span>

              {/* Place action */}
              {canWrite && (
                <div className="flex items-center gap-2 flex-shrink-0">
                  {stages.length === 0 ? (
                    <span className="text-xs text-gray-600 italic">Configure stages first</span>
                  ) : (
                    <>
                      <Select
                        value={selected[p.id] ?? ''}
                        onValueChange={(v) => setSelected((prev) => ({ ...prev, [p.id]: v }))}
                      >
                        <SelectTrigger className="h-7 text-xs bg-white/5 border-white/10 text-white rounded-lg w-36">
                          <SelectValue>
                            {(v: string | null) => {
                              if (!v) return <span className="text-gray-500">Select stage…</span>
                              return <span>{stages.find((s) => s.id === v)?.name ?? v}</span>
                            }}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent className="rounded-xl border-white/10 bg-[#161c26]">
                          {stages.map((s) => (
                            <SelectItem
                              key={s.id}
                              value={s.id}
                              className="text-gray-300 focus:bg-white/5 focus:text-white rounded-lg text-xs"
                            >
                              <span className="flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color }} />
                                {s.name}
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <button
                        type="button"
                        onClick={() => handlePlace(p.id)}
                        disabled={!selected[p.id] || placing[p.id]}
                        className="h-7 px-3 text-xs bg-gradient-to-r from-[#00d4ff] to-cyan-600 text-black font-semibold rounded-lg disabled:opacity-40 hover:opacity-90"
                      >
                        {placing[p.id] ? '…' : 'Place'}
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => handleDismiss(p.id)}
                    className="w-6 h-6 flex items-center justify-center text-gray-600 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
                    title="Remove from queue"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
          ))}
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

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/pipeline/PendingPipelineSection.tsx
git commit -m "Add PendingPipelineSection component"
```

---

## Task 11: Update KanbanBoard — pending section + empty-stages state

**Files:**
- Modify: `src/components/pipeline/KanbanBoard.tsx`

- [ ] **Step 1: Add pending props and render PendingPipelineSection**

Open `src/components/pipeline/KanbanBoard.tsx`. Add the import at the top:

```typescript
import { PendingPipelineSection } from './PendingPipelineSection'
import type { PipelineStageRow, PipelineDealRow, PendingPipelineDealRow } from '@/types/models'
```

Replace the `KanbanBoardProps` interface with:

```typescript
interface KanbanBoardProps {
  clients?:          { id: string; name: string }[]
  selectedClientId?: string
  stages:            PipelineStageRow[]
  initialDeals:      PipelineDealRow[]
  pendingDeals?:     PendingPipelineDealRow[]
  canWrite?:         boolean
  readOnly?:         boolean
  hideHeader?:       boolean
}
```

Replace the `export function KanbanBoard({` destructure to add the new props with defaults:

```typescript
export function KanbanBoard({
  clients,
  selectedClientId,
  stages,
  initialDeals,
  pendingDeals  = [],
  canWrite      = false,
  readOnly      = false,
  hideHeader    = false,
}: KanbanBoardProps) {
```

Replace the entire `return (` block with:

```typescript
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

      {pendingDeals.length > 0 && (
        <PendingPipelineSection
          pending={pendingDeals}
          stages={stages}
          canWrite={canWrite}
        />
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
                expandedCardId={expandedCardId}
                onToggleExpand={handleToggleExpand}
              />
            ))}
          </div>
        </DndContext>
      )}
    </div>
  )
```

Also add the expanded card state in the component body (before the return):

```typescript
const [expandedCardId, setExpandedCardId] = useState<string | null>(null)

function handleToggleExpand(id: string) {
  setExpandedCardId((prev) => (prev === id ? null : id))
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/pipeline/KanbanBoard.tsx
git commit -m "Add pending pipeline section to KanbanBoard"
```

---

## Task 12: DealExpandPanel component

**Files:**
- Create: `src/components/pipeline/DealExpandPanel.tsx`

- [ ] **Step 1: Create the component**

Create `src/components/pipeline/DealExpandPanel.tsx`:

```typescript
'use client'

import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import type { ContactWithCampaign } from '@/types/models'

interface DealExpandPanelProps {
  contactId: string
  notes:     string | null
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-0.5">
      {children}
    </p>
  )
}

function FieldValue({ children }: { children: React.ReactNode }) {
  const empty = children === null || children === undefined || children === ''
  return (
    <p className={cn('text-xs', empty ? 'text-gray-600' : 'text-gray-300')}>
      {empty ? '—' : children}
    </p>
  )
}

export function DealExpandPanel({ contactId, notes }: DealExpandPanelProps) {
  const [contact, setContact] = useState<ContactWithCampaign | null>(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(false)

  useEffect(() => {
    setLoading(true)
    setError(false)
    fetch(`/api/contacts/${contactId}`)
      .then((r) => {
        if (!r.ok) throw new Error()
        return r.json()
      })
      .then(({ data }) => setContact(data))
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [contactId])

  if (loading) {
    return (
      <div className="p-4 space-y-2 border-t border-white/5">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-4 bg-white/5 rounded animate-pulse" style={{ width: `${60 + i * 10}%` }} />
        ))}
      </div>
    )
  }

  if (error || !contact) {
    return (
      <div className="p-4 border-t border-white/5">
        <p className="text-xs text-red-400">Failed to load contact info</p>
      </div>
    )
  }

  return (
    <div className="p-4 border-t border-white/5 grid grid-cols-2 gap-x-4 gap-y-2.5">
      <div><FieldLabel>Email</FieldLabel><FieldValue>{contact.email}</FieldValue></div>
      <div><FieldLabel>Job Title</FieldLabel><FieldValue>{contact.jobTitle}</FieldValue></div>
      <div><FieldLabel>Mobile</FieldLabel><FieldValue>{contact.mobilePhone}</FieldValue></div>
      <div><FieldLabel>Office</FieldLabel><FieldValue>{contact.corporatePhone}</FieldValue></div>
      <div><FieldLabel>Industry</FieldLabel><FieldValue>{contact.industry}</FieldValue></div>
      <div><FieldLabel>Employees</FieldLabel><FieldValue>{contact.employeeCount?.toLocaleString()}</FieldValue></div>
      {contact.website && (
        <div className="col-span-2">
          <FieldLabel>Website</FieldLabel>
          <a
            href={contact.website.startsWith('http') ? contact.website : `https://${contact.website}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-[#00d4ff] hover:underline truncate block"
          >
            {contact.website}
          </a>
        </div>
      )}
      {contact.linkedinUrl && (
        <div className="col-span-2">
          <FieldLabel>LinkedIn</FieldLabel>
          <a
            href={contact.linkedinUrl.startsWith('http') ? contact.linkedinUrl : `https://${contact.linkedinUrl}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-[#00d4ff] hover:underline truncate block"
          >
            {contact.linkedinUrl}
          </a>
        </div>
      )}
      <div><FieldLabel>City</FieldLabel><FieldValue>{contact.city}</FieldValue></div>
      <div><FieldLabel>Country</FieldLabel><FieldValue>{contact.country}</FieldValue></div>
      {notes && (
        <div className="col-span-2 mt-1 pt-2 border-t border-white/5">
          <FieldLabel>Notes</FieldLabel>
          <p className="text-xs text-gray-400 whitespace-pre-wrap">{notes}</p>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Check the contacts API response shape**

```bash
grep -n "data:" src/app/api/contacts/\[id\]/route.ts | head -5
```

Confirm the route returns `{ data: contact }` with the full contact fields. If the route doesn't exist or returns differently, check `src/app/api/contacts/[id]/route.ts` and adjust the fetch/parse accordingly.

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/pipeline/DealExpandPanel.tsx
git commit -m "Add DealExpandPanel read-only contact info component"
```

---

## Task 13: Update DealCard — click to expand

**Files:**
- Modify: `src/components/pipeline/DealCard.tsx`

- [ ] **Step 1: Replace DealCard with expanded version**

```typescript
'use client'

import { useState } from 'react'
import { useDraggable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical } from 'lucide-react'
import { DealExpandPanel } from './DealExpandPanel'
import type { PipelineDealRow } from '@/types/models'

interface DealCardProps {
  deal:           PipelineDealRow
  stageColor:     string
  expandedCardId: string | null
  onToggleExpand: (id: string) => void
}

export function DealCard({ deal, stageColor, expandedCardId, onToggleExpand }: DealCardProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id:   deal.id,
    data: { stageId: deal.stageId },
  })

  const isExpanded = expandedCardId === deal.id

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), borderLeftColor: stageColor }}
      className={`
        glass-panel rounded-2xl border-l-2
        hover:border-[#00d4ff]/20 transition-colors duration-200
        ${isDragging ? 'opacity-50 shadow-2xl cursor-grabbing' : 'cursor-pointer'}
      `}
    >
      {/* Card header — drag handle + contact info */}
      <div
        className="p-4 flex items-start justify-between gap-2"
        onClick={() => onToggleExpand(deal.id)}
      >
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-white truncate">
            {deal.contact.firstName} {deal.contact.lastName}
          </p>
          {deal.contact.companyName && (
            <p className="text-xs text-gray-400 truncate mt-0.5">{deal.contact.companyName}</p>
          )}
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
        <div
          className="flex-shrink-0 mt-0.5 cursor-grab active:cursor-grabbing"
          onClick={(e) => e.stopPropagation()}
          {...attributes}
          {...listeners}
        >
          <GripVertical className="w-4 h-4 text-gray-600" />
        </div>
      </div>

      {/* Expanded panel */}
      {isExpanded && (
        <DealExpandPanel contactId={deal.contactId} notes={deal.notes} />
      )}
    </div>
  )
}
```

- [ ] **Step 2: Update KanbanColumn to accept and forward expandedCardId**

Open `src/components/pipeline/KanbanColumn.tsx`. Replace the entire file with:

```typescript
'use client'

import { useDroppable } from '@dnd-kit/core'
import { DealCard } from './DealCard'
import type { PipelineStageRow, PipelineDealRow } from '@/types/models'

interface KanbanColumnProps {
  stage:          PipelineStageRow
  deals:          PipelineDealRow[]
  expandedCardId: string | null
  onToggleExpand: (id: string) => void
}

export function KanbanColumn({ stage, deals, expandedCardId, onToggleExpand }: KanbanColumnProps) {
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
          <DealCard
            key={deal.id}
            deal={deal}
            stageColor={stage.color}
            expandedCardId={expandedCardId}
            onToggleExpand={onToggleExpand}
          />
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

- [ ] **Step 3: (KanbanBoard state was already added in Task 11 Step 1)**

The `expandedCardId` state and `handleToggleExpand` function were added to KanbanBoard in Task 11. Confirm they are present before proceeding.

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/pipeline/DealCard.tsx src/components/pipeline/KanbanColumn.tsx src/components/pipeline/KanbanBoard.tsx
git commit -m "Add click-to-expand contact panel on deal cards"
```

---

## Task 14: Sidebar pending pipeline badge

**Files:**
- Modify: `src/app/(dashboard)/layout.tsx`
- Modify: `src/components/layout/Sidebar.tsx`

- [ ] **Step 1: Fetch pending count in layout**

Open `src/app/(dashboard)/layout.tsx`. Inside the `try` block, after fetching `dbUser`, add a pending count query:

```typescript
let pendingPipelineCount = 0
if (dbUser && tenantId) {
  pendingPipelineCount = await withTenant(tenantId, () =>
    db.pendingPipelineDeal.count()
  )
}
```

Pass it to `Sidebar`:

```typescript
<Sidebar
  dailyStats={dailyStats}
  logoUrl={logoUrl}
  role={role}
  pendingPipelineCount={pendingPipelineCount}
/>
```

- [ ] **Step 2: Update Sidebar to accept and render the badge**

Open `src/components/layout/Sidebar.tsx`. Update the `SidebarProps` interface:

```typescript
interface SidebarProps {
  dailyStats:            DailyTargetStats
  logoUrl?:              string | null
  role?:                 string
  pendingPipelineCount?: number
}
```

Destructure the new prop:

```typescript
export function Sidebar({ dailyStats, logoUrl, role = '', pendingPipelineCount = 0 }: SidebarProps) {
```

In the nav items map, find the Pipeline item and add a badge when count > 0. Replace the `Link` for Pipeline:

```typescript
{NAV_ITEMS.filter(item => !item.roles || item.roles.includes(role)).map(({ href, label, icon: Icon }) => {
  const active = href === '/' ? pathname === '/' : pathname.startsWith(href)
  const isPipeline = href === '/pipeline'
  const showBadge  = isPipeline && pendingPipelineCount > 0
  return (
    <Link
      key={href}
      href={href}
      title={sidebarCollapsed ? label : undefined}
      className={cn(
        'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-colors duration-200',
        active ? 'bg-white/5 text-accent' : 'text-gray-400 hover:text-white hover:bg-white/5',
        sidebarCollapsed && 'justify-center px-0'
      )}
    >
      <div className="relative flex-shrink-0">
        <Icon className="w-5 h-5" />
        {showBadge && (
          <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-amber-500 text-[9px] font-bold text-black flex items-center justify-center">
            {pendingPipelineCount > 9 ? '9+' : pendingPipelineCount}
          </span>
        )}
      </div>
      {!sidebarCollapsed && <span>{label}</span>}
    </Link>
  )
})}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/(dashboard)/layout.tsx src/components/layout/Sidebar.tsx
git commit -m "Add pending pipeline count badge to Pipeline nav item"
```

---

## Task 15: Run full test suite and verify

- [ ] **Step 1: Run all tests**

```bash
npx vitest run
```

Expected: all tests pass. If `auto-deal.test.ts` tests fail because the store's `meeting_booked` path changed, update tests accordingly — the `autoCreateDeal` function itself is unchanged, only its call site was removed.

- [ ] **Step 2: TypeScript full check**

```bash
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 3: Final commit**

```bash
git add -A
git commit -m "Pipeline from dialer: complete feature"
```
