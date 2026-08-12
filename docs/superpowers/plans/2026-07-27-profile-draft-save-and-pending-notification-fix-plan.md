# Profile View Draft Save + Pending-Notification Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In the Calling page's Profile view, defer saving an outcome disposition and any standalone notes until "Next" is clicked, with edit/delete for both while unsaved; separately, stop the sidebar's pending-pipeline badge from counting items that belong to a deleted or archived campaign.

**Architecture:** Part 1 (Tasks 1–4) reworks `ProfileViewCard`'s disposition state from "save immediately, show a read-only confirmation" to "hold a local draft, show an editable/deletable confirmation, save on Next." `DispositionForm`, `ProfileActionBar`, and `ContactNotesModal` each gain new *optional* props with backward-compatible defaults, so Tasks 1–3 land independently without breaking their existing callers (List view's `CallControls.tsx`, `QuickLogDropdown.tsx`, and `QueuePanel`'s use of `ContactNotesModal`) or requiring a combined dispatch like last time's Task 4+5. Task 4 (`ProfileViewCard`) is the only task that actually wires the new props together. Part 2 (Task 5) is an independent, small bug fix to the campaign-deletion cleanup path.

**Tech Stack:** Next.js 14 App Router, TypeScript, Zustand (dialer-store), Prisma, Vitest + React Testing Library.

## Global Constraints

- Scoped to Profile view only. List view (`CallControls.tsx`, `QuickLogDropdown.tsx`, `ContactNotesModal` opened from `QueuePanel`'s list rows) keeps saving immediately, unchanged.
- Editing a draft disposition may change the outcome, notes, and pipeline choice freely — nothing has been saved or routed yet, so there's no business-logic reversal to worry about.
- Deleting a draft disposition or a draft note never calls an API — it only clears local state. Delete always confirms first via `window.confirm(...)` (the codebase's existing confirmation convention — no dedicated dialog component exists).
- `logManualOutcome`'s queue-shift/`calledToday` mutation logic in `dialer-store.ts` is not modified.
- No schema changes, no new dependencies, no new API routes for Part 1 — everything in scope is pre-save local state.

---

## Task 1: `DispositionForm` — seed notes/pipeline for editing

**Files:**
- Modify: `src/components/dialer/DispositionForm.tsx` (full rewrite — see Step 3)
- Modify: `src/components/dialer/__tests__/DispositionForm.test.tsx` (add tests only — existing tests are unaffected)

**Interfaces:**
- Produces: `DispositionForm` gains two new optional props, consumed by Task 4 (`ProfileViewCard`):
  - `initialNotes?: string`
  - `initialPipeline?: PipelineAction`
- All existing props/behavior unchanged when these are omitted.

- [ ] **Step 1: Write the failing tests**

Add to `src/components/dialer/__tests__/DispositionForm.test.tsx` (append inside the existing `describe('DispositionForm', ...)` block, after the last `it`):

```tsx
  it('seeds notes and pipeline selection from initialNotes/initialPipeline when editing', () => {
    render(
      <DispositionForm
        campaignId="camp1"
        onSubmit={vi.fn()}
        loading={false}
        initialOutcome="meeting_booked"
        lockOutcome
        initialNotes="Booked demo for Friday"
        initialPipeline={{ stageId: 'stage1', addToQueue: false, clientId: 'client1' }}
      />
    )
    expect(screen.getByDisplayValue('Booked demo for Friday')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Log Outcome' })).not.toBeDisabled()
    // "Add to pipeline" toggle should already be on since initialPipeline was provided
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'true')
  })

  it('submits the seeded notes unchanged if the user does not edit them', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(
      <DispositionForm
        campaignId={null}
        onSubmit={onSubmit}
        loading={false}
        initialOutcome="lead"
        lockOutcome
        initialNotes="Interested in Q3"
      />
    )
    fireEvent.click(screen.getByRole('button', { name: 'Log Outcome' }))
    expect(onSubmit).toHaveBeenCalledWith('lead', 'Interested in Q3', undefined)
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/dialer/__tests__/DispositionForm.test.tsx`
Expected: FAIL — `DispositionForm` doesn't accept `initialNotes`/`initialPipeline` props yet, so the notes textarea starts empty and the pipeline toggle starts off.

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
  initialNotes?:    string
  initialPipeline?: PipelineAction
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
  initialNotes,
  initialPipeline,
}: DispositionFormProps) {
  const [outcome,        setOutcome]        = useState<CallOutcome | ''>(initialOutcome ?? '')
  const [notes,          setNotes]          = useState(initialNotes ?? '')
  const [addToPipeline,  setAddToPipeline]  = useState(initialPipeline != null)
  const [selectedStage,  setSelectedStage]  = useState(
    initialPipeline == null
      ? ''
      : initialPipeline.addToQueue
        ? QUEUE_FOR_LATER
        : (initialPipeline.stageId ?? '')
  )
  const [stages,         setStages]         = useState<PipelineStage[]>([])
  const [clientId,       setClientId]       = useState<string | null>(initialPipeline?.clientId ?? null)
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
Expected: PASS (all 8 tests — 6 existing + 2 new)

- [ ] **Step 5: Commit**

```bash
git add src/components/dialer/DispositionForm.tsx src/components/dialer/__tests__/DispositionForm.test.tsx
git commit -m "DispositionForm: seed notes/pipeline selection for editing a draft"
```

---

## Task 2: `ContactNotesModal` — deferred-save (draft) note mode

**Files:**
- Modify: `src/components/dialer/ContactNotesModal.tsx` (full rewrite — see Step 3)
- Create: `src/components/dialer/__tests__/ContactNotesModal.test.tsx`

**Interfaces:**
- Produces: `ContactNotesModal` gains five new optional props, consumed by Task 4 (`ProfileViewCard`):
  - `deferSave?: boolean` (default `false` — List view's usage via `QueuePanel` doesn't pass it, so its behavior is byte-for-byte unchanged)
  - `pendingNotes?: { id: string; content: string }[]`
  - `onStageNote?: (content: string) => void`
  - `onUpdatePendingNote?: (id: string, content: string) => void`
  - `onDeletePendingNote?: (id: string) => void`
- When `deferSave` is true: "Add Note" calls `onStageNote` instead of `POST`ing. `pendingNotes` render above the fetched history, each tagged "Draft" with Edit (loads it into the compose textarea, relabels the submit button "Update Note", calls `onUpdatePendingNote` on submit) and Delete (`window.confirm('Delete this note?')`, then `onDeletePendingNote`) buttons.

- [ ] **Step 1: Write the failing tests**

Create `src/components/dialer/__tests__/ContactNotesModal.test.tsx`:

```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ContactNotesModal } from '../ContactNotesModal'

function mockFetch() {
  return vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: [] }) }) as unknown as typeof fetch
}

describe('ContactNotesModal — deferSave mode', () => {
  beforeEach(() => {
    global.fetch = mockFetch()
  })

  it('stages a note via onStageNote instead of posting when deferSave is true', async () => {
    const onStageNote = vi.fn()
    render(
      <ContactNotesModal
        contactId="c1"
        contactName="John Doe"
        open={true}
        onClose={vi.fn()}
        hideOutcome
        deferSave
        pendingNotes={[]}
        onStageNote={onStageNote}
        onUpdatePendingNote={vi.fn()}
        onDeletePendingNote={vi.fn()}
      />
    )
    await waitFor(() => expect(global.fetch).toHaveBeenCalled())
    fireEvent.change(screen.getByPlaceholderText('Add a note…'), { target: { value: 'Follow up Monday' } })
    fireEvent.click(screen.getByRole('button', { name: /Add Note/ }))
    expect(onStageNote).toHaveBeenCalledWith('Follow up Monday')
    expect(global.fetch).not.toHaveBeenCalledWith(expect.stringContaining('/notes'), expect.objectContaining({ method: 'POST' }))
  })

  it('renders pending notes above history with a Draft badge', async () => {
    render(
      <ContactNotesModal
        contactId="c1"
        contactName="John Doe"
        open={true}
        onClose={vi.fn()}
        hideOutcome
        deferSave
        pendingNotes={[{ id: 'p1', content: 'Follow up Monday' }]}
        onStageNote={vi.fn()}
        onUpdatePendingNote={vi.fn()}
        onDeletePendingNote={vi.fn()}
      />
    )
    await waitFor(() => expect(global.fetch).toHaveBeenCalled())
    expect(screen.getByText('Follow up Monday')).toBeInTheDocument()
    expect(screen.getByText('Draft')).toBeInTheDocument()
  })

  it('Edit on a pending note loads it into the textarea and Update Note calls onUpdatePendingNote', async () => {
    const onUpdatePendingNote = vi.fn()
    render(
      <ContactNotesModal
        contactId="c1"
        contactName="John Doe"
        open={true}
        onClose={vi.fn()}
        hideOutcome
        deferSave
        pendingNotes={[{ id: 'p1', content: 'Follow up Monday' }]}
        onStageNote={vi.fn()}
        onUpdatePendingNote={onUpdatePendingNote}
        onDeletePendingNote={vi.fn()}
      />
    )
    await waitFor(() => expect(global.fetch).toHaveBeenCalled())
    fireEvent.click(screen.getByRole('button', { name: 'Edit note' }))
    expect(screen.getByPlaceholderText('Add a note…')).toHaveValue('Follow up Monday')
    fireEvent.change(screen.getByPlaceholderText('Add a note…'), { target: { value: 'Follow up Tuesday' } })
    fireEvent.click(screen.getByRole('button', { name: /Update Note/ }))
    expect(onUpdatePendingNote).toHaveBeenCalledWith('p1', 'Follow up Tuesday')
  })

  it('Delete on a pending note confirms then calls onDeletePendingNote', async () => {
    const onDeletePendingNote = vi.fn()
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(
      <ContactNotesModal
        contactId="c1"
        contactName="John Doe"
        open={true}
        onClose={vi.fn()}
        hideOutcome
        deferSave
        pendingNotes={[{ id: 'p1', content: 'Follow up Monday' }]}
        onStageNote={vi.fn()}
        onUpdatePendingNote={vi.fn()}
        onDeletePendingNote={onDeletePendingNote}
      />
    )
    await waitFor(() => expect(global.fetch).toHaveBeenCalled())
    fireEvent.click(screen.getByRole('button', { name: 'Delete note' }))
    expect(confirmSpy).toHaveBeenCalledWith('Delete this note?')
    expect(onDeletePendingNote).toHaveBeenCalledWith('p1')
    confirmSpy.mockRestore()
  })

  it('still posts immediately when deferSave is not set (List view, unchanged)', async () => {
    render(
      <ContactNotesModal
        contactId="c1"
        contactName="John Doe"
        open={true}
        onClose={vi.fn()}
      />
    )
    await waitFor(() => expect(global.fetch).toHaveBeenCalled())
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: { id: 'n1' } }) })
    fireEvent.click(screen.getByText('Add Note'))
    fireEvent.change(screen.getByPlaceholderText('Add a note…'), { target: { value: 'Immediate note' } })
    fireEvent.click(screen.getByRole('button', { name: /Add Note/ }))
    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/contacts/c1/notes',
        expect.objectContaining({ method: 'POST' })
      )
    )
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/dialer/__tests__/ContactNotesModal.test.tsx`
Expected: FAIL — `ContactNotesModal` doesn't accept `deferSave`/`pendingNotes`/staging-callback props yet, so "Add Note" always POSTs and there's no "Draft" badge or per-pending-note Edit/Delete buttons.

- [ ] **Step 3: Replace `src/components/dialer/ContactNotesModal.tsx` in full**

```tsx
'use client'

import { useEffect, useState } from 'react'
import { MessageSquare, Plus, Pencil, Trash2 } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { CallOutcome } from '@prisma/client'
import { OUTCOME_LABEL, OUTCOME_COLOR, TEXT_CLASS } from './outcome-colors'
import { DispositionForm } from './DispositionForm'
import type { PipelineAction } from './DispositionForm'
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
type PendingNote = { id: string; content: string }

interface ContactNotesModalProps {
  contactId:            string
  contactName:          string
  open:                 boolean
  onClose:              () => void
  hideOutcome?:         boolean
  onNoteSaved?:         () => void
  deferSave?:           boolean
  pendingNotes?:        PendingNote[]
  onStageNote?:         (content: string) => void
  onUpdatePendingNote?: (id: string, content: string) => void
  onDeletePendingNote?: (id: string) => void
}

export function ContactNotesModal({
  contactId,
  contactName,
  open,
  onClose,
  hideOutcome = false,
  onNoteSaved,
  deferSave = false,
  pendingNotes = [],
  onStageNote,
  onUpdatePendingNote,
  onDeletePendingNote,
}: ContactNotesModalProps) {
  const logManualOutcome = useDialerStore((s) => s.logManualOutcome)
  const campaignId       = useDialerStore((s) => s.campaignId)

  const [entries,          setEntries]          = useState<NoteEntry[]>([])
  const [loading,          setLoading]          = useState(false)
  const [fetchError,       setFetchError]       = useState(false)
  const [tab,              setTab]              = useState<ModalTab>('note')
  const [noteText,         setNoteText]         = useState('')
  const [editingPendingId, setEditingPendingId] = useState<string | null>(null)
  const [submitting,       setSubmitting]       = useState(false)
  const [saveError,        setSaveError]        = useState(false)
  const [outcomeLoading,   setOutcomeLoading]   = useState(false)

  useEffect(() => {
    if (!open) return
    setLoading(true)
    setFetchError(false)
    setTab('note')
    setNoteText('')
    setEditingPendingId(null)
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

    if (deferSave) {
      if (editingPendingId) {
        onUpdatePendingNote?.(editingPendingId, noteText.trim())
      } else {
        onStageNote?.(noteText.trim())
      }
      setNoteText('')
      setEditingPendingId(null)
      return
    }

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
      onNoteSaved?.()
    } finally {
      setSubmitting(false)
    }
  }

  const handleEditPending = (note: PendingNote) => {
    setNoteText(note.content)
    setEditingPendingId(note.id)
  }

  const handleDeletePending = (id: string) => {
    if (!confirm('Delete this note?')) return
    onDeletePendingNote?.(id)
    if (editingPendingId === id) {
      setNoteText('')
      setEditingPendingId(null)
    }
  }

  const handleLogOutcome = async (outcome: CallOutcome, notes: string, pipeline?: PipelineAction) => {
    setOutcomeLoading(true)
    try {
      await logManualOutcome(contactId, outcome, notes, pipeline)
      onClose()
    } finally {
      setOutcomeLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="bg-[var(--card-bg)] border-[var(--panel-border)] rounded-3xl max-w-lg w-full max-h-[80vh] flex flex-col gap-0 p-0 overflow-hidden">
        <DialogHeader className="p-5 pb-4 border-b border-[var(--panel-border)] flex-shrink-0">
          <DialogTitle className="text-base font-semibold text-[var(--text-primary)] flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-[var(--lf-accent)]" />
            {contactName} — Call Notes
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto min-h-0">
          {deferSave && pendingNotes.length > 0 && (
            <ul className="divide-y divide-[var(--panel-border)] border-b border-[var(--panel-border)]">
              {pendingNotes.map((note) => (
                <li key={note.id} className="px-5 py-3.5 bg-white/[0.02]">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-[var(--panel-border)] text-[var(--lf-accent)]">
                        Draft
                      </span>
                      <p className="text-sm text-[var(--text-secondary)] mt-1">{note.content}</p>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        type="button"
                        onClick={() => handleEditPending(note)}
                        aria-label="Edit note"
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--panel-border-hover)] transition-colors duration-150"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeletePending(note.id)}
                        aria-label="Delete note"
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--text-secondary)] hover:text-red-400 hover:bg-red-500/10 transition-colors duration-150"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <p className="text-sm text-[var(--text-muted)]">Loading…</p>
            </div>
          ) : fetchError ? (
            <div className="flex items-center justify-center py-12">
              <p className="text-sm text-red-400">Failed to load notes. Check your connection.</p>
            </div>
          ) : entries.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <p className="text-sm text-[var(--text-muted)]">No calls or notes yet</p>
            </div>
          ) : (
            <ul className="divide-y divide-[var(--panel-border)]">
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
                          <span className="text-xs font-semibold text-[var(--text-primary)]">{entry.callerName}</span>
                          {entry.outcome && (
                            <span className={cn(
                              'text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-[var(--panel-border)]',
                              TEXT_CLASS[OUTCOME_COLOR[entry.outcome]],
                            )}>
                              {OUTCOME_LABEL[entry.outcome]}
                            </span>
                          )}
                          {entry.type === 'note' && (
                            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-[var(--panel-border)] text-[var(--text-secondary)]">
                              Note
                            </span>
                          )}
                        </div>
                        {entry.content && (
                          <p className="text-sm text-[var(--text-secondary)] mt-1">{entry.content}</p>
                        )}
                        {!entry.content && entry.type === 'call' && (
                          <p className="text-sm text-[var(--text-muted)] mt-1 italic">No notes</p>
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

        <div className="border-t border-[var(--panel-border)] flex-shrink-0">
          {!hideOutcome && (
            <div className="flex gap-1 p-3 pb-0">
              <button
                onClick={() => setTab('note')}
                className={cn(
                  'flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors',
                  tab === 'note' ? 'bg-[var(--panel-border)] text-[var(--text-primary)]' : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]',
                )}
              >
                Add Note
              </button>
              <button
                onClick={() => setTab('outcome')}
                className={cn(
                  'flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors',
                  tab === 'outcome' ? 'bg-[var(--panel-border)] text-[var(--text-primary)]' : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]',
                )}
              >
                Log Outcome
              </button>
            </div>
          )}

          {(tab === 'note' || hideOutcome) ? (
            <div className="p-4 space-y-2">
              <textarea
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                placeholder="Add a note…"
                rows={2}
                className="w-full bg-[var(--panel-border)] border border-[var(--panel-border)] rounded-xl px-3 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] resize-none focus:outline-none focus:border-[var(--lf-accent)]/50 focus:ring-1 focus:ring-[var(--lf-accent)]/10"
              />
              {saveError && (
                <p className="text-xs text-red-400">Failed to save note. Try again.</p>
              )}
              <div className="flex gap-2">
                {editingPendingId && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => { setNoteText(''); setEditingPendingId(null) }}
                    className="flex-1 rounded-xl"
                  >
                    Cancel
                  </Button>
                )}
                <Button
                  onClick={handleAddNote}
                  disabled={!noteText.trim() || submitting}
                  className={cn(
                    'bg-[var(--panel-border)] border border-[var(--panel-border)] text-[var(--text-secondary)] rounded-xl hover:bg-[var(--panel-border-hover)] disabled:opacity-40',
                    editingPendingId ? 'flex-1' : 'w-full'
                  )}
                >
                  {editingPendingId ? (
                    'Update Note'
                  ) : (
                    <>
                      <Plus className="w-3.5 h-3.5 mr-1.5" />
                      {submitting ? 'Saving…' : 'Add Note'}
                    </>
                  )}
                </Button>
              </div>
            </div>
          ) : (
            <div className="p-4">
              <DispositionForm campaignId={campaignId} onSubmit={handleLogOutcome} loading={outcomeLoading} />
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/components/dialer/__tests__/ContactNotesModal.test.tsx`
Expected: PASS (all 5 tests)

- [ ] **Step 5: Run the full test suite to check for regressions**

Run: `npx vitest run`
Expected: PASS — no regression in any test that renders `ContactNotesModal` without `deferSave` (its default-`false` behavior is unchanged).

- [ ] **Step 6: Commit**

```bash
git add src/components/dialer/ContactNotesModal.tsx src/components/dialer/__tests__/ContactNotesModal.test.tsx
git commit -m "ContactNotesModal: add deferSave mode for draft notes with edit/delete"
```

---

## Task 3: `ProfileActionBar` — edit/delete for the draft confirmation, flush hook before No Answer

**Files:**
- Modify: `src/components/dialer/ProfileActionBar.tsx` (full rewrite — see Step 3)
- Modify: `src/components/dialer/__tests__/ProfileActionBar.test.tsx` (add tests only — existing tests are unaffected, since the new props are optional)

**Interfaces:**
- Produces: `ProfileActionBarProps` gains three new optional props, consumed by Task 4 (`ProfileViewCard`):
  - `onEditDraft?: () => void` — Edit button in the confirmed state; button only renders if provided
  - `onDeleteDraft?: () => void` — called only after `window.confirm(...)` accepts; button only renders if provided
  - `onBeforeNoAnswer?: () => Promise<void>` — awaited at the start of `handleNoAnswer`, before its existing `logManualOutcome` call, if provided

- [ ] **Step 1: Write the failing tests**

Add to `src/components/dialer/__tests__/ProfileActionBar.test.tsx` (append inside the existing `describe('ProfileActionBar', ...)` block, after the last `it`; also add `import { vi } from 'vitest'` is already present):

```tsx
  it('renders Edit and Delete buttons in the confirmed state when their handlers are provided', () => {
    const onEditDraft   = vi.fn()
    const onDeleteDraft = vi.fn()
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(
      <ProfileActionBar
        contact={contact}
        onNext={vi.fn()}
        onOpenNotes={vi.fn()}
        noteCount={0}
        confirmed={{ outcome: 'meeting_booked' as CallOutcome, notes: 'Booked for Tuesday' }}
        onOutcomeChosen={vi.fn()}
        onEditDraft={onEditDraft}
        onDeleteDraft={onDeleteDraft}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: 'Edit outcome' }))
    expect(onEditDraft).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: 'Delete outcome' }))
    expect(confirmSpy).toHaveBeenCalledWith('Discard this outcome? Nothing has been saved yet.')
    expect(onDeleteDraft).toHaveBeenCalledTimes(1)
    confirmSpy.mockRestore()
  })

  it('does not call onDeleteDraft when the confirmation is declined', () => {
    const onDeleteDraft = vi.fn()
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(
      <ProfileActionBar
        contact={contact}
        onNext={vi.fn()}
        onOpenNotes={vi.fn()}
        noteCount={0}
        confirmed={{ outcome: 'meeting_booked' as CallOutcome, notes: '' }}
        onOutcomeChosen={vi.fn()}
        onDeleteDraft={onDeleteDraft}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: 'Delete outcome' }))
    expect(onDeleteDraft).not.toHaveBeenCalled()
    confirmSpy.mockRestore()
  })

  it('does not render Edit/Delete buttons when their handlers are omitted', () => {
    render(
      <ProfileActionBar
        contact={contact}
        onNext={vi.fn()}
        onOpenNotes={vi.fn()}
        noteCount={0}
        confirmed={{ outcome: 'meeting_booked' as CallOutcome, notes: '' }}
        onOutcomeChosen={vi.fn()}
      />
    )
    expect(screen.queryByRole('button', { name: 'Edit outcome' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Delete outcome' })).not.toBeInTheDocument()
  })

  it('awaits onBeforeNoAnswer before logging No Answer when provided', async () => {
    const order: string[] = []
    const onBeforeNoAnswer = vi.fn(async () => { order.push('flush') })
    global.fetch = vi.fn().mockImplementation(async () => {
      order.push('log')
      return {
        ok:   true,
        json: async () => ({
          data: { callRecord: { id: 'r1', outcome: 'no_answer', notes: null, createdAt: new Date().toISOString(), callerName: 'Rep' } },
        }),
      }
    })
    render(
      <ProfileActionBar
        contact={contact}
        onNext={vi.fn()}
        onOpenNotes={vi.fn()}
        noteCount={0}
        confirmed={null}
        onOutcomeChosen={vi.fn()}
        onBeforeNoAnswer={onBeforeNoAnswer}
      />
    )
    fireEvent.click(screen.getByTitle('Mark as No Answer — no outcome required'))
    await waitFor(() => expect(onBeforeNoAnswer).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(order).toEqual(['flush', 'log']))
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/dialer/__tests__/ProfileActionBar.test.tsx`
Expected: FAIL — no Edit/Delete buttons exist in the confirmed state yet, and `handleNoAnswer` doesn't call any `onBeforeNoAnswer` prop.

- [ ] **Step 3: Replace `src/components/dialer/ProfileActionBar.tsx` in full**

```tsx
'use client'

import { useState } from 'react'
import { CircleX, CircleDashed, MessageSquare, ArrowRight, Pencil, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useDialerStore } from '@/stores/dialer-store'
import type { CallOutcome } from '@prisma/client'
import type { ContactSummary } from '@/types/models'
import { OutcomeSearchDropdown } from './OutcomeSearchDropdown'
import { OUTCOME_LABEL } from './outcome-colors'

interface ProfileActionBarProps {
  contact:            ContactSummary
  onNext:             () => void
  onOpenNotes:        () => void
  noteCount:          number
  confirmed:          { outcome: CallOutcome; notes: string } | null
  onOutcomeChosen:    (outcome: CallOutcome) => void
  onEditDraft?:       () => void
  onDeleteDraft?:     () => void
  onBeforeNoAnswer?:  () => Promise<void>
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
  onEditDraft,
  onDeleteDraft,
  onBeforeNoAnswer,
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
      if (onBeforeNoAnswer) await onBeforeNoAnswer()
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

  /* ── Delete draft ──────────────────────────────────────────── */
  const handleDeleteDraft = () => {
    if (!confirm('Discard this outcome? Nothing has been saved yet.')) return
    onDeleteDraft?.()
  }

  const outcomeDisabled = noAnswerSelected || loading

  if (confirmed) {
    return (
      <div className="flex flex-col gap-3 pt-4 border-t border-[var(--panel-border-hover)]">
        <div
          className="flex items-start justify-between gap-3"
          style={{ background: '#16281f', border: '0.5px solid #234534', borderRadius: 12, padding: '10px 12px' }}
        >
          <div className="flex flex-col gap-1 min-w-0">
            <span style={{ color: '#7dd6ab', fontSize: 11, fontWeight: 600 }}>
              Logged: {OUTCOME_LABEL[confirmed.outcome]}
            </span>
            {confirmed.notes && (
              <span style={{ color: 'var(--text-secondary)', fontSize: 11 }}>
                {confirmed.notes}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            {onEditDraft && (
              <button
                type="button"
                onClick={onEditDraft}
                aria-label="Edit outcome"
                className="w-7 h-7 rounded-lg flex items-center justify-center text-[#7dd6ab] hover:text-[var(--text-primary)] hover:bg-white/10 transition-colors duration-150"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
            )}
            {onDeleteDraft && (
              <button
                type="button"
                onClick={handleDeleteDraft}
                aria-label="Delete outcome"
                className="w-7 h-7 rounded-lg flex items-center justify-center text-[#7dd6ab] hover:text-red-400 hover:bg-red-500/10 transition-colors duration-150"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
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
Expected: PASS (all 8 tests — 4 existing + 4 new)

- [ ] **Step 5: Commit**

```bash
git add src/components/dialer/ProfileActionBar.tsx src/components/dialer/__tests__/ProfileActionBar.test.tsx
git commit -m "ProfileActionBar: add Edit/Delete for the draft confirmation and a pre-No-Answer flush hook"
```

---

## Task 4: `ProfileViewCard` — draft disposition + draft notes, save on Next

**Files:**
- Modify: `src/components/dialer/ProfileViewCard.tsx` (full rewrite — see Step 3)
- Modify: `src/components/dialer/__tests__/ProfileViewCard.test.tsx` (full rewrite — see Step 1; existing tests 2 and 3 change their assertions because saving now happens on Next, not on Log Outcome)

**Interfaces:**
- Consumes: Task 1's `DispositionForm` (`initialNotes`, `initialPipeline`), Task 2's `ContactNotesModal` (`deferSave`, `pendingNotes`, `onStageNote`, `onUpdatePendingNote`, `onDeletePendingNote`), Task 3's `ProfileActionBar` (`onEditDraft`, `onDeleteDraft`, `onBeforeNoAnswer`).
- No new props on `ProfileViewCardProps` itself.

- [ ] **Step 1: Replace `src/components/dialer/__tests__/ProfileViewCard.test.tsx` in full**

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
  return vi.fn((url: string, init?: RequestInit) => {
    if (url.includes('/notes')) {
      if (init?.method === 'POST') {
        return Promise.resolve({ ok: true, json: async () => ({ data: { id: 'n1' } }) })
      }
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

describe('ProfileViewCard — draft disposition flow', () => {
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

  it('shows a confirmation for the same contact without saving when Log Outcome is submitted', async () => {
    render(<ProfileViewCard contact={contact} contactIndex={0} totalContacts={1} campaignId="camp1" />)

    fireEvent.click(screen.getByTitle('Log a call outcome'))
    fireEvent.click(screen.getByText('Meeting Booked'))
    fireEvent.change(screen.getByPlaceholderText('Notes required for this outcome…'), {
      target: { value: 'Booked demo for Friday' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Log Outcome' }))

    expect(screen.getByText(/Logged: Meeting Booked/)).toBeInTheDocument()
    expect(screen.getByText('John Doe')).toBeInTheDocument()
    expect(global.fetch).not.toHaveBeenCalledWith('/api/dialer/log-outcome', expect.anything())
  })

  it('saves the draft and does not call advanceProfile when Next is clicked', async () => {
    render(<ProfileViewCard contact={contact} contactIndex={0} totalContacts={1} campaignId="camp1" />)

    fireEvent.click(screen.getByTitle('Log a call outcome'))
    fireEvent.click(screen.getByText('Meeting Booked'))
    fireEvent.change(screen.getByPlaceholderText('Notes required for this outcome…'), {
      target: { value: 'Booked demo for Friday' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Log Outcome' }))
    fireEvent.click(screen.getByText('Next'))

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/dialer/log-outcome',
        expect.objectContaining({ body: expect.stringContaining('"outcome":"meeting_booked"') })
      )
    )
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

  it('Edit reopens the disposition form pre-filled with the draft notes', async () => {
    render(<ProfileViewCard contact={contact} contactIndex={0} totalContacts={1} campaignId="camp1" />)

    fireEvent.click(screen.getByTitle('Log a call outcome'))
    fireEvent.click(screen.getByText('Meeting Booked'))
    fireEvent.change(screen.getByPlaceholderText('Notes required for this outcome…'), {
      target: { value: 'Booked demo for Friday' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Log Outcome' }))

    fireEvent.click(screen.getByRole('button', { name: 'Edit outcome' }))

    expect(screen.getByDisplayValue('Booked demo for Friday')).toBeInTheDocument()
  })

  it('Delete discards the draft disposition without saving it', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<ProfileViewCard contact={contact} contactIndex={0} totalContacts={1} campaignId="camp1" />)

    fireEvent.click(screen.getByTitle('Log a call outcome'))
    fireEvent.click(screen.getByText('Meeting Booked'))
    fireEvent.change(screen.getByPlaceholderText('Notes required for this outcome…'), {
      target: { value: 'Booked demo for Friday' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Log Outcome' }))

    fireEvent.click(screen.getByRole('button', { name: 'Delete outcome' }))

    expect(screen.getByTitle('Log a call outcome')).toBeInTheDocument()
    expect(global.fetch).not.toHaveBeenCalledWith('/api/dialer/log-outcome', expect.anything())
    confirmSpy.mockRestore()
  })

  it('stages a note locally, then flushes it and advances on Next with no draft disposition', async () => {
    render(<ProfileViewCard contact={contact} contactIndex={0} totalContacts={1} campaignId="camp1" />)

    fireEvent.click(screen.getByTitle('Add or view notes'))
    await waitFor(() => expect(screen.getByPlaceholderText('Add a note…')).toBeInTheDocument())
    fireEvent.change(screen.getByPlaceholderText('Add a note…'), { target: { value: 'Follow up Monday' } })
    fireEvent.click(screen.getByRole('button', { name: /Add Note/ }))

    expect(global.fetch).not.toHaveBeenCalledWith(
      expect.stringContaining('/notes'),
      expect.objectContaining({ method: 'POST' })
    )
    expect(screen.getByText('Draft')).toBeInTheDocument()

    fireEvent.click(screen.getByText('Next'))

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/contacts/c1/notes',
        expect.objectContaining({ method: 'POST', body: expect.stringContaining('Follow up Monday') })
      )
    )
    expect(useDialerStore.getState().advanceProfile).toHaveBeenCalledTimes(1)
  })

  it('flushes pending notes before logging No Answer', async () => {
    render(<ProfileViewCard contact={contact} contactIndex={0} totalContacts={1} campaignId="camp1" />)

    fireEvent.click(screen.getByTitle('Add or view notes'))
    await waitFor(() => expect(screen.getByPlaceholderText('Add a note…')).toBeInTheDocument())
    fireEvent.change(screen.getByPlaceholderText('Add a note…'), { target: { value: 'Follow up Monday' } })
    fireEvent.click(screen.getByRole('button', { name: /Add Note/ }))
    fireEvent.click(screen.getByLabelText(/close/i))

    fireEvent.click(screen.getByTitle('Mark as No Answer — no outcome required'))

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/contacts/c1/notes',
        expect.objectContaining({ method: 'POST', body: expect.stringContaining('Follow up Monday') })
      )
    )
  })

  it('confirms before discarding an unsaved draft when leaving via the Queue back-link', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const { setCallingView } = useDialerStore.getState()
    useDialerStore.setState({ setCallingView: vi.fn(setCallingView) })

    render(<ProfileViewCard contact={contact} contactIndex={0} totalContacts={1} campaignId="camp1" />)

    fireEvent.click(screen.getByTitle('Log a call outcome'))
    fireEvent.click(screen.getByText('Meeting Booked'))
    fireEvent.change(screen.getByPlaceholderText('Notes required for this outcome…'), {
      target: { value: 'Booked demo for Friday' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Log Outcome' }))

    fireEvent.click(screen.getByText('Queue'))

    expect(confirmSpy).toHaveBeenCalledWith('Discard unsaved outcome/notes for this contact?')
    expect(useDialerStore.getState().setCallingView).not.toHaveBeenCalled()
    expect(screen.getByText(/Logged: Meeting Booked/)).toBeInTheDocument()
    confirmSpy.mockRestore()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/dialer/__tests__/ProfileViewCard.test.tsx`
Expected: FAIL — `ProfileViewCard` still saves on Log Outcome, has no Edit/Delete draft handling, doesn't defer notes, and doesn't confirm before leaving with unsaved state.

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
type PendingNote = { id: string; content: string }
type DraftDisposition = {
  contact:  ContactSummary
  outcome:  CallOutcome
  notes:    string
  pipeline?: PipelineAction
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

  // Outcome chosen from the action bar's search dropdown, awaiting notes/pipeline before it's staged
  const [pendingOutcome, setPendingOutcome] = useState<CallOutcome | null>(null)
  // The staged (unsaved) disposition — keeps the same contact on screen until Next flushes it
  const [draftDisposition, setDraftDisposition] = useState<DraftDisposition | null>(null)
  // Standalone notes staged (unsaved) for this contact, flushed alongside the draft disposition
  const [pendingNotes, setPendingNotes] = useState<PendingNote[]>([])

  const displayContact = draftDisposition?.contact ?? contact

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

  const flushPendingNotes = async () => {
    for (const note of pendingNotes) {
      await fetch(`/api/contacts/${displayContact.id}/notes`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ content: note.content }),
      })
    }
    setPendingNotes([])
    delete notesCacheRef.current[displayContact.id]
  }

  const handleDispositionSubmit = async (outcome: CallOutcome, notes: string, pipeline?: PipelineAction) => {
    setPendingOutcome(null)
    setDraftDisposition({ contact: displayContact, outcome, notes, pipeline })
  }

  const handleEditDraft = () => {
    if (!draftDisposition) return
    setPendingOutcome(draftDisposition.outcome)
  }

  const handleDeleteDraft = () => {
    setDraftDisposition(null)
  }

  const handleBeforeNoAnswer = async () => {
    if (pendingNotes.length > 0) await flushPendingNotes()
  }

  const handleStageNote = (content: string) => {
    setPendingNotes((prev) => [...prev, { id: crypto.randomUUID(), content }])
  }

  const handleUpdatePendingNote = (id: string, content: string) => {
    setPendingNotes((prev) => prev.map((n) => (n.id === id ? { ...n, content } : n)))
  }

  const handleDeletePendingNote = (id: string) => {
    setPendingNotes((prev) => prev.filter((n) => n.id !== id))
  }

  const handleNext = async () => {
    const hadDraftDisposition = draftDisposition !== null

    if (draftDisposition) {
      await logManualOutcome(
        draftDisposition.contact.id,
        draftDisposition.outcome,
        draftDisposition.notes,
        draftDisposition.pipeline
      )
      setDraftDisposition(null)

      // logManualOutcome doesn't replenish the local queue the way logOutcome does for
      // list view — top it up here so the profile view doesn't run out of loaded contacts.
      const { queue, currentContact, totalContacts: liveTotal, loadQueue } = useDialerStore.getState()
      const loadedCount = (currentContact ? 1 : 0) + queue.length
      if (loadedCount < 5 && loadedCount < liveTotal) {
        await loadQueue(loadedCount)
      }
    }

    if (pendingNotes.length > 0) {
      await flushPendingNotes()
    }

    if (!hadDraftDisposition) {
      // The store only shifts the queue as a side effect of logManualOutcome above —
      // if there was no draft disposition to flush, nothing has advanced yet.
      advanceProfile()
    }
  }

  const handleBackToQueue = () => {
    if (draftDisposition || pendingNotes.length > 0) {
      if (!confirm('Discard unsaved outcome/notes for this contact?')) return
    }
    setDraftDisposition(null)
    setPendingNotes([])
    setCallingView('list')
  }

  return (
    <div className="max-w-[720px] mx-auto w-full px-6 py-6 overflow-y-auto flex flex-col gap-4">

      {/* Top row: back | counter | location */}
      <div className="flex items-start justify-between gap-4">
        <button
          onClick={handleBackToQueue}
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
          initialNotes={draftDisposition?.notes}
          initialPipeline={draftDisposition?.pipeline}
          onChangeOutcome={() => setPendingOutcome(null)}
          onCancel={() => setPendingOutcome(null)}
          onSubmit={handleDispositionSubmit}
          loading={false}
        />
      ) : (
        <ProfileActionBar
          key={displayContact.id}
          contact={displayContact}
          onNext={handleNext}
          onOpenNotes={() => setNotesOpen(true)}
          noteCount={noteCount + pendingNotes.length}
          confirmed={draftDisposition ? { outcome: draftDisposition.outcome, notes: draftDisposition.notes } : null}
          onOutcomeChosen={setPendingOutcome}
          onEditDraft={handleEditDraft}
          onDeleteDraft={handleDeleteDraft}
          onBeforeNoAnswer={handleBeforeNoAnswer}
        />
      )}

      {/* Notes modal */}
      <ContactNotesModal
        contactId={displayContact.id}
        contactName={fullName}
        open={notesOpen}
        onClose={() => setNotesOpen(false)}
        hideOutcome={true}
        deferSave
        pendingNotes={pendingNotes}
        onStageNote={handleStageNote}
        onUpdatePendingNote={handleUpdatePendingNote}
        onDeletePendingNote={handleDeletePendingNote}
      />
    </div>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/components/dialer/__tests__/ProfileViewCard.test.tsx`
Expected: PASS (all 10 tests)

- [ ] **Step 5: Run the full test suite and typecheck**

Run: `npx vitest run`
Expected: PASS — including Task 1–3's test files (their new optional props are now actually exercised by this integration).

Run: `npx tsc --noEmit`
Expected: no errors introduced by this change (any pre-existing unrelated errors, e.g. in `CampaignWizardStep3.test.tsx`, are not this task's concern — confirm via `git stash` against the base commit if any appear, same as prior sessions).

- [ ] **Step 6: Commit**

```bash
git add src/components/dialer/ProfileViewCard.tsx src/components/dialer/__tests__/ProfileViewCard.test.tsx
git commit -m "ProfileViewCard: defer outcome/notes save to Next, add draft edit/delete"
```

---

## Task 5: Pending-notification cleanup on campaign deletion/archival

**Files:**
- Modify: `src/app/api/campaigns/[id]/route.ts:69-89` (DELETE handler)
- Modify: `src/app/(dashboard)/layout.tsx:30-34`
- Modify: `src/app/(dashboard)/pipeline/page.tsx:77-86`
- Modify: `src/app/api/pipeline/pending/route.ts:21-36`

**Interfaces:** None — this task doesn't change any function signature or component prop; it's a self-contained query/transaction fix in four files, verified via `tsc` and manual inspection (this codebase has no automated test coverage for API routes or server-component pages — consistent with prior sessions' Tasks 3/6).

- [ ] **Step 1: Extend the campaign DELETE transaction to also remove its pending pipeline items**

In `src/app/api/campaigns/[id]/route.ts`, find (lines 69–89):

```ts
  const { id } = await params
  const now = new Date()
  const result = await withTenant(tenantId, () =>
    db.$transaction([
      db.contact.updateMany({
        where: { campaignId: id, deletedAt: null },
        data: { deletedAt: now },
      }),
      db.campaign.updateMany({
        where: { id, archivedAt: null, deletedAt: null },
        data: { deletedAt: now },
      }),
    ])
  )

  if (result[1].count === 0) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  return NextResponse.json({ data: { success: true } })
}
```

Replace with:

```ts
  const { id } = await params
  const now = new Date()
  const result = await withTenant(tenantId, () =>
    db.$transaction([
      db.contact.updateMany({
        where: { campaignId: id, deletedAt: null },
        data: { deletedAt: now },
      }),
      db.campaign.updateMany({
        where: { id, archivedAt: null, deletedAt: null },
        data: { deletedAt: now },
      }),
      db.pendingPipelineDeal.deleteMany({
        where: { campaignId: id },
      }),
    ])
  )

  if (result[1].count === 0) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  return NextResponse.json({ data: { success: true } })
}
```

(`result[1]` still refers to the `campaign.updateMany` call — it's the second array element both before and after this change, since the new `pendingPipelineDeal.deleteMany` is appended at the end.)

- [ ] **Step 2: Filter deleted/archived campaigns out of the sidebar badge count**

In `src/app/(dashboard)/layout.tsx`, find (lines 30–34):

```ts
      if (dbUser && tenantId) {
        pendingPipelineCount = await withTenant(tenantId, () =>
          db.pendingPipelineDeal.count()
        )
      }
```

Replace with:

```ts
      if (dbUser && tenantId) {
        pendingPipelineCount = await withTenant(tenantId, () =>
          db.pendingPipelineDeal.count({
            where: { campaign: { deletedAt: null, archivedAt: null } },
          })
        )
      }
```

- [ ] **Step 3: Filter deleted/archived campaigns out of the Pipeline page's pending list**

In `src/app/(dashboard)/pipeline/page.tsx`, find (lines 77–86):

```ts
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
```

Replace with:

```ts
      db.pendingPipelineDeal.findMany({
        where: {
          clientId: selectedClientId,
          campaign: { deletedAt: null, archivedAt: null },
        },
        select: {
          id: true, clientId: true, contactId: true, campaignId: true,
          outcome: true, createdAt: true,
          contact:  { select: { firstName: true, lastName: true, companyName: true, jobTitle: true } },
          campaign: { select: { name: true } },
        },
        orderBy: { createdAt: 'asc' },
      }),
```

- [ ] **Step 4: Filter deleted/archived campaigns out of `/api/pipeline/pending`**

In `src/app/api/pipeline/pending/route.ts`, find (lines 21–36):

```ts
    const pending = await withTenant(tenantId, () =>
      db.pendingPipelineDeal.findMany({
        where: { clientId },
        select: {
          id: true,
          clientId: true,
          contactId: true,
          campaignId: true,
          outcome: true,
          createdAt: true,
          contact: { select: { firstName: true, lastName: true, companyName: true, jobTitle: true } },
          campaign: { select: { name: true } },
        },
        orderBy: { createdAt: 'asc' },
      })
    )
```

Replace with:

```ts
    const pending = await withTenant(tenantId, () =>
      db.pendingPipelineDeal.findMany({
        where: {
          clientId,
          campaign: { deletedAt: null, archivedAt: null },
        },
        select: {
          id: true,
          clientId: true,
          contactId: true,
          campaignId: true,
          outcome: true,
          createdAt: true,
          contact: { select: { firstName: true, lastName: true, companyName: true, jobTitle: true } },
          campaign: { select: { name: true } },
        },
        orderBy: { createdAt: 'asc' },
      })
    )
```

- [ ] **Step 5: Verify types compile**

Run: `npx tsc --noEmit`
Expected: no new errors from any of the four files touched in this task.

- [ ] **Step 6: Manual verification against the running dev server**

This codebase has no automated test harness for API routes or server components (only `src/lib`/`src/stores`/`src/components` have Vitest coverage). Verify by hand:

1. Run `npm run dev`, sign in, and in a campaign that has at least one contact with an outcome that was queued to the pipeline ("Add to pipeline" → "Queue for later" from the disposition flow — this creates a `PendingPipelineDeal` row), confirm the sidebar's Pipeline badge count includes it.
2. Delete that campaign from the Campaigns page.
3. Confirm the sidebar badge count decreases by exactly the number of pending items that campaign had, and that the Pipeline page's "Pending Pipeline" section no longer lists them.
4. Optionally repeat with Archive instead of Delete on a different campaign with a pending item, and confirm the same count/list drop (its `PendingPipelineDeal` rows should still exist in the DB, just excluded from the count/list — unlike Delete, which removes them).

- [ ] **Step 7: Commit**

```bash
git add src/app/api/campaigns/[id]/route.ts src/app/\(dashboard\)/layout.tsx src/app/\(dashboard\)/pipeline/page.tsx src/app/api/pipeline/pending/route.ts
git commit -m "Clean up pending pipeline items when their campaign is deleted or archived"
```

---

## Self-Review Notes

- **Spec coverage:** Part 1.2 (draft disposition edit/delete, draft notes edit/delete, flush-on-Next/No-Answer/Queue-back-link ordering) → Tasks 1–4. Part 1.3 (exact prop additions per component) → Tasks 1–4 respectively. Part 2.2 (hard-delete on campaign delete, filter on all three read paths) → Task 5.
- **Coupling lesson applied:** unlike the previous plan (where Tasks 4+5 had to be merged into one dispatch after a pre-flight conflict was found), every new prop added in Tasks 1–3 here is optional with a backward-compatible default, so Tasks 1, 2, and 3 each land independently without breaking their existing callers, and only Task 4 (which actually wires them together) depends on all three being done first. No merged dispatch should be needed this time — but if a pre-flight scan before Task 1 finds otherwise, escalate exactly as before.
- **Existing test churn:** Task 4 fully rewrites `ProfileViewCard.test.tsx` because two of its five existing tests assert the *old* immediate-save timing (`global.fetch` called right after "Log Outcome"); those assertions are now wrong under the new design and must change, not just gain siblings. Tasks 1–3 only *add* tests to their existing files, since their new props are additive/optional.
