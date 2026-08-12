# Calling Section Enhancements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the calling queue panel and disposition form to match Adenzo-style UX — richer contact rows (full name + job title, company + employee count, 10-dot call history, notes modal, per-row call button) and an expanded 19-outcome color-coded disposition picker that opens automatically post-call.

**Architecture:** Call history dots are served via an extended queue API response (last 10 `CallRecord`s per contact, with caller name). Standalone notes are stored in a new `ContactNote` model. A shared `outcome-colors.ts` utility maps every `CallOutcome` to green/yellow/red and drives both the history dots and the disposition form. The `DispositionForm` continues to render inside `CallControls` when `callStatus === 'ended'`.

**Tech Stack:** Next.js 14 App Router, Prisma/PostgreSQL, Zustand, Tailwind CSS, Shadcn/UI (`Dialog`), Lucide React

---

## File Map

**New files:**
- `src/components/dialer/outcome-colors.ts` — maps every `CallOutcome` to color + display label; imported by dots + form
- `src/components/dialer/CallHistoryDots.tsx` — 10-circle visual (5 top row, 5 bottom row) with hover tooltip
- `src/components/dialer/ContactNotesModal.tsx` — Dialog: merged call records + standalone notes + add-note form
- `src/app/api/contacts/[id]/notes/route.ts` — GET (history entries) + POST (create `ContactNote`)

**Modified files:**
- `prisma/schema.prisma` — add 14 `CallOutcome` enum values; add `ContactNote` model; add back-relations on `Tenant`, `Contact`, `User`
- `src/types/models.ts` — add `CallHistoryRecord` type; extend `ContactSummary` with `jobTitle`, `employeeCount`, `callHistory`
- `src/app/api/dialer/queue/route.ts` — select `jobTitle`, `employeeCount`, nested `callRecords` (10 most recent with caller name); transform response
- `src/app/api/dialer/log-outcome/route.ts` — expand Zod enum to accept 14 new outcomes
- `src/components/dialer/QueuePanel.tsx` — redesign `ContactRow` with 5-column grid; add call button
- `src/components/dialer/DispositionForm.tsx` — replace 8-outcome list with 19 color-coded outcomes
- `src/stores/dialer-store.ts` — add `selectContact` action
- `src/lib/outcome-router.ts` — add routing rules for 14 new outcomes; expand `CONVERSATION_TAGGED_OUTCOMES`
- `src/lib/__tests__/outcome-router.test.ts` — add tests for all 14 new outcomes

---

### Task 1: Schema Changes + Migration

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add 14 new `CallOutcome` enum values to schema**

In `prisma/schema.prisma`, replace the existing `CallOutcome` enum:

```prisma
enum CallOutcome {
  no_answer
  voicemail
  not_interested
  not_relevant_contact
  disqualified
  lead
  call_back_later
  meeting_booked
  call_back_attempted
  connected
  left_voicemail
  bad_time_to_speak
  in_a_meeting
  on_holiday
  hung_up
  does_not_take_cold_calls
  ai_assistant
  line_engaged
  wrong_number
  mobile_switched_off
  foreign_dial_tone
  not_available
  other
}
```

- [ ] **Step 2: Add `ContactNote` model and back-relations**

Add this model at the end of `prisma/schema.prisma` (before the final blank line):

```prisma
model ContactNote {
  id        String   @id @default(cuid())
  tenantId  String
  contactId String
  userId    String
  content   String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  tenant    Tenant   @relation(fields: [tenantId], references: [id])
  contact   Contact  @relation(fields: [contactId], references: [id])
  user      User     @relation(fields: [userId], references: [id])

  @@index([tenantId, contactId])
}
```

Add back-relations (inside each existing model):

In `model Tenant` — add after the `scripts` line:
```prisma
  contactNotes ContactNote[]
```

In `model User` — add after the `ownedContacts` line:
```prisma
  contactNotes ContactNote[]
```

In `model Contact` — add after the `callRecords` line:
```prisma
  notes        ContactNote[]
```

- [ ] **Step 3: Run migration**

```bash
npx prisma migrate dev --name add-outcome-values-and-contact-notes
```

Expected: Migration created and applied. Prisma client regenerated.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "Add 14 new CallOutcome values and ContactNote model"
```

---

### Task 2: Outcome Color + Label Utility

**Files:**
- Create: `src/components/dialer/outcome-colors.ts`

- [ ] **Step 1: Create the utility**

```typescript
import { CallOutcome } from '@prisma/client'

export type OutcomeColor = 'green' | 'yellow' | 'red'

export const OUTCOME_COLOR: Record<CallOutcome, OutcomeColor> = {
  // Green — meaningful conversation with positive/neutral result
  connected:               'green',
  not_interested:          'green',
  lead:                    'green',
  meeting_booked:          'green',
  call_back_attempted:     'green',

  // Yellow — some form of contact but no full conversation
  left_voicemail:          'yellow',
  bad_time_to_speak:       'yellow',
  in_a_meeting:            'yellow',
  call_back_later:         'yellow',
  on_holiday:              'yellow',
  hung_up:                 'yellow',
  does_not_take_cold_calls:'yellow',
  not_relevant_contact:    'yellow',
  ai_assistant:            'yellow',

  // Red — no real contact made
  voicemail:               'red',
  no_answer:               'red',
  line_engaged:            'red',
  wrong_number:            'red',
  mobile_switched_off:     'red',
  foreign_dial_tone:       'red',
  not_available:           'red',
  other:                   'red',
  disqualified:            'red',
}

export const OUTCOME_LABEL: Record<CallOutcome, string> = {
  connected:               'Connected',
  not_interested:          'Not Interested',
  lead:                    'Lead',
  meeting_booked:          'Meeting Booked',
  call_back_attempted:     'Call Back Attempted',
  left_voicemail:          'Left Voicemail',
  bad_time_to_speak:       'Bad Time to Speak',
  in_a_meeting:            'In a Meeting',
  call_back_later:         'Call Back Later',
  on_holiday:              'On Holiday',
  hung_up:                 'Hung Up',
  does_not_take_cold_calls:'Does Not Take Cold Calls',
  not_relevant_contact:    'Not a Relevant Contact',
  ai_assistant:            'AI Assistant',
  voicemail:               'Voicemail',
  no_answer:               'No Answer',
  line_engaged:            'Line Engaged',
  wrong_number:            'Wrong Number',
  mobile_switched_off:     'Mobile Switched Off',
  foreign_dial_tone:       'Foreign Dial Tone',
  not_available:           'Not Available',
  other:                   'Other',
  disqualified:            'Disqualified',
}

export const DOT_CLASS: Record<OutcomeColor, string> = {
  green:  'bg-emerald-500',
  yellow: 'bg-amber-400',
  red:    'bg-red-500',
}

export const TEXT_CLASS: Record<OutcomeColor, string> = {
  green:  'text-emerald-400',
  yellow: 'text-amber-400',
  red:    'text-red-400',
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/dialer/outcome-colors.ts
git commit -m "Add outcome color/label utility for dialer"
```

---

### Task 3: Type Definitions Update

**Files:**
- Modify: `src/types/models.ts`

- [ ] **Step 1: Add `CallHistoryRecord` type and extend `ContactSummary`**

Replace `src/types/models.ts` with:

```typescript
import type { Client, Campaign, User, CampaignSDR, Contact } from '@prisma/client'
import type { CallOutcome } from '@prisma/client'

export type ClientWithCampaignCount = Client & {
  _count: { campaigns: number }
}

export type CampaignWithDetails = Campaign & {
  client: Pick<Client, 'id' | 'name'>
  sdrs: (CampaignSDR & {
    user: Pick<User, 'id' | 'name' | 'email'>
  })[]
}

export type UserSummary = Pick<User, 'id' | 'name' | 'email' | 'role'>

export type ContactWithCampaign = Contact & {
  campaign: Pick<Campaign, 'id' | 'name'>
  accountOwner: Pick<User, 'id' | 'name'> | null
}

export type CallHistoryRecord = {
  id: string
  outcome: CallOutcome | null
  notes: string | null
  createdAt: string  // ISO string (JSON serialized from Date)
  callerName: string
}

export type ContactSummary = Pick<
  Contact,
  'id' | 'firstName' | 'lastName' | 'mobilePhone' | 'corporatePhone' | 'companyName' | 'status'
> & {
  jobTitle: string | null
  employeeCount: number | null
  callHistory: CallHistoryRecord[]
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -30
```

Expected: No errors related to `ContactSummary` or `CallHistoryRecord`. (Other pre-existing errors are OK to note but not fix here.)

- [ ] **Step 3: Commit**

```bash
git add src/types/models.ts
git commit -m "Add CallHistoryRecord type; extend ContactSummary with jobTitle, employeeCount, callHistory"
```

---

### Task 4: Queue API — Include Call History

**Files:**
- Modify: `src/app/api/dialer/queue/route.ts`

- [ ] **Step 1: Update the route to select and transform call history**

Replace `src/app/api/dialer/queue/route.ts` with:

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

    const now = new Date()
    const contacts = await withTenant(tenantId, () =>
      db.contact.findMany({
        where: {
          campaignId,
          status: { in: ['call_back', 'prospect'] },
          OR: [
            { notInterestedUntil: null },
            { notInterestedUntil: { lte: now } },
          ],
        },
        select: {
          id:            true,
          firstName:     true,
          lastName:      true,
          mobilePhone:   true,
          corporatePhone: true,
          companyName:   true,
          status:        true,
          jobTitle:      true,
          employeeCount: true,
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
      id:            c.id,
      firstName:     c.firstName,
      lastName:      c.lastName,
      mobilePhone:   c.mobilePhone,
      corporatePhone: c.corporatePhone,
      companyName:   c.companyName,
      status:        c.status,
      jobTitle:      c.jobTitle,
      employeeCount: c.employeeCount,
      callHistory:   c.callRecords.map((r) => ({
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

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | grep "queue/route" | head -10
```

Expected: No errors for this file.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/dialer/queue/route.ts
git commit -m "Extend queue API to include jobTitle, employeeCount, and last-10 call history per contact"
```

---

### Task 5: Contact Notes API

**Files:**
- Create: `src/app/api/contacts/[id]/notes/route.ts`

- [ ] **Step 1: Create the notes route**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { db, withTenant } from '@/lib/db'
import { hasPermission, getClerkMeta } from '@/lib/auth'

const PostSchema = z.object({ content: z.string().min(1) })

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { userId: clerkId } = await auth()
    if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { role, tenantId } = await getClerkMeta()
    if (!hasPermission(role, 'contacts:read') || !tenantId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const [callRecords, standaloneNotes] = await withTenant(tenantId, () =>
      Promise.all([
        db.callRecord.findMany({
          where:   { contactId: params.id },
          select: {
            id:        true,
            outcome:   true,
            notes:     true,
            createdAt: true,
            user:      { select: { name: true } },
          },
          orderBy: { createdAt: 'desc' },
        }),
        db.contactNote.findMany({
          where:   { contactId: params.id },
          select: {
            id:        true,
            content:   true,
            createdAt: true,
            user:      { select: { name: true } },
          },
          orderBy: { createdAt: 'desc' },
        }),
      ])
    )

    const entries = [
      ...callRecords.map((r) => ({
        id:         r.id,
        type:       'call' as const,
        callerName: r.user.name,
        createdAt:  r.createdAt.toISOString(),
        outcome:    r.outcome ?? null,
        content:    r.notes ?? '',
      })),
      ...standaloneNotes.map((n) => ({
        id:         n.id,
        type:       'note' as const,
        callerName: n.user.name,
        createdAt:  n.createdAt.toISOString(),
        outcome:    null,
        content:    n.content,
      })),
    ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

    return NextResponse.json({ data: entries })
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { userId: clerkId } = await auth()
    if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { role, tenantId } = await getClerkMeta()
    if (!hasPermission(role, 'contacts:write') || !tenantId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await req.json()
    const parsed = PostSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid body', details: parsed.error.flatten() }, { status: 400 })
    }

    const dbUser = await withTenant(tenantId, () =>
      db.user.findFirst({ where: { clerkId }, select: { id: true } })
    )
    if (!dbUser) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    const note = await withTenant(tenantId, () =>
      db.contactNote.create({
        data: {
          tenantId,
          contactId: params.id,
          userId:    dbUser.id,
          content:   parsed.data.content,
        },
        select: { id: true },
      })
    )

    return NextResponse.json({ data: { id: note.id } }, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | grep "contacts/\[id\]/notes" | head -10
```

Expected: No errors for this file.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/contacts/[id]/notes/route.ts
git commit -m "Add contact notes API: GET call history + standalone notes, POST create note"
```

---

### Task 6: CallHistoryDots Component

**Files:**
- Create: `src/components/dialer/CallHistoryDots.tsx`

- [ ] **Step 1: Create the component**

```typescript
'use client'

import { CallOutcome } from '@prisma/client'
import { OUTCOME_COLOR, OUTCOME_LABEL, DOT_CLASS } from './outcome-colors'
import type { CallHistoryRecord } from '@/types/models'
import { cn } from '@/lib/utils'

const TOTAL_DOTS = 10

interface CallHistoryDotsProps {
  history: CallHistoryRecord[]  // most-recent first, max 10
}

function Dot({ record }: { record: CallHistoryRecord | null }) {
  if (!record) {
    return (
      <span className="w-2 h-2 rounded-full bg-white/10 flex-shrink-0" />
    )
  }

  const color  = record.outcome ? OUTCOME_COLOR[record.outcome] : 'red'
  const label  = record.outcome ? OUTCOME_LABEL[record.outcome] : 'Unknown'
  const date   = new Date(record.createdAt).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: '2-digit',
  })

  return (
    <span className="relative group/dot flex-shrink-0">
      <span className={cn('w-2 h-2 rounded-full block', DOT_CLASS[color])} />
      {/* Tooltip */}
      <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-44 bg-[#0d1117] border border-white/10 rounded-xl p-2.5 text-[10px] z-50 shadow-xl opacity-0 group-hover/dot:opacity-100 transition-opacity pointer-events-none">
        <span className="block font-semibold text-white truncate">{record.callerName}</span>
        <span className="block text-gray-400 mt-0.5">{date}</span>
        <span className={cn('block mt-1 font-medium', color === 'green' ? 'text-emerald-400' : color === 'yellow' ? 'text-amber-400' : 'text-red-400')}>
          {label}
        </span>
        {record.notes && (
          <span className="block text-gray-300 mt-1 line-clamp-2">{record.notes}</span>
        )}
      </span>
    </span>
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

- [ ] **Step 2: Commit**

```bash
git add src/components/dialer/CallHistoryDots.tsx
git commit -m "Add CallHistoryDots component: 2×5 color-coded circles with hover tooltip"
```

---

### Task 7: ContactNotesModal Component

**Files:**
- Create: `src/components/dialer/ContactNotesModal.tsx`

- [ ] **Step 1: Create the component**

```typescript
'use client'

import { useEffect, useState } from 'react'
import { MessageSquare, Plus, X } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { CallOutcome } from '@prisma/client'
import { OUTCOME_LABEL, OUTCOME_COLOR, TEXT_CLASS } from './outcome-colors'
import { cn } from '@/lib/utils'

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
  const [entries,    setEntries]    = useState<NoteEntry[]>([])
  const [loading,    setLoading]    = useState(false)
  const [noteText,   setNoteText]   = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open) return
    setLoading(true)
    fetch(`/api/contacts/${contactId}/notes`)
      .then((r) => r.json())
      .then(({ data }) => setEntries(data ?? []))
      .finally(() => setLoading(false))
  }, [open, contactId])

  const handleAddNote = async () => {
    if (!noteText.trim()) return
    setSubmitting(true)
    try {
      const res = await fetch(`/api/contacts/${contactId}/notes`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ content: noteText.trim() }),
      })
      if (!res.ok) return
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

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="bg-[#161c26] border-white/10 rounded-3xl max-w-lg w-full max-h-[80vh] flex flex-col gap-0 p-0 overflow-hidden">
        <DialogHeader className="p-5 pb-4 border-b border-white/5 flex-shrink-0">
          <DialogTitle className="text-base font-semibold text-white flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-[#00d4ff]" />
            {contactName} — Call Notes
          </DialogTitle>
        </DialogHeader>

        {/* History list */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <p className="text-sm text-gray-500">Loading…</p>
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

        {/* Add note footer */}
        <div className="p-4 border-t border-white/5 flex-shrink-0 space-y-2">
          <textarea
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            placeholder="Add a note…"
            rows={2}
            className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-gray-600 resize-none focus:outline-none focus:border-[#00d4ff]/50 focus:ring-1 focus:ring-[#00d4ff]/10"
          />
          <Button
            onClick={handleAddNote}
            disabled={!noteText.trim() || submitting}
            className="w-full bg-white/5 border border-white/10 text-gray-300 rounded-xl hover:bg-white/10 disabled:opacity-40"
          >
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            {submitting ? 'Saving…' : 'Add Note'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/dialer/ContactNotesModal.tsx
git commit -m "Add ContactNotesModal: merged call history and standalone notes with add-note form"
```

---

### Task 8: QueuePanel Redesign

**Files:**
- Modify: `src/components/dialer/QueuePanel.tsx`
- Modify: `src/stores/dialer-store.ts`

- [ ] **Step 1: Add `selectContact` action to dialer store**

In `src/stores/dialer-store.ts`, add `selectContact` to the interface and implementation.

In the `DialerState` interface, add after the `setCampaign` line:
```typescript
  selectContact(contact: ContactSummary): void
```

In the `create<DialerState>` implementation, add after the `setCampaign` implementation:
```typescript
  selectContact(contact) {
    const { currentContact, queue } = get()
    if (contact.id === currentContact?.id) return
    const newQueue = [
      ...(currentContact ? [currentContact] : []),
      ...queue.filter((c) => c.id !== contact.id),
    ]
    set({ currentContact: contact, queue: newQueue, callStatus: 'idle', activeCallRecordId: null, callStartedAt: null })
  },
```

- [ ] **Step 2: Commit the store change**

```bash
git add src/stores/dialer-store.ts
git commit -m "Add selectContact action to dialer store"
```

- [ ] **Step 3: Rewrite QueuePanel with Adenzo-style layout**

Replace `src/components/dialer/QueuePanel.tsx` with:

```typescript
'use client'

import { useState } from 'react'
import { Phone, Copy, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { useDialerStore } from '@/stores/dialer-store'
import { CallHistoryDots } from './CallHistoryDots'
import { ContactNotesModal } from './ContactNotesModal'
import type { ContactSummary } from '@/types/models'

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

function ContactRow({ contact, isActive }: { contact: ContactSummary; isActive: boolean }) {
  const { callStatus, selectContact, startCall } = useDialerStore()

  const handleCallClick = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (callStatus !== 'idle') return
    if (!isActive) {
      selectContact(contact)
    } else {
      await startCall()
    }
  }

  return (
    <div className={cn(
      'grid grid-cols-[1fr_auto_auto_auto] items-center gap-2 px-3 py-2.5 border-b border-white/5 transition-colors',
      isActive ? 'bg-white/5 border-l-2 border-l-[#00d4ff]' : 'hover:bg-white/[0.02]',
    )}>
      {/* Col 1: Name + title | Company + employees */}
      <div className="min-w-0">
        <div className="flex items-baseline gap-2 min-w-0">
          {/* Left: name + title */}
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
          {/* Right: company + employees */}
          <div className="flex-shrink-0 text-right max-w-[90px]">
            {contact.companyName && (
              <p className="text-[10px] text-gray-400 truncate leading-tight">
                {contact.companyName}
              </p>
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

      {/* Col 2: Call history dots */}
      <CallHistoryDots history={contact.callHistory} />

      {/* Col 3: Notes button */}
      <NotesButton contact={contact} />

      {/* Col 4: Call button */}
      <button
        onClick={handleCallClick}
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
    </div>
  )
}

export function QueuePanel({ campaigns }: QueuePanelProps) {
  const { campaignId, currentContact, queue, setCampaign, startSession, loadQueue } = useDialerStore()

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

  return (
    <div className="glass-panel rounded-3xl flex flex-col w-[30%] flex-shrink-0 overflow-hidden">
      <div className="p-4 border-b border-white/5">
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

      <div className="flex-1 overflow-y-auto">
        {!campaignId ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm text-gray-500">Select a campaign to begin</p>
          </div>
        ) : allContacts.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm text-gray-500">Queue empty</p>
          </div>
        ) : (
          allContacts.map((contact) => (
            <ContactRow
              key={contact.id}
              contact={contact}
              isActive={contact.id === currentContact?.id}
            />
          ))
        )}
      </div>

      {queue.length >= 19 && (
        <div className="p-4 border-t border-white/5">
          <button
            onClick={() => loadQueue()}
            className="w-full text-xs text-gray-400 hover:text-white transition-colors py-2"
          >
            Load more
          </button>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | grep "QueuePanel\|dialer-store" | head -20
```

Expected: No errors for these files.

- [ ] **Step 5: Commit**

```bash
git add src/components/dialer/QueuePanel.tsx
git commit -m "Redesign QueuePanel: Adenzo-style rows with title, company/headcount, call history dots, notes modal, call button"
```

---

### Task 9: DispositionForm Redesign + Log-Outcome API Update

**Files:**
- Modify: `src/components/dialer/DispositionForm.tsx`
- Modify: `src/app/api/dialer/log-outcome/route.ts`

- [ ] **Step 1: Replace DispositionForm with 19-outcome color-coded version**

Replace `src/components/dialer/DispositionForm.tsx` with:

```typescript
'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { CallOutcome } from '@prisma/client'
import { OUTCOME_COLOR, OUTCOME_LABEL, DOT_CLASS } from './outcome-colors'
import { cn } from '@/lib/utils'

// Ordered list: green group first, then yellow, then red
const OUTCOME_OPTIONS: CallOutcome[] = [
  // Green
  CallOutcome.connected,
  CallOutcome.not_interested,
  CallOutcome.lead,
  CallOutcome.meeting_booked,
  // Yellow
  CallOutcome.left_voicemail,
  CallOutcome.bad_time_to_speak,
  CallOutcome.in_a_meeting,
  CallOutcome.call_back_later,
  CallOutcome.on_holiday,
  CallOutcome.hung_up,
  CallOutcome.does_not_take_cold_calls,
  CallOutcome.not_relevant_contact,
  CallOutcome.ai_assistant,
  // Red
  CallOutcome.voicemail,
  CallOutcome.no_answer,
  CallOutcome.line_engaged,
  CallOutcome.wrong_number,
  CallOutcome.mobile_switched_off,
  CallOutcome.foreign_dial_tone,
  CallOutcome.not_available,
  CallOutcome.other,
]

interface DispositionFormProps {
  onSubmit: (outcome: CallOutcome, notes: string) => Promise<void>
  loading:  boolean
}

export function DispositionForm({ onSubmit, loading }: DispositionFormProps) {
  const [outcome, setOutcome] = useState<CallOutcome | ''>('')
  const [notes,   setNotes]   = useState('')

  const handleSubmit = async () => {
    if (!outcome) return
    await onSubmit(outcome, notes)
    setOutcome('')
    setNotes('')
  }

  const selectedColor = outcome ? OUTCOME_COLOR[outcome] : null

  return (
    <div className="space-y-4 w-full animate-in slide-in-from-bottom-4 duration-300">
      <div className="space-y-1.5">
        <Label className="text-xs text-gray-400">Outcome *</Label>
        <Select
          value={outcome}
          onValueChange={(v) => setOutcome((v ?? '') as CallOutcome | '')}
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

      <Button
        type="button"
        onClick={handleSubmit}
        disabled={!outcome || loading}
        className="w-full bg-gradient-to-r from-[#00d4ff] to-cyan-600 text-black font-semibold rounded-xl hover:opacity-90 disabled:opacity-50"
      >
        {loading ? 'Logging…' : 'Log Outcome'}
      </Button>
    </div>
  )
}
```

- [ ] **Step 2: Update log-outcome API Zod schema to accept all 23 outcomes**

In `src/app/api/dialer/log-outcome/route.ts`, replace the `BodySchema` definition:

```typescript
const BodySchema = z.object({
  callRecordId: z.string().min(1),
  outcome: z.enum([
    'no_answer', 'voicemail', 'not_interested', 'not_relevant_contact',
    'disqualified', 'lead', 'call_back_later', 'meeting_booked', 'call_back_attempted',
    'connected', 'left_voicemail', 'bad_time_to_speak', 'in_a_meeting', 'on_holiday',
    'hung_up', 'does_not_take_cold_calls', 'ai_assistant', 'line_engaged', 'wrong_number',
    'mobile_switched_off', 'foreign_dial_tone', 'not_available', 'other',
  ]),
  notes:     z.string().optional(),
  contactId: z.string().min(1),
})
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | grep "DispositionForm\|log-outcome" | head -20
```

Expected: No errors for these files.

- [ ] **Step 4: Commit**

```bash
git add src/components/dialer/DispositionForm.tsx src/app/api/dialer/log-outcome/route.ts
git commit -m "Expand disposition form to 21 color-coded outcomes; update log-outcome API schema"
```

---

### Task 10: Outcome Router Updates + Tests

**Files:**
- Modify: `src/lib/outcome-router.ts`
- Modify: `src/lib/__tests__/outcome-router.test.ts`

- [ ] **Step 1: Write failing tests for new outcomes first**

Add these test blocks to the bottom of `src/lib/__tests__/outcome-router.test.ts` (before the final `}`):

```typescript
  describe('connected', () => {
    it('makes no status change', async () => {
      mockFindUnique.mockResolvedValue(baseContact)
      await routeOutcome('c1', CallOutcome.connected, mockTx)
      expect(mockUpdate).not.toHaveBeenCalled()
    })
  })

  describe('left_voicemail', () => {
    it('increments dialAttempts like voicemail', async () => {
      mockFindUnique.mockResolvedValue({ ...baseContact, dialAttempts: 3 })
      await routeOutcome('c1', CallOutcome.left_voicemail, mockTx)
      expect(mockUpdate).toHaveBeenCalledWith({ where: { id: 'c1' }, data: { dialAttempts: 4 } })
    })

    it('moves to future at 8 attempts', async () => {
      mockFindUnique.mockResolvedValue({ ...baseContact, dialAttempts: 7 })
      await routeOutcome('c1', CallOutcome.left_voicemail, mockTx)
      expect(mockUpdate).toHaveBeenCalledWith({ where: { id: 'c1' }, data: { dialAttempts: 8, status: 'future' } })
    })
  })

  describe('bad_time_to_speak', () => {
    it('moves contact to call_back', async () => {
      mockFindUnique.mockResolvedValue(baseContact)
      await routeOutcome('c1', CallOutcome.bad_time_to_speak, mockTx)
      expect(mockUpdate).toHaveBeenCalledWith({ where: { id: 'c1' }, data: { status: 'call_back' } })
    })
  })

  describe('in_a_meeting', () => {
    it('moves contact to call_back', async () => {
      mockFindUnique.mockResolvedValue(baseContact)
      await routeOutcome('c1', CallOutcome.in_a_meeting, mockTx)
      expect(mockUpdate).toHaveBeenCalledWith({ where: { id: 'c1' }, data: { status: 'call_back' } })
    })
  })

  describe('on_holiday', () => {
    it('moves contact to call_back', async () => {
      mockFindUnique.mockResolvedValue(baseContact)
      await routeOutcome('c1', CallOutcome.on_holiday, mockTx)
      expect(mockUpdate).toHaveBeenCalledWith({ where: { id: 'c1' }, data: { status: 'call_back' } })
    })
  })

  describe('hung_up', () => {
    it('increments dialAttempts', async () => {
      mockFindUnique.mockResolvedValue({ ...baseContact, dialAttempts: 1 })
      await routeOutcome('c1', CallOutcome.hung_up, mockTx)
      expect(mockUpdate).toHaveBeenCalledWith({ where: { id: 'c1' }, data: { dialAttempts: 2 } })
    })
  })

  describe('does_not_take_cold_calls', () => {
    it('moves contact to dnc', async () => {
      mockFindUnique.mockResolvedValue(baseContact)
      await routeOutcome('c1', CallOutcome.does_not_take_cold_calls, mockTx)
      expect(mockUpdate).toHaveBeenCalledWith({
        where: { id: 'c1' },
        data:  { status: 'dnc', dncReason: 'Does not take cold calls' },
      })
    })
  })

  describe('ai_assistant', () => {
    it('increments dialAttempts', async () => {
      mockFindUnique.mockResolvedValue({ ...baseContact, dialAttempts: 2 })
      await routeOutcome('c1', CallOutcome.ai_assistant, mockTx)
      expect(mockUpdate).toHaveBeenCalledWith({ where: { id: 'c1' }, data: { dialAttempts: 3 } })
    })
  })

  describe('line_engaged', () => {
    it('increments dialAttempts', async () => {
      mockFindUnique.mockResolvedValue({ ...baseContact, dialAttempts: 0 })
      await routeOutcome('c1', CallOutcome.line_engaged, mockTx)
      expect(mockUpdate).toHaveBeenCalledWith({ where: { id: 'c1' }, data: { dialAttempts: 1 } })
    })
  })

  describe('wrong_number', () => {
    it('moves contact to dnc with wrong number reason', async () => {
      mockFindUnique.mockResolvedValue(baseContact)
      await routeOutcome('c1', CallOutcome.wrong_number, mockTx)
      expect(mockUpdate).toHaveBeenCalledWith({
        where: { id: 'c1' },
        data:  { status: 'dnc', dncReason: 'Wrong number' },
      })
    })
  })

  describe('mobile_switched_off', () => {
    it('increments dialAttempts', async () => {
      mockFindUnique.mockResolvedValue({ ...baseContact, dialAttempts: 4 })
      await routeOutcome('c1', CallOutcome.mobile_switched_off, mockTx)
      expect(mockUpdate).toHaveBeenCalledWith({ where: { id: 'c1' }, data: { dialAttempts: 5 } })
    })
  })

  describe('foreign_dial_tone', () => {
    it('increments dialAttempts', async () => {
      mockFindUnique.mockResolvedValue({ ...baseContact, dialAttempts: 1 })
      await routeOutcome('c1', CallOutcome.foreign_dial_tone, mockTx)
      expect(mockUpdate).toHaveBeenCalledWith({ where: { id: 'c1' }, data: { dialAttempts: 2 } })
    })
  })

  describe('not_available', () => {
    it('increments dialAttempts', async () => {
      mockFindUnique.mockResolvedValue({ ...baseContact, dialAttempts: 5 })
      await routeOutcome('c1', CallOutcome.not_available, mockTx)
      expect(mockUpdate).toHaveBeenCalledWith({ where: { id: 'c1' }, data: { dialAttempts: 6 } })
    })
  })

  describe('other', () => {
    it('increments dialAttempts', async () => {
      mockFindUnique.mockResolvedValue({ ...baseContact, dialAttempts: 0 })
      await routeOutcome('c1', CallOutcome.other, mockTx)
      expect(mockUpdate).toHaveBeenCalledWith({ where: { id: 'c1' }, data: { dialAttempts: 1 } })
    })
  })
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/lib/__tests__/outcome-router.test.ts 2>&1 | tail -20
```

Expected: New tests FAIL (unhandled cases in switch fall through with no action taken / `mockUpdate` not called).

- [ ] **Step 3: Update `outcome-router.ts` with new routing rules**

Replace `src/lib/outcome-router.ts` with:

```typescript
import { db } from '@/lib/db'
import { CallOutcome } from '@prisma/client'

type TxClient = Parameters<Parameters<typeof db.$transaction>[0]>[0]

export const CONVERSATION_TAGGED_OUTCOMES = new Set<CallOutcome>([
  CallOutcome.not_relevant_contact,
  CallOutcome.disqualified,
  CallOutcome.lead,
  CallOutcome.call_back_later,
  CallOutcome.meeting_booked,
  CallOutcome.connected,
  CallOutcome.bad_time_to_speak,
  CallOutcome.in_a_meeting,
  CallOutcome.on_holiday,
  CallOutcome.does_not_take_cold_calls,
  CallOutcome.hung_up,
])

async function incrementDialAttempts(
  contactId: string,
  currentAttempts: number,
  tx: TxClient
) {
  const newCount = currentAttempts + 1
  await tx.contact.update({
    where: { id: contactId },
    data: {
      dialAttempts: newCount,
      ...(newCount >= 8 ? { status: 'future' } : {}),
    },
  })
}

export async function routeOutcome(
  contactId: string,
  outcome: CallOutcome,
  tx: TxClient
): Promise<void> {
  const contact = await tx.contact.findUnique({
    where:  { id: contactId },
    select: { dialAttempts: true, companyName: true },
  })
  if (!contact) return

  switch (outcome) {
    case CallOutcome.no_answer:
    case CallOutcome.voicemail:
    case CallOutcome.left_voicemail:
    case CallOutcome.hung_up:
    case CallOutcome.ai_assistant:
    case CallOutcome.line_engaged:
    case CallOutcome.mobile_switched_off:
    case CallOutcome.foreign_dial_tone:
    case CallOutcome.not_available:
    case CallOutcome.other: {
      await incrementDialAttempts(contactId, contact.dialAttempts, tx)
      break
    }

    case CallOutcome.not_interested: {
      const notInterestedUntil = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      await tx.contact.update({
        where: { id: contactId },
        data:  { notInterestedUntil },
      })
      break
    }

    case CallOutcome.bad_time_to_speak:
    case CallOutcome.in_a_meeting:
    case CallOutcome.on_holiday:
    case CallOutcome.call_back_later: {
      await tx.contact.update({
        where: { id: contactId },
        data:  { status: 'call_back' },
      })
      break
    }

    case CallOutcome.not_relevant_contact:
    case CallOutcome.lead:
    case CallOutcome.call_back_attempted: {
      await tx.contact.update({
        where: { id: contactId },
        data:  { status: 'lead' },
      })
      break
    }

    case CallOutcome.does_not_take_cold_calls: {
      await tx.contact.update({
        where: { id: contactId },
        data:  { status: 'dnc', dncReason: 'Does not take cold calls' },
      })
      break
    }

    case CallOutcome.wrong_number: {
      await tx.contact.update({
        where: { id: contactId },
        data:  { status: 'dnc', dncReason: 'Wrong number' },
      })
      break
    }

    case CallOutcome.disqualified: {
      await tx.contact.update({
        where: { id: contactId },
        data:  { status: 'dnc', dncReason: 'Disqualified' },
      })
      if (contact.companyName) {
        await tx.contact.updateMany({
          where: {
            companyName: { equals: contact.companyName, mode: 'insensitive' },
            id:          { not: contactId },
            status:      { not: 'dnc' },
            deletedAt:   null,
          },
          data: { status: 'dnc', dncReason: 'Disqualified — company-wide' },
        })
      }
      break
    }

    case CallOutcome.meeting_booked: {
      await tx.contact.update({
        where: { id: contactId },
        data:  { status: 'meeting_booked' },
      })
      if (contact.companyName) {
        await tx.contact.updateMany({
          where: {
            companyName: { equals: contact.companyName, mode: 'insensitive' },
            id:          { not: contactId },
            status:      { not: 'dnc' },
            deletedAt:   null,
          },
          data: { status: 'dnc', dncReason: 'Irrelevant — meeting secured' },
        })
      }
      break
    }

    case CallOutcome.connected:
      // No routing change — contact stays as prospect; SDR recorded the connection
      break
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/lib/__tests__/outcome-router.test.ts 2>&1 | tail -20
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/outcome-router.ts src/lib/__tests__/outcome-router.test.ts
git commit -m "Add routing rules for 14 new CallOutcome values; expand CONVERSATION_TAGGED_OUTCOMES"
```

---

## Self-Review

### Spec Coverage Check

| Requirement | Covered by |
|---|---|
| Full name + job title in queue rows | Task 8: `ContactRow` grid col 1 |
| Company name + employee count | Task 8: `ContactRow` grid col 1 right side |
| 10 color-coded call history circles (5 top, 5 bottom) | Task 6: `CallHistoryDots` |
| Gray circles = no call yet | Task 6: `DOT_CLASS` + null slot rendering |
| Green/yellow/red colors matching UI theme | Task 2: `OUTCOME_COLOR` + `DOT_CLASS` |
| Hover on circle: who called, date, notes | Task 6: `Dot` tooltip |
| Notes column → modal with call history | Task 7: `ContactNotesModal` |
| Modal: caller name, date, outcome, notes | Task 7: entry rendering |
| Modal: add new note | Task 7: `handleAddNote` + Task 5: POST API |
| Make a call button per row | Task 8: phone icon button |
| Post-call outcome form opens automatically | Existing: `callStatus === 'ended'` in `CallControls` |
| 19 color-coded outcomes in disposition form | Task 9: `DispositionForm` |
| Green: Connected, Not Interested | Task 9 + Task 2 |
| Yellow: Left Voicemail, Bad Time, Meeting, etc. | Task 9 + Task 2 |
| Red: Voicemail, No Answer, Line Engaged, etc. | Task 9 + Task 2 |
| New outcome routing rules | Task 10 |

### Potential Issues

1. **`SelectValue` render function pattern** — the codebase already uses this pattern (memory note confirms it). `DispositionForm` and `QueuePanel` follow the same `{(v) => ...}` children form.

2. **`callHistory` on initial load** — when `setCampaign` is called in the store, `contacts[0]` becomes `currentContact`. The `callHistory` field will be populated since the queue API now returns it.

3. **TypeScript: `ContactSummary` breakage** — The two existing usages of `ContactSummary` are in `QueuePanel.tsx` (fully replaced) and `dialer-store.ts` (which stores contacts as-received from the API — the new fields are additive so no breaking change).