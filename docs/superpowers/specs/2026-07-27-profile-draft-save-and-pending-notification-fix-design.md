# Profile View Draft Save (Edit/Delete Before Commit) + Pending-Notification Cleanup Bug Fix

**Date:** 2026-07-27
**Scope:** Two independent pieces of work from the same request:
1. In the Calling page's Profile view, defer saving the outcome disposition and any standalone notes until "Next" is clicked, and let the SDR edit or delete either while they're still unsaved.
2. Fix a bug where the sidebar's pending-pipeline notification badge keeps counting items that belong to a deleted campaign.

---

## Part 1 — Profile view draft save

### 1.1 Problem

Today (per `2026-07-25-profile-view-outcome-pipeline-design.md`), logging an outcome in Profile view saves immediately — `handleDispositionSubmit` calls `logManualOutcome` as soon as "Log Outcome" is clicked, and the confirmation chip that follows is read-only. Standalone notes added via the Notes button also save immediately (`ContactNotesModal`'s `handleAddNote` POSTs on submit). Once either is saved there's no way to correct a mis-click or typo without leaving the app.

### 1.2 Behavior

Scoped entirely to Profile view, for the currently-displayed contact only. Nothing changes in List view (`CallControls.tsx`, `QuickLogDropdown.tsx`, `ContactNotesModal` opened from `QueuePanel`'s list rows) — all of those keep saving immediately, unchanged.

**Draft disposition:**
- Submitting the disposition form no longer calls `logManualOutcome`. It stores `{ contact, outcome, notes, pipeline }` locally as `draftDisposition` and shows the existing confirmation chip.
- The confirmation chip gains two icon buttons: **Edit** (pencil) and **Delete** (trash).
- Edit reopens the disposition form pre-filled with the draft's outcome, notes, and pipeline choice — all three are freely editable (a slight expansion from the "notes only" edit-scope discussed for *already-saved* records, since nothing here has been saved or routed yet, so there's no side effect to worry about reversing).
- Delete asks `window.confirm('Discard this outcome? Nothing has been saved yet.')`, then clears `draftDisposition` with no API call.

**Draft notes:**
- `ContactNotesModal`, when opened from Profile view, stages notes locally (`pendingNotes: { id, content }[]`) instead of POSTing on "Add Note."
- Staged notes render in their own list above the fetched historical entries, each tagged "Draft" with its own Edit (loads it back into the compose textarea, submit relabeled "Update Note") and Delete (`window.confirm('Delete this note?')`, then remove from the array — no API call) buttons.
- List view's `ContactNotesModal` usage is untouched — it keeps posting immediately, gated by a new `deferSave` prop that only Profile view sets.
- The Notes icon's badge count becomes `savedNoteCount + pendingNotes.length`, so the SDR sees drafts reflected immediately.

**Flushing (the actual save):**
- Clicking **Next**: if a `draftDisposition` exists, call `logManualOutcome` with its outcome/notes/pipeline (exactly the API call that used to happen on submit) — this also performs the store's existing queue-shift, so `advanceProfile()` must NOT additionally be called in this branch (same no-double-skip principle as before). Then flush any `pendingNotes` (sequential `POST`s to the existing `/api/contacts/[id]/notes` route, unchanged). If there was no `draftDisposition` but there were `pendingNotes`, flushing them doesn't shift the queue, so `advanceProfile()` must still be called explicitly. If neither existed (plain skip), `advanceProfile()` runs exactly as it does today.
- Clicking **No Answer**: unchanged instant-log-and-advance behavior, except it now flushes `pendingNotes` first (so a note drafted then abandoned via No Answer isn't silently lost) — `logManualOutcome('no_answer', ...)` still fires unconditionally afterward, same as today. No Answer itself can't have a `draftDisposition` pending (the Outcome button is unreachable whenever one exists — see 1.3).
- Clicking **"← Queue"** (leave Profile view) while a `draftDisposition` or any `pendingNotes` exist: `window.confirm('Discard unsaved outcome/notes for this contact?')` before actually switching to List view; declining leaves the SDR on the contact with drafts intact.

### 1.3 Component changes

- **`DispositionForm.tsx`**: add `initialNotes?: string` and `initialPipeline?: PipelineAction` props, used to seed the notes textarea and the pipeline toggle/stage selection when reopened for editing. `onSubmit`'s contract is unchanged — the caller (now `ProfileViewCard`) decides whether it's an immediate save (list view, unchanged) or a local stage (Profile view).
- **`ProfileActionBar.tsx`**: the confirmed-state branch gains Edit/Delete icon buttons next to the chip, wired through two new props, `onEditDraft: () => void` and `onDeleteDraft: () => void` (delete's `window.confirm` lives here, next to the button). `handleNoAnswer` gains one `await onBeforeNoAnswer()` call (new required prop) before its existing `logManualOutcome` call.
- **`ProfileViewCard.tsx`**: `pinned` is renamed `draftDisposition` (same shape plus a new `pipeline?: PipelineAction` field) since it no longer represents an already-saved record. Adds `pendingNotes` state, a `flushPendingNotes` helper, and rewrites `handleDispositionSubmit`/`handleNext`/the "← Queue" button's `onClick` per 1.2. Passes the new `deferSave`/`pendingNotes`/staging-callback props to `ContactNotesModal`.
- **`ContactNotesModal.tsx`**: adds `deferSave?: boolean`, `pendingNotes?: { id: string; content: string }[]`, `onStageNote?: (content: string) => void`, `onUpdatePendingNote?: (id: string, content: string) => void`, `onDeletePendingNote?: (id: string) => void`. When `deferSave` is true, "Add Note" calls `onStageNote` instead of POSTing, the pending list renders above the fetched entries, and each pending item gets its own Edit/Delete controls as described in 1.2. `hideOutcome` continues to control the tab bar exactly as today — unrelated to this change.

### 1.4 Out of scope

- Editing or deleting an *already-saved* (historical) call record or note — this whole feature only ever touches state that hasn't hit the database yet. Nothing here requires a schema change, a soft-delete field on `CallRecord`, or new API routes.
- Any change to List view's save timing.
- A `beforeunload`/tab-close warning for unsaved drafts.
- A dedicated confirm-dialog component — this reuses the `window.confirm()` convention already used by `ContactsTable.tsx`/`ClientsTable.tsx`, since no shared dialog component exists yet and building one is unrelated to this request.

---

## Part 2 — Pending-notification cleanup on campaign deletion

### 2.1 Root cause

The sidebar's pending-pipeline badge (`src/app/(dashboard)/layout.tsx:30-34`, `db.pendingPipelineDeal.count()`), the Pipeline page's pending list (`src/app/(dashboard)/pipeline/page.tsx:77-86`), and `/api/pipeline/pending/route.ts:21-36` all query `PendingPipelineDeal` directly — none of them check the parent campaign's `deletedAt`/`archivedAt`. Deleting a campaign (`src/app/api/campaigns/[id]/route.ts:57-89`) soft-deletes `Contact` and `Campaign` rows in a transaction but never touches `PendingPipelineDeal`, so its rows for that campaign are orphaned and keep inflating every one of those counts forever. Archiving (`src/app/api/campaigns/[id]/archive/route.ts:20-25`) has the same gap.

### 2.2 Fix

- **Delete path**: extend the existing `$transaction` in `src/app/api/campaigns/[id]/route.ts` to also delete `PendingPipelineDeal` rows where `campaignId` matches. This is a hard delete (not soft) — `PendingPipelineDeal` is a queue marker, not a record of truth that needs retention, and a deleted campaign can't be un-deleted.
- **Archive path**: campaigns can be reactivated, so archiving should not delete `PendingPipelineDeal` rows — instead, all three read paths (badge count, pipeline page, `/api/pipeline/pending`) add a `campaign: { deletedAt: null, archivedAt: null }` filter, so archived campaigns' pending items stop counting/listing while they still exist for reactivation.
- Net effect: a deleted campaign's pending items are gone immediately (hard delete); an archived campaign's pending items stop showing up everywhere the count/list is read, without being destroyed.

### 2.3 Out of scope

- Any change to how `PipelineDeal` (the promoted/actual pipeline entries, as opposed to `PendingPipelineDeal`) are affected by campaign deletion/archival — not reported as buggy, not touched here.
- Building the `Notification` model mentioned in CLAUDE.md's roadmap — confirmed not to exist; this bug is entirely about `PendingPipelineDeal`, which is what the badge actually reflects today.
