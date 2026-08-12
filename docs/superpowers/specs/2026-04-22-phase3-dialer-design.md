# Phase 3 — Power Dialer Design Spec

**Date:** 2026-04-22
**Status:** Approved
**Approach:** Option A — Zustand-first, server actions for mutations

---

## Overview

Phase 3 adds a fully functional power dialer to LeadForce CRM. The telephony layer is built behind an abstraction interface with a mock implementation (JustCall credentials not yet available). All call outcome business logic, session tracking, and company-wide DNC triggers are implemented in full. Socket.io is deferred to Phase 4 — dialer state lives in a Zustand store client-side.

---

## 1. Architecture & New Files

### New lib files

| File | Purpose |
|---|---|
| `src/lib/telephony/types.ts` | `TelephonyService` interface + `CallStatus` type |
| `src/lib/telephony/mock.ts` | Mock implementation with simulated ringing/connect delays |
| `src/lib/telephony/index.ts` | Factory: returns mock or JustCall based on `TELEPHONY_PROVIDER` env var |
| `src/lib/outcome-router.ts` | Pure async function containing all call outcome routing business logic |

### New Zustand store

| File | Purpose |
|---|---|
| `src/stores/dialer-store.ts` | Holds callStatus, queue, currentContact, session timer, actions |

### New page + components

| File | Purpose |
|---|---|
| `src/app/(dashboard)/calling/page.tsx` | Server component — loads campaign list + initial queue |
| `src/components/dialer/QueuePanel.tsx` | Left panel: campaign selector + prioritised contact queue |
| `src/components/dialer/CallControls.tsx` | Centre panel: call button, timer, disposition form |
| `src/components/dialer/ScriptPanel.tsx` | Right panel: Phase 6 placeholder |
| `src/components/dialer/DispositionForm.tsx` | Inline outcome selector + notes, shown after call ends |

### New API routes

| Route | Method | Purpose |
|---|---|---|
| `/api/dialer/queue` | GET | Returns prioritised queue (call-backs first, then prospects) |
| `/api/dialer/session` | POST | Creates or resumes a Session record |
| `/api/dialer/start-call` | POST | Creates CallRecord, invokes mock makeCall |
| `/api/dialer/end-call` | POST | Finalises CallRecord duration |
| `/api/dialer/log-outcome` | POST | Writes outcome, runs routing logic, returns next contact |
| `/api/dialer/session/end` | POST | Sets `endedAt = now()` on active session (called via `sendBeacon` on page unload) |

---

## 2. Data Model

### New Prisma enum

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

### New model: `CallRecord`

```prisma
model CallRecord {
  id                 String       @id @default(cuid())
  tenantId           String
  campaignId         String
  contactId          String
  userId             String
  outcome            CallOutcome?
  notes              String?
  durationSecs       Int?
  conversationTagged Boolean      @default(false)
  createdAt          DateTime     @default(now())
  updatedAt          DateTime     @updatedAt
  tenant             Tenant       @relation(fields: [tenantId], references: [id])
  campaign           Campaign     @relation(fields: [campaignId], references: [id])
  contact            Contact      @relation(fields: [contactId], references: [id])
  user               User         @relation(fields: [userId], references: [id])

  @@index([tenantId, campaignId])
  @@index([tenantId, contactId])
}
```

### New model: `Session`

```prisma
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
```

### New model stubs: `Script` + `ScriptVersion`

Minimal stubs — no UI in Phase 3. Editor and versioning come in Phase 6.

```prisma
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

### `Contact` model additions

Two new columns added to the existing `Contact` model:

```prisma
dialAttempts      Int       @default(0)
notInterestedUntil DateTime?
```

`TENANT_MODELS` in `db.ts` must be updated to add `'CallRecord'`, `'Session'`, and `'Script'` — these all carry `tenantId` and need automatic tenant scoping. `ScriptVersion` has no `tenantId` (accessed only via `scriptId` relation) and is excluded.

---

## 3. TelephonyService Abstraction

### Interface (`src/lib/telephony/types.ts`)

```typescript
export type CallStatus = 'ringing' | 'connected' | 'ended' | 'failed'

export interface TelephonyService {
  makeCall(params: { from: string; to: string; campaignId: string }): Promise<{ callId: string }>
  endCall(callId: string): Promise<void>
  getCallStatus(callId: string): Promise<CallStatus>
  getRecordingUrl(callId: string): Promise<string | null>
  registerWebhook(eventType: string, callbackUrl: string): Promise<void>
}
```

### Mock implementation (`src/lib/telephony/mock.ts`)

- `makeCall` — generates a UUID `callId`, stores `'ringing'` in an in-memory Map, schedules a 1500ms timeout to transition to `'connected'`. Returns `{ callId }` immediately.
- `getCallStatus` — reads from the in-memory Map.
- `endCall` — sets status to `'ended'`.
- `getRecordingUrl` — always returns `null`.
- `registerWebhook` — no-op, logs to console in dev.

### Factory (`src/lib/telephony/index.ts`)

```typescript
export function getTelephonyService(): TelephonyService {
  if (process.env.TELEPHONY_PROVIDER === 'justcall') {
    throw new Error('JustCall not yet configured — add JUSTCALL_API_KEY to env')
  }
  return new MockTelephonyService()
}
```

---

## 4. Zustand Dialer Store

### State shape (`src/stores/dialer-store.ts`)

```typescript
type DialerCallStatus = 'idle' | 'ringing' | 'connected' | 'ended'

interface ContactSummary {
  id: string
  firstName: string
  lastName: string
  phone: string | null
  companyName: string | null
  list: ContactList
}

interface DialerState {
  campaignId: string | null
  queue: ContactSummary[]
  callStatus: DialerCallStatus
  currentContact: ContactSummary | null
  activeCallRecordId: string | null
  sessionId: string | null
  sessionStartedAt: number | null
  elapsedSeconds: number

  setCampaign(id: string, queue: ContactSummary[]): void
  loadQueue(): Promise<void>
  startSession(): Promise<void>
  startCall(): Promise<void>
  endCall(): Promise<void>
  logOutcome(outcome: CallOutcome, notes: string): Promise<void>
  tickTimer(): void
}
```

### Call flow state machine

```
idle → startCall() → ringing → [~1.5s mock delay] → connected → endCall() → ended → logOutcome() → idle
                                                                                         ↓
                                                                              next contact loaded from queue
```

`startCall` sets `callStatus = 'ringing'`, calls `POST /api/dialer/start-call`, then uses a client-side `setTimeout(1500)` to set `callStatus = 'connected'`. No polling — the mock always connects after 1.5s and the store transition is purely client-side.

`logOutcome` calls `POST /api/dialer/log-outcome` which returns the next contact. The store sets `currentContact` to it and returns to `'idle'`.

### Session timer

`CallControls` sets up `setInterval(() => tickTimer(), 1000)` on mount when `sessionId` is non-null. `tickTimer` increments `elapsedSeconds` by 1. Interval is cleared on unmount.

---

## 5. Call Outcome Routing Logic

All routing lives in `src/lib/outcome-router.ts` as:

```typescript
export async function routeOutcome(
  contactId: string,
  outcome: CallOutcome,
  tenantId: string,
  tx: PrismaTransactionClient
): Promise<void>
```

Called inside a DB transaction from the `log-outcome` API route.

### Routing table

| Outcome | `list` after | `conversationTagged` | Other effects |
|---|---|---|---|
| `no_answer` | unchanged | false | `dialAttempts++`; if ≥ 8 → `future` |
| `voicemail` | unchanged | false | `dialAttempts++`; if ≥ 8 → `future` |
| `not_interested` | unchanged | false | `notInterestedUntil = now + 7 days` |
| `not_relevant_contact` | `lead` | **true** | — |
| `disqualified` | `dnc` | **true** | Company-wide DNC: `"Disqualified — company-wide"` |
| `lead` | `lead` | **true** | — |
| `call_back_later` | `call_back` | **true** | — |
| `meeting_booked` | `meeting_booked` | **true** | Company-wide DNC: `"Irrelevant — meeting secured"` |
| `call_back_attempted` | `lead` | false | Auto-assigned — not user-selectable in disposition form |

### Company-wide DNC

For `disqualified` and `meeting_booked`, after updating the current contact, find all other contacts in the same tenant with a matching `companyName` (case-insensitive, non-null) where `list != 'dnc'`, and update them with the appropriate `dncReason`.

### Dial attempt threshold

After 8 unanswered attempts (`no_answer` or `voicemail`), contact moves to `future`. The re-entry logic (3 months → re-enter prospect, 3 more dials → permanent DNC) is a background job concern deferred to Phase 4. Phase 3 only sets `future`.

---

## 6. UI Panels

### Page layout (`/calling`)

Full-height, no vertical scroll. Three columns, flex row, filling `h-screen` minus the sidebar:

```
┌──────────────────┬──────────────────────────┬──────────────────┐
│  QueuePanel 30%  │  CallControls 40%        │  ScriptPanel 30% │
│  (glass-panel)   │  (glass-panel)            │  (glass-panel)   │
└──────────────────┴──────────────────────────┴──────────────────┘
```

### QueuePanel

- Top: campaign `<Select>` — choosing a campaign calls `setCampaign` + `startSession`
- Contact list: scrollable, each row shows avatar initials, name, company, phone, `call_back` badge if applicable
- Active contact: highlighted `border-[#00d4ff]/30 bg-white/5`
- Empty state: "Select a campaign to begin"
- "Load more" button at bottom when queue has more items

### CallControls — `idle` state

- Current contact card: name (text-xl semibold), company (text-sm muted), phone (font-mono)
- Session timer: top-right, `HH:MM:SS` JetBrains Mono accent colour, "Session active" micro-label beneath
- "Start Call" button: full-width cyan gradient, large, rounded-2xl

### CallControls — `ringing` state

- Pulsing cyan ring animation around contact avatar
- "Cancel" secondary button
- Status text: "Ringing…" in accent colour

### CallControls — `connected` state

- Live call duration timer in accent colour (separate from session timer)
- "End Call" danger button (red gradient)
- Status text: "Connected" in green

### CallControls — `ended` state (DispositionForm visible)

`DispositionForm` slides up inline (no drawer):
- Outcome `<Select>` (all 8 user-selectable outcomes — `call_back_attempted` is excluded)
- Notes `<textarea>` (optional)
- "Log Outcome" primary button → calls `logOutcome()` → returns to idle with next contact

### ScriptPanel

- Centred icon (`ScrollText` from Lucide) in muted colour
- Heading: "Scripts" 
- Body: "Script display coming in Phase 6"
- No interactivity

### New permission added to auth

```typescript
'calls:write'  // SDR and above
```

Added to `ROLE_PERMISSIONS` in `src/lib/auth.ts`.

---

## 7. Session Tracking

- Session is created (`POST /api/dialer/session`) when the SDR selects a campaign in QueuePanel
- If a `Session` already exists for this user + campaign today with no `endedAt`, it is resumed (returned as-is)
- `sessionStartedAt` in the store is set to `Date.now()` on session creation/resume
- Session end: the calling page registers a `beforeunload` handler that calls `POST /api/dialer/session/end` — a fire-and-forget `sendBeacon` to set `endedAt = now()`
- `endedAt` is also set when the SDR navigates away (handled by a `useEffect` cleanup in `CallControls`)

---

## Decisions & Constraints

- **No Socket.io in Phase 3** — Zustand is the source of truth for call state; real-time broadcast added in Phase 4
- **Mock telephony only** — `TELEPHONY_PROVIDER=justcall` env var is the swap point; JustCall implementation is a future file
- **Script panel is a placeholder** — full script editor, versioning, and branch logic come in Phase 6
- **Re-entry from `future` list** — the scheduling logic is deferred to Phase 4 background jobs; Phase 3 only writes `future`
- **Inbound call-back detection** (`call_back_attempted`) — requires JustCall webhook; deferred to when JustCall is live. The outcome exists in the enum and routing table but won't appear in the disposition form UI
