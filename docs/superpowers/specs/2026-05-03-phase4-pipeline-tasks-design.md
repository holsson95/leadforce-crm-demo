# Phase 4: Pipeline & Tasks — Design Spec

**Date:** 2026-05-03
**Scope:** Pipeline Kanban board, auto-deal on Meeting Booked, Task management
**Deferred:** Google Calendar sync, Notification system (moved to Phase 5)
**Approach:** Feature-by-feature — Pipeline + auto-deal first, Tasks second

---

## 1. Data Model

### New Prisma Models

```prisma
model PipelineStage {
  id        String         @id @default(cuid())
  tenantId  String
  clientId  String
  name      String
  color     String         // hex color, e.g. "#00d4ff"
  position  Int            // display order (ascending)
  createdAt DateTime       @default(now())
  updatedAt DateTime       @updatedAt
  tenant    Tenant         @relation(fields: [tenantId], references: [id])
  client    Client         @relation(fields: [clientId], references: [id])
  deals     PipelineDeal[]

  @@index([tenantId, clientId])
}

model PipelineDeal {
  id         String        @id @default(cuid())
  tenantId   String
  clientId   String
  stageId    String
  contactId  String
  campaignId String
  title      String        // auto: "[firstName] [lastName] — [companyName]"
  value      Decimal?      // optional deal value
  notes      String?
  source     String        @default("auto") // "auto" | "manual"
  closedAt   DateTime?     // set when moved to a won/lost stage (future)
  createdAt  DateTime      @default(now())
  updatedAt  DateTime      @updatedAt
  tenant     Tenant        @relation(fields: [tenantId], references: [id])
  client     Client        @relation(fields: [clientId], references: [id])
  stage      PipelineStage @relation(fields: [stageId], references: [id])
  contact    Contact       @relation(fields: [contactId], references: [id])
  campaign   Campaign      @relation(fields: [campaignId], references: [id])

  @@unique([contactId, campaignId])
  @@index([tenantId, clientId])
  @@index([tenantId, stageId])
}

model Task {
  id          String     @id @default(cuid())
  tenantId    String
  assigneeId  String
  contactId   String?
  campaignId  String?
  title       String
  description String?
  color       String     // free-choice hex color
  dueDate     DateTime?
  status      TaskStatus @default(pending)
  createdAt   DateTime   @default(now())
  updatedAt   DateTime   @updatedAt
  deletedAt   DateTime?
  tenant      Tenant     @relation(fields: [tenantId], references: [id])
  assignee    User       @relation(fields: [assigneeId], references: [id])
  contact     Contact?   @relation(fields: [contactId], references: [id])
  campaign    Campaign?  @relation(fields: [campaignId], references: [id])

  @@index([tenantId, assigneeId])
  @@index([tenantId, status])
}

enum TaskStatus {
  pending
  in_progress
  completed
}
```

### Back-relations required on existing models

- `Tenant`: add `pipelineStages PipelineStage[]`, `pipelineDeals PipelineDeal[]`, `tasks Task[]`
- `Client`: add `pipelineStages PipelineStage[]`, `pipelineDeals PipelineDeal[]`
- `Contact`: add `pipelineDeals PipelineDeal[]`, `tasks Task[]`
- `Campaign`: add `pipelineDeals PipelineDeal[]`, `tasks Task[]`
- `User`: add `tasks Task[]`

### Design notes

- `PipelineStage.position` is an integer — stage reordering is deferred to the Settings phase.
- `PipelineDeal` has a `@@unique([contactId, campaignId])` constraint — upsert on Meeting Booked prevents duplicate deals for the same contact/campaign.
- `Task.color` is an unconstrained hex string — validation happens in the UI (color picker), not the DB.
- `Task.deletedAt` enables soft delete; hard deletes are not used for tasks.

---

## 2. Pipeline Kanban

### Route

`/pipeline` → `src/app/(dashboard)/pipeline/page.tsx`

### Page layout

1. **Client selector** — dropdown at the top of the page listing all clients for the tenant. Defaults to the first client. Persists selection in URL query param (`?clientId=xxx`).
2. **Kanban board** — horizontally scrolling flex container. One glass-panel column per `PipelineStage` (ordered by `position`). If no stages exist for the selected client, show an empty state with a prompt to configure stages in settings.
3. **Column header** — stage name, color dot, deal count badge (`bg-[accent]/10 text-[accent]`).
4. **Deal card** — glass-panel `rounded-2xl p-4`, left border in stage color, contact name + company (bold), campaign name (muted), optional value, `createdAt` as relative date. Hover: `border-[accent]/20` glow.
5. **Drag-and-drop** — powered by `@dnd-kit` (already installed). Dragging a card between columns fires `PATCH /api/pipeline/deals/[id]` with new `stageId`. Optimistic UI — card moves immediately, reverts with toast on failure.

### API routes

| Method | Route | Purpose |
|--------|-------|---------|
| GET | `/api/pipeline/stages?clientId=xxx` | List stages for a client, ordered by position |
| GET | `/api/pipeline/deals?clientId=xxx` | All deals for a client, with contact + campaign included |
| PATCH | `/api/pipeline/deals/[id]` | Update stageId (drag), notes, value |

Stage CRUD (`POST /api/pipeline/stages`, `PATCH /api/pipeline/stages/[id]`, `DELETE /api/pipeline/stages/[id]`) is deferred to Phase 6 (Settings page). Only the GET route is built in this phase.

### Component files

- `src/app/(dashboard)/pipeline/page.tsx` — server component, fetches stages + deals
- `src/components/pipeline/KanbanBoard.tsx` — client component, dnd-kit context
- `src/components/pipeline/KanbanColumn.tsx` — single stage column with droppable
- `src/components/pipeline/DealCard.tsx` — draggable deal card

---

## 3. Auto-Deal on Meeting Booked

### Trigger

`POST /api/dialer/log-outcome` — when `outcome === "meeting_booked"`, after writing the `CallRecord` and running the outcome router, a deal is synchronously created.

### Logic

```
1. Resolve clientId from campaign
2. Find PipelineStage WHERE clientId = X AND tenantId = Y ORDER BY position ASC LIMIT 1
3. If no stage found → skip silently (pipeline not configured yet)
4. Upsert PipelineDeal:
     - key: { contactId, campaignId }
     - create: { tenantId, clientId, stageId, contactId, campaignId, title, source: "auto" }
     - update: { stageId } (reset to first stage if re-booked)
5. Title = "[firstName] [lastName] — [companyName]" or "[firstName] [lastName]" if no company
```

### Design notes

- Upsert (not insert) prevents duplicates and handles the re-book case cleanly.
- Synchronous — no queue, no event system. The outcome router is already synchronous; this is one extra DB call.
- Silent skip on missing stages keeps the dialer working even for clients with no pipeline configured.
- The upsert `update` clause only resets `stageId` — notes and value set manually are preserved.

---

## 4. Task Management

### Route

`/schedule` → `src/app/(dashboard)/schedule/page.tsx`

The `/schedule` route is specified for Tasks + Calendar in the spec. Since the calendar widget is deferred, this page is the task list only for this phase.

### Page layout

1. **Toolbar** — status filter tabs (All / Pending / In Progress / Completed), assignee filter (managers only — select from SDRs on the tenant), "+ New Task" button (primary style).
2. **Task list** — rows following the style guide's task list pattern:
   - Color dot (the task's hex color, `w-3 h-3 rounded-full`)
   - Checkbox (unchecked: `border-white/20`; checked: `border-[accent] bg-[accent]/20`)
   - Title (checked → `line-through text-gray-500`)
   - Optional contact badge + campaign badge if linked
   - Due date (relative, in red if overdue)
   - Assignee name (muted, managers view only)
3. **Empty state** — centered icon + "No tasks yet" + "+ New Task" button.
4. **Checking off** — clicking checkbox optimistically toggles `pending`/`in_progress` → `completed`. Fires `PATCH /api/tasks/[id]`. On failure, reverts with toast.

### Task drawer

Slides in from the right. Used for both create and edit. Fields:

| Field | Type | Required |
|-------|------|----------|
| Title | text input | yes |
| Description | textarea | no |
| Color | swatch grid (12 presets) + hex input | yes (defaults to first swatch) |
| Due date | date picker | no |
| Status | select (pending / in progress / completed) | yes |
| Linked contact | searchable dropdown | no |
| Linked campaign | searchable dropdown | no |

Assignee field: SDRs see it pre-filled with themselves (read-only). Managers see a dropdown of all SDRs + themselves.

### API routes

| Method | Route | Purpose |
|--------|-------|---------|
| GET | `/api/tasks` | List with filters (`assigneeId`, `status`, `contactId`, `campaignId`), cursor pagination |
| POST | `/api/tasks` | Create task |
| PATCH | `/api/tasks/[id]` | Update any field |
| DELETE | `/api/tasks/[id]` | Soft delete (`deletedAt = now()`) |

### Permissions

- SDRs: see only `assigneeId = currentUser.id`; cannot change assignee
- Managers: see all tasks for the tenant; can assign to any user

### Component files

- `src/app/(dashboard)/schedule/page.tsx` — server component, initial task fetch
- `src/components/schedule/TaskList.tsx` — client component, filter state, optimistic toggle
- `src/components/schedule/TaskRow.tsx` — single task row
- `src/components/schedule/TaskDrawer.tsx` — create/edit slide-in drawer

---

## 5. Out of Scope (deferred)

- Google Calendar sync
- Notification system (in-app + email)
- Pipeline stage reordering (Settings phase)
- Manual deal creation UI
- Deal value / won-lost tracking
- Task priorities
