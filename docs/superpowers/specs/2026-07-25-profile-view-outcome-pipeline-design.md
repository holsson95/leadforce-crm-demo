# Profile View — Outcome Notes & Pipeline Design

**Date:** 2026-07-25
**Scope:** Bring the list view's pipeline-eligibility workflow into the Profile view's outcome-logging flow, add a notes-required rule for pipeline-eligible outcomes (both views), and stop the Profile view from silently auto-advancing to the next contact when an outcome (other than No Answer) is logged.

**Supersedes:** Section 7c of `2026-07-22-calling-profile-view-design.md`, which specified instant-log-and-auto-advance for the Outcome button. That behavior is replaced by the flow in Section 3 below. Sections 7a, 7b (No Answer), 7d (Notes), and 7e (Next) of that design are unchanged.

---

## 1. Problem

Today, `DispositionForm` (used by the list view) already has the full workflow for outcomes that matter to the pipeline: `PIPELINE_ELIGIBLE_OUTCOMES` (`connected`, `lead`, `call_back_later`, `meeting_booked`) reveal an "Add to pipeline" toggle with stage selection. The Profile view's `ProfileActionBar` bypasses all of this — selecting any outcome calls `logManualOutcome(contact.id, outcome, '')` directly, with empty notes and no pipeline option, and the view immediately jumps to the next contact as a side effect of how the store's queue array is mutated.

This design:
1. Brings the pipeline workflow into the Profile view by reusing `DispositionForm`.
2. Adds a notes-required rule for pipeline-eligible outcomes, enforced in both views.
3. Stops the Profile view's outcome logging from auto-advancing — the SDR reviews the logged outcome and clicks Next deliberately. No Answer is unchanged: it still logs and advances immediately.

---

## 2. Notes-required rule

`PIPELINE_ELIGIBLE_OUTCOMES` (`connected`, `lead`, `call_back_later`, `meeting_booked`) require non-empty (trimmed) notes before the outcome can be submitted. This is independent of whether the SDR actually adds the contact to the pipeline — the requirement is tied to the outcome, not the toggle.

- **Client-side:** `DispositionForm`'s `submitDisabled` gains `|| (PIPELINE_ELIGIBLE_OUTCOMES.has(outcome) && !notes.trim())`. The "Notes" label reads "Notes *" and shows a small "Notes required for this outcome" hint when the outcome is eligible.
- **Server-side:** `/api/dialer/log-outcome`'s request validation rejects with 400 when `outcome` is in `PIPELINE_ELIGIBLE_OUTCOMES` and `notes` is missing or blank. This is defense-in-depth — the two other call sites that log outcomes with a fixed empty string (`ProfileActionBar`'s No Answer button, `QuickLogDropdown`) never pass a pipeline-eligible outcome with empty notes after this change, but the API shouldn't rely on that.
- Applies identically to the list view and the Profile view, since both funnel through `DispositionForm` and the same API route.

---

## 3. Profile view outcome flow

### 3a. Current behavior (being replaced)

`ProfileActionBar`'s Outcome button opens `OutcomeSearchDropdown`; selecting an outcome calls `logManualOutcome(contact.id, outcome, '')` immediately. That store action removes the contact from `currentContact`/`queue` and appends it to `calledToday` — the same bookkeeping the list view relies on to keep dispositioned contacts out of the active queue. Because `profileIndex` doesn't change but the underlying `allContacts` array shifts left by one, `allContacts[profileIndex]` now resolves to what was the next contact — the view appears to auto-advance, even though nothing explicitly moved the pointer.

### 3b. New behavior

1. SDR clicks the **Outcome** icon → `OutcomeSearchDropdown` opens (unchanged).
2. Picking an outcome no longer logs it immediately. It opens `DispositionForm` inline, in place of the icon row, with:
   - `initialOutcome={selected}` and `lockOutcome` — outcome shows as a labeled pill with a "change" link that reopens the search dropdown, instead of the list view's `Select`.
   - Notes field, required per Section 2 when the outcome is pipeline-eligible.
   - The existing "Add to pipeline" section, shown automatically when `PIPELINE_ELIGIBLE_OUTCOMES.has(outcome)` — same stage-fetch and "queue for later" logic as today, untouched.
   - "Log Outcome" (submit) and "Cancel" (discards the selection, returns to the icon row without logging anything) buttons.
3. Submitting calls the existing `logManualOutcome(contact.id, outcome, notes, pipelineAction)` — no change to that store action's queue-mutation behavior.
4. On success, the action bar shows a **confirmation state** in place of the icon row: an outcome badge + notes preview (visually consistent with today's "Marked as No Answer" chip), plus the Next button. The contact stays on screen — the SDR must click Next to move on.
5. Clicking **Next** clears the confirmation state. No index math is needed: the store already advanced the underlying array in step 3, so the contact revealed at the current `profileIndex` is already the correct next one. This is implemented as component-local state in `ProfileViewCard`/`ProfileActionBar` — a pinned snapshot of `{ contact, outcome, notes }` captured right before the `logManualOutcome` call and cleared on Next — not a change to `dialer-store.ts`'s queue-shift mechanics. `QuickLogDropdown` and `ContactNotesModal`, which also call `logManualOutcome` today from list-view contexts, are unaffected.
6. **No Answer** is unchanged: it still calls `logManualOutcome(contact.id, 'no_answer', '')` directly (no notes required — `no_answer` isn't pipeline-eligible) and the view still advances immediately, since there is no pinned snapshot for this path.

### 3c. Component changes

- `DispositionForm.tsx`: add `initialOutcome?: CallOutcome`, `lockOutcome?: boolean`, `onCancel?: () => void` props. When `lockOutcome` is true, render a locked outcome pill instead of the `Select`, with a "change" affordance that calls a new `onChangeOutcome?: () => void` callback (Profile view uses it to reopen `OutcomeSearchDropdown`).
- `ProfileActionBar.tsx`: replace the instant `handleOutcomeSelect` with a two-step flow — outcome search dropdown selection opens the embedded `DispositionForm` instead of calling `logManualOutcome` directly. Add the pinned-snapshot confirmation state described in 3b step 5.
- `ProfileViewCard.tsx`: pass `campaignId` down so `DispositionForm`'s pipeline-stage fetch works (list view already has this via `CallControls`).

No changes to `dialer-store.ts`, `outcome-router.ts`, or the removal/`calledToday` bookkeeping in `logManualOutcome`.

---

## 4. Out of scope

- Changing list view's auto-advance behavior (unchanged — it already requires an explicit disposition submit per call).
- Changing `No Answer`'s behavior in any way.
- Adding notes-required rules to any outcome outside `PIPELINE_ELIGIBLE_OUTCOMES`.
- Auto-creating pipeline deals off an outcome (pipeline addition stays an explicit SDR choice via the toggle, in both views).
- Restyling `DispositionForm` beyond what's needed to embed it in the Profile view's action-bar area.

---

## 5. File summary

| File | Action | Notes |
|------|--------|-------|
| `src/components/dialer/DispositionForm.tsx` | Modify | Notes-required validation; `initialOutcome`, `lockOutcome`, `onChangeOutcome`, `onCancel` props |
| `src/app/api/dialer/log-outcome/route.ts` | Modify | Reject pipeline-eligible outcomes with empty notes (400) |
| `src/components/dialer/ProfileActionBar.tsx` | Modify | Outcome selection opens embedded `DispositionForm` instead of logging instantly; confirmation/pinned-snapshot state; Next clears it |
| `src/components/dialer/ProfileViewCard.tsx` | Modify | Pass `campaignId` through to the embedded `DispositionForm` |
