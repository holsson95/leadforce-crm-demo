# Calling Section Enhancements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eight targeted enhancements to the calling page — 2/3 layout, dual phone columns with dialer selector, portal-based tooltip fix, row selection fix, session-only drag-to-reorder, "calls made today" collapsible section, daily queue filtering, and manual outcome override in the notes modal.

**Architecture:** All changes confined to the calling section. The dialer store gains `calledToday`, `reorderQueue`, `logManualOutcome`, and fixes to `setCampaign`/`startCall`. The queue API gains a "called today" exclusion filter. The log-outcome API gains a `manual` flag that creates a fresh CallRecord (instead of updating an existing one) and returns the record for immediate dot updates. The tooltip fix uses `@base-ui/react`'s `Tooltip` (already installed) which portals to body. Drag-to-reorder uses dnd-kit (new dependency), session-only.

**Tech Stack:** Next.js 14 App Router, Prisma/PostgreSQL, Zustand, Tailwind CSS, `@base-ui/react`, `@dnd-kit/core` + `@dnd-kit/sortable` + `@dnd-kit/utilities` (new)

---

## File Map

| File | Change |
|------|--------|
| `src/app/(dashboard)/calling/page.tsx` | New 2-column layout |
| `src/app/api/dialer/queue/route.ts` | Add "called today" exclusion filter |
| `src/app/api/dialer/log-outcome/route.ts` | `manual` flag, return `callRecord`, lookup `dbUser` |
| `src/app/api/dialer/start-call/route.ts` | Accept optional `phoneNumber` override |
| `src/stores/dialer-store.ts` | `calledToday`, `reorderQueue`, `logManualOutcome`, `setCampaign` null fix, `startCall` phone param, `logOutcome` calledToday update |
| `src/components/dialer/CallHistoryDots.tsx` | Replace custom hover tooltip with `@base-ui/react` Tooltip |
| `src/components/dialer/QueuePanel.tsx` | Full rewrite: 2/3 width, drag handle, phone columns, calledToday section |
| `src/components/dialer/ContactNotesModal.tsx` | Add "Log Outcome" tab using `DispositionForm` + `logManualOutcome` |

---

### Task 1: Install dnd-kit

**Files:**
- Modify: `package.json` (via npm install)

- [ ] **Step 1: Install the three dnd-kit packages**

```bash
npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```

Expected output: packages added, `package.json` and `package-lock.json` updated.

- [ ] **Step 2: Verify install**

```bash
node -e "require('@dnd-kit/core'); require('@dnd-kit/sortable'); require('@dnd-kit/utilities'); console.log('ok')"
```

Expected: `ok`

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "Install @dnd-kit/core, @dnd-kit/sortable, @dnd-kit/utilities for drag-to-reorder"
```

---

### Task 2: Update start-call API — accept phoneNumber override

**Files:**
- Modify: `src/app/api/dialer/start-call/route.ts`

- [ ] **Step 1: Add `phoneNumber` to BodySchema and pass it to telephony**

Replace the entire file content:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { db, withTenant } from '@/lib/db'
import { hasPermission, getClerkMeta } from '@/lib/auth'
import { getTelephonyService } from '@/lib/telephony'

const BodySchema = z.object({
  contactId:   z.string().min(1),
  campaignId:  z.string().min(1),
  phoneNumber: z.string().optional(),
})

export async function POST(req: NextRequest) {
  try {
    const { userId: clerkId } = await auth()
    if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { role, tenantId } = await getClerkMeta()
    if (!hasPermission(role, 'calls:write') || !tenantId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await req.json()
    const parsed = BodySchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid body', details: parsed.error.flatten() }, { status: 400 })
    }
    const { contactId, campaignId, phoneNumber } = parsed.data

    const dbUser = await withTenant(tenantId, () =>
      db.user.findFirst({ where: { clerkId }, select: { id: true } })
    )
    if (!dbUser) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    const contact = await withTenant(tenantId, () =>
      db.contact.findUnique({ where: { id: contactId }, select: { mobilePhone: true } })
    )
    if (!contact) return NextResponse.json({ error: 'Contact not found' }, { status: 404 })

    const dialTo = phoneNumber ?? contact.mobilePhone ?? ''

    try {
      const telephony = getTelephonyService()
      await telephony.makeCall({ from: 'system', to: dialTo, campaignId })
    } catch {
      // continue — record the call regardless
    }

    const callRecord = await withTenant(tenantId, () =>
      db.callRecord.create({
        data:   { tenantId, campaignId, contactId, userId: dbUser.id },
        select: { id: true },
      })
    )

    return NextResponse.json({ data: { callRecordId: callRecord.id } })
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep "start-call" | head -10
```

Expected: no errors for this file.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/dialer/start-call/route.ts
git commit -m "Accept optional phoneNumber override in start-call API"
```

---

### Task 3: Update log-outcome API — manual flag + return CallRecord

**Files:**
- Modify: `src/app/api/dialer/log-outcome/route.ts`

- [ ] **Step 1: Rewrite the route**

Replace the entire file:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { db, withTenant } from '@/lib/db'
import { hasPermission, getClerkMeta } from '@/lib/auth'
import { routeOutcome, CONVERSATION_TAGGED_OUTCOMES } from '@/lib/outcome-router'
import { CallOutcome } from '@prisma/client'

const OUTCOME_ENUM = [
  'no_answer', 'voicemail', 'not_interested', 'not_relevant_contact',
  'disqualified', 'lead', 'call_back_later', 'meeting_booked', 'call_back_attempted',
  'connected', 'left_voicemail', 'bad_time_to_speak', 'in_a_meeting', 'on_holiday',
  'hung_up', 'does_not_take_cold_calls', 'ai_assistant', 'line_engaged', 'wrong_number',
  'mobile_switched_off', 'foreign_dial_tone', 'not_available', 'other',
] as const

const BodySchema = z.object({
  manual:       z.boolean().optional().default(false),
  callRecordId: z.string().min(1).optional(),
  campaignId:   z.string().min(1).optional(),
  outcome:      z.enum(OUTCOME_ENUM),
  notes:        z.string().optional(),
  contactId:    z.string().min(1),
})

export async function POST(req: NextRequest) {
  try {
    const { userId: clerkId } = await auth()
    if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { role, tenantId } = await getClerkMeta()
    if (!hasPermission(role, 'calls:write') || !tenantId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await req.json()
    const parsed = BodySchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid body', details: parsed.error.flatten() }, { status: 400 })
    }
    const { manual, callRecordId, campaignId, outcome, notes, contactId } = parsed.data

    if (!manual && !callRecordId) {
      return NextResponse.json({ error: 'callRecordId required' }, { status: 400 })
    }
    if (manual && !campaignId) {
      return NextResponse.json({ error: 'campaignId required for manual outcomes' }, { status: 400 })
    }

    const typedOutcome       = outcome as CallOutcome
    const conversationTagged = CONVERSATION_TAGGED_OUTCOMES.has(typedOutcome)

    const dbUser = await withTenant(tenantId, () =>
      db.user.findFirst({ where: { clerkId }, select: { id: true, name: true } })
    )
    if (!dbUser) return NextResponse.json({ error: 'User not found' }, { status: 404 })

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
          return created
        } else {
          const updated = await tx.callRecord.update({
            where: { id: callRecordId! },
            data:  { outcome: typedOutcome, notes: notes ?? null, conversationTagged },
            select: { id: true, createdAt: true },
          })
          await routeOutcome(contactId, typedOutcome, tx)
          return updated
        }
      })
    )

    return NextResponse.json({
      data: {
        success: true,
        callRecord: {
          id:         record.id,
          outcome:    typedOutcome,
          notes:      notes ?? null,
          createdAt:  record.createdAt.toISOString(),
          callerName: dbUser.name,
        },
      },
    })
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep "log-outcome" | head -10
```

Expected: no errors for this file.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/dialer/log-outcome/route.ts
git commit -m "Add manual flag to log-outcome; return CallRecord for immediate dot update"
```

---

### Task 4: Update queue API — exclude already-called-today

**Files:**
- Modify: `src/app/api/dialer/queue/route.ts`

- [ ] **Step 1: Add startOfToday filter to the Prisma query**

In `src/app/api/dialer/queue/route.ts`, replace the `const now = new Date()` block and the `contacts` query. The full new file:

```typescript
import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { db, withTenant } from '@/lib/db'
import { hasPermission, getClerkMeta } from '@/lib/auth'
import type { ContactSummary } from '@/types/models'

const QuerySchema = z.object({
  campaignId: z.string().min(1),
})

export async function GET(request: Request) {
  try {
    const { userId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { role, tenantId } = await getClerkMeta()
    if (!hasPermission(role, 'calls:write') || !tenantId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const parsed = QuerySchema.safeParse({ campaignId: searchParams.get('campaignId') })
    if (!parsed.success) {
      return NextResponse.json({ error: 'campaignId required' }, { status: 400 })
    }
    const { campaignId } = parsed.data

    const now          = new Date()
    const startOfToday = new Date(now)
    startOfToday.setUTCHours(0, 0, 0, 0)

    const contacts = await withTenant(tenantId, () =>
      db.contact.findMany({
        where: {
          campaignId,
          status: { in: ['call_back', 'prospect'] },
          OR: [
            { notInterestedUntil: null },
            { notInterestedUntil: { lte: now } },
          ],
          callRecords: {
            none: {
              campaignId,
              createdAt: { gte: startOfToday },
            },
          },
        },
        select: {
          id:             true,
          firstName:      true,
          lastName:       true,
          mobilePhone:    true,
          corporatePhone: true,
          companyName:    true,
          status:         true,
          jobTitle:       true,
          employeeCount:  true,
          callRecords: {
            select: {
              id:        true,
              outcome:   true,
              notes:     true,
              createdAt: true,
              user:      { select: { name: true } },
            },
            orderBy: { createdAt: 'desc' },
            take:    10,
          },
        },
        take: 50,
      })
    )

    const sorted = [
      ...contacts.filter((c) => c.status === 'call_back'),
      ...contacts.filter((c) => c.status === 'prospect'),
    ].slice(0, 20)

    const data: ContactSummary[] = sorted.map((c) => ({
      id:             c.id,
      firstName:      c.firstName,
      lastName:       c.lastName,
      mobilePhone:    c.mobilePhone,
      corporatePhone: c.corporatePhone,
      companyName:    c.companyName,
      status:         c.status,
      jobTitle:       c.jobTitle,
      employeeCount:  c.employeeCount,
      callHistory:    c.callRecords.map((r) => ({
        id:         r.id,
        outcome:    r.outcome,
        notes:      r.notes,
        createdAt:  r.createdAt.toISOString(),
        callerName: r.user.name,
      })),
    }))

    return NextResponse.json({ data })
  } catch (err) {
    console.error('[queue/route] GET error', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep "queue/route" | head -10
```

Expected: no errors for this file.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/dialer/queue/route.ts
git commit -m "Exclude contacts already called today from dialer queue"
```

---

### Task 5: Update dialer store

**Files:**
- Modify: `src/stores/dialer-store.ts`

- [ ] **Step 1: Rewrite the store with all new actions**

Replace the entire file:

```typescript
import { create } from 'zustand'
import { arrayMove } from '@dnd-kit/utilities'
import type { ContactSummary, CallHistoryRecord } from '@/types/models'
import type { CallOutcome } from '@prisma/client'

type DialerCallStatus = 'idle' | 'ringing' | 'connected' | 'ended'

interface DialerState {
  campaignId:         string | null
  queue:              ContactSummary[]
  calledToday:        ContactSummary[]
  callStatus:         DialerCallStatus
  currentContact:     ContactSummary | null
  activeCallRecordId: string | null
  callStartedAt:      number | null
  sessionId:          string | null
  sessionStartedAt:   number | null
  elapsedSeconds:     number

  setCampaign(id: string, contacts: ContactSummary[]): void
  selectContact(contact: ContactSummary): void
  reorderQueue(oldIndex: number, newIndex: number): void
  loadQueue(): Promise<void>
  startSession(campaignId: string): Promise<void>
  startCall(phoneNumber?: string): Promise<void>
  endCall(durationSecs: number): Promise<void>
  logOutcome(outcome: CallOutcome, notes: string): Promise<void>
  logManualOutcome(contactId: string, outcome: CallOutcome, notes: string): Promise<void>
  tickTimer(): void
}

function prependRecord(
  contact: ContactSummary,
  record: CallHistoryRecord | undefined,
): ContactSummary {
  if (!record) return contact
  return {
    ...contact,
    callHistory: [record, ...contact.callHistory].slice(0, 10),
  }
}

export const useDialerStore = create<DialerState>((set, get) => ({
  campaignId:         null,
  queue:              [],
  calledToday:        [],
  callStatus:         'idle',
  currentContact:     null,
  activeCallRecordId: null,
  callStartedAt:      null,
  sessionId:          null,
  sessionStartedAt:   null,
  elapsedSeconds:     0,

  setCampaign(id, contacts) {
    set({
      campaignId:         id,
      currentContact:     null,
      queue:              contacts,
      calledToday:        [],
      callStatus:         'idle',
      activeCallRecordId: null,
      callStartedAt:      null,
    })
  },

  selectContact(contact) {
    const { currentContact, queue } = get()
    if (contact.id === currentContact?.id) return
    const newQueue = [
      ...(currentContact ? [currentContact] : []),
      ...queue.filter((c) => c.id !== contact.id),
    ]
    set({ currentContact: contact, queue: newQueue, callStatus: 'idle', activeCallRecordId: null, callStartedAt: null })
  },

  reorderQueue(oldIndex, newIndex) {
    const { currentContact, queue } = get()
    const all      = currentContact ? [currentContact, ...queue] : [...queue]
    const reordered = arrayMove(all, oldIndex, newIndex)
    set({ currentContact: reordered[0] ?? null, queue: reordered.slice(1) })
  },

  async loadQueue() {
    const { campaignId, currentContact } = get()
    if (!campaignId) return
    const res = await fetch(`/api/dialer/queue?campaignId=${campaignId}`)
    if (!res.ok) return
    const { data } = (await res.json()) as { data: ContactSummary[] }
    const filtered = data.filter((c) => c.id !== currentContact?.id)
    set({ queue: filtered })
  },

  async startSession(campaignId) {
    const res = await fetch('/api/dialer/session', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ campaignId }),
    })
    if (!res.ok) return
    const { data } = await res.json()
    set({ sessionId: data.id, sessionStartedAt: Date.now(), elapsedSeconds: 0 })
  },

  async startCall(phoneNumber) {
    const { currentContact, campaignId } = get()
    if (!currentContact || !campaignId) return

    set({ callStatus: 'ringing' })

    const res = await fetch('/api/dialer/start-call', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ contactId: currentContact.id, campaignId, phoneNumber }),
    })
    if (!res.ok) { set({ callStatus: 'idle' }); return }
    const { data } = await res.json()
    set({ activeCallRecordId: data.callRecordId })

    setTimeout(() => {
      if (get().callStatus === 'ringing') {
        set({ callStatus: 'connected', callStartedAt: Date.now() })
      }
    }, 1500)
  },

  async endCall(durationSecs) {
    const { activeCallRecordId } = get()
    if (!activeCallRecordId) return
    set({ callStatus: 'ended' })
    await fetch('/api/dialer/end-call', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ callRecordId: activeCallRecordId, durationSecs }),
    })
  },

  async logOutcome(outcome, notes) {
    const { activeCallRecordId, currentContact, queue, calledToday } = get()
    if (!activeCallRecordId || !currentContact) return

    const res = await fetch('/api/dialer/log-outcome', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        callRecordId: activeCallRecordId,
        outcome,
        notes,
        contactId: currentContact.id,
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
    })

    if (queue.length < 5) get().loadQueue()
  },

  async logManualOutcome(contactId, outcome, notes) {
    const { campaignId, queue, currentContact, calledToday } = get()
    if (!campaignId) return

    const res = await fetch('/api/dialer/log-outcome', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ manual: true, outcome, notes, contactId, campaignId }),
    })
    if (!res.ok) throw new Error('Failed to log manual outcome')

    const json      = await res.json()
    const newRecord = json.data?.callRecord as CallHistoryRecord | undefined

    const updateContact = (c: ContactSummary) => prependRecord(c, newRecord)

    if (currentContact?.id === contactId) {
      const nextContact = queue[0] ?? null
      set({
        currentContact:     nextContact,
        queue:              queue.slice(1),
        calledToday:        [...calledToday, updateContact(currentContact)],
        callStatus:         'idle',
        activeCallRecordId: null,
        callStartedAt:      null,
      })
    } else {
      const inQueue = queue.find((c) => c.id === contactId)
      if (inQueue) {
        set({
          queue:       queue.filter((c) => c.id !== contactId),
          calledToday: [...calledToday, updateContact(inQueue)],
        })
      } else {
        set({
          calledToday: calledToday.map((c) =>
            c.id === contactId ? updateContact(c) : c
          ),
        })
      }
    }
  },

  tickTimer() {
    set((s) => ({ elapsedSeconds: s.elapsedSeconds + 1 }))
  },
}))
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep "dialer-store" | head -10
```

Expected: no errors for this file.

- [ ] **Step 3: Commit**

```bash
git add src/stores/dialer-store.ts
git commit -m "Add calledToday, reorderQueue, logManualOutcome; fix setCampaign null start; startCall phone param"
```

---

### Task 6: Fix CallHistoryDots tooltip — Base UI portal

**Files:**
- Modify: `src/components/dialer/CallHistoryDots.tsx`

Replace the custom hover `<span>` tooltip with `@base-ui/react`'s `Tooltip`, which portals to `<body>` and can never be clipped by a scroll container.

- [ ] **Step 1: Rewrite the component**

Replace the entire file:

```typescript
'use client'

import { Tooltip } from '@base-ui/react/tooltip'
import { OUTCOME_COLOR, OUTCOME_LABEL, DOT_CLASS, TEXT_CLASS } from './outcome-colors'
import type { CallHistoryRecord } from '@/types/models'
import { cn } from '@/lib/utils'

const TOTAL_DOTS = 10

interface CallHistoryDotsProps {
  history: CallHistoryRecord[]
}

function Dot({ record }: { record: CallHistoryRecord | null }) {
  if (!record) {
    return <span className="w-2 h-2 rounded-full bg-white/10 flex-shrink-0 block" />
  }

  const color = record.outcome ? OUTCOME_COLOR[record.outcome] : 'red'
  const label = record.outcome ? OUTCOME_LABEL[record.outcome] : 'Unknown'
  const date  = new Date(record.createdAt).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: '2-digit',
  })

  return (
    <Tooltip.Root delay={150}>
      <Tooltip.Trigger
        render={<span className="flex-shrink-0 cursor-default" />}
      >
        <span className={cn('w-2 h-2 rounded-full block', DOT_CLASS[color])} />
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Positioner side="top" sideOffset={8}>
          <Tooltip.Popup className="w-44 bg-[#0d1117] border border-white/10 rounded-xl p-2.5 text-[10px] z-50 shadow-xl">
            <span className="block font-semibold text-white truncate">{record.callerName}</span>
            <span className="block text-gray-400 mt-0.5">{date}</span>
            <span className={cn('block mt-1 font-medium', TEXT_CLASS[color])}>{label}</span>
            {record.notes && (
              <span className="block text-gray-300 mt-1 line-clamp-2">{record.notes}</span>
            )}
          </Tooltip.Popup>
        </Tooltip.Positioner>
      </Tooltip.Portal>
    </Tooltip.Root>
  )
}

export function CallHistoryDots({ history }: CallHistoryDotsProps) {
  const slots: (CallHistoryRecord | null)[] = [
    ...history.slice(0, TOTAL_DOTS),
    ...Array(Math.max(0, TOTAL_DOTS - history.length)).fill(null),
  ]

  const topRow    = slots.slice(0, 5)
  const bottomRow = slots.slice(5, 10)

  return (
    <div className="flex flex-col gap-0.5 flex-shrink-0">
      <div className="flex gap-0.5">
        {topRow.map((r, i) => <Dot key={i} record={r} />)}
      </div>
      <div className="flex gap-0.5">
        {bottomRow.map((r, i) => <Dot key={i + 5} record={r} />)}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep "CallHistoryDots" | head -10
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/dialer/CallHistoryDots.tsx
git commit -m "Fix dot tooltip clipping: replace custom hover span with Base UI Tooltip portal"
```

---

### Task 7: Update page layout — 2/3 + 1/3 stacked

**Files:**
- Modify: `src/app/(dashboard)/calling/page.tsx`

- [ ] **Step 1: Rewrite the page layout**

Replace the entire file:

```typescript
import { redirect } from 'next/navigation'
import { getCurrentTenantId } from '@/lib/auth'
import { db, withTenant } from '@/lib/db'
import { QueuePanel } from '@/components/dialer/QueuePanel'
import { CallControls } from '@/components/dialer/CallControls'
import { ScriptPanel } from '@/components/dialer/ScriptPanel'

export default async function CallingPage() {
  const tenantId = await getCurrentTenantId()
  if (!tenantId) redirect('/sign-in')

  const campaigns = await withTenant(tenantId, () =>
    db.campaign.findMany({
      where:   { status: 'active', deletedAt: null },
      select:  { id: true, name: true },
      orderBy: { name: 'asc' },
    })
  )

  return (
    <div className="flex h-full gap-4 p-4 overflow-hidden">
      <QueuePanel campaigns={campaigns} />
      <div className="w-1/3 flex flex-col gap-4 min-w-0">
        <CallControls />
        <ScriptPanel />
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep "calling/page" | head -10
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/(dashboard)/calling/page.tsx
git commit -m "Calling page: 2/3 queue panel, 1/3 stacked call controls + script"
```

---

### Task 8: Rewrite QueuePanel

**Files:**
- Modify: `src/components/dialer/QueuePanel.tsx`

This task introduces: `w-2/3` width, drag handle column, dual phone columns with selection, "calls made today" collapsible section, dnd-kit sortable queue, and row-click selection.

- [ ] **Step 1: Rewrite the entire file**

Replace `src/components/dialer/QueuePanel.tsx`:

```typescript
'use client'

import { useState } from 'react'
import { Phone, GripVertical, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { useDialerStore } from '@/stores/dialer-store'
import { CallHistoryDots } from './CallHistoryDots'
import { ContactNotesModal } from './ContactNotesModal'
import type { ContactSummary } from '@/types/models'
import {
  DndContext, DragEndEvent, closestCenter, PointerSensor, useSensor, useSensors,
} from '@dnd-kit/core'
import {
  SortableContext, verticalListSortingStrategy, useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

interface QueuePanelProps {
  campaigns: { id: string; name: string }[]
}

function NotesButton({ contact }: { contact: ContactSummary }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(true) }}
        className="w-6 h-6 flex items-center justify-center rounded-lg text-gray-500 hover:text-[#00d4ff] hover:bg-white/5 transition-colors flex-shrink-0"
        title="View notes"
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
          <path d="M1 2a1 1 0 011-1h8a1 1 0 011 1v6a1 1 0 01-1 1H7.5L5 11V9H2a1 1 0 01-1-1V2z"/>
        </svg>
      </button>
      <ContactNotesModal
        contactId={contact.id}
        contactName={`${contact.firstName} ${contact.lastName}`}
        open={open}
        onClose={() => setOpen(false)}
      />
    </>
  )
}

function PhoneColumns({
  contact,
  isActive,
  selectedPhone,
  setSelectedPhone,
  onCallClick,
}: {
  contact: ContactSummary
  isActive: boolean
  selectedPhone: 'mobile' | 'corporate'
  setSelectedPhone: (p: 'mobile' | 'corporate') => void
  onCallClick: (e: React.MouseEvent) => void
}) {
  const { callStatus } = useDialerStore()
  const hasBoth = !!contact.mobilePhone && !!contact.corporatePhone

  return (
    <>
      <div className="flex-shrink-0">
        {contact.mobilePhone ? (
          <button
            onClick={(e) => { e.stopPropagation(); setSelectedPhone('mobile') }}
            className={cn(
              'font-mono text-[10px] w-[72px] truncate block text-left',
              hasBoth
                ? selectedPhone === 'mobile'
                  ? 'text-[#00d4ff] underline underline-offset-2'
                  : 'text-gray-500 hover:text-gray-300'
                : 'text-gray-400 cursor-default',
            )}
          >
            {contact.mobilePhone}
          </button>
        ) : (
          <span className="w-[72px] block" />
        )}
      </div>

      <div className="flex-shrink-0">
        {contact.corporatePhone ? (
          <button
            onClick={(e) => { e.stopPropagation(); setSelectedPhone('corporate') }}
            className={cn(
              'font-mono text-[10px] w-[72px] truncate block text-left',
              hasBoth
                ? selectedPhone === 'corporate'
                  ? 'text-[#00d4ff] underline underline-offset-2'
                  : 'text-gray-500 hover:text-gray-300'
                : 'text-gray-400 cursor-default',
            )}
          >
            {contact.corporatePhone}
          </button>
        ) : (
          <span className="w-[72px] block" />
        )}
      </div>

      <button
        onClick={onCallClick}
        disabled={callStatus !== 'idle'}
        className={cn(
          'w-6 h-6 flex items-center justify-center rounded-lg flex-shrink-0 transition-colors',
          isActive
            ? 'bg-[#00d4ff]/10 text-[#00d4ff] hover:bg-[#00d4ff]/20'
            : 'text-gray-600 hover:text-gray-300 hover:bg-white/5',
          callStatus !== 'idle' && 'opacity-30 cursor-not-allowed',
        )}
        title={isActive ? 'Start call' : 'Select contact'}
      >
        <Phone className="w-3 h-3" />
      </button>
    </>
  )
}

function ContactRow({ contact, isActive }: { contact: ContactSummary; isActive: boolean }) {
  const { callStatus, selectContact, startCall } = useDialerStore()
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: contact.id })

  const defaultPhone: 'mobile' | 'corporate' = contact.mobilePhone ? 'mobile' : 'corporate'
  const [selectedPhone, setSelectedPhone] = useState<'mobile' | 'corporate'>(defaultPhone)
  const dialNumber = selectedPhone === 'mobile' ? contact.mobilePhone : contact.corporatePhone

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity:   isDragging ? 0.4 : 1,
    zIndex:    isDragging ? 50 : undefined,
  }

  const handleRowClick = () => {
    if (callStatus !== 'idle' || isActive) return
    selectContact(contact)
  }

  const handleCallClick = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (callStatus !== 'idle') return
    if (!isActive) {
      selectContact(contact)
    } else {
      await startCall(dialNumber ?? undefined)
    }
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={handleRowClick}
      className={cn(
        'group grid grid-cols-[auto_1fr_auto_auto_auto_auto_auto] items-center gap-2 px-3 py-2.5 border-b border-white/5 transition-colors cursor-pointer',
        isActive ? 'bg-white/5 border-l-2 border-l-[#00d4ff]' : 'hover:bg-white/[0.02]',
      )}
      {...attributes}
    >
      <div
        {...listeners}
        onClick={(e) => e.stopPropagation()}
        className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-600 hover:text-gray-400 touch-none cursor-grab active:cursor-grabbing flex-shrink-0"
      >
        <GripVertical className="w-3 h-3" />
      </div>

      <div className="min-w-0">
        <div className="flex items-start gap-2 min-w-0">
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-white truncate leading-tight">
              {contact.firstName} {contact.lastName}
            </p>
            {contact.jobTitle && (
              <p className="text-[10px] text-gray-500 truncate leading-tight mt-0.5">
                {contact.jobTitle}
              </p>
            )}
          </div>
          <div className="flex-shrink-0 text-right max-w-[90px]">
            {contact.companyName && (
              <p className="text-[10px] text-gray-400 truncate leading-tight">{contact.companyName}</p>
            )}
            {contact.employeeCount != null && (
              <p className="text-[10px] text-gray-600 leading-tight">
                {contact.employeeCount.toLocaleString()} emp
              </p>
            )}
          </div>
        </div>
        {contact.status === 'call_back' && (
          <Badge className="mt-1 text-[9px] h-4 px-1.5 bg-amber-500/10 text-amber-400 border-amber-500/20">
            Call Back
          </Badge>
        )}
      </div>

      <CallHistoryDots history={contact.callHistory} />
      <NotesButton contact={contact} />
      <PhoneColumns
        contact={contact}
        isActive={isActive}
        selectedPhone={selectedPhone}
        setSelectedPhone={setSelectedPhone}
        onCallClick={handleCallClick}
      />
    </div>
  )
}

function CalledTodayRow({ contact }: { contact: ContactSummary }) {
  const { callStatus, selectContact, startCall } = useDialerStore()
  const defaultPhone: 'mobile' | 'corporate' = contact.mobilePhone ? 'mobile' : 'corporate'
  const [selectedPhone, setSelectedPhone] = useState<'mobile' | 'corporate'>(defaultPhone)
  const dialNumber = selectedPhone === 'mobile' ? contact.mobilePhone : contact.corporatePhone

  const handleCallClick = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (callStatus !== 'idle') return
    selectContact(contact)
    await startCall(dialNumber ?? undefined)
  }

  return (
    <div className="group grid grid-cols-[auto_1fr_auto_auto_auto_auto_auto] items-center gap-2 px-3 py-2.5 border-b border-white/5 opacity-60 hover:opacity-80 transition-opacity">
      <div className="w-3 flex-shrink-0" />
      <div className="min-w-0">
        <div className="flex items-start gap-2 min-w-0">
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-white truncate leading-tight">
              {contact.firstName} {contact.lastName}
            </p>
            {contact.jobTitle && (
              <p className="text-[10px] text-gray-500 truncate leading-tight mt-0.5">
                {contact.jobTitle}
              </p>
            )}
          </div>
          <div className="flex-shrink-0 text-right max-w-[90px]">
            {contact.companyName && (
              <p className="text-[10px] text-gray-400 truncate leading-tight">{contact.companyName}</p>
            )}
            {contact.employeeCount != null && (
              <p className="text-[10px] text-gray-600 leading-tight">
                {contact.employeeCount.toLocaleString()} emp
              </p>
            )}
          </div>
        </div>
      </div>
      <CallHistoryDots history={contact.callHistory} />
      <NotesButton contact={contact} />
      <PhoneColumns
        contact={contact}
        isActive={false}
        selectedPhone={selectedPhone}
        setSelectedPhone={setSelectedPhone}
        onCallClick={handleCallClick}
      />
    </div>
  )
}

export function QueuePanel({ campaigns }: QueuePanelProps) {
  const {
    campaignId, currentContact, queue, calledToday,
    setCampaign, startSession, loadQueue, reorderQueue,
  } = useDialerStore()

  const [calledTodayOpen, setCalledTodayOpen] = useState(false)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  )

  const handleCampaignChange = async (id: string) => {
    const res = await fetch(`/api/dialer/queue?campaignId=${id}`)
    if (!res.ok) return
    const { data } = await res.json()
    setCampaign(id, data)
    await startSession(id)
  }

  const allContacts: ContactSummary[] = [
    ...(currentContact ? [currentContact] : []),
    ...queue,
  ]

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = allContacts.findIndex((c) => c.id === active.id)
    const newIndex = allContacts.findIndex((c) => c.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return
    reorderQueue(oldIndex, newIndex)
  }

  return (
    <div className="glass-panel rounded-3xl flex flex-col w-2/3 flex-shrink-0 overflow-hidden">
      <div className="p-4 border-b border-white/5 flex-shrink-0">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-2">Campaign</p>
        <Select value={campaignId ?? ''} onValueChange={(v) => handleCampaignChange(v ?? '')}>
          <SelectTrigger className="bg-white/5 border-white/10 text-white rounded-xl text-sm">
            <SelectValue>
              {(v: string | null) => v ? (campaigns.find(c => c.id === v)?.name ?? v) : 'Select a campaign…'}
            </SelectValue>
          </SelectTrigger>
          <SelectContent className="rounded-xl border-white/10 bg-[#161c26]">
            {campaigns.map((c) => (
              <SelectItem key={c.id} value={c.id}
                className="text-gray-300 focus:bg-white/5 focus:text-white rounded-lg">
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0">
        {!campaignId ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm text-gray-500">Select a campaign to begin</p>
          </div>
        ) : allContacts.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm text-gray-500">Queue empty</p>
          </div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={allContacts.map((c) => c.id)} strategy={verticalListSortingStrategy}>
              {allContacts.map((contact) => (
                <ContactRow
                  key={contact.id}
                  contact={contact}
                  isActive={contact.id === currentContact?.id}
                />
              ))}
            </SortableContext>
          </DndContext>
        )}
      </div>

      {queue.length >= 19 && (
        <div className="p-2 border-t border-white/5 flex-shrink-0">
          <button
            onClick={() => loadQueue()}
            className="w-full text-xs text-gray-400 hover:text-white transition-colors py-2"
          >
            Load more
          </button>
        </div>
      )}

      {calledToday.length > 0 && (
        <div className="border-t border-white/10 flex-shrink-0">
          <button
            onClick={() => setCalledTodayOpen((v) => !v)}
            className="w-full px-4 py-3 flex items-center justify-between text-xs text-gray-400 hover:text-white transition-colors"
          >
            <span>Calls made today ({calledToday.length})</span>
            <ChevronDown className={cn('w-3.5 h-3.5 transition-transform duration-200', calledTodayOpen && 'rotate-180')} />
          </button>
          {calledTodayOpen && (
            <div className="overflow-y-auto max-h-60">
              {calledToday.map((contact) => (
                <CalledTodayRow key={contact.id} contact={contact} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep "QueuePanel" | head -10
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/dialer/QueuePanel.tsx
git commit -m "Rewrite QueuePanel: 2/3 width, drag-to-reorder, phone columns, calls-made-today section"
```

---

### Task 9: Update ContactNotesModal — Log Outcome tab

**Files:**
- Modify: `src/components/dialer/ContactNotesModal.tsx`

Adds a "Log Outcome" tab to the modal footer. Selecting it shows `DispositionForm`. Submitting creates a real `CallRecord` via `logManualOutcome` in the store and closes the modal.

- [ ] **Step 1: Rewrite the modal**

Replace `src/components/dialer/ContactNotesModal.tsx`:

```typescript
'use client'

import { useEffect, useState } from 'react'
import { MessageSquare, Plus } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { CallOutcome } from '@prisma/client'
import { OUTCOME_LABEL, OUTCOME_COLOR, TEXT_CLASS } from './outcome-colors'
import { DispositionForm } from './DispositionForm'
import { useDialerStore } from '@/stores/dialer-store'
import { cn } from '@/lib/utils'

type ModalTab  = 'note' | 'outcome'
type NoteEntry = {
  id:         string
  type:       'call' | 'note'
  callerName: string
  createdAt:  string
  outcome:    CallOutcome | null
  content:    string
}

interface ContactNotesModalProps {
  contactId:   string
  contactName: string
  open:        boolean
  onClose:     () => void
}

export function ContactNotesModal({
  contactId,
  contactName,
  open,
  onClose,
}: ContactNotesModalProps) {
  const logManualOutcome = useDialerStore((s) => s.logManualOutcome)

  const [entries,        setEntries]        = useState<NoteEntry[]>([])
  const [loading,        setLoading]        = useState(false)
  const [fetchError,     setFetchError]     = useState(false)
  const [tab,            setTab]            = useState<ModalTab>('note')
  const [noteText,       setNoteText]       = useState('')
  const [submitting,     setSubmitting]     = useState(false)
  const [saveError,      setSaveError]      = useState(false)
  const [outcomeLoading, setOutcomeLoading] = useState(false)

  useEffect(() => {
    if (!open) return
    setLoading(true)
    setFetchError(false)
    setTab('note')
    fetch(`/api/contacts/${contactId}/notes`)
      .then((r) => {
        if (!r.ok) { setFetchError(true); return null }
        return r.json()
      })
      .then((json) => { if (json) setEntries(json.data ?? []) })
      .finally(() => setLoading(false))
  }, [open, contactId])

  const handleAddNote = async () => {
    if (!noteText.trim()) return
    setSaveError(false)
    setSubmitting(true)
    try {
      const res = await fetch(`/api/contacts/${contactId}/notes`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ content: noteText.trim() }),
      })
      if (!res.ok) { setSaveError(true); return }
      const { data } = await res.json()
      const newEntry: NoteEntry = {
        id:         data.id,
        type:       'note',
        callerName: 'You',
        createdAt:  new Date().toISOString(),
        outcome:    null,
        content:    noteText.trim(),
      }
      setEntries((prev) => [newEntry, ...prev])
      setNoteText('')
    } finally {
      setSubmitting(false)
    }
  }

  const handleLogOutcome = async (outcome: CallOutcome, notes: string) => {
    setOutcomeLoading(true)
    try {
      await logManualOutcome(contactId, outcome, notes)
      onClose()
    } finally {
      setOutcomeLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="bg-[#161c26] border-white/10 rounded-3xl max-w-lg w-full max-h-[80vh] flex flex-col gap-0 p-0 overflow-hidden">
        <DialogHeader className="p-5 pb-4 border-b border-white/5 flex-shrink-0">
          <DialogTitle className="text-base font-semibold text-white flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-[#00d4ff]" />
            {contactName} — Call Notes
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto min-h-0">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <p className="text-sm text-gray-500">Loading…</p>
            </div>
          ) : fetchError ? (
            <div className="flex items-center justify-center py-12">
              <p className="text-sm text-red-400">Failed to load notes. Check your connection.</p>
            </div>
          ) : entries.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <p className="text-sm text-gray-500">No calls or notes yet</p>
            </div>
          ) : (
            <ul className="divide-y divide-white/5">
              {entries.map((entry) => {
                const date = new Date(entry.createdAt).toLocaleString('en-GB', {
                  day: '2-digit', month: 'short', year: '2-digit',
                  hour: '2-digit', minute: '2-digit',
                })
                return (
                  <li key={entry.id} className="px-5 py-3.5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-semibold text-white">{entry.callerName}</span>
                          {entry.outcome && (
                            <span className={cn(
                              'text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-white/5',
                              TEXT_CLASS[OUTCOME_COLOR[entry.outcome]],
                            )}>
                              {OUTCOME_LABEL[entry.outcome]}
                            </span>
                          )}
                          {entry.type === 'note' && (
                            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-white/5 text-gray-400">
                              Note
                            </span>
                          )}
                        </div>
                        {entry.content && (
                          <p className="text-sm text-gray-300 mt-1">{entry.content}</p>
                        )}
                        {!entry.content && entry.type === 'call' && (
                          <p className="text-sm text-gray-600 mt-1 italic">No notes</p>
                        )}
                      </div>
                      <span className="text-[10px] text-gray-500 flex-shrink-0 mt-0.5">{date}</span>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        <div className="border-t border-white/5 flex-shrink-0">
          <div className="flex gap-1 p-3 pb-0">
            <button
              onClick={() => setTab('note')}
              className={cn(
                'flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors',
                tab === 'note' ? 'bg-white/10 text-white' : 'text-gray-500 hover:text-gray-300',
              )}
            >
              Add Note
            </button>
            <button
              onClick={() => setTab('outcome')}
              className={cn(
                'flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors',
                tab === 'outcome' ? 'bg-white/10 text-white' : 'text-gray-500 hover:text-gray-300',
              )}
            >
              Log Outcome
            </button>
          </div>

          {tab === 'note' ? (
            <div className="p-4 space-y-2">
              <textarea
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                placeholder="Add a note…"
                rows={2}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-gray-600 resize-none focus:outline-none focus:border-[#00d4ff]/50 focus:ring-1 focus:ring-[#00d4ff]/10"
              />
              {saveError && (
                <p className="text-xs text-red-400">Failed to save note. Try again.</p>
              )}
              <Button
                onClick={handleAddNote}
                disabled={!noteText.trim() || submitting}
                className="w-full bg-white/5 border border-white/10 text-gray-300 rounded-xl hover:bg-white/10 disabled:opacity-40"
              >
                <Plus className="w-3.5 h-3.5 mr-1.5" />
                {submitting ? 'Saving…' : 'Add Note'}
              </Button>
            </div>
          ) : (
            <div className="p-4">
              <DispositionForm onSubmit={handleLogOutcome} loading={outcomeLoading} />
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep "ContactNotesModal" | head -10
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/dialer/ContactNotesModal.tsx
git commit -m "Add Log Outcome tab to notes modal: creates real CallRecord via logManualOutcome"
```

---

## Self-Review

### Spec Coverage Check

| Requirement | Task |
|---|---|
| Page layout: 2/3 queue, 1/3 stacked call+script | Task 7 |
| Employee count under company name | Already present; preserved in Task 8 |
| Phone number columns (mobile + corporate) | Task 8 — `PhoneColumns` component |
| Phone selector UI when both present | Task 8 — click to select, cyan underline |
| Mobile phone default | Task 8 — `defaultPhone = mobilePhone ? 'mobile' : 'corporate'` |
| Phone number passed to dialer on call | Tasks 5 + 8 — `startCall(dialNumber)` |
| Tooltip clipping fix | Task 6 — Base UI Tooltip portal |
| Any row selectable (not just top) | Tasks 5 + 8 — `setCampaign` sets `null`, `handleRowClick` calls `selectContact` |
| Drag-to-reorder, session-only | Tasks 1 + 5 + 8 — dnd-kit, `reorderQueue`, Zustand |
| Calls made today, collapsible, full row | Task 8 — `calledToday` state + `CalledTodayRow` |
| Calls made today populated on outcome log | Task 5 — `logOutcome` pushes to `calledToday` |
| No reshow on navigation | Tasks 4 + 5 — queue API filter + `setCampaign` resets `calledToday` |
| Manual outcome in notes modal creates real CallRecord | Tasks 3 + 5 + 9 — `manual: true` API + `logManualOutcome` + modal tab |
| Manual outcome triggers outcome router | Task 3 — `routeOutcome` called in both branches |
| Manual outcome moves contact to calledToday | Task 5 — `logManualOutcome` |
| Dot updates immediately after manual outcome | Tasks 3 + 5 — API returns `callRecord`, store calls `prependRecord` |
| Modal closes after manual outcome | Task 9 — `onClose()` in `handleLogOutcome` |

### Type Consistency Check

- `CallHistoryRecord` used in store's `prependRecord` ✓ (matches `@/types/models`)
- `logManualOutcome(contactId, outcome, notes)` called in modal with those exact params ✓
- `reorderQueue(oldIndex, newIndex)` in store interface + `handleDragEnd` usage ✓
- `startCall(phoneNumber?)` store interface + `ContactRow` / `CalledTodayRow` calls ✓
- `calledToday: ContactSummary[]` in store interface + `QueuePanel` destructure ✓
- `PhoneColumns` props match both `ContactRow` and `CalledTodayRow` usage ✓
