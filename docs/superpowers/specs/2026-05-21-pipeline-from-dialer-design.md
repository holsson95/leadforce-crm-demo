# Pipeline from Dialer — Design Spec

**Date:** 2026-05-21  
**Status:** Approved

---

## Overview

Three related features:

1. **Add to Pipeline from DispositionForm** — after logging a call outcome, SDRs can optionally place the contact into a pipeline stage (or queue it for later if stages aren't configured yet or they're unsure).
2. **Pending Pipeline Queue** — a holding area in the pipeline page for contacts flagged "queue for later," with a manager UI to place them into stages once ready.
3. **Expanded Deal Card** — clicking a deal card on the Kanban board reveals a full read-only contact info panel inline.

Plus: a pipeline empty-state with a "Configure pipeline" CTA when a client has no stages.

---

## Feature 1: Add to Pipeline in DispositionForm

### Trigger

For these qualifying outcomes only: `connected`, `lead`, `call_back_later`, `meeting_booked`.

When one of these is selected in the outcome dropdown, a toggle row appears below it:

```
[●] Add to pipeline
```

Off by default. Toggling it on reveals a stage selector.

### Stage selector

The stage selector always includes **"Queue for later"** as the first option, followed by the actual pipeline stages for the campaign's client (fetched from a new API endpoint). If no stages are configured for the client, only "Queue for later" appears.

```
[ Queue for later           ]   ← always present
[ Stage 1 — Qualified      ]   ← only shown if stages exist
[ Stage 2 — Proposal       ]
[ Stage 3 — Negotiation    ]
```

The SDR can select "Queue for later" even when stages exist — useful when unsure which stage fits, or if the right stage hasn't been created yet.

### Submission behaviour

- **Toggle off:** outcome is logged, no pipeline action taken.
- **Toggle on, stage selected:** outcome is logged and a `PipelineDeal` is created in the selected stage.
- **Toggle on, "Queue for later":** outcome is logged and a `PendingPipelineDeal` is created (see Feature 2).
- **Toggle on, no selection:** submit button stays disabled — selection is required when toggle is on.

### Meeting Booked auto-creation removed

The existing `autoCreateDeal` call inside `/api/dialer/log-outcome` for `meeting_booked` is removed entirely. Deals are only created when the SDR explicitly uses the Add to Pipeline section.

---

## Feature 2: Pending Pipeline Queue

### Data model

New Prisma model:

```prisma
model PendingPipelineDeal {
  id         String      @id @default(cuid())
  tenantId   String
  clientId   String
  contactId  String
  campaignId String
  outcome    CallOutcome
  createdAt  DateTime    @default(now())

  tenant     Tenant      @relation(fields: [tenantId], references: [id])
  client     Client      @relation(fields: [clientId], references: [id])
  contact    Contact     @relation(fields: [contactId], references: [id])
  campaign   Campaign    @relation(fields: [campaignId], references: [id])

  @@unique([contactId, campaignId])
  @@index([tenantId, clientId])
}
```

One pending entry per contact+campaign pair (upsert on duplicate). If a deal already exists in the pipeline for the same contact+campaign, placing from the queue or selecting a stage in the disposition form moves the existing deal to the new stage rather than creating a duplicate.

### Pipeline page — Pending section

At the top of the pipeline page (above the Kanban columns), if there are any pending deals for the selected client, a collapsible **"Pending Pipeline"** section appears. A badge count on the Pipeline nav item shows the total pending count across all clients for the tenant.

Each row in the pending section shows:
- Contact name + company
- Outcome badge (e.g. "Lead", "Meeting Booked")
- Campaign name
- Date added

If stages are configured, each row has a **"Place in stage"** inline stage selector + confirm button. Confirming:
1. Creates a `PipelineDeal` in the selected stage (upsert — safe if one already exists from a concurrent action).
2. Deletes the `PendingPipelineDeal` record.

If stages are NOT configured, the row shows "Configure stages first" and the place action is disabled.

Each row also has a **dismiss** button (×) to remove from the queue without placing (for cases where the SDR added it in error).

### Pipeline empty state — no stages

When `stages.length === 0` for the selected client, the Kanban area is replaced by a glass-panel empty state:

- Icon + "No pipeline stages configured for [Client Name]"
- Users with `pipeline:write` permission: "Configure pipeline →" link to `/settings/pipeline?clientId=xxx`
- Users without permission: empty state only, no button

The pending section still renders above this empty state if there are pending contacts.

---

## Feature 3: Expanded Deal Card

### Trigger

Clicking a deal card (clean tap, no drag) expands an inline panel directly below it. Clicking again collapses it. Only one card can be expanded at a time — expanding a new card collapses any open one.

### Panel contents

Fetched via `GET /api/contacts/[contactId]` on first expand; cached in component state for subsequent expands.

Shown (read-only):
- Name, job title
- Company name, industry, employee count
- Email, mobile phone, corporate phone
- LinkedIn URL (clickable), website (clickable)
- City, state, country
- Contact status badge
- Campaign name
- Notes — the call notes from the disposition that created this deal, stored on the deal record at creation time (deal-level `notes` field)

**Not shown:** call history dots, add-notes input, edit contact form, dial attempts.

A skeleton shimmer (matching glass-panel style) shows while fetching.

### contactId in PipelineDealRow

`contactId` is added to `PipelineDealRow` type and included in the pipeline DB query so the expand panel knows which contact to fetch.

### Pending queue rows

The same expand panel is available on pending queue rows. The "Place in stage" action sits on the row itself, separate from the expanded panel.

---

## API Changes

### New endpoints

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/dialer/pipeline-stages?campaignId=xxx` | Returns `{ clientId, stages: [{id, name, color}] }` for the campaign's client |
| `GET` | `/api/pipeline/pending?clientId=xxx` | Returns pending deals for client |
| `POST` | `/api/pipeline/pending/[id]/place` | Body: `{ stageId }`. Creates deal, deletes pending record |
| `DELETE` | `/api/pipeline/pending/[id]` | Dismisses pending record |

### Updated endpoints

**`POST /api/dialer/log-outcome`** — body gains two optional fields:

```ts
stageId?:     string   // place in this stage
addToQueue?:  boolean  // add to pending queue instead
clientId?:    string   // required when addToQueue is true
```

If `stageId` is provided: creates `PipelineDeal` in that stage (upsert — moves existing deal if one already exists for the same contact+campaign). The disposition `notes` value is stored on the deal's `notes` field at creation time.  
If `addToQueue` is true: creates `PendingPipelineDeal` (upsert).  
If neither: outcome is logged with no pipeline action (existing behaviour for non-qualifying outcomes).

**Scope note:** The pipeline section applies only to `DispositionForm` (after a live call). `QuickLogDropdown` (quick-log from queue rows) is out of scope — it does not show the pipeline section.

The `autoCreateDeal` import and call are removed from this route.

---

## Component Changes

| File | Change |
|------|--------|
| `prisma/schema.prisma` | Add `PendingPipelineDeal` model; add `pendingPipelineDeals` relation to `Contact`, `Campaign`, `Client`, `Tenant` |
| `src/types/models.ts` | Add `PendingPipelineDealRow` type; add `contactId` to `PipelineDealRow` |
| `src/components/dialer/DispositionForm.tsx` | Add toggle + stage selector for qualifying outcomes; prop `campaignId` added; `onSubmit` gains optional `stageId` and `addToQueue`/`clientId` |
| `src/components/dialer/CallControls.tsx` | Pass store's `campaignId` to `DispositionForm`; forward pipeline params to `handleLogOutcome` |
| `src/stores/dialer-store.ts` | `logOutcome` and `logManualOutcome` signatures gain optional pipeline params |
| `/api/dialer/pipeline-stages/route.ts` | New GET endpoint |
| `/api/dialer/log-outcome/route.ts` | Accept `stageId`/`addToQueue`/`clientId`; remove `autoCreateDeal` call |
| `src/lib/auto-deal.ts` | No changes to file; just no longer called from log-outcome |
| `src/app/(dashboard)/pipeline/page.tsx` | Fetch pending deals; pass stages + pending to `KanbanBoard`; add empty-stages state; add pending badge count query |
| `src/components/pipeline/KanbanBoard.tsx` | Render `PendingPipelineSection` above columns; render empty-stages state |
| `src/components/pipeline/PendingPipelineSection.tsx` | New component: collapsible pending list with place/dismiss actions |
| `src/components/pipeline/DealCard.tsx` | Add click-to-expand; render `DealExpandPanel` inline below card |
| `src/components/pipeline/DealExpandPanel.tsx` | New component: fetches and displays full contact info read-only |
| `src/app/(dashboard)/layout.tsx` | Fetch pending deal count for Pipeline nav badge |
| `/api/pipeline/pending/route.ts` | New GET |
| `/api/pipeline/pending/[id]/place/route.ts` | New POST |
| `/api/pipeline/pending/[id]/route.ts` | New DELETE |

---

## Error Handling

- Stage fetch fails (network): stage selector shows "Failed to load stages — retry" with a retry button. Submit stays disabled.
- Place in stage fails: toast error, pending record stays in queue.
- Contact fetch for expand panel fails: show "Failed to load contact info" inside the expanded area with a retry link.
- Duplicate deal (contactId+campaignId unique constraint): the upsert handles this gracefully — deal moves to new stage rather than erroring.

---

## Out of Scope

- Bulk-place multiple pending contacts at once (future enhancement)
- SDR-level permission to place from pending queue (currently any user with `pipeline:write` can place)
- Notification to manager when a contact enters the pending queue (deferred — notification system not yet built)
