# Quick-Log Dropdown Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `▾` dropdown button to each active queue row in QueuePanel that lets SDRs log one of 9 call outcomes in one click, without opening the full DispositionForm.

**Architecture:** A new `QuickLogDropdown` client component reads `campaignId` and `logManualOutcome` from the existing Zustand dialer store, calls `POST /api/dialer/log-outcome` with `manual: true`, and updates queue state via the store's existing logic. Two outcome-router bugs are fixed first (TDD): `not_relevant_contact` must route to DNC (not lead), and `hung_up` must auto-DNC on the second disconnected call.

**Tech Stack:** React, Zustand (`useDialerStore`), Lucide React, Tailwind CSS, Vitest (tests)

---

## File Map

| File | Action |
|---|---|
| `src/lib/__tests__/outcome-router.test.ts` | Update `not_relevant_contact` test; add mock for `callRecord.count`; add 3 `hung_up` tests |
| `src/lib/outcome-router.ts` | Fix `not_relevant_contact` → DNC; add `hung_up` auto-DNC on 2nd disconnect |
| `src/components/dialer/QuickLogDropdown.tsx` | **New** — dropdown component |
| `src/components/dialer/QueuePanel.tsx` | Add column to GRID; add `QuickLogDropdown` to `ContactRow` and `CalledTodayRow` |

---

## Task 1: Fix `not_relevant_contact` routing — TDD

**Files:**
- Modify: `src/lib/__tests__/outcome-router.test.ts`
- Modify: `src/lib/outcome-router.ts`

- [ ] **Step 1: Update the failing test**

In `src/lib/__tests__/outcome-router.test.ts`, find the `describe('not_relevant_contact')` block (line 82) and replace it:

```typescript
describe('not_relevant_contact', () => {
  it('moves contact to dnc', async () => {
    mockFindUnique.mockResolvedValue(baseContact)
    await routeOutcome('c1', CallOutcome.not_relevant_contact, mockTx, DEFAULT_DIALER_THRESHOLDS)
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data:  { status: 'dnc', dncReason: 'Not relevant contact' },
    })
  })
})
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
npx vitest run src/lib/__tests__/outcome-router.test.ts --reporter=verbose 2>&1 | grep -A 5 "not_relevant_contact"
```

Expected: FAIL — `received { status: 'lead' }` vs `expected { status: 'dnc', dncReason: 'Not relevant contact' }`

- [ ] **Step 3: Fix the router**

In `src/lib/outcome-router.ts`, find this block (lines 97-105):

```typescript
    case CallOutcome.not_relevant_contact:
    case CallOutcome.lead:
    case CallOutcome.call_back_attempted: {
      await tx.contact.update({
        where: { id: contactId },
        data:  { status: 'lead' },
      })
      break
    }
```

Replace with:

```typescript
    case CallOutcome.not_relevant_contact: {
      await tx.contact.update({
        where: { id: contactId },
        data:  { status: 'dnc', dncReason: 'Not relevant contact' },
      })
      break
    }

    case CallOutcome.lead:
    case CallOutcome.call_back_attempted: {
      await tx.contact.update({
        where: { id: contactId },
        data:  { status: 'lead' },
      })
      break
    }
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx vitest run src/lib/__tests__/outcome-router.test.ts --reporter=verbose 2>&1 | tail -20
```

Expected: all tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/__tests__/outcome-router.test.ts src/lib/outcome-router.ts
git commit -m "Fix not_relevant_contact routing to DNC instead of lead"
```

---

## Task 2: Add `hung_up` auto-DNC on second disconnected call — TDD

**Files:**
- Modify: `src/lib/__tests__/outcome-router.test.ts`
- Modify: `src/lib/outcome-router.ts`

- [ ] **Step 1: Add `mockCount` to the test mock and new hung_up tests**

In `src/lib/__tests__/outcome-router.test.ts`:

At the top, add `mockCount` alongside the existing mocks (after line 8):

```typescript
const mockCount      = vi.fn()
```

Update the `mockTx` object to include `callRecord`:

```typescript
const mockTx = {
  contact: {
    findUnique: mockFindUnique,
    update:     mockUpdate,
    updateMany: mockUpdateMany,
  },
  callRecord: {
    count: mockCount,
  },
} as any
```

In the top-level `beforeEach` (line 20), add a default for `mockCount`:

```typescript
beforeEach(() => {
  vi.clearAllMocks()
  mockCount.mockResolvedValue(0)
})
```

Find the existing `describe('hung_up')` block (line 236) and replace it entirely:

```typescript
describe('hung_up', () => {
  it('makes no status change on first disconnected call', async () => {
    mockFindUnique.mockResolvedValue(baseContact)
    mockCount.mockResolvedValue(0)
    await routeOutcome('c1', CallOutcome.hung_up, mockTx, DEFAULT_DIALER_THRESHOLDS)
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('moves contact to dnc on second disconnected call', async () => {
    mockFindUnique.mockResolvedValue(baseContact)
    mockCount.mockResolvedValue(1)
    await routeOutcome('c1', CallOutcome.hung_up, mockTx, DEFAULT_DIALER_THRESHOLDS)
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data:  { status: 'dnc', dncReason: 'Disconnected twice' },
    })
  })

  it('counts prior hung_up records with correct filters', async () => {
    mockFindUnique.mockResolvedValue({ ...baseContact, tenantId: 't1' })
    mockCount.mockResolvedValue(1)
    await routeOutcome('c1', CallOutcome.hung_up, mockTx, DEFAULT_DIALER_THRESHOLDS)
    expect(mockCount).toHaveBeenCalledWith({
      where: { contactId: 'c1', outcome: CallOutcome.hung_up, tenantId: 't1' },
    })
  })
})
```

- [ ] **Step 2: Run tests to confirm the new hung_up tests fail**

```bash
npx vitest run src/lib/__tests__/outcome-router.test.ts --reporter=verbose 2>&1 | grep -A 3 "hung_up"
```

Expected: the two new tests FAIL (the first one may pass since count=0 means no update), the count-filter test fails

- [ ] **Step 3: Fix the router**

In `src/lib/outcome-router.ts`, find the last case block (lines 163-167):

```typescript
    case CallOutcome.connected:
    case CallOutcome.hung_up:
      // No routing change — contact stays as prospect; SDR recorded the connection
      break
```

Replace with:

```typescript
    case CallOutcome.connected:
      break

    case CallOutcome.hung_up: {
      const priorDisconnects = await tx.callRecord.count({
        where: { contactId, outcome: CallOutcome.hung_up, tenantId: contact.tenantId },
      })
      if (priorDisconnects >= 1) {
        await tx.contact.update({
          where: { id: contactId },
          data:  { status: 'dnc', dncReason: 'Disconnected twice' },
        })
      }
      break
    }
```

- [ ] **Step 4: Run all outcome-router tests**

```bash
npx vitest run src/lib/__tests__/outcome-router.test.ts --reporter=verbose 2>&1 | tail -20
```

Expected: all tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/__tests__/outcome-router.test.ts src/lib/outcome-router.ts
git commit -m "Add hung_up auto-DNC on second disconnected call"
```

---

## Task 3: Build QuickLogDropdown component

**Files:**
- Create: `src/components/dialer/QuickLogDropdown.tsx`

- [ ] **Step 1: Create the component**

Create `src/components/dialer/QuickLogDropdown.tsx` with this full content:

```typescript
'use client'

import { useState, useEffect, useRef } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useDialerStore } from '@/stores/dialer-store'
import type { CallOutcome } from '@prisma/client'

type DropdownState = 'idle' | 'open' | 'confirm' | 'loading'

interface OutcomeOption {
  label: string
  outcome: CallOutcome
  dotClass: string
  badge?: string
  badgeClass?: string
  requiresConfirm: boolean
}

const OUTCOMES: OutcomeOption[] = [
  { label: 'No Answer',     outcome: 'no_answer'             as CallOutcome, dotClass: 'bg-white/30',  requiresConfirm: false },
  { label: 'Voicemail',     outcome: 'voicemail'             as CallOutcome, dotClass: 'bg-amber-400', requiresConfirm: false },
  { label: 'AI Assistant',  outcome: 'ai_assistant'          as CallOutcome, dotClass: 'bg-white/30',  requiresConfirm: false },
  { label: 'Gatekeeper',    outcome: 'not_available'         as CallOutcome, dotClass: 'bg-white/30',  requiresConfirm: false },
  { label: 'Not Interested', outcome: 'not_interested'       as CallOutcome, dotClass: 'bg-blue-400',  badge: 'Requeue 1wk', badgeClass: 'bg-amber-500/15 text-amber-400', requiresConfirm: false },
  { label: 'Not Relevant',  outcome: 'not_relevant_contact'  as CallOutcome, dotClass: 'bg-red-500',   badge: '→ DNC', badgeClass: 'bg-red-500/15 text-red-400',   requiresConfirm: true  },
  { label: 'Disconnected',  outcome: 'hung_up'               as CallOutcome, dotClass: 'bg-red-500',   requiresConfirm: false },
  { label: 'Wrong Number',  outcome: 'wrong_number'          as CallOutcome, dotClass: 'bg-red-500',   badge: '→ DNC', badgeClass: 'bg-red-500/15 text-red-400',   requiresConfirm: true  },
  { label: 'DNC',           outcome: 'does_not_take_cold_calls' as CallOutcome, dotClass: 'bg-red-500', badge: '→ DNC', badgeClass: 'bg-red-500/15 text-red-400', requiresConfirm: true  },
]

// Indices where a divider appears BEFORE the item
const DIVIDER_BEFORE = new Set([4, 5])

interface QuickLogDropdownProps {
  contactId: string
  contactName: string
  disabled: boolean
}

export function QuickLogDropdown({ contactId, contactName, disabled }: QuickLogDropdownProps) {
  const [dropState, setDropState]       = useState<DropdownState>('idle')
  const [pending, setPending]           = useState<OutcomeOption | null>(null)
  const containerRef                    = useRef<HTMLDivElement>(null)
  const { logManualOutcome }            = useDialerStore()

  useEffect(() => {
    if (dropState === 'idle') return
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setDropState('idle')
        setPending(null)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [dropState])

  const handleTriggerClick = () => {
    if (disabled) return
    setDropState((s) => (s === 'idle' ? 'open' : 'idle'))
    setPending(null)
  }

  const handleSelect = (opt: OutcomeOption) => {
    if (opt.requiresConfirm) {
      setPending(opt)
      setDropState('confirm')
    } else {
      void submit(opt)
    }
  }

  const submit = async (opt: OutcomeOption) => {
    setDropState('loading')
    try {
      await logManualOutcome(contactId, opt.outcome, '')
    } catch {
      // reset to open on error so the user can retry
      setDropState('open')
      return
    }
    setDropState('idle')
    setPending(null)
  }

  const firstName = contactName.split(' ')[0]

  return (
    <div ref={containerRef} className="relative flex-shrink-0">
      <button
        onClick={handleTriggerClick}
        disabled={disabled}
        title={disabled ? undefined : 'Quick log outcome'}
        className={cn(
          'w-6 h-6 flex items-center justify-center rounded-lg transition-colors',
          disabled
            ? 'text-gray-700 cursor-not-allowed'
            : dropState !== 'idle'
              ? 'bg-[#00d4ff]/15 text-[#00d4ff] border border-[#00d4ff]/30'
              : 'text-gray-500 hover:text-[#00d4ff] hover:bg-white/5',
        )}
      >
        <ChevronDown className="w-3 h-3" />
      </button>

      {dropState !== 'idle' && (
        <div className="absolute top-[calc(100%+4px)] right-0 z-50 w-52 rounded-xl border border-[#00d4ff]/20 bg-[#161c26] shadow-2xl shadow-black/60">

          {dropState === 'loading' && (
            <div className="flex items-center justify-center py-6">
              <div className="w-4 h-4 border-2 border-[#00d4ff]/30 border-t-[#00d4ff] rounded-full animate-spin" />
            </div>
          )}

          {dropState === 'confirm' && pending && (
            <div className="p-3">
              <p className="text-[9px] uppercase tracking-widest text-gray-600 mb-3">Confirm DNC</p>
              <p className="text-xs text-gray-300 mb-4 leading-relaxed">
                Mark <span className="text-white font-semibold">{firstName}</span> as Do Not Call?
              </p>
              <button
                onClick={() => void submit(pending)}
                className="w-full py-1.5 rounded-lg bg-red-500/15 border border-red-500/25 text-red-400 text-xs font-semibold hover:bg-red-500/25 transition-colors mb-2"
              >
                Confirm DNC
              </button>
              <button
                onClick={() => { setDropState('open'); setPending(null) }}
                className="w-full py-1 text-[10px] text-gray-600 hover:text-gray-300 transition-colors"
              >
                Cancel
              </button>
            </div>
          )}

          {dropState === 'open' && (
            <div className="p-1.5">
              <p className="text-[9px] uppercase tracking-widest text-gray-600 px-2 pt-1 pb-1.5">
                Quick Log · {firstName}
              </p>
              {OUTCOMES.map((opt, i) => (
                <div key={opt.outcome}>
                  {DIVIDER_BEFORE.has(i) && (
                    <div className="my-1 mx-2 border-t border-white/5" />
                  )}
                  <button
                    onClick={() => handleSelect(opt)}
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left text-xs text-gray-300 hover:bg-white/5 hover:text-white transition-colors"
                  >
                    <span className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', opt.dotClass)} />
                    <span className="flex-1">{opt.label}</span>
                    {opt.badge && (
                      <span className={cn('text-[9px] px-1.5 py-0.5 rounded font-semibold flex-shrink-0', opt.badgeClass)}>
                        {opt.badge}
                      </span>
                    )}
                  </button>
                </div>
              ))}
            </div>
          )}

        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Type-check the new file**

```bash
npx tsc --noEmit 2>&1 | grep QuickLogDropdown
```

Expected: no output (no errors)

- [ ] **Step 3: Commit**

```bash
git add src/components/dialer/QuickLogDropdown.tsx
git commit -m "Add QuickLogDropdown component with 9 outcomes, DNC confirmation, and auto-DNC handling"
```

---

## Task 4: Wire QuickLogDropdown into QueuePanel

**Files:**
- Modify: `src/components/dialer/QueuePanel.tsx`

- [ ] **Step 1: Update the GRID constant and import**

In `src/components/dialer/QueuePanel.tsx`:

At the top, add the import after the existing dialer imports:

```typescript
import { QuickLogDropdown } from './QuickLogDropdown'
```

Find line 24:

```typescript
const GRID = 'grid-cols-[12px_1fr_110px_48px_24px_140px_24px]'
// drag | name+title | company+employees | history dots | notes | mobile | call
```

Replace with:

```typescript
const GRID = 'grid-cols-[12px_1fr_110px_48px_24px_24px_140px_24px]'
// drag | name+title | company+employees | history dots | notes | quick-log | mobile | call
```

- [ ] **Step 2: Add QuickLogDropdown to ContactRow**

In `ContactRow`, find the JSX between `<NotesButton>` and `<MobilePhoneCell>` (lines 172-174):

```typescript
      <CallHistoryDots history={contact.callHistory} />
      <NotesButton contact={contact} />
      <MobilePhoneCell phone={contact.mobilePhone} />
```

Replace with:

```typescript
      <CallHistoryDots history={contact.callHistory} />
      <NotesButton contact={contact} />
      <QuickLogDropdown
        contactId={contact.id}
        contactName={`${contact.firstName} ${contact.lastName}`}
        disabled={!isActive || callStatus !== 'idle'}
      />
      <MobilePhoneCell phone={contact.mobilePhone} />
```

- [ ] **Step 3: Add placeholder column to CalledTodayRow**

In `CalledTodayRow`, find the same sequence (lines 218-220):

```typescript
      <CallHistoryDots history={contact.callHistory} />
      <NotesButton contact={contact} />
      <MobilePhoneCell phone={contact.mobilePhone} />
```

Replace with:

```typescript
      <CallHistoryDots history={contact.callHistory} />
      <NotesButton contact={contact} />
      <div />
      <MobilePhoneCell phone={contact.mobilePhone} />
```

- [ ] **Step 4: Update the column header row**

Find the column headers block (lines 324-333):

```typescript
        <div className={cn(`grid ${GRID}`, 'items-center gap-3 px-4 py-2 border-b border-white/10 flex-shrink-0')}>
          <div className="w-3" />
          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-600">Contact</p>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-600 text-right">Company</p>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-600 text-center">Calls</p>
          <div />
          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-600">Mobile</p>
          <div />
        </div>
```

Replace with:

```typescript
        <div className={cn(`grid ${GRID}`, 'items-center gap-3 px-4 py-2 border-b border-white/10 flex-shrink-0')}>
          <div className="w-3" />
          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-600">Contact</p>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-600 text-right">Company</p>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-600 text-center">Calls</p>
          <div />
          <div />
          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-600">Mobile</p>
          <div />
        </div>
```

- [ ] **Step 5: Type-check the whole project**

```bash
npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add src/components/dialer/QueuePanel.tsx
git commit -m "Wire QuickLogDropdown into queue rows — active contact only"
```

---

## Verification

Manual test checklist in the browser at `/calling`:

1. Select a campaign — confirm `▾` button visible on all rows, visually dimmed on non-active contacts
2. Click `▾` on the active contact — dropdown opens with header "Quick Log · [First Name]", 9 items in 3 groups separated by dividers
3. Select **No Answer** — logs immediately, new grey dot appears in call history, queue advances to next contact
4. Select **Voicemail** on the next active contact — same instant log behavior
5. Select **Wrong Number** — confirm step appears: "Mark [Name] as Do Not Call?", click Cancel → returns to list, click Confirm → contact leaves queue
6. Select **Not Interested** — contact leaves queue; verify in DB: `notInterestedUntil` ≈ 7 days from now, status = (not changed by router but contact exits queue via store)
7. Select **Disconnected** on a contact, then make that same contact active again and select **Disconnected** a second time — second log auto-DNCs silently, contact disappears from queue; verify in DB: `status = 'dnc'`, `dncReason = 'Disconnected twice'`
8. Start a call (callStatus → ringing/connected) — confirm `▾` is disabled on ALL rows including active
9. Click `▾` on a non-active row — nothing happens (button is disabled)
