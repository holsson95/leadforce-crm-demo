# Quick-Log Dropdown — Design Spec

**Date:** 2026-05-13
**Status:** Ready for implementation

---

## Context

SDRs currently log call outcomes through the full DispositionForm in the CallControls panel (right side). For no-contact outcomes like No Answer, Voicemail, or AI Assistant, there are no notes to write — the current form forces unnecessary clicks. This feature adds a one-click dropdown on the active queue row so SDRs can log simple outcomes without leaving the queue panel.

---

## Design Decisions

| Decision | Choice |
|---|---|
| Placement | `▾` button in each queue row, between notes icon and call button |
| Enabled on | Active contact only — dimmed/disabled on all other rows |
| Trigger symbol | `▾` chevron-down |
| DNC outcomes | Inline confirmation step before logging |
| Disconnected rule | 1st click logs normally; 2nd click auto-DNCs silently (no warning badge) |
| Notes | Quick-log bypasses notes — full DispositionForm still available for outcomes with notes |

---

## The 9 Quick Outcomes

Grouped into three visual sections with dividers:

### Section 1 — No Contact (no status change)
| Label | CallOutcome enum value | Behavior |
|---|---|---|
| No Answer | `no_answer` | Increments dial attempts |
| Voicemail | `voicemail` | Increments dial attempts |
| AI Assistant | `ai_assistant` | Increments dial attempts |
| Gatekeeper | `not_available` | Increments dial attempts |

### Section 2 — Soft Outcomes
| Label | CallOutcome enum value | Behavior |
|---|---|---|
| Not Interested | `not_interested` | 7-day cooldown, mark as lead |

### Section 3 — DNC Outcomes (require confirmation)
| Label | CallOutcome enum value | Behavior |
|---|---|---|
| Not Relevant | `not_relevant_contact` | Contact → DNC |
| Disconnected | `hung_up` | 1st: log only. 2nd: auto-DNC silently |
| Wrong Number | `wrong_number` | Contact → DNC |
| DNC | `does_not_take_cold_calls` | Contact → DNC |

> **Outcome-router fix — Not Relevant:** `not_relevant_contact` currently routes to `lead` status. This is incorrect — it must route to `dnc`. The fix goes in `outcome-router.ts` and corrects behavior for both quick-log and the full DispositionForm.

> **Outcome-router addition — Disconnected auto-DNC:** `hung_up` currently triggers no status change. Add logic: when routing `hung_up`, count prior `hung_up` records for this contact — if count ≥ 1, set contact status to DNC.

---

## Component Design

### `QuickLogDropdown` (new component)

**File:** `src/components/dialer/QuickLogDropdown.tsx`

**Props:**
```typescript
interface QuickLogDropdownProps {
  contactId: string
  contactName: string
  campaignId: string
  callRecordId?: string  // if a call record exists (post-call), pass it; else manual=true
  disabled: boolean       // true for non-active rows
  onLogged: () => void    // callback to refresh queue / add dot
}
```

**States:**
1. **Idle** — `▾` button, dimmed if `disabled`
2. **Open** — dropdown visible with 9 options in 3 sections
3. **DNC Confirm** — after clicking a DNC outcome, the dropdown shows "Confirm DNC for [Name]?" with a red confirm button and cancel link (replaces the outcome list)
4. **Loading** — spinner while API call is in flight
5. **Done** — closes dropdown, calls `onLogged()`

**Dropdown layout:**
- Width: 200px, positioned below and right-aligned to the trigger
- Header: small uppercase label "Quick Log · [contact first name]"
- Sections separated by `<hr>` dividers
- Each item: colored dot + label + optional consequence badge
- DNC items show `→ DNC` badge in red; Not Interested shows `Requeue 1wk` badge in amber
- Disconnected shows no badge (1st attempt is silent)

### Changes to `QueuePanel.tsx`

- Add `▾` icon button to the row grid between notes icon and call button
- Render `<QuickLogDropdown>` with `disabled={contact.id !== activeContactId}`
- On `onLogged`: trigger a queue refresh (existing `fetchQueue` pattern) so the new call history dot appears

---

## API

Reuses the existing `POST /api/dialer/log-outcome` endpoint. Quick-log always sends `manual: true` with `campaignId` (no `callRecordId` needed).

```typescript
// Quick-log request body
{
  manual: true,
  campaignId: string,
  contactId: string,
  outcome: CallOutcome,
  notes: undefined  // quick-log never sends notes
}
```

---

## Outcome-Router Changes

**1. Fix `not_relevant_contact` routing** — change from `lead` to `dnc`:

```typescript
case 'not_relevant_contact': {
  await tx.contact.update({ where: { id: contactId }, data: { status: 'dnc' } })
  break
}
```

**2. Add disconnected auto-DNC** for `hung_up`:

```typescript
case 'hung_up': {
  const priorDisconnects = await tx.callRecord.count({
    where: { contactId, outcome: 'hung_up', tenantId },
  })
  if (priorDisconnects >= 1) {
    await tx.contact.update({ where: { id: contactId }, data: { status: 'dnc' } })
  }
  break
}
```

---

## Files to Modify

| File | Change |
|---|---|
| `src/components/dialer/QuickLogDropdown.tsx` | **New** — dropdown component |
| `src/components/dialer/QueuePanel.tsx` | Add `▾` button to row grid, wire `QuickLogDropdown` |
| `src/lib/outcome-router.ts` | Fix `not_relevant_contact` → DNC (was lead); add disconnected-count → auto-DNC for `hung_up` |

---

## Verification

1. Open `/calling`, select a campaign with contacts in queue
2. Verify `▾` button is visible on all rows, dimmed on non-active contacts
3. Click `▾` on the active contact — dropdown opens with 9 options in 3 sections
4. Select "No Answer" — logs immediately, new dot appears in call history, dropdown closes
5. Select "Wrong Number" — confirmation step appears, cancel returns to list, confirm logs and contact disappears from queue
6. Call the same contact twice and select "Disconnected" both times — second log should auto-DNC (contact leaves queue, status = DNC in DB)
7. Select "Not Interested" — contact leaves queue, verify `notInterestedUntil` is set ~7 days out in DB
8. Verify `▾` on non-active rows does nothing when clicked
