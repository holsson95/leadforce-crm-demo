# Profile View — Outcome Notes & Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the list view's pipeline-eligibility workflow into the Profile view's outcome-logging flow, require notes for pipeline-eligible outcomes in both views, and stop the Profile view from auto-advancing to the next contact after a logged outcome (No Answer still auto-advances).

**Architecture:** A single shared rule (`notesRequiredFor`, added to `outcome-router.ts`) drives notes validation in both `DispositionForm` (client) and `/api/dialer/log-outcome` (server). `DispositionForm` gains optional props so it can run in a "locked outcome" mode, embedded inline in the Profile view's action-bar area instead of only inside the list view's `CallControls`. `ProfileViewCard` owns a small local state machine (`pendingOutcome` → submit → `pinned` snapshot → `Next` clears it) so the already-dispositioned contact stays visible until the SDR explicitly moves on; the store's existing `logManualOutcome` queue-shift/`calledToday` bookkeeping is untouched, since `QuickLogDropdown` and `ContactNotesModal` also depend on it unchanged.

**Tech Stack:** Next.js 14 App Router, TypeScript, Zustand (dialer-store), Prisma, Vitest + React Testing Library.

## Global Constraints

- Notes-required set is exactly `PIPELINE_ELIGIBLE_OUTCOMES` (`connected`, `lead`, `call_back_later`, `meeting_booked`), enforced identically in the list view and the Profile view.
- No Answer's behavior is unchanged — it still logs instantly with no notes and the view still advances immediately.
- `dialer-store.ts`'s `logManualOutcome` queue-shift/`calledToday` mutation logic is not modified — `QuickLogDropdown.tsx` and `ContactNotesModal.tsx` call it today and must keep working exactly as before.
- No new dependencies. No DB/schema changes.

---

## Task 1: `notesRequiredFor` helper in `outcome-router.ts`

**Files:**
- Modify: `src/lib/outcome-router.ts:20-26` (after `PIPELINE_ELIGIBLE_OUTCOMES`)
- Test: `src/lib/__tests__/outcome-router.test.ts`

**Interfaces:**
- Produces: `notesRequiredFor(outcome: CallOutcome): boolean` — exported from `@/lib/outcome-router`. Returns `true` iff `outcome` is in `PIPELINE_ELIGIBLE_OUTCOMES`. Used by Task 2 (client) and Task 3 (server).

- [ ] **Step 1: Write the failing test**

Open `src/lib/__tests__/outcome-router.test.ts`. Change the import on line 2 from:

```ts
import { routeOutcome, CONVERSATION_TAGGED_OUTCOMES, DEFAULT_DIALER_THRESHOLDS } from '../outcome-router'
```

to:

```ts
import { routeOutcome, CONVERSATION_TAGGED_OUTCOMES, DEFAULT_DIALER_THRESHOLDS, notesRequiredFor } from '../outcome-router'
```

Add this `describe` block at the end of the file (after the last existing `describe`, before end of file):

```ts
describe('notesRequiredFor', () => {
  it('returns true for pipeline-eligible outcomes', () => {
    expect(notesRequiredFor(CallOutcome.connected)).toBe(true)
    expect(notesRequiredFor(CallOutcome.lead)).toBe(true)
    expect(notesRequiredFor(CallOutcome.call_back_later)).toBe(true)
    expect(notesRequiredFor(CallOutcome.meeting_booked)).toBe(true)
  })

  it('returns false for outcomes outside the pipeline-eligible set', () => {
    expect(notesRequiredFor(CallOutcome.no_answer)).toBe(false)
    expect(notesRequiredFor(CallOutcome.not_interested)).toBe(false)
    expect(notesRequiredFor(CallOutcome.disqualified)).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/outcome-router.test.ts`
Expected: FAIL — `notesRequiredFor is not exported from '../outcome-router'` (or `is not a function`).

- [ ] **Step 3: Implement `notesRequiredFor`**

In `src/lib/outcome-router.ts`, immediately after the `PIPELINE_ELIGIBLE_OUTCOMES` export (after line 26, before the `CONVERSATION_TAGGED_OUTCOMES` comment on line 28), add:

```ts
// Outcomes in PIPELINE_ELIGIBLE_OUTCOMES require non-empty notes before they can be logged
export function notesRequiredFor(outcome: CallOutcome): boolean {
  return PIPELINE_ELIGIBLE_OUTCOMES.has(outcome)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/__tests__/outcome-router.test.ts`
Expected: PASS (all tests in the file, including the two new ones)

- [ ] **Step 5: Commit**

```bash
git add src/lib/outcome-router.ts src/lib/__tests__/outcome-router.test.ts
git commit -m "Add notesRequiredFor helper for pipeline-eligible outcomes"
```

---

## Task 2: `DispositionForm` — notes-required validation + locked-outcome mode

**Files:**
- Modify: `src/components/dialer/DispositionForm.tsx` (full rewrite — see Step 3)
- Test: `src/components/dialer/__tests__/DispositionForm.test.tsx` (create)

**Interfaces:**
- Consumes: `notesRequiredFor(outcome: CallOutcome): boolean` from Task 1.
- Produces: `DispositionForm` gains three new optional props consumed by Task 5 (`ProfileViewCard`):
  - `initialOutcome?: CallOutcome`
  - `lockOutcome?: boolean`
  - `onChangeOutcome?: () => void`
  - `onCancel?: () => void`
  - Existing props (`campaignId`, `onSubmit`, `loading`) and the exported `PipelineAction` type are unchanged.

- [ ] **Step 1: Write the failing tests**

Create `src/components/dialer/__tests__/DispositionForm.test.tsx`:

```tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { DispositionForm } from '../DispositionForm'

describe('DispositionForm', () => {
  it('requires notes for a pipeline-eligible outcome before Log Outcome is enabled', () => {
    render(
      <DispositionForm
        campaignId={null}
        onSubmit={vi.fn()}
        loading={false}
        initialOutcome="meeting_booked"
        lockOutcome
      />
    )
    expect(screen.getByRole('button', { name: 'Log Outcome' })).toBeDisabled()
    expect(screen.getByText('Notes required for this outcome.')).toBeInTheDocument()

    fireEvent.change(screen.getByPlaceholderText('Notes required for this outcome…'), {
      target: { value: 'Booked demo for Friday' },
    })
    expect(screen.getByRole('button', { name: 'Log Outcome' })).not.toBeDisabled()
  })

  it('does not require notes for a non-pipeline-eligible outcome', () => {
    render(
      <DispositionForm
        campaignId={null}
        onSubmit={vi.fn()}
        loading={false}
        initialOutcome="no_answer"
        lockOutcome
      />
    )
    expect(screen.getByRole('button', { name: 'Log Outcome' })).not.toBeDisabled()
    expect(screen.queryByText('Notes required for this outcome.')).not.toBeInTheDocument()
  })

  it('calls onSubmit with the outcome, notes, and no pipeline action when submitted', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(
      <DispositionForm
        campaignId={null}
        onSubmit={onSubmit}
        loading={false}
        initialOutcome="lead"
        lockOutcome
      />
    )
    fireEvent.change(screen.getByPlaceholderText('Notes required for this outcome…'), {
      target: { value: 'Interested in Q3' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Log Outcome' }))
    expect(onSubmit).toHaveBeenCalledWith('lead', 'Interested in Q3', undefined)
  })

  it('shows the locked outcome label and a Change link that calls onChangeOutcome', () => {
    const onChangeOutcome = vi.fn()
    render(
      <DispositionForm
        campaignId={null}
        onSubmit={vi.fn()}
        loading={false}
        initialOutcome="meeting_booked"
        lockOutcome
        onChangeOutcome={onChangeOutcome}
      />
    )
    expect(screen.getByText('Meeting Booked')).toBeInTheDocument()
    expect(screen.queryByText('Select outcome…')).not.toBeInTheDocument()
    fireEvent.click(screen.getByText('Change'))
    expect(onChangeOutcome).toHaveBeenCalledTimes(1)
  })

  it('renders a Cancel button that calls onCancel when provided', () => {
    const onCancel = vi.fn()
    render(
      <DispositionForm
        campaignId={null}
        onSubmit={vi.fn()}
        loading={false}
        initialOutcome="no_answer"
        lockOutcome
        onCancel={onCancel}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('shows the pipeline section for a pipeline-eligible locked outcome when campaignId is set', () => {
    render(
      <DispositionForm
        campaignId="camp1"
        onSubmit={vi.fn()}
        loading={false}
        initialOutcome="meeting_booked"
        lockOutcome
      />
    )
    expect(screen.getByText('Add to pipeline')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/dialer/__tests__/DispositionForm.test.tsx`
Expected: FAIL — `DispositionForm` doesn't accept `initialOutcome`/`lockOutcome`/`onChangeOutcome`/`onCancel` props yet (TypeScript errors under Vitest's esbuild transform will surface as the props being silently ignored, so the locked-pill assertions and notes-required assertions fail); the "Notes required for this outcome." text and "Change"/"Cancel" buttons won't exist.

- [ ] **Step 3: Replace `src/components/dialer/DispositionForm.tsx` in full**

```tsx
'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { CallOutcome } from '@prisma/client'
import { OUTCOME_COLOR, OUTCOME_LABEL, DOT_CLASS } from './outcome-colors'
import { PIPELINE_ELIGIBLE_OUTCOMES, notesRequiredFor } from '@/lib/outcome-router'
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
  campaignId:       string | null
  onSubmit:         (outcome: CallOutcome, notes: string, pipeline?: PipelineAction) => Promise<void>
  loading:          boolean
  initialOutcome?:  CallOutcome
  lockOutcome?:     boolean
  onChangeOutcome?: () => void
  onCancel?:        () => void
}

const QUEUE_FOR_LATER = '__queue__'

export function DispositionForm({
  campaignId,
  onSubmit,
  loading,
  initialOutcome,
  lockOutcome,
  onChangeOutcome,
  onCancel,
}: DispositionFormProps) {
  const [outcome,        setOutcome]        = useState<CallOutcome | ''>(initialOutcome ?? '')
  const [notes,          setNotes]          = useState('')
  const [addToPipeline,  setAddToPipeline]  = useState(false)
  const [selectedStage,  setSelectedStage]  = useState('')
  const [stages,         setStages]         = useState<PipelineStage[]>([])
  const [clientId,       setClientId]       = useState<string | null>(null)
  const [stagesLoading,  setStagesLoading]  = useState(false)
  const [stagesError,    setStagesError]    = useState(false)

  const showPipelineSection = campaignId !== null && outcome !== '' && PIPELINE_ELIGIBLE_OUTCOMES.has(outcome as CallOutcome)
  const notesRequired       = outcome !== '' && notesRequiredFor(outcome as CallOutcome)

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
    if (notesRequired && !notes.trim()) return

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
    (notesRequired && !notes.trim()) ||
    (addToPipeline && !selectedStage) ||
    (addToPipeline && stagesLoading)

  return (
    <div className="space-y-4 w-full animate-in slide-in-from-bottom-4 duration-300">
      {/* Outcome select or locked pill */}
      {lockOutcome ? (
        <div className="space-y-1.5">
          <Label className="text-xs text-[var(--text-secondary)]">Outcome</Label>
          <div className="flex items-center justify-between bg-[var(--panel-border)] border border-[var(--panel-border)] rounded-xl px-3 py-2.5">
            <span className="flex items-center gap-2 text-sm text-[var(--text-primary)]">
              {outcome !== '' && (
                <>
                  <span className={cn('w-2 h-2 rounded-full flex-shrink-0', DOT_CLASS[OUTCOME_COLOR[outcome as CallOutcome]])} />
                  {OUTCOME_LABEL[outcome as CallOutcome]}
                </>
              )}
            </span>
            {onChangeOutcome && (
              <button
                type="button"
                onClick={onChangeOutcome}
                className="text-xs text-[var(--lf-accent)] hover:underline"
              >
                Change
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-1.5">
          <Label className="text-xs text-[var(--text-secondary)]">Outcome *</Label>
          <Select
            value={outcome}
            onValueChange={(v) => {
              setOutcome((v ?? '') as CallOutcome | '')
              setAddToPipeline(false)
              setSelectedStage('')
            }}
          >
            <SelectTrigger className="bg-[var(--panel-border)] border-[var(--panel-border)] text-[var(--text-primary)] rounded-xl">
              <SelectValue>
                {(v: string | null) => {
                  if (!v) return <span className="text-[var(--text-muted)]">Select outcome…</span>
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
            <SelectContent className="rounded-xl border-[var(--panel-border)] bg-[var(--card-bg)] max-h-72 overflow-y-auto">
              {OUTCOME_OPTIONS.map((value) => {
                const color = OUTCOME_COLOR[value]
                return (
                  <SelectItem
                    key={value}
                    value={value}
                    className="text-[var(--text-secondary)] focus:bg-[var(--panel-border-hover)] focus:text-[var(--text-primary)] rounded-lg"
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
      )}

      {/* Notes */}
      <div className="space-y-1.5">
        <Label className="text-xs text-[var(--text-secondary)]">
          Notes {notesRequired && <span className="text-red-400">*</span>}
        </Label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder={notesRequired ? 'Notes required for this outcome…' : 'Optional notes…'}
          rows={3}
          className="w-full bg-[var(--panel-border)] border border-[var(--panel-border)] rounded-xl px-3 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] resize-none focus:outline-none focus:border-[var(--lf-accent)]/50 focus:ring-1 focus:ring-[var(--lf-accent)]/10"
        />
        {notesRequired && !notes.trim() && (
          <p className="text-[11px] text-red-400">Notes required for this outcome.</p>
        )}
      </div>

      {/* Add to pipeline section */}
      {showPipelineSection && (
        <div className="border border-[var(--panel-border)] rounded-xl p-3 space-y-3 bg-white/[0.02]">
          <div className="flex items-center justify-between">
            <Label className="text-xs text-[var(--text-secondary)] cursor-pointer" htmlFor="pipeline-toggle">
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
                'relative w-9 h-5 rounded-full flex-shrink-0',
                addToPipeline ? 'bg-[var(--lf-accent)]' : 'bg-[var(--panel-border)]'
              )}
            >
              <span
                className={cn(
                  'absolute top-0.5 left-0 w-4 h-4 bg-white rounded-full shadow',
                  addToPipeline ? 'translate-x-[18px]' : 'translate-x-0.5'
                )}
              />
            </button>
          </div>

          {addToPipeline && (
            <div className="space-y-1.5">
              {stagesLoading ? (
                <div className="h-9 bg-[var(--panel-border)] rounded-xl animate-pulse" />
              ) : stagesError ? (
                <div className="flex items-center justify-between">
                  <p className="text-xs text-red-400">Failed to load stages</p>
                  <button
                    type="button"
                    onClick={() => {
                      setAddToPipeline(false)
                      setTimeout(() => setAddToPipeline(true), 0)
                    }}
                    className="text-xs text-[var(--lf-accent)] hover:underline"
                  >
                    Retry
                  </button>
                </div>
              ) : (
                <Select value={selectedStage} onValueChange={(v) => setSelectedStage(v ?? '')}>
                  <SelectTrigger className="bg-[var(--panel-border)] border-[var(--panel-border)] text-[var(--text-primary)] rounded-xl">
                    <SelectValue>
                      {(v: string | null) => {
                        if (!v) return <span className="text-[var(--text-muted)]">Select stage…</span>
                        if (v === QUEUE_FOR_LATER) return <span className="text-[var(--text-secondary)]">Queue for later</span>
                        const stage = stages.find((s) => s.id === v)
                        return <span className="text-[var(--text-secondary)]">{stage?.name ?? v}</span>
                      }}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent className="rounded-xl border-[var(--panel-border)] bg-[var(--card-bg)]">
                    <SelectItem
                      value={QUEUE_FOR_LATER}
                      className="text-[var(--text-secondary)] focus:bg-[var(--panel-border-hover)] focus:text-[var(--text-primary)] rounded-lg italic"
                    >
                      Queue for later
                    </SelectItem>
                    {stages.map((s) => (
                      <SelectItem
                        key={s.id}
                        value={s.id}
                        className="text-[var(--text-secondary)] focus:bg-[var(--panel-border-hover)] focus:text-[var(--text-primary)] rounded-lg"
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

      <div className="flex gap-2">
        {onCancel && (
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            className="flex-1 rounded-xl"
          >
            Cancel
          </Button>
        )}
        <Button
          type="button"
          onClick={handleSubmit}
          disabled={submitDisabled}
          className={cn(
            'bg-gradient-to-r from-[var(--lf-accent)] to-amber-600 text-black font-semibold rounded-xl hover:opacity-90 disabled:opacity-50',
            onCancel ? 'flex-1' : 'w-full'
          )}
        >
          {loading ? 'Logging…' : 'Log Outcome'}
        </Button>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/components/dialer/__tests__/DispositionForm.test.tsx`
Expected: PASS (all 6 tests)

- [ ] **Step 5: Run the full test suite to check for regressions**

Run: `npx vitest run`
Expected: PASS — in particular no regression in any existing test that renders `DispositionForm` (none currently exist, but `CallControls.tsx` uses it unchanged since none of its props changed meaning, only new optional ones were added).

- [ ] **Step 6: Commit**

```bash
git add src/components/dialer/DispositionForm.tsx src/components/dialer/__tests__/DispositionForm.test.tsx
git commit -m "Add notes-required validation and locked-outcome mode to DispositionForm"
```

---

## Task 3: Server-side notes-required enforcement in `/api/dialer/log-outcome`

**Files:**
- Modify: `src/app/api/dialer/log-outcome/route.ts:6, 46-55`

**Interfaces:**
- Consumes: `notesRequiredFor(outcome: CallOutcome): boolean` from Task 1.

- [ ] **Step 1: Add the import**

In `src/app/api/dialer/log-outcome/route.ts`, change line 6 from:

```ts
import { routeOutcome, CONVERSATION_TAGGED_OUTCOMES, DEFAULT_DIALER_THRESHOLDS } from '@/lib/outcome-router'
```

to:

```ts
import { routeOutcome, CONVERSATION_TAGGED_OUTCOMES, DEFAULT_DIALER_THRESHOLDS, notesRequiredFor } from '@/lib/outcome-router'
```

- [ ] **Step 2: Add the validation check**

Find this block (currently lines 48-54):

```ts
    if (!manual && !callRecordId) {
      return NextResponse.json({ error: 'callRecordId required' }, { status: 400 })
    }
    if (manual && !campaignId) {
      return NextResponse.json({ error: 'campaignId required for manual outcomes' }, { status: 400 })
    }

    const typedOutcome       = outcome as CallOutcome
```

Replace it with:

```ts
    if (!manual && !callRecordId) {
      return NextResponse.json({ error: 'callRecordId required' }, { status: 400 })
    }
    if (manual && !campaignId) {
      return NextResponse.json({ error: 'campaignId required for manual outcomes' }, { status: 400 })
    }
    if (notesRequiredFor(outcome as CallOutcome) && !(notes ?? '').trim()) {
      return NextResponse.json({ error: 'Notes are required for this outcome' }, { status: 400 })
    }

    const typedOutcome       = outcome as CallOutcome
```

- [ ] **Step 3: Verify types compile**

Run: `npx tsc --noEmit`
Expected: no new errors from `src/app/api/dialer/log-outcome/route.ts`.

- [ ] **Step 4: Manual verification against the running dev server**

This repo has no existing test harness for API routes (only `src/lib` and `src/stores` have Vitest coverage; `notesRequiredFor` itself is already unit-tested in Task 1). Verify the guard manually:

1. Run `npm run dev` and sign in to the app in a browser.
2. Open the browser devtools console on any authenticated page and run (substituting a real `campaignId` and `contactId` from your dev database — e.g. from the Network tab on the Calling page):

```js
fetch('/api/dialer/log-outcome', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    manual: true,
    campaignId: '<real campaign id>',
    outcome: 'meeting_booked',
    notes: '',
    contactId: '<real contact id>',
  }),
}).then(async (r) => console.log(r.status, await r.json()))
```

Expected: logs `400 { error: 'Notes are required for this outcome' }`.

3. Re-run the same fetch with `notes: 'Booked for Friday'` instead of `''`.

Expected: logs `200 { data: { success: true, callRecord: { ... } } }`.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/dialer/log-outcome/route.ts
git commit -m "Enforce notes-required rule server-side in log-outcome route"
```

---

## Task 4: `ProfileActionBar` — outcome selection bubbles up instead of logging instantly

**Files:**
- Modify: `src/components/dialer/ProfileActionBar.tsx` (full rewrite — see Step 3)
- Test: `src/components/dialer/__tests__/ProfileActionBar.test.tsx` (create)

**Interfaces:**
- Consumes: `useDialerStore` (`logManualOutcome`, used only for the No Answer path), `OutcomeSearchDropdown` (unchanged), `OUTCOME_LABEL` from `./outcome-colors`.
- Produces: New `ProfileActionBarProps` shape, consumed by Task 5 (`ProfileViewCard`):

```ts
interface ProfileActionBarProps {
  contact:         ContactSummary
  onNext:          () => void
  onOpenNotes:     () => void
  noteCount:       number
  confirmed:       { outcome: CallOutcome; notes: string } | null
  onOutcomeChosen: (outcome: CallOutcome) => void
}
```

`onOutcomeLogged` is removed (it was already a no-op). When `confirmed` is non-null, the component renders a confirmation summary + Next button instead of the icon row.

- [ ] **Step 1: Write the failing tests**

Create `src/components/dialer/__tests__/ProfileActionBar.test.tsx`:

```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ProfileActionBar } from '../ProfileActionBar'
import { useDialerStore } from '@/stores/dialer-store'
import type { ContactSummary } from '@/types/models'
import type { CallOutcome } from '@prisma/client'

const contact: ContactSummary = {
  id: 'c1', firstName: 'John', lastName: 'Doe', mobilePhone: null,
  corporatePhone: null, companyName: 'Acme', status: 'prospect',
  jobTitle: 'VP', employeeCount: null, linkedinUrl: null, website: null,
  email: null, country: null, city: null, callHistory: [],
}

describe('ProfileActionBar', () => {
  beforeEach(() => {
    useDialerStore.setState({ campaignId: 'camp1', currentContact: contact, queue: [], calledToday: [] })
    global.fetch = vi.fn().mockResolvedValue({
      ok:   true,
      json: async () => ({
        data: {
          callRecord: {
            id: 'r1', outcome: 'no_answer', notes: null,
            createdAt: new Date().toISOString(), callerName: 'Rep',
          },
        },
      }),
    })
  })

  it('calls onOutcomeChosen instead of logging when an outcome is picked from the dropdown', () => {
    const onOutcomeChosen = vi.fn()
    render(
      <ProfileActionBar
        contact={contact}
        onNext={vi.fn()}
        onOpenNotes={vi.fn()}
        noteCount={0}
        confirmed={null}
        onOutcomeChosen={onOutcomeChosen}
      />
    )
    fireEvent.click(screen.getByTitle('Log a call outcome'))
    fireEvent.click(screen.getByText('Meeting Booked'))
    expect(onOutcomeChosen).toHaveBeenCalledWith('meeting_booked')
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('still logs No Answer immediately via the store', async () => {
    render(
      <ProfileActionBar
        contact={contact}
        onNext={vi.fn()}
        onOpenNotes={vi.fn()}
        noteCount={0}
        confirmed={null}
        onOutcomeChosen={vi.fn()}
      />
    )
    fireEvent.click(screen.getByTitle('Mark as No Answer — no outcome required'))
    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith('/api/dialer/log-outcome', expect.objectContaining({ method: 'POST' }))
    )
    expect(screen.getByText('Marked as No Answer — outcome not required')).toBeInTheDocument()
  })

  it('renders a confirmation summary and hides the icon row when confirmed is set', () => {
    render(
      <ProfileActionBar
        contact={contact}
        onNext={vi.fn()}
        onOpenNotes={vi.fn()}
        noteCount={0}
        confirmed={{ outcome: 'meeting_booked' as CallOutcome, notes: 'Booked for Tuesday' }}
        onOutcomeChosen={vi.fn()}
      />
    )
    expect(screen.getByText(/Logged: Meeting Booked/)).toBeInTheDocument()
    expect(screen.getByText('Booked for Tuesday')).toBeInTheDocument()
    expect(screen.queryByTitle('Log a call outcome')).not.toBeInTheDocument()
  })

  it('calls onNext when Next is clicked in the confirmed state', () => {
    const onNext = vi.fn()
    render(
      <ProfileActionBar
        contact={contact}
        onNext={onNext}
        onOpenNotes={vi.fn()}
        noteCount={0}
        confirmed={{ outcome: 'meeting_booked' as CallOutcome, notes: '' }}
        onOutcomeChosen={vi.fn()}
      />
    )
    fireEvent.click(screen.getByText('Next'))
    expect(onNext).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/dialer/__tests__/ProfileActionBar.test.tsx`
Expected: FAIL — current `ProfileActionBar` calls `logManualOutcome` directly on outcome selection (so `global.fetch` IS called, failing the first test) and has no `confirmed` prop (so the confirmation tests find no matching text).

- [ ] **Step 3: Replace `src/components/dialer/ProfileActionBar.tsx` in full**

```tsx
'use client'

import { useState } from 'react'
import { CircleX, CircleDashed, MessageSquare, ArrowRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useDialerStore } from '@/stores/dialer-store'
import type { CallOutcome } from '@prisma/client'
import type { ContactSummary } from '@/types/models'
import { OutcomeSearchDropdown } from './OutcomeSearchDropdown'
import { OUTCOME_LABEL } from './outcome-colors'

interface ProfileActionBarProps {
  contact:         ContactSummary
  onNext:          () => void
  onOpenNotes:     () => void
  noteCount:       number
  confirmed:       { outcome: CallOutcome; notes: string } | null
  onOutcomeChosen: (outcome: CallOutcome) => void
}

interface IconButtonProps {
  icon:        React.ReactNode
  label:       string
  tooltip:     string
  onClick?:    () => void
  disabled?:   boolean
  highlighted?: 'noAnswer' | 'notes'
  badge?:       number
  children?:   React.ReactNode
}

function IconButton({
  icon,
  label,
  tooltip,
  onClick,
  disabled,
  highlighted,
  badge,
  children,
}: IconButtonProps) {
  const circleStyle: React.CSSProperties =
    highlighted === 'noAnswer'
      ? { background: '#3a2118', border: '1.5px solid #d98a5f' }
      : highlighted === 'notes'
      ? { background: '#16281f', border: '1.5px solid #5fa87f' }
      : { background: 'transparent', border: '1.5px solid rgba(255,255,255,0.1)' }

  const iconColor =
    disabled && !highlighted
      ? '#4a4535'
      : highlighted === 'noAnswer'
      ? '#e08a7c'
      : highlighted === 'notes'
      ? '#7dd6ab'
      : 'var(--text-secondary)'

  const labelColor =
    disabled && !highlighted
      ? '#4a4535'
      : highlighted
      ? iconColor
      : 'var(--text-secondary)'

  return (
    <div className="relative flex flex-col items-center gap-1">
      <button
        type="button"
        title={tooltip}
        onClick={disabled ? undefined : onClick}
        disabled={disabled}
        style={{ ...circleStyle, width: 52, height: 52, borderRadius: '50%', color: iconColor }}
        className={cn(
          'flex items-center justify-center transition-all',
          disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:brightness-110',
        )}
      >
        {icon}
      </button>

      {/* Note count badge */}
      {badge != null && badge > 0 && (
        <div
          className="absolute -top-1 -right-1 flex items-center justify-center rounded-full text-[10px] font-semibold pointer-events-none"
          style={{
            width:      17,
            height:     17,
            background: '#5fa87f',
            color:      '#0d1a13',
          }}
        >
          {badge}
        </div>
      )}

      <span className="text-[10px]" style={{ color: labelColor }}>
        {label}
      </span>

      {/* Dropdown slot (OutcomeSearchDropdown) */}
      {children}
    </div>
  )
}

export function ProfileActionBar({
  contact,
  onNext,
  onOpenNotes,
  noteCount,
  confirmed,
  onOutcomeChosen,
}: ProfileActionBarProps) {
  const logManualOutcome = useDialerStore((s) => s.logManualOutcome)

  const [noAnswerSelected, setNoAnswerSelected] = useState(false)
  const [outcomeDropOpen,  setOutcomeDropOpen]  = useState(false)
  const [loading,          setLoading]          = useState(false)

  /* ── No Answer ─────────────────────────────────────────────── */
  const handleNoAnswer = async () => {
    if (loading) return

    if (noAnswerSelected) {
      // Toggle off — deselect without logging again
      setNoAnswerSelected(false)
      return
    }

    setLoading(true)
    try {
      await logManualOutcome(contact.id, 'no_answer' as CallOutcome, '')
      setNoAnswerSelected(true)
    } finally {
      setLoading(false)
    }
  }

  /* ── Outcome ────────────────────────────────────────────────── */
  const handleOutcomeSelect = (outcome: CallOutcome) => {
    setOutcomeDropOpen(false)
    onOutcomeChosen(outcome)
  }

  const outcomeDisabled = noAnswerSelected || loading

  if (confirmed) {
    return (
      <div className="flex flex-col gap-3 pt-4 border-t border-[var(--panel-border-hover)]">
        <div
          className="flex flex-col gap-1"
          style={{ background: '#16281f', border: '0.5px solid #234534', borderRadius: 12, padding: '10px 12px' }}
        >
          <span style={{ color: '#7dd6ab', fontSize: 11, fontWeight: 600 }}>
            Logged: {OUTCOME_LABEL[confirmed.outcome]}
          </span>
          {confirmed.notes && (
            <span style={{ color: 'var(--text-secondary)', fontSize: 11 }}>
              {confirmed.notes}
            </span>
          )}
        </div>
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onNext}
            className="flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold transition-opacity"
            style={{ background: 'var(--lf-accent)', color: 'var(--bg-dark)' }}
          >
            Next
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3 pt-4 border-t border-[var(--panel-border-hover)]">
      {/* Status chip — shown when No Answer is selected */}
      {noAnswerSelected && (
        <div
          style={{
            background:   '#2b201a',
            border:       '0.5px solid #3d2c22',
            borderRadius: 9999,
            padding:      '6px 10px',
          }}
        >
          <span style={{ color: '#d98a5f', fontSize: 11 }}>
            Marked as No Answer — outcome not required
          </span>
        </div>
      )}

      {/* Button row */}
      <div className="flex items-center gap-3">
        {/* Left group: No Answer + Outcome + Notes */}
        <div className="flex items-end gap-4">
          {/* No Answer */}
          <IconButton
            icon={<CircleX className="w-5 h-5" />}
            label="No Answer"
            tooltip="Mark as No Answer — no outcome required"
            onClick={handleNoAnswer}
            disabled={loading}
            highlighted={noAnswerSelected ? 'noAnswer' : undefined}
          />

          {/* Outcome */}
          <IconButton
            icon={<CircleDashed className="w-5 h-5" />}
            label="Outcome"
            tooltip="Log a call outcome"
            onClick={() => {
              if (!outcomeDisabled) setOutcomeDropOpen((v) => !v)
            }}
            disabled={outcomeDisabled}
          >
            {outcomeDropOpen && (
              <OutcomeSearchDropdown
                onSelect={handleOutcomeSelect}
                onClose={() => setOutcomeDropOpen(false)}
              />
            )}
          </IconButton>

          {/* Notes */}
          <IconButton
            icon={<MessageSquare className="w-5 h-5" />}
            label="Notes"
            tooltip="Add or view notes"
            onClick={onOpenNotes}
            highlighted={noteCount > 0 ? 'notes' : undefined}
            badge={noteCount}
          />
        </div>

        {/* Divider */}
        <div className="w-px h-8 mx-2" style={{ background: 'var(--panel-border-hover)' }} />

        {/* Next */}
        <button
          type="button"
          onClick={onNext}
          disabled={loading}
          className="flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold transition-opacity disabled:opacity-50"
          style={{ background: 'var(--lf-accent)', color: 'var(--bg-dark)' }}
        >
          Next
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/components/dialer/__tests__/ProfileActionBar.test.tsx`
Expected: PASS (all 4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/components/dialer/ProfileActionBar.tsx src/components/dialer/__tests__/ProfileActionBar.test.tsx
git commit -m "ProfileActionBar: bubble up outcome selection instead of logging instantly"
```

*(Note: this commit intentionally leaves `ProfileActionBar` unused by `ProfileViewCard` in its old form — Task 5 updates the caller in the same file tree; run the full suite again after Task 5 to confirm integration.)*

---

## Task 5: `ProfileViewCard` — disposition state machine (pending → pinned → Next)

**Files:**
- Modify: `src/components/dialer/ProfileViewCard.tsx` (full rewrite — see Step 3)
- Test: `src/components/dialer/__tests__/ProfileViewCard.test.tsx` (create)

**Interfaces:**
- Consumes: `DispositionForm` (Task 2, with `initialOutcome`/`lockOutcome`/`onChangeOutcome`/`onCancel`), `ProfileActionBar` (Task 4, with `confirmed`/`onOutcomeChosen`), `useDialerStore` (`logManualOutcome`, `advanceProfile`, `setCallingView`, `loadQueue` via `getState()`).
- Produces: `ProfileViewCardProps` gains a required `campaignId: string | null` field, consumed by Task 6 (`QueuePanel`).

- [ ] **Step 1: Write the failing tests**

Create `src/components/dialer/__tests__/ProfileViewCard.test.tsx`:

```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ProfileViewCard } from '../ProfileViewCard'
import { useDialerStore } from '@/stores/dialer-store'
import type { ContactSummary } from '@/types/models'

const contact: ContactSummary = {
  id: 'c1', firstName: 'John', lastName: 'Doe', mobilePhone: '555-1000',
  corporatePhone: null, companyName: 'Acme', status: 'prospect',
  jobTitle: 'VP', employeeCount: null, linkedinUrl: null, website: null,
  email: null, country: null, city: null, callHistory: [],
}

function mockFetch() {
  return vi.fn((url: string) => {
    if (url.includes('/notes')) {
      return Promise.resolve({ ok: true, json: async () => ({ data: [] }) })
    }
    if (url.includes('/api/dialer/log-outcome')) {
      return Promise.resolve({
        ok:   true,
        json: async () => ({
          data: {
            callRecord: {
              id: 'r1', outcome: 'meeting_booked', notes: 'Booked demo for Friday',
              createdAt: new Date().toISOString(), callerName: 'Rep',
            },
          },
        }),
      })
    }
    return Promise.resolve({ ok: true, json: async () => ({ data: {} }) })
  }) as unknown as typeof fetch
}

describe('ProfileViewCard — outcome disposition flow', () => {
  beforeEach(() => {
    global.fetch = mockFetch()
    useDialerStore.setState({
      campaignId:     'camp1',
      currentContact: contact,
      queue:          [],
      calledToday:    [],
      totalContacts:  1,
      advanceProfile: vi.fn(async () => {}),
    })
  })

  it('opens the disposition form instead of logging immediately when an outcome is picked', () => {
    render(<ProfileViewCard contact={contact} contactIndex={0} totalContacts={1} campaignId="camp1" />)

    fireEvent.click(screen.getByTitle('Log a call outcome'))
    fireEvent.click(screen.getByText('Meeting Booked'))

    expect(screen.getByRole('button', { name: 'Log Outcome' })).toBeDisabled()
    expect(screen.getByText('Notes required for this outcome.')).toBeInTheDocument()
  })

  it('logs the outcome and shows a confirmation for the same contact instead of advancing', async () => {
    render(<ProfileViewCard contact={contact} contactIndex={0} totalContacts={1} campaignId="camp1" />)

    fireEvent.click(screen.getByTitle('Log a call outcome'))
    fireEvent.click(screen.getByText('Meeting Booked'))
    fireEvent.change(screen.getByPlaceholderText('Notes required for this outcome…'), {
      target: { value: 'Booked demo for Friday' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Log Outcome' }))

    await waitFor(() => expect(screen.getByText(/Logged: Meeting Booked/)).toBeInTheDocument())
    expect(screen.getByText('John Doe')).toBeInTheDocument()
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/dialer/log-outcome',
      expect.objectContaining({ body: expect.stringContaining('"outcome":"meeting_booked"') })
    )
  })

  it('does not call advanceProfile when Next clears a confirmation', async () => {
    render(<ProfileViewCard contact={contact} contactIndex={0} totalContacts={1} campaignId="camp1" />)

    fireEvent.click(screen.getByTitle('Log a call outcome'))
    fireEvent.click(screen.getByText('Meeting Booked'))
    fireEvent.change(screen.getByPlaceholderText('Notes required for this outcome…'), {
      target: { value: 'Booked demo for Friday' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Log Outcome' }))
    await waitFor(() => expect(screen.getByText(/Logged: Meeting Booked/)).toBeInTheDocument())

    fireEvent.click(screen.getByText('Next'))

    expect(useDialerStore.getState().advanceProfile).not.toHaveBeenCalled()
  })

  it('calls advanceProfile when Next is clicked without a prior disposition', () => {
    render(<ProfileViewCard contact={contact} contactIndex={0} totalContacts={1} campaignId="camp1" />)

    fireEvent.click(screen.getByText('Next'))

    expect(useDialerStore.getState().advanceProfile).toHaveBeenCalledTimes(1)
  })

  it('Cancel in the disposition form returns to the icon row without logging', () => {
    render(<ProfileViewCard contact={contact} contactIndex={0} totalContacts={1} campaignId="camp1" />)

    fireEvent.click(screen.getByTitle('Log a call outcome'))
    fireEvent.click(screen.getByText('Meeting Booked'))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(screen.getByTitle('Log a call outcome')).toBeInTheDocument()
    expect(global.fetch).not.toHaveBeenCalledWith('/api/dialer/log-outcome', expect.anything())
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/dialer/__tests__/ProfileViewCard.test.tsx`
Expected: FAIL — current `ProfileViewCard` doesn't accept a `campaignId` prop, doesn't render `DispositionForm`, and `ProfileActionBar`'s outcome click still logs instantly (via the old Task-4-superseded behavior) rather than opening a form.

- [ ] **Step 3: Replace `src/components/dialer/ProfileViewCard.tsx` in full**

```tsx
'use client'

import { useEffect, useRef, useState } from 'react'
import { MapPin, Clock, Copy, Check, ChevronDown, ArrowLeft } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useDialerStore } from '@/stores/dialer-store'
import { getCityTimezone, formatLocalTime } from '@/lib/timezone'
import type { ContactSummary } from '@/types/models'
import type { CallOutcome } from '@prisma/client'
import { ProfileCompanyCard } from './ProfileCompanyCard'
import { ProfileActionBar } from './ProfileActionBar'
import { ContactNotesModal } from './ContactNotesModal'
import { DispositionForm } from './DispositionForm'
import type { PipelineAction } from './DispositionForm'
import { OUTCOME_LABEL, OUTCOME_COLOR, TEXT_CLASS } from './outcome-colors'

type NoteEntry = {
  id:         string
  type:       'call' | 'note'
  callerName: string
  createdAt:  string
  outcome:    string | null
  content:    string
}

interface ProfileViewCardProps {
  contact:       ContactSummary
  contactIndex:  number
  totalContacts: number
  campaignId:    string | null
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try { await navigator.clipboard.writeText(value) } catch { /* ignore */ }
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <button onClick={handleCopy} className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors flex-shrink-0">
      {copied
        ? <Check className="w-3 h-3 text-emerald-400" />
        : <Copy className="w-3 h-3" />
      }
    </button>
  )
}

function ContactInfoCard({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div
      className="flex flex-col gap-1 rounded-[10px] px-[14px] py-3"
      style={{ background: 'var(--card-bg-solid)', border: '0.5px solid var(--panel-border-hover)' }}
    >
      <p className="text-[11px] text-[var(--text-muted)]">{label}</p>
      <div className="flex items-center justify-between gap-2">
        <p className={cn('text-[14px] text-[var(--text-primary)] truncate', mono && 'font-mono')}>{value}</p>
        <CopyButton value={value} />
      </div>
    </div>
  )
}

export function ProfileViewCard({ contact, contactIndex, totalContacts, campaignId }: ProfileViewCardProps) {
  const { setCallingView, advanceProfile, logManualOutcome } = useDialerStore()

  const [localTime,     setLocalTime]     = useState<string | null>(null)
  const [noteEntries,   setNoteEntries]   = useState<NoteEntry[] | null>(null)
  const [activityOpen,  setActivityOpen]  = useState(false)
  const [notesOpen,     setNotesOpen]     = useState(false)
  const [noteCount,     setNoteCount]     = useState(0)

  // Outcome chosen from the action bar's search dropdown, awaiting notes/pipeline before it's logged
  const [pendingOutcome,     setPendingOutcome]     = useState<CallOutcome | null>(null)
  const [dispositionLoading, setDispositionLoading] = useState(false)
  // Snapshot of the just-logged disposition — keeps the same contact on screen until Next is clicked
  const [pinned, setPinned] = useState<{ contact: ContactSummary; outcome: CallOutcome; notes: string } | null>(null)

  const displayContact = pinned?.contact ?? contact

  // Per-contact notes cache: keyed by contact id
  const notesCacheRef = useRef<Record<string, NoteEntry[]>>({})
  const intervalRef   = useRef<ReturnType<typeof setInterval> | null>(null)

  const fullName    = `${displayContact.firstName} ${displayContact.lastName}`
  const linkedinHref = displayContact.linkedinUrl
    ? (displayContact.linkedinUrl.startsWith('http') ? displayContact.linkedinUrl : `https://${displayContact.linkedinUrl}`)
    : null
  const locationLabel = [displayContact.city, displayContact.country].filter(Boolean).join(', ')

  // Live local time — recompute when contact.city / country changes
  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current)
    setLocalTime(null)

    if (!displayContact.city) return
    const tz = getCityTimezone(displayContact.city, displayContact.country)
    if (!tz) return

    const tick = () => setLocalTime(formatLocalTime(tz))
    tick()
    intervalRef.current = setInterval(tick, 60_000)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [displayContact.city, displayContact.country])

  // Reset per-contact state when the displayed contact changes
  useEffect(() => {
    setNotesOpen(false)
    setActivityOpen(false)
    setNoteCount(0)

    // Check cache first
    const cached = notesCacheRef.current[displayContact.id]
    if (cached) {
      setNoteEntries(cached)
      setNoteCount(cached.filter((e) => e.type === 'note').length)
      return
    }

    // Fetch fresh
    setNoteEntries(null)
    fetch(`/api/contacts/${displayContact.id}/notes`)
      .then((r) => r.json())
      .then(({ data }) => {
        const entries: NoteEntry[] = data ?? []
        notesCacheRef.current[displayContact.id] = entries
        setNoteEntries(entries)
        setNoteCount(entries.filter((e) => e.type === 'note').length)
      })
      .catch(() => {
        setNoteEntries([])
      })
  }, [displayContact.id])

  const callCount = noteEntries?.filter((e) => e.type === 'call').length ?? 0

  const handleNoteSaved = () => {
    setNoteCount((c) => c + 1)
    // Invalidate cache so next open re-fetches
    delete notesCacheRef.current[displayContact.id]
  }

  const handleDispositionSubmit = async (outcome: CallOutcome, notes: string, pipeline?: PipelineAction) => {
    setDispositionLoading(true)
    try {
      await logManualOutcome(displayContact.id, outcome, notes, pipeline)
      setPendingOutcome(null)
      setPinned({ contact: displayContact, outcome, notes })

      // logManualOutcome doesn't replenish the local queue the way logOutcome does for
      // list view — top it up here so the profile view doesn't run out of loaded contacts
      // while the SDR stays on the pin-then-Next flow without ever triggering advanceProfile.
      const { queue, currentContact, totalContacts: liveTotal, loadQueue } = useDialerStore.getState()
      const loadedCount = (currentContact ? 1 : 0) + queue.length
      if (loadedCount < 5 && loadedCount < liveTotal) {
        await loadQueue(loadedCount)
      }
    } finally {
      setDispositionLoading(false)
    }
  }

  const handleNext = () => {
    if (pinned) {
      // The store already advanced the queue when the disposition was logged —
      // clearing the pin is enough, calling advanceProfile here would skip a contact.
      setPinned(null)
      return
    }
    advanceProfile()
  }

  return (
    <div className="max-w-[720px] mx-auto w-full px-6 py-6 overflow-y-auto flex flex-col gap-4">

      {/* Top row: back | counter | location */}
      <div className="flex items-start justify-between gap-4">
        <button
          onClick={() => setCallingView('list')}
          className="flex items-center gap-1 text-[12px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors flex-shrink-0"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Queue
        </button>

        <p className="text-[12px] text-[var(--text-secondary)] flex-shrink-0 pt-0.5">
          Contact {contactIndex + 1} of {totalContacts}
        </p>

        {locationLabel ? (
          <div className="flex flex-col items-end gap-1">
            <div
              className="flex items-center gap-1 px-2.5 py-1 rounded-full"
              style={{ background: 'var(--card-bg-solid)', border: '0.5px solid var(--panel-border-hover)' }}
            >
              <MapPin className="w-[10px] h-[10px] text-[var(--lf-accent)] flex-shrink-0" />
              <span className="text-[11px] text-[var(--text-secondary)]">{locationLabel}</span>
            </div>
            {localTime && (
              <div className="flex items-center gap-1">
                <Clock className="w-[10px] h-[10px] text-[var(--text-muted)]" />
                <span className="text-[11px] text-[var(--text-muted)]">{localTime} local</span>
              </div>
            )}
          </div>
        ) : (
          <div className="w-20" />
        )}
      </div>

      {/* Name block */}
      <div className="flex flex-col items-center gap-1 mt-4">
        <div className="flex items-center gap-2">
          <p className="text-[26px] font-semibold text-[var(--text-primary)] leading-tight">
            {fullName}
          </p>
          {linkedinHref && (
            <a
              href={linkedinHref}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center w-6 h-6 rounded-full flex-shrink-0 hover:opacity-80 transition-opacity"
              style={{ background: 'var(--card-bg-solid)', border: '0.5px solid var(--panel-border-hover)' }}
              title="LinkedIn"
            >
              <svg className="w-3.5 h-3.5 text-[var(--lf-accent)]" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.32 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.79M6.88 8.56a1.68 1.68 0 0 0 1.68-1.68c0-.93-.75-1.69-1.68-1.69a1.69 1.69 0 0 0-1.69 1.69c0 .93.76 1.68 1.69 1.68m1.39 9.94v-8.37H5.5v8.37h2.77z"/>
              </svg>
            </a>
          )}
        </div>
        {displayContact.jobTitle && (
          <p className="text-[14px] text-[var(--text-secondary)]">{displayContact.jobTitle}</p>
        )}
      </div>

      {/* Contact info cards */}
      {(displayContact.mobilePhone || displayContact.email) && (
        <div className="grid grid-cols-2 gap-3">
          {displayContact.mobilePhone && (
            <ContactInfoCard label="Mobile" value={displayContact.mobilePhone} mono />
          )}
          {displayContact.email && (
            <ContactInfoCard label="Email" value={displayContact.email} />
          )}
        </div>
      )}

      {/* Company card */}
      <ProfileCompanyCard contact={displayContact} />

      {/* Activity section */}
      <div>
        <button
          onClick={() => setActivityOpen((v) => !v)}
          className="w-full flex items-center justify-between rounded-[10px] px-[14px] py-[10px] transition-colors hover:bg-white/[0.02]"
          style={{ background: 'var(--card-bg-solid)', border: '0.5px solid var(--panel-border-hover)' }}
        >
          <span className="text-[12px] text-[var(--text-secondary)]">
            Activity — {callCount} prior attempt{callCount !== 1 ? 's' : ''}
          </span>
          <ChevronDown
            className={cn('w-3.5 h-3.5 text-[var(--text-muted)] transition-transform duration-150', activityOpen && 'rotate-180')}
          />
        </button>

        {activityOpen && (
          <div
            className="mt-1 rounded-[10px] overflow-hidden"
            style={{ border: '0.5px solid var(--panel-border-hover)' }}
          >
            {!noteEntries ? (
              <div className="px-4 py-6 text-center text-[12px] text-[var(--text-muted)]">Loading…</div>
            ) : noteEntries.length === 0 ? (
              <div className="px-4 py-6 text-center text-[12px] text-[var(--text-muted)]">No activity yet</div>
            ) : (
              <ul style={{ background: 'var(--card-bg-solid)' }}>
                {noteEntries.map((entry, i) => {
                  const date = new Date(entry.createdAt).toLocaleString('en-GB', {
                    day: '2-digit', month: 'short', year: '2-digit',
                    hour: '2-digit', minute: '2-digit',
                  })
                  const outcomeKey = entry.outcome as keyof typeof OUTCOME_LABEL | null
                  return (
                    <li
                      key={entry.id}
                      className={cn('px-4 py-3', i < noteEntries.length - 1 && 'border-b')}
                      style={{ borderColor: 'var(--panel-border-hover)' }}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[12px] font-semibold text-[var(--text-primary)]">{entry.callerName}</span>
                            {outcomeKey && OUTCOME_LABEL[outcomeKey] && (
                              <span className={cn(
                                'text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-[var(--panel-border)]',
                                TEXT_CLASS[OUTCOME_COLOR[outcomeKey]],
                              )}>
                                {OUTCOME_LABEL[outcomeKey]}
                              </span>
                            )}
                            {entry.type === 'note' && (
                              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-[var(--panel-border)] text-[var(--text-muted)]">
                                Note
                              </span>
                            )}
                          </div>
                          {entry.content && (
                            <p className="text-[13px] text-[var(--text-secondary)] mt-1">{entry.content}</p>
                          )}
                        </div>
                        <span className="text-[10px] text-[var(--text-muted)] flex-shrink-0 mt-0.5">{date}</span>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        )}
      </div>

      {/* Action bar / disposition form */}
      {pendingOutcome ? (
        <DispositionForm
          campaignId={campaignId}
          initialOutcome={pendingOutcome}
          lockOutcome
          onChangeOutcome={() => setPendingOutcome(null)}
          onCancel={() => setPendingOutcome(null)}
          onSubmit={handleDispositionSubmit}
          loading={dispositionLoading}
        />
      ) : (
        <ProfileActionBar
          key={displayContact.id}
          contact={displayContact}
          onNext={handleNext}
          onOpenNotes={() => setNotesOpen(true)}
          noteCount={noteCount}
          confirmed={pinned ? { outcome: pinned.outcome, notes: pinned.notes } : null}
          onOutcomeChosen={setPendingOutcome}
        />
      )}

      {/* Notes modal */}
      <ContactNotesModal
        contactId={displayContact.id}
        contactName={fullName}
        open={notesOpen}
        onClose={() => setNotesOpen(false)}
        hideOutcome={true}
        onNoteSaved={handleNoteSaved}
      />
    </div>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/components/dialer/__tests__/ProfileViewCard.test.tsx`
Expected: PASS (all 5 tests)

- [ ] **Step 5: Run the full test suite**

Run: `npx vitest run`
Expected: PASS — including Task 4's `ProfileActionBar.test.tsx` (now exercised as intended by its actual caller) and Task 2's `DispositionForm.test.tsx`.

- [ ] **Step 6: Commit**

```bash
git add src/components/dialer/ProfileViewCard.tsx src/components/dialer/__tests__/ProfileViewCard.test.tsx
git commit -m "ProfileViewCard: disposition form + pinned confirmation, no auto-advance on outcome log"
```

---

## Task 6: Thread `campaignId` from `QueuePanel` into `ProfileViewCard`

**Files:**
- Modify: `src/components/dialer/QueuePanel.tsx:650-655`

**Interfaces:**
- Consumes: `campaignId` (already destructured from `useDialerStore()` at `QueuePanel.tsx:411`), `ProfileViewCardProps.campaignId` (Task 5).

- [ ] **Step 1: Update the `ProfileViewCard` call site**

In `src/components/dialer/QueuePanel.tsx`, find:

```tsx
          {callingView === 'profile' && profileContact ? (
            <ProfileViewCard
              contact={profileContact}
              contactIndex={safeProfileIndex}
              totalContacts={totalContacts}
            />
          ) : !campaignId ? (
```

Replace with:

```tsx
          {callingView === 'profile' && profileContact ? (
            <ProfileViewCard
              contact={profileContact}
              contactIndex={safeProfileIndex}
              totalContacts={totalContacts}
              campaignId={campaignId}
            />
          ) : !campaignId ? (
```

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit`
Expected: no errors (the previous `ProfileViewCardProps` required `campaignId`; this was the only call site missing it, so the build was broken by Task 5 until this step — this confirms the fix).

- [ ] **Step 3: Run the full test suite**

Run: `npx vitest run`
Expected: PASS

- [ ] **Step 4: Manual smoke test**

Run `npm run dev`, open the Calling page, switch to Profile view, and verify by hand:
1. Pick "Meeting Booked" from the Outcome dropdown → disposition panel opens showing a locked "Meeting Booked" pill, a required Notes field, and an "Add to pipeline" toggle.
2. Try to submit with empty notes → "Log Outcome" stays disabled, "Notes required for this outcome." shows.
3. Type notes, submit → confirmation chip appears ("Logged: Meeting Booked" + notes), the same contact stays on screen.
4. Click "Next" → the next contact in the queue appears (not two contacts ahead).
5. Click "No Answer" on a fresh contact → view advances to the next contact immediately, no confirmation/Next click needed.
6. Switch to List view → confirm the just-dispositioned Profile-view contacts no longer appear in the active queue rows (they moved to "Calls made today").

Expected: all six behaviors match.

- [ ] **Step 5: Commit**

```bash
git add src/components/dialer/QueuePanel.tsx
git commit -m "Pass campaignId from QueuePanel into ProfileViewCard"
```

---

## Self-Review Notes

- **Spec coverage:** Section 2 (notes-required rule, both views) → Tasks 1–3. Section 3b (profile flow: pick outcome → form → submit → confirm → Next; No Answer unchanged) → Tasks 4–5. Section 3c (component changes: `DispositionForm` props, `ProfileActionBar` rewrite, `ProfileViewCard` `campaignId`) → Tasks 2, 4, 5, 6.
- **Pre-existing bug not touched:** clicking "Next" after "No Answer" already auto-advances the view (via the store's queue-shift), so an additional "Next" click there would skip a contact. This exists identically before and after this plan (No Answer's behavior is explicitly out of scope) and is not introduced or worsened by any task here.
- **Queue replenishment:** `logManualOutcome` (unlike `logOutcome`) never topped up the local queue on its own; profile view relied entirely on `advanceProfile`'s lazy-load check, which the new pinned/no-advance path skips. Task 5 adds an equivalent top-up check in `handleDispositionSubmit` using the same `< 5` threshold already used in `dialer-store.ts:227`, so the profile view doesn't run dry mid-session.
