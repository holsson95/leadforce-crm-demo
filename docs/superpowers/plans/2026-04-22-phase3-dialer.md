# Phase 3 — Power Dialer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a fully functional power dialer with mock telephony, all call outcome routing logic, session tracking, and a 3-panel UI.

**Architecture:** Zustand store owns live call state; API routes handle all DB mutations; TelephonyService abstraction wraps a mock that simulates 1.5s ringing-to-connected. Call outcome routing runs in DB transactions for consistency. Socket.io deferred to Phase 4.

**Tech Stack:** Next.js 16 App Router, Prisma + PostgreSQL, Zustand, Tailwind + Shadcn/UI, Vitest, Zod

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `prisma/schema.prisma` | Modify | Add CallOutcome enum, CallRecord, Session, Script, ScriptVersion; extend Contact |
| `src/lib/db.ts` | Modify | Add CallRecord, Session, Script to TENANT_MODELS |
| `src/lib/auth.ts` | Modify | Add `calls:write` permission |
| `src/types/enums.ts` | Modify | Add CallOutcome enum |
| `src/types/models.ts` | Modify | Add ContactSummary type |
| `src/lib/telephony/types.ts` | Create | TelephonyService interface + CallStatus type |
| `src/lib/telephony/mock.ts` | Create | MockTelephonyService |
| `src/lib/telephony/index.ts` | Create | Factory: returns mock or throws for JustCall |
| `src/lib/outcome-router.ts` | Create | routeOutcome + CONVERSATION_TAGGED_OUTCOMES |
| `src/lib/__tests__/outcome-router.test.ts` | Create | Outcome routing tests |
| `src/stores/dialer-store.ts` | Create | Zustand dialer store |
| `src/app/api/dialer/queue/route.ts` | Create | GET — prioritised contact queue |
| `src/app/api/dialer/session/route.ts` | Create | POST — create or resume session |
| `src/app/api/dialer/session/end/route.ts` | Create | POST — end session (sendBeacon target) |
| `src/app/api/dialer/start-call/route.ts` | Create | POST — create CallRecord + invoke mock |
| `src/app/api/dialer/end-call/route.ts` | Create | POST — finalise CallRecord duration |
| `src/app/api/dialer/log-outcome/route.ts` | Create | POST — write outcome, run routing, return next |
| `src/app/(dashboard)/calling/page.tsx` | Create | Server component — campaign list → client panels |
| `src/components/dialer/QueuePanel.tsx` | Create | Left panel: campaign selector + queue list |
| `src/components/dialer/DispositionForm.tsx` | Create | Inline outcome selector shown after call ends |
| `src/components/dialer/CallControls.tsx` | Create | Centre panel: timer, call button, disposition |
| `src/components/dialer/ScriptPanel.tsx` | Create | Right panel: Phase 6 placeholder |

---

## Task 1: Prisma Schema Migration

**Files:**
- Modify: `prisma/schema.prisma`
- Modify: `src/lib/db.ts`

- [ ] **Step 1: Add CallOutcome enum to schema**

In `prisma/schema.prisma`, after the existing `ContactList` enum, add:

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
}
```

- [ ] **Step 2: Add new columns to Contact model**

In the `Contact` model in `prisma/schema.prisma`, after the `dncReason` line, add:

```prisma
  dialAttempts       Int       @default(0)
  notInterestedUntil DateTime?
  callRecords        CallRecord[]
```

- [ ] **Step 3: Add back-relations to existing models**

In the `Tenant` model, after `contacts Contact[]`, add:
```prisma
  callRecords CallRecord[]
  sessions    Session[]
  scripts     Script[]
```

In the `Campaign` model, after `contacts Contact[]`, add:
```prisma
  callRecords CallRecord[]
  sessions    Session[]
  scripts     Script[]
```

In the `User` model, after `campaigns CampaignSDR[]`, add:
```prisma
  callRecords CallRecord[]
  sessions    Session[]
```

- [ ] **Step 4: Add CallRecord, Session, Script, ScriptVersion models**

At the end of `prisma/schema.prisma`, append:

```prisma
model CallRecord {
  id                 String      @id @default(cuid())
  tenantId           String
  campaignId         String
  contactId          String
  userId             String
  outcome            CallOutcome?
  notes              String?
  durationSecs       Int?
  conversationTagged Boolean     @default(false)
  createdAt          DateTime    @default(now())
  updatedAt          DateTime    @updatedAt
  tenant             Tenant      @relation(fields: [tenantId], references: [id])
  campaign           Campaign    @relation(fields: [campaignId], references: [id])
  contact            Contact     @relation(fields: [contactId], references: [id])
  user               User        @relation(fields: [userId], references: [id])

  @@index([tenantId, campaignId])
  @@index([tenantId, contactId])
}

model Session {
  id         String    @id @default(cuid())
  tenantId   String
  campaignId String
  userId     String
  startedAt  DateTime  @default(now())
  endedAt    DateTime?
  createdAt  DateTime  @default(now())
  updatedAt  DateTime  @updatedAt
  tenant     Tenant    @relation(fields: [tenantId], references: [id])
  campaign   Campaign  @relation(fields: [campaignId], references: [id])
  user       User      @relation(fields: [userId], references: [id])

  @@index([tenantId, userId])
}

model Script {
  id         String          @id @default(cuid())
  tenantId   String
  campaignId String
  title      String
  createdAt  DateTime        @default(now())
  updatedAt  DateTime        @updatedAt
  deletedAt  DateTime?
  tenant     Tenant          @relation(fields: [tenantId], references: [id])
  campaign   Campaign        @relation(fields: [campaignId], references: [id])
  versions   ScriptVersion[]
}

model ScriptVersion {
  id        String   @id @default(cuid())
  scriptId  String
  content   String
  version   Int
  createdAt DateTime @default(now())
  script    Script   @relation(fields: [scriptId], references: [id])
}
```

- [ ] **Step 5: Run migration**

```bash
npx prisma migrate dev --name phase3-dialer
```

Expected: migration file created in `prisma/migrations/`, Prisma client regenerated.

- [ ] **Step 6: Update TENANT_MODELS in db.ts**

In `src/lib/db.ts`, change:

```typescript
const TENANT_MODELS = new Set(['User', 'Client', 'Campaign', 'Contact'])
```

to:

```typescript
const TENANT_MODELS = new Set(['User', 'Client', 'Campaign', 'Contact', 'CallRecord', 'Session', 'Script'])
```

- [ ] **Step 7: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add prisma/ src/lib/db.ts
git commit -m "Add Phase 3 schema: CallRecord, Session, Script, CallOutcome enum"
```

---

## Task 2: TypeScript Enums and Types

**Files:**
- Modify: `src/types/enums.ts`
- Modify: `src/types/models.ts`

- [ ] **Step 1: Add CallOutcome enum to enums.ts**

In `src/types/enums.ts`, append:

```typescript
export enum CallOutcome {
  no_answer            = 'no_answer',
  voicemail            = 'voicemail',
  not_interested       = 'not_interested',
  not_relevant_contact = 'not_relevant_contact',
  disqualified         = 'disqualified',
  lead                 = 'lead',
  call_back_later      = 'call_back_later',
  meeting_booked       = 'meeting_booked',
  call_back_attempted  = 'call_back_attempted',
}
```

- [ ] **Step 2: Add ContactSummary type to models.ts**

In `src/types/models.ts`, append:

```typescript
import type { ContactList } from '@prisma/client'

export type ContactSummary = {
  id: string
  firstName: string
  lastName: string
  phone: string | null
  companyName: string | null
  list: ContactList
}
```

Note: `ContactList` is already imported by Prisma's generated types. The import at top of models.ts should become:

```typescript
import type { Client, Campaign, User, CampaignSDR, Contact, ContactList } from '@prisma/client'
```

- [ ] **Step 3: Verify**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/types/
git commit -m "Add CallOutcome enum and ContactSummary type"
```

---

## Task 3: Auth Permissions

**Files:**
- Modify: `src/lib/auth.ts`

- [ ] **Step 1: Add calls:write permission**

In `src/lib/auth.ts`, update the `Permission` type and `ROLE_PERMISSIONS`:

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

const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  admin:   ['clients:read', 'clients:write', 'campaigns:read', 'campaigns:write', 'sdrs:manage', 'contacts:read', 'contacts:write', 'calls:write'],
  manager: ['clients:read', 'clients:write', 'campaigns:read', 'campaigns:write', 'sdrs:manage', 'contacts:read', 'contacts:write', 'calls:write'],
  sdr:     ['campaigns:read', 'contacts:read', 'contacts:write', 'calls:write'],
  client:  ['campaigns:read'],
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/auth.ts
git commit -m "Add calls:write permission for dialer"
```

---

## Task 4: Telephony Abstraction

**Files:**
- Create: `src/lib/telephony/types.ts`
- Create: `src/lib/telephony/mock.ts`
- Create: `src/lib/telephony/index.ts`

- [ ] **Step 1: Create types.ts**

```typescript
// src/lib/telephony/types.ts
export type CallStatus = 'ringing' | 'connected' | 'ended' | 'failed'

export interface TelephonyService {
  makeCall(params: { from: string; to: string; campaignId: string }): Promise<{ callId: string }>
  endCall(callId: string): Promise<void>
  getCallStatus(callId: string): Promise<CallStatus>
  getRecordingUrl(callId: string): Promise<string | null>
  registerWebhook(eventType: string, callbackUrl: string): Promise<void>
}
```

- [ ] **Step 2: Create mock.ts**

```typescript
// src/lib/telephony/mock.ts
import { randomUUID } from 'crypto'
import type { TelephonyService, CallStatus } from './types'

const callStatuses = new Map<string, CallStatus>()

export class MockTelephonyService implements TelephonyService {
  async makeCall(_params: { from: string; to: string; campaignId: string }): Promise<{ callId: string }> {
    const callId = randomUUID()
    callStatuses.set(callId, 'ringing')
    setTimeout(() => {
      if (callStatuses.get(callId) === 'ringing') {
        callStatuses.set(callId, 'connected')
      }
    }, 1500)
    return { callId }
  }

  async endCall(callId: string): Promise<void> {
    callStatuses.set(callId, 'ended')
  }

  async getCallStatus(callId: string): Promise<CallStatus> {
    return callStatuses.get(callId) ?? 'failed'
  }

  async getRecordingUrl(_callId: string): Promise<string | null> {
    return null
  }

  async registerWebhook(eventType: string, _callbackUrl: string): Promise<void> {
    if (process.env.NODE_ENV === 'development') {
      console.log(`[MockTelephony] registerWebhook no-op: ${eventType}`)
    }
  }
}
```

- [ ] **Step 3: Create index.ts**

```typescript
// src/lib/telephony/index.ts
import type { TelephonyService } from './types'
import { MockTelephonyService } from './mock'

export function getTelephonyService(): TelephonyService {
  if (process.env.TELEPHONY_PROVIDER === 'justcall') {
    throw new Error(
      'JustCall not yet configured — implement src/lib/telephony/justcall.ts and set JUSTCALL_API_KEY'
    )
  }
  return new MockTelephonyService()
}

export type { TelephonyService, CallStatus } from './types'
```

- [ ] **Step 4: Verify**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/telephony/
git commit -m "Add TelephonyService abstraction with mock implementation"
```

---

## Task 5: Outcome Router — Failing Tests

**Files:**
- Create: `src/lib/__tests__/outcome-router.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/lib/__tests__/outcome-router.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { routeOutcome } from '../outcome-router'
import { CallOutcome } from '@/types/enums'

const mockUpdate   = vi.fn()
const mockUpdateMany = vi.fn()
const mockFindUnique = vi.fn()

const mockTx = {
  contact: {
    findUnique: mockFindUnique,
    update:     mockUpdate,
    updateMany: mockUpdateMany,
  },
} as any

const baseContact = { dialAttempts: 0, companyName: null }

describe('routeOutcome', () => {
  beforeEach(() => vi.clearAllMocks())

  describe('no_answer', () => {
    it('increments dialAttempts', async () => {
      mockFindUnique.mockResolvedValue({ ...baseContact, dialAttempts: 2 })
      await routeOutcome('c1', CallOutcome.no_answer, mockTx)
      expect(mockUpdate).toHaveBeenCalledWith({
        where: { id: 'c1' },
        data:  { dialAttempts: 3 },
      })
    })

    it('moves to future list when dialAttempts reaches 8', async () => {
      mockFindUnique.mockResolvedValue({ ...baseContact, dialAttempts: 7 })
      await routeOutcome('c1', CallOutcome.no_answer, mockTx)
      expect(mockUpdate).toHaveBeenCalledWith({
        where: { id: 'c1' },
        data:  { dialAttempts: 8, list: 'future' },
      })
    })
  })

  describe('voicemail', () => {
    it('increments dialAttempts', async () => {
      mockFindUnique.mockResolvedValue({ ...baseContact, dialAttempts: 1 })
      await routeOutcome('c1', CallOutcome.voicemail, mockTx)
      expect(mockUpdate).toHaveBeenCalledWith({
        where: { id: 'c1' },
        data:  { dialAttempts: 2 },
      })
    })

    it('moves to future list at attempt 8', async () => {
      mockFindUnique.mockResolvedValue({ ...baseContact, dialAttempts: 7 })
      await routeOutcome('c1', CallOutcome.voicemail, mockTx)
      expect(mockUpdate).toHaveBeenCalledWith({
        where: { id: 'c1' },
        data:  { dialAttempts: 8, list: 'future' },
      })
    })
  })

  describe('not_interested', () => {
    it('sets notInterestedUntil to ~7 days from now', async () => {
      mockFindUnique.mockResolvedValue(baseContact)
      const before = Date.now()
      await routeOutcome('c1', CallOutcome.not_interested, mockTx)
      const after = Date.now()
      const sevenDays = 7 * 24 * 60 * 60 * 1000
      const { notInterestedUntil } = mockUpdate.mock.calls[0][0].data as { notInterestedUntil: Date }
      expect(notInterestedUntil.getTime()).toBeGreaterThanOrEqual(before + sevenDays)
      expect(notInterestedUntil.getTime()).toBeLessThanOrEqual(after   + sevenDays)
    })

    it('does not change the list', async () => {
      mockFindUnique.mockResolvedValue(baseContact)
      await routeOutcome('c1', CallOutcome.not_interested, mockTx)
      expect(mockUpdate.mock.calls[0][0].data).not.toHaveProperty('list')
    })
  })

  describe('not_relevant_contact', () => {
    it('moves contact to lead list', async () => {
      mockFindUnique.mockResolvedValue(baseContact)
      await routeOutcome('c1', CallOutcome.not_relevant_contact, mockTx)
      expect(mockUpdate).toHaveBeenCalledWith({
        where: { id: 'c1' },
        data:  { list: 'lead' },
      })
    })
  })

  describe('lead', () => {
    it('moves contact to lead list', async () => {
      mockFindUnique.mockResolvedValue(baseContact)
      await routeOutcome('c1', CallOutcome.lead, mockTx)
      expect(mockUpdate).toHaveBeenCalledWith({
        where: { id: 'c1' },
        data:  { list: 'lead' },
      })
    })
  })

  describe('call_back_later', () => {
    it('moves contact to call_back list', async () => {
      mockFindUnique.mockResolvedValue(baseContact)
      await routeOutcome('c1', CallOutcome.call_back_later, mockTx)
      expect(mockUpdate).toHaveBeenCalledWith({
        where: { id: 'c1' },
        data:  { list: 'call_back' },
      })
    })
  })

  describe('call_back_attempted', () => {
    it('moves contact to lead list', async () => {
      mockFindUnique.mockResolvedValue(baseContact)
      await routeOutcome('c1', CallOutcome.call_back_attempted, mockTx)
      expect(mockUpdate).toHaveBeenCalledWith({
        where: { id: 'c1' },
        data:  { list: 'lead' },
      })
    })
  })

  describe('disqualified', () => {
    it('moves contact to dnc', async () => {
      mockFindUnique.mockResolvedValue(baseContact)
      await routeOutcome('c1', CallOutcome.disqualified, mockTx)
      expect(mockUpdate).toHaveBeenCalledWith({
        where: { id: 'c1' },
        data:  { list: 'dnc', dncReason: 'Disqualified' },
      })
    })

    it('applies company-wide DNC when companyName is set', async () => {
      mockFindUnique.mockResolvedValue({ ...baseContact, companyName: 'Acme Corp' })
      await routeOutcome('c1', CallOutcome.disqualified, mockTx)
      expect(mockUpdateMany).toHaveBeenCalledWith({
        where: {
          companyName: { equals: 'Acme Corp', mode: 'insensitive' },
          id:          { not: 'c1' },
          list:        { not: 'dnc' },
          deletedAt:   null,
        },
        data: { list: 'dnc', dncReason: 'Disqualified — company-wide' },
      })
    })

    it('skips company-wide DNC when companyName is null', async () => {
      mockFindUnique.mockResolvedValue({ ...baseContact, companyName: null })
      await routeOutcome('c1', CallOutcome.disqualified, mockTx)
      expect(mockUpdateMany).not.toHaveBeenCalled()
    })
  })

  describe('meeting_booked', () => {
    it('moves contact to meeting_booked list', async () => {
      mockFindUnique.mockResolvedValue(baseContact)
      await routeOutcome('c1', CallOutcome.meeting_booked, mockTx)
      expect(mockUpdate).toHaveBeenCalledWith({
        where: { id: 'c1' },
        data:  { list: 'meeting_booked' },
      })
    })

    it('applies company-wide DNC when companyName is set', async () => {
      mockFindUnique.mockResolvedValue({ ...baseContact, companyName: 'BigCo' })
      await routeOutcome('c1', CallOutcome.meeting_booked, mockTx)
      expect(mockUpdateMany).toHaveBeenCalledWith({
        where: {
          companyName: { equals: 'BigCo', mode: 'insensitive' },
          id:          { not: 'c1' },
          list:        { not: 'dnc' },
          deletedAt:   null,
        },
        data: { list: 'dnc', dncReason: 'Irrelevant — meeting secured' },
      })
    })

    it('skips company-wide DNC when companyName is null', async () => {
      mockFindUnique.mockResolvedValue({ ...baseContact, companyName: null })
      await routeOutcome('c1', CallOutcome.meeting_booked, mockTx)
      expect(mockUpdateMany).not.toHaveBeenCalled()
    })
  })
})
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
npx vitest run src/lib/__tests__/outcome-router.test.ts
```

Expected: FAIL with "Cannot find module '../outcome-router'"

---

## Task 6: Outcome Router — Implementation

**Files:**
- Create: `src/lib/outcome-router.ts`

- [ ] **Step 1: Create outcome-router.ts**

```typescript
// src/lib/outcome-router.ts
import { db } from '@/lib/db'
import { CallOutcome } from '@/types/enums'

type TxClient = Parameters<Parameters<typeof db.$transaction>[0]>[0]

export const CONVERSATION_TAGGED_OUTCOMES = new Set<CallOutcome>([
  CallOutcome.not_relevant_contact,
  CallOutcome.disqualified,
  CallOutcome.lead,
  CallOutcome.call_back_later,
  CallOutcome.meeting_booked,
])

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
    case CallOutcome.voicemail: {
      const newDialAttempts = contact.dialAttempts + 1
      await tx.contact.update({
        where: { id: contactId },
        data:  {
          dialAttempts: newDialAttempts,
          ...(newDialAttempts >= 8 ? { list: 'future' } : {}),
        },
      })
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

    case CallOutcome.not_relevant_contact:
    case CallOutcome.lead:
    case CallOutcome.call_back_attempted: {
      await tx.contact.update({
        where: { id: contactId },
        data:  { list: 'lead' },
      })
      break
    }

    case CallOutcome.call_back_later: {
      await tx.contact.update({
        where: { id: contactId },
        data:  { list: 'call_back' },
      })
      break
    }

    case CallOutcome.disqualified: {
      await tx.contact.update({
        where: { id: contactId },
        data:  { list: 'dnc', dncReason: 'Disqualified' },
      })
      if (contact.companyName) {
        await tx.contact.updateMany({
          where: {
            companyName: { equals: contact.companyName, mode: 'insensitive' },
            id:          { not: contactId },
            list:        { not: 'dnc' },
            deletedAt:   null,
          },
          data: { list: 'dnc', dncReason: 'Disqualified — company-wide' },
        })
      }
      break
    }

    case CallOutcome.meeting_booked: {
      await tx.contact.update({
        where: { id: contactId },
        data:  { list: 'meeting_booked' },
      })
      if (contact.companyName) {
        await tx.contact.updateMany({
          where: {
            companyName: { equals: contact.companyName, mode: 'insensitive' },
            id:          { not: contactId },
            list:        { not: 'dnc' },
            deletedAt:   null,
          },
          data: { list: 'dnc', dncReason: 'Irrelevant — meeting secured' },
        })
      }
      break
    }
  }
}
```

- [ ] **Step 2: Run tests — verify they pass**

```bash
npx vitest run src/lib/__tests__/outcome-router.test.ts
```

Expected: all 16 tests PASS.

- [ ] **Step 3: Commit**

```bash
git add src/lib/outcome-router.ts src/lib/__tests__/outcome-router.test.ts
git commit -m "Add outcome router with full call routing logic and tests"
```

---

## Task 7: Queue and Session API Routes

**Files:**
- Create: `src/app/api/dialer/queue/route.ts`
- Create: `src/app/api/dialer/session/route.ts`
- Create: `src/app/api/dialer/session/end/route.ts`

- [ ] **Step 1: Create queue route**

```typescript
// src/app/api/dialer/queue/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db, withTenant } from '@/lib/db'
import { getCurrentTenantId, requirePermission } from '@/lib/auth'

const QuerySchema = z.object({
  campaignId: z.string().min(1),
})

export async function GET(req: NextRequest) {
  try {
    await requirePermission('calls:write')
    const tenantId = await getCurrentTenantId()
    if (!tenantId) return NextResponse.json({ error: 'No tenant' }, { status: 401 })

    const { searchParams } = new URL(req.url)
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
          list: { in: ['call_back', 'prospect'] },
          OR: [
            { notInterestedUntil: null },
            { notInterestedUntil: { lte: now } },
          ],
        },
        select: {
          id:          true,
          firstName:   true,
          lastName:    true,
          phone:       true,
          companyName: true,
          list:        true,
        },
        take: 50,
        orderBy: { createdAt: 'asc' },
      })
    )

    // Prioritise call_back before prospect
    const sorted = [
      ...contacts.filter((c) => c.list === 'call_back'),
      ...contacts.filter((c) => c.list === 'prospect'),
    ].slice(0, 20)

    return NextResponse.json({ data: sorted })
  } catch (err: unknown) {
    if (err instanceof Error && err.message === 'Forbidden') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
```

- [ ] **Step 2: Create session route (create or resume)**

```typescript
// src/app/api/dialer/session/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db, withTenant } from '@/lib/db'
import { getCurrentTenantId, requirePermission } from '@/lib/auth'
import { auth } from '@clerk/nextjs/server'

const BodySchema = z.object({
  campaignId: z.string().min(1),
})

export async function POST(req: NextRequest) {
  try {
    await requirePermission('calls:write')
    const tenantId = await getCurrentTenantId()
    if (!tenantId) return NextResponse.json({ error: 'No tenant' }, { status: 401 })

    const { userId: clerkId } = await auth()
    if (!clerkId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const body = await req.json()
    const parsed = BodySchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid body', details: parsed.error.flatten() }, { status: 400 })
    }
    const { campaignId } = parsed.data

    const dbUser = await withTenant(tenantId, () =>
      db.user.findFirst({ where: { clerkId }, select: { id: true } })
    )
    if (!dbUser) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    // Resume today's open session if exists
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const existing = await withTenant(tenantId, () =>
      db.session.findFirst({
        where: {
          userId:    dbUser.id,
          campaignId,
          endedAt:   null,
          createdAt: { gte: today },
        },
      })
    )

    if (existing) {
      return NextResponse.json({ data: { id: existing.id, startedAt: existing.startedAt, resumed: true } })
    }

    const session = await withTenant(tenantId, () =>
      db.session.create({
        data: { tenantId, campaignId, userId: dbUser.id },
        select: { id: true, startedAt: true },
      })
    )

    return NextResponse.json({ data: { ...session, resumed: false } })
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
```

- [ ] **Step 3: Create session/end route**

```typescript
// src/app/api/dialer/session/end/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db, withTenant } from '@/lib/db'
import { getCurrentTenantId } from '@/lib/auth'

const BodySchema = z.object({
  sessionId: z.string().min(1),
})

export async function POST(req: NextRequest) {
  try {
    const tenantId = await getCurrentTenantId()
    if (!tenantId) return NextResponse.json({ error: 'No tenant' }, { status: 401 })

    const body = await req.json()
    const parsed = BodySchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
    }

    await withTenant(tenantId, () =>
      db.session.update({
        where: { id: parsed.data.sessionId },
        data:  { endedAt: new Date() },
      })
    )

    return NextResponse.json({ data: { success: true } })
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
```

- [ ] **Step 4: Verify TypeScript**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/dialer/
git commit -m "Add dialer queue and session API routes"
```

---

## Task 8: Start-Call, End-Call, Log-Outcome API Routes

**Files:**
- Create: `src/app/api/dialer/start-call/route.ts`
- Create: `src/app/api/dialer/end-call/route.ts`
- Create: `src/app/api/dialer/log-outcome/route.ts`

- [ ] **Step 1: Create start-call route**

```typescript
// src/app/api/dialer/start-call/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db, withTenant } from '@/lib/db'
import { getCurrentTenantId, requirePermission } from '@/lib/auth'
import { auth } from '@clerk/nextjs/server'
import { getTelephonyService } from '@/lib/telephony'

const BodySchema = z.object({
  contactId:  z.string().min(1),
  campaignId: z.string().min(1),
})

export async function POST(req: NextRequest) {
  try {
    await requirePermission('calls:write')
    const tenantId = await getCurrentTenantId()
    if (!tenantId) return NextResponse.json({ error: 'No tenant' }, { status: 401 })

    const { userId: clerkId } = await auth()
    if (!clerkId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const body = await req.json()
    const parsed = BodySchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid body', details: parsed.error.flatten() }, { status: 400 })
    }
    const { contactId, campaignId } = parsed.data

    const dbUser = await withTenant(tenantId, () =>
      db.user.findFirst({ where: { clerkId }, select: { id: true } })
    )
    if (!dbUser) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    const contact = await withTenant(tenantId, () =>
      db.contact.findUnique({ where: { id: contactId }, select: { phone: true } })
    )
    if (!contact) return NextResponse.json({ error: 'Contact not found' }, { status: 404 })

    // Invoke telephony (mock returns instantly)
    const telephony = getTelephonyService()
    await telephony.makeCall({ from: 'system', to: contact.phone ?? '', campaignId })

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

- [ ] **Step 2: Create end-call route**

```typescript
// src/app/api/dialer/end-call/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db, withTenant } from '@/lib/db'
import { getCurrentTenantId, requirePermission } from '@/lib/auth'
import { getTelephonyService } from '@/lib/telephony'

const BodySchema = z.object({
  callRecordId: z.string().min(1),
  durationSecs: z.number().int().nonnegative(),
})

export async function POST(req: NextRequest) {
  try {
    await requirePermission('calls:write')
    const tenantId = await getCurrentTenantId()
    if (!tenantId) return NextResponse.json({ error: 'No tenant' }, { status: 401 })

    const body = await req.json()
    const parsed = BodySchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid body', details: parsed.error.flatten() }, { status: 400 })
    }
    const { callRecordId, durationSecs } = parsed.data

    await withTenant(tenantId, () =>
      db.callRecord.update({
        where: { id: callRecordId },
        data:  { durationSecs },
      })
    )

    return NextResponse.json({ data: { success: true } })
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
```

- [ ] **Step 3: Create log-outcome route**

```typescript
// src/app/api/dialer/log-outcome/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db, withTenant } from '@/lib/db'
import { getCurrentTenantId, requirePermission } from '@/lib/auth'
import { routeOutcome, CONVERSATION_TAGGED_OUTCOMES } from '@/lib/outcome-router'
import { CallOutcome } from '@/types/enums'

const BodySchema = z.object({
  callRecordId: z.string().min(1),
  outcome:      z.enum([
    'no_answer', 'voicemail', 'not_interested', 'not_relevant_contact',
    'disqualified', 'lead', 'call_back_later', 'meeting_booked', 'call_back_attempted',
  ]),
  notes:     z.string().optional(),
  contactId: z.string().min(1),
})

export async function POST(req: NextRequest) {
  try {
    await requirePermission('calls:write')
    const tenantId = await getCurrentTenantId()
    if (!tenantId) return NextResponse.json({ error: 'No tenant' }, { status: 401 })

    const body = await req.json()
    const parsed = BodySchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid body', details: parsed.error.flatten() }, { status: 400 })
    }
    const { callRecordId, outcome, notes, contactId } = parsed.data
    const typedOutcome = outcome as CallOutcome
    const conversationTagged = CONVERSATION_TAGGED_OUTCOMES.has(typedOutcome)

    await withTenant(tenantId, () =>
      db.$transaction(async (tx) => {
        await tx.callRecord.update({
          where: { id: callRecordId },
          data:  { outcome: typedOutcome, notes: notes ?? null, conversationTagged },
        })
        await routeOutcome(contactId, typedOutcome, tx)
      })
    )

    return NextResponse.json({ data: { success: true } })
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
```

- [ ] **Step 4: Verify TypeScript**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/dialer/
git commit -m "Add start-call, end-call, log-outcome API routes"
```

---

## Task 9: Dialer Zustand Store

**Files:**
- Create: `src/stores/dialer-store.ts`

- [ ] **Step 1: Create dialer-store.ts**

```typescript
// src/stores/dialer-store.ts
import { create } from 'zustand'
import type { ContactSummary } from '@/types/models'
import type { CallOutcome } from '@/types/enums'

type DialerCallStatus = 'idle' | 'ringing' | 'connected' | 'ended'

interface DialerState {
  // Campaign + queue
  campaignId:      string | null
  queue:           ContactSummary[]

  // Active call
  callStatus:      DialerCallStatus
  currentContact:  ContactSummary | null
  activeCallRecordId: string | null
  callStartedAt:   number | null   // Date.now() when connected

  // Session
  sessionId:       string | null
  sessionStartedAt: number | null  // Date.now() when session created
  elapsedSeconds:  number

  // Actions
  setCampaign(id: string, contacts: ContactSummary[]): void
  loadQueue(): Promise<void>
  startSession(campaignId: string): Promise<void>
  startCall(): Promise<void>
  endCall(durationSecs: number): Promise<void>
  logOutcome(outcome: CallOutcome, notes: string): Promise<void>
  tickTimer(): void
}

export const useDialerStore = create<DialerState>((set, get) => ({
  campaignId:        null,
  queue:             [],
  callStatus:        'idle',
  currentContact:    null,
  activeCallRecordId: null,
  callStartedAt:     null,
  sessionId:         null,
  sessionStartedAt:  null,
  elapsedSeconds:    0,

  setCampaign(id, contacts) {
    set({
      campaignId:     id,
      currentContact: contacts[0] ?? null,
      queue:          contacts.slice(1),
      callStatus:     'idle',
      activeCallRecordId: null,
      callStartedAt:  null,
    })
  },

  async loadQueue() {
    const { campaignId, currentContact } = get()
    if (!campaignId) return

    const res = await fetch(`/api/dialer/queue?campaignId=${campaignId}`)
    if (!res.ok) return
    const { data } = (await res.json()) as { data: ContactSummary[] }

    // Exclude the contact currently being dialed
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

  async startCall() {
    const { currentContact, campaignId } = get()
    if (!currentContact || !campaignId) return

    set({ callStatus: 'ringing' })

    const res = await fetch('/api/dialer/start-call', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ contactId: currentContact.id, campaignId }),
    })
    if (!res.ok) { set({ callStatus: 'idle' }); return }
    const { data } = await res.json()
    set({ activeCallRecordId: data.callRecordId })

    // Mock transitions to connected after 1.5s
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
    const { activeCallRecordId, currentContact, queue } = get()
    if (!activeCallRecordId || !currentContact) return

    await fetch('/api/dialer/log-outcome', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        callRecordId: activeCallRecordId,
        outcome,
        notes,
        contactId: currentContact.id,
      }),
    })

    const nextContact = queue[0] ?? null
    set({
      callStatus:         'idle',
      currentContact:     nextContact,
      queue:              queue.slice(1),
      activeCallRecordId: null,
      callStartedAt:      null,
    })

    // Reload from server when queue runs low
    if (queue.length < 5) {
      get().loadQueue()
    }
  },

  tickTimer() {
    set((s) => ({ elapsedSeconds: s.elapsedSeconds + 1 }))
  },
}))
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/stores/dialer-store.ts
git commit -m "Add Zustand dialer store with call state machine"
```

---

## Task 10: Calling Page (Server Component)

**Files:**
- Create: `src/app/(dashboard)/calling/page.tsx`

- [ ] **Step 1: Create calling page**

```typescript
// src/app/(dashboard)/calling/page.tsx
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
      where:   { status: 'active' },
      select:  { id: true, name: true },
      orderBy: { name: 'asc' },
    })
  )

  return (
    <div className="flex h-full gap-4 p-4 overflow-hidden">
      <QueuePanel campaigns={campaigns} />
      <CallControls />
      <ScriptPanel />
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/(dashboard)/calling/
git commit -m "Add calling page server component"
```

---

## Task 11: QueuePanel Component

**Files:**
- Create: `src/components/dialer/QueuePanel.tsx`

- [ ] **Step 1: Create QueuePanel.tsx**

```typescript
// src/components/dialer/QueuePanel.tsx
'use client'

import { cn } from '@/lib/utils'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { useDialerStore } from '@/stores/dialer-store'
import type { ContactSummary } from '@/types/models'

interface QueuePanelProps {
  campaigns: { id: string; name: string }[]
}

function ContactRow({ contact, isActive }: { contact: ContactSummary; isActive: boolean }) {
  return (
    <div className={cn(
      'flex items-center gap-3 px-4 py-3 border-b border-white/5 transition-colors',
      isActive ? 'bg-white/5 border-l-2 border-l-[#00d4ff]' : 'hover:bg-white/[0.02]',
    )}>
      <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-xs font-semibold text-white flex-shrink-0">
        {contact.firstName[0]}{contact.lastName[0]}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-white truncate">
          {contact.firstName} {contact.lastName}
        </p>
        {contact.companyName && (
          <p className="text-xs text-gray-500 truncate">{contact.companyName}</p>
        )}
        {contact.phone && (
          <p className="text-xs font-mono text-gray-400">{contact.phone}</p>
        )}
      </div>
      {contact.list === 'call_back' && (
        <Badge className="text-[10px] bg-amber-500/10 text-amber-400 border-amber-500/20 flex-shrink-0">
          Call Back
        </Badge>
      )}
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
            <SelectValue placeholder="Select a campaign…" />
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

      <div className="flex-1 overflow-y-auto custom-scrollbar">
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

- [ ] **Step 2: Commit**

```bash
git add src/components/dialer/QueuePanel.tsx
git commit -m "Add QueuePanel component"
```

---

## Task 12: DispositionForm Component

**Files:**
- Create: `src/components/dialer/DispositionForm.tsx`

- [ ] **Step 1: Create DispositionForm.tsx**

```typescript
// src/components/dialer/DispositionForm.tsx
'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { CallOutcome } from '@/types/enums'

const OUTCOME_OPTIONS: { value: CallOutcome; label: string }[] = [
  { value: CallOutcome.no_answer,            label: 'No Answer' },
  { value: CallOutcome.voicemail,            label: 'Voicemail' },
  { value: CallOutcome.not_interested,       label: 'Not Interested' },
  { value: CallOutcome.not_relevant_contact, label: 'Not Relevant Contact' },
  { value: CallOutcome.disqualified,         label: 'Disqualified' },
  { value: CallOutcome.lead,                 label: 'Lead' },
  { value: CallOutcome.call_back_later,      label: 'Call Back Later' },
  { value: CallOutcome.meeting_booked,       label: 'Meeting Booked' },
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

  return (
    <div className="space-y-4 w-full animate-in slide-in-from-bottom-4 duration-300">
      <div className="space-y-1.5">
        <Label className="text-xs text-gray-400">Outcome *</Label>
        <Select
          value={outcome}
          onValueChange={(v) => setOutcome((v ?? '') as CallOutcome | '')}
        >
          <SelectTrigger className="bg-white/5 border-white/10 text-white rounded-xl">
            <SelectValue placeholder="Select outcome…" />
          </SelectTrigger>
          <SelectContent className="rounded-xl border-white/10 bg-[#161c26]">
            {OUTCOME_OPTIONS.map(({ value, label }) => (
              <SelectItem key={value} value={value}
                className="text-gray-300 focus:bg-white/5 focus:text-white rounded-lg">
                {label}
              </SelectItem>
            ))}
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

- [ ] **Step 2: Commit**

```bash
git add src/components/dialer/DispositionForm.tsx
git commit -m "Add DispositionForm component"
```

---

## Task 13: CallControls Component

**Files:**
- Create: `src/components/dialer/CallControls.tsx`

- [ ] **Step 1: Create CallControls.tsx**

```typescript
// src/components/dialer/CallControls.tsx
'use client'

import { useEffect, useRef, useState } from 'react'
import { Phone, PhoneOff, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useDialerStore } from '@/stores/dialer-store'
import { DispositionForm } from './DispositionForm'
import { cn } from '@/lib/utils'
import type { CallOutcome } from '@/types/enums'

function formatTime(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = totalSeconds % 60
  return [h, m, s].map((v) => String(v).padStart(2, '0')).join(':')
}

export function CallControls() {
  const {
    currentContact,
    callStatus,
    elapsedSeconds,
    sessionId,
    startCall,
    endCall,
    logOutcome,
    tickTimer,
  } = useDialerStore()

  const sessionTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const callStartRef    = useRef<number | null>(null)
  const [logLoading, setLogLoading] = useState(false)

  // Session timer — increments elapsedSeconds every second while session is active
  useEffect(() => {
    if (sessionId) {
      sessionTimerRef.current = setInterval(tickTimer, 1000)
    } else {
      if (sessionTimerRef.current) clearInterval(sessionTimerRef.current)
    }
    return () => {
      if (sessionTimerRef.current) clearInterval(sessionTimerRef.current)
    }
  }, [sessionId, tickTimer])

  // Track when call became connected for duration calculation
  useEffect(() => {
    if (callStatus === 'connected') {
      callStartRef.current = Date.now()
    }
    if (callStatus === 'idle') {
      callStartRef.current = null
    }
  }, [callStatus])

  // End session on tab close or SPA navigation away
  useEffect(() => {
    const endSession = () => {
      const { sessionId } = useDialerStore.getState()
      if (sessionId) {
        // sendBeacon requires a Blob with explicit Content-Type for req.json() to parse it
        navigator.sendBeacon(
          '/api/dialer/session/end',
          new Blob([JSON.stringify({ sessionId })], { type: 'application/json' })
        )
      }
    }
    window.addEventListener('beforeunload', endSession)
    return () => {
      window.removeEventListener('beforeunload', endSession)
      endSession()
    }
  }, [])

  const handleEndCall = async () => {
    const durationSecs = callStartRef.current
      ? Math.floor((Date.now() - callStartRef.current) / 1000)
      : 0
    await endCall(durationSecs)
  }

  const handleLogOutcome = async (outcome: CallOutcome, notes: string) => {
    setLogLoading(true)
    try {
      await logOutcome(outcome, notes)
    } finally {
      setLogLoading(false)
    }
  }

  return (
    <div className="glass-panel rounded-3xl flex-1 flex flex-col overflow-hidden">
      {/* Session timer — top right */}
      <div className="flex justify-end p-5 pb-0 min-h-[56px]">
        {sessionId && (
          <div className="text-right">
            <p className="font-mono text-lg font-semibold text-[#00d4ff]">
              {formatTime(elapsedSeconds)}
            </p>
            <p className="text-[10px] uppercase tracking-wider text-gray-500">Session active</p>
          </div>
        )}
      </div>

      {/* Main content area */}
      <div className="flex-1 flex flex-col items-center justify-center p-8 space-y-8">
        {!currentContact ? (
          <div className="text-center">
            <Phone className="w-12 h-12 mx-auto mb-4 text-gray-600" />
            <p className="text-sm text-gray-500">Select a campaign and contact to begin</p>
          </div>
        ) : (
          <>
            {/* Contact card */}
            <div className="text-center space-y-2">
              <div className={cn(
                'w-20 h-20 rounded-full mx-auto flex items-center justify-center text-2xl font-bold transition-all duration-300 bg-white/10 text-white',
                callStatus === 'ringing'   && 'ring-4 ring-[#00d4ff]/60 ring-offset-4 ring-offset-[#0b0e14] animate-pulse',
                callStatus === 'connected' && 'ring-4 ring-emerald-500/60 ring-offset-4 ring-offset-[#0b0e14]',
              )}>
                {currentContact.firstName[0]}{currentContact.lastName[0]}
              </div>
              <h2 className="text-xl font-semibold text-white">
                {currentContact.firstName} {currentContact.lastName}
              </h2>
              {currentContact.companyName && (
                <p className="text-sm text-gray-400">{currentContact.companyName}</p>
              )}
              {currentContact.phone && (
                <p className="font-mono text-sm text-gray-300">{currentContact.phone}</p>
              )}
            </div>

            {/* Status text */}
            {callStatus === 'ringing' && (
              <p className="text-sm text-[#00d4ff] animate-pulse">Ringing…</p>
            )}
            {callStatus === 'connected' && (
              <p className="text-sm text-emerald-400">● Connected</p>
            )}

            {/* Disposition form (shown after call ends) */}
            {callStatus === 'ended' && (
              <div className="w-full max-w-sm">
                <DispositionForm onSubmit={handleLogOutcome} loading={logLoading} />
              </div>
            )}

            {/* Action buttons */}
            {callStatus === 'idle' && (
              <Button
                onClick={startCall}
                className="w-full max-w-xs bg-gradient-to-r from-[#00d4ff] to-cyan-600 text-black font-semibold rounded-2xl h-14 text-base hover:opacity-90 shadow-xl shadow-[#00d4ff]/20"
              >
                <Phone className="w-5 h-5 mr-2" />
                Start Call
              </Button>
            )}

            {callStatus === 'ringing' && (
              <Button
                onClick={handleEndCall}
                className="w-full max-w-xs bg-white/5 border border-white/10 text-gray-300 rounded-2xl h-14 text-base hover:bg-white/10"
              >
                <X className="w-5 h-5 mr-2" />
                Cancel
              </Button>
            )}

            {callStatus === 'connected' && (
              <Button
                onClick={handleEndCall}
                className="w-full max-w-xs bg-red-500/10 border border-red-500/20 text-red-400 rounded-2xl h-14 text-base hover:bg-red-500/20"
              >
                <PhoneOff className="w-5 h-5 mr-2" />
                End Call
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/dialer/CallControls.tsx
git commit -m "Add CallControls component with session timer and call state UI"
```

---

## Task 14: ScriptPanel + Final Wiring

**Files:**
- Create: `src/components/dialer/ScriptPanel.tsx`

- [ ] **Step 1: Create ScriptPanel.tsx**

```typescript
// src/components/dialer/ScriptPanel.tsx
import { ScrollText } from 'lucide-react'

export function ScriptPanel() {
  return (
    <div className="glass-panel rounded-3xl w-[30%] flex-shrink-0 flex flex-col items-center justify-center p-8 text-center">
      <ScrollText className="w-12 h-12 text-gray-600 mb-4" />
      <h3 className="text-sm font-semibold text-gray-400 mb-2">Scripts</h3>
      <p className="text-xs text-gray-600">Script display coming in Phase 6</p>
    </div>
  )
}
```

- [ ] **Step 2: Run TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Run all tests**

```bash
npx vitest run
```

Expected: all tests pass (including the 16 outcome-router tests).

- [ ] **Step 4: Start dev server and smoke-test**

```bash
npm run dev
```

Navigate to `http://localhost:3000/calling`. Verify:
- Sidebar "Calling" link is active
- 3 panels render: Queue (left), Call Controls (centre), Script placeholder (right)
- Campaign dropdown lists active campaigns
- Selecting a campaign loads the queue and shows contacts
- Session timer appears and counts up
- "Start Call" button transitions to ringing → connected after 1.5s
- "End Call" shows disposition form
- Selecting an outcome and submitting advances to the next contact
- Queue reloads when running low

- [ ] **Step 5: Commit**

```bash
git add src/components/dialer/ScriptPanel.tsx
git commit -m "Add ScriptPanel placeholder — completes Phase 3 dialer"
```
