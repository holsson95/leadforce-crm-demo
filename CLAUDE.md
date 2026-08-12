# CLAUDE.md — LeadForce CRM

> This file is the single source of truth for Claude Code when working on this project.
> Read this before every task. Do not deviate from these decisions unless explicitly asked.

---

## Project Overview

LeadForce is a sales engagement CRM built for outsourced SDR teams and sales agencies. It combines a power dialer, campaign management, pipeline tracking, and client reporting into one platform. It is being built as an internal tool first, then commercialized as a SaaS product. Primary competitors are Close and Zoho CRM.

**Key reference documents:**
- Product specification: `/docs/LeadForce_CRM_Specification_v1.1.docx` — full feature spec with 24 sections
- UI style guide: `/docs/LEADFORCE_UI_STYLE_GUIDE.md` — every visual decision (colors, typography, components, animations). Follow this exactly for all UI work.

---

## Tech Stack (Locked — Do Not Change)

| Layer            | Technology                          |
|------------------|-------------------------------------|
| Frontend         | Next.js 14+ (App Router) + React + TypeScript |
| UI Components    | Shadcn/UI + Tailwind CSS            |
| Fonts            | Outfit (UI) + JetBrains Mono (data) |
| Icons            | Lucide React (`lucide-react`)       |
| Backend          | Next.js API Routes (extract to Fastify later if needed) |
| Database         | PostgreSQL + Prisma ORM             |
| Real-Time        | Socket.io + Redis pub/sub           |
| Authentication   | Clerk (multi-tenant, role-based)    |
| Job Queue        | BullMQ + Redis                      |
| File Storage     | Cloudflare R2 (S3-compatible)       |
| AI               | Anthropic API (call summaries, objection handling, company summaries) |
| Telephony        | JustCall API (behind abstraction layer) |
| Hosting          | Vercel (frontend) + Railway (backend, DB, Redis) |

---

## Project Structure

```
leadforce/
├── CLAUDE.md                          # This file
├── docs/
│   ├── LeadForce_CRM_Specification_v1.1.docx
│   └── LEADFORCE_UI_STYLE_GUIDE.md
├── prisma/
│   └── schema.prisma                  # Database schema (source of truth for data model)
├── src/
│   ├── app/                           # Next.js App Router
│   │   ├── (auth)/                    # Auth pages (login, signup, invite)
│   │   ├── (dashboard)/               # Authenticated app shell
│   │   │   ├── layout.tsx             # Sidebar + Header layout
│   │   │   ├── page.tsx               # Dashboard (role-specific)
│   │   │   ├── campaigns/
│   │   │   ├── contacts/
│   │   │   ├── calling/               # Power dialer
│   │   │   ├── pipeline/
│   │   │   ├── scripts/
│   │   │   ├── schedule/              # Tasks + Calendar
│   │   │   ├── reports/
│   │   │   ├── imports/               # CSV data imports
│   │   │   └── settings/
│   │   ├── client-portal/             # Client-facing dashboard (separate layout)
│   │   └── api/                       # API routes
│   │       ├── campaigns/
│   │       ├── contacts/
│   │       ├── calls/
│   │       ├── pipeline/
│   │       ├── tasks/
│   │       ├── reports/
│   │       ├── imports/
│   │       ├── notifications/
│   │       └── webhooks/              # JustCall webhook receivers
│   ├── components/
│   │   ├── ui/                        # Shadcn/UI primitives (button, input, dialog, etc.)
│   │   ├── layout/                    # Sidebar, Header, PageShell
│   │   ├── dashboard/                 # KPI cards, campaign health, leaderboard
│   │   ├── dialer/                    # Queue panel, call controls, disposition form, waveform
│   │   ├── contacts/                  # Contact table, inline edit, search/filter
│   │   ├── pipeline/                  # Kanban board, deal cards, stage columns
│   │   ├── scripts/                   # Script editor, version history, branch nodes
│   │   ├── schedule/                  # Calendar widget, task list, task drawer
│   │   ├── reports/                   # Report charts, PDF export, leaderboard
│   │   └── shared/                    # Glass panel, drawers, badges, empty states
│   ├── lib/
│   │   ├── db.ts                      # Prisma client singleton
│   │   ├── auth.ts                    # Clerk helpers, role checks
│   │   ├── telephony/                 # Telephony abstraction layer
│   │   │   ├── types.ts              # TelephonyService interface
│   │   │   └── justcall.ts           # JustCall implementation
│   │   ├── ai/                        # AI service abstraction
│   │   │   ├── types.ts
│   │   │   └── anthropic.ts
│   │   ├── storage/                   # R2/S3 file operations
│   │   ├── jobs/                      # BullMQ job definitions
│   │   ├── notifications/             # Notification service
│   │   ├── csv/                       # CSV parsing, validation, dedup
│   │   └── utils/                     # General helpers, date/timezone, formatting
│   ├── hooks/                         # Custom React hooks
│   │   ├── use-realtime.ts            # Socket.io connection
│   │   ├── use-call-state.ts          # Dialer state management
│   │   └── use-notifications.ts       # Notification subscription
│   ├── stores/                        # Zustand stores (client state)
│   │   ├── dialer-store.ts
│   │   ├── notification-store.ts
│   │   └── ui-store.ts               # Sidebar collapse, drawer state, etc.
│   └── types/                         # Shared TypeScript types
│       ├── models.ts                  # Mirrors Prisma types with frontend additions
│       ├── api.ts                     # API request/response types
│       └── enums.ts                   # CallOutcome, PipelineStage, UserRole, etc.
├── public/
├── tailwind.config.ts
├── next.config.ts
└── package.json
```

### Structure Rules

- **One component per file.** File name matches component name in PascalCase.
- **Colocate related files.** A page's loading state, error boundary, and server actions live in the same route folder.
- **Server components by default.** Only add `"use client"` when the component needs interactivity, hooks, or browser APIs.
- **No barrel exports (index.ts re-exports).** Import directly from the file.

---

## Architecture Decisions

### Multi-Tenancy

Every database table that holds tenant-specific data includes a `tenantId` column. All queries filter by tenant. Use Prisma middleware or a wrapper function to enforce this automatically — never rely on individual queries to remember the filter. When the CRM is sold commercially, each buyer is a Tenant.

### Telephony Abstraction Layer

**This is critical.** All telephony operations go through `/src/lib/telephony/types.ts` which defines a `TelephonyService` interface:

```typescript
interface TelephonyService {
  makeCall(params: { from: string; to: string; campaignId: string }): Promise<{ callId: string }>;
  endCall(callId: string): Promise<void>;
  getCallStatus(callId: string): Promise<CallStatus>;
  getRecordingUrl(callId: string): Promise<string | null>;
  registerWebhook(eventType: string, callbackUrl: string): Promise<void>;
}
```

JustCall is the first implementation (`justcall.ts`). When Twilio support is added later, it's a new file implementing the same interface. **Never import JustCall directly from components or API routes** — always go through the service.

### AI Abstraction

Same pattern as telephony. Define an `AIService` interface for:
- `generateCompanySummary(companyData)` — used during CSV import
- `summarizeCall(transcript)` — used after call ends
- `suggestObjectionResponse(context)` — used during live calls

Anthropic API is the first implementation. This can be swapped without touching business logic.

### State Management

- **Server state**: React Server Components + Server Actions for data fetching and mutations. Use `revalidatePath` / `revalidateTag` for cache invalidation.
- **Client state**: Zustand for UI state (sidebar, drawers, dialer state). Keep stores small and focused.
- **Real-time state**: Socket.io for live updates (call state changes, new notifications, session tracking). The `use-realtime` hook manages the connection.

### Authentication & Authorization

Clerk handles auth. Roles are: `admin`, `manager`, `sdr`, `client`.

```typescript
// Role check pattern — use this in API routes and server components
import { auth } from "@clerk/nextjs";
import { hasPermission } from "@/lib/auth";

// In API route:
const { userId, orgId } = auth();
if (!hasPermission(userId, "campaigns:create")) {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}
```

Managers can delegate partial permissions to SDRs (campaigns, dashboards, pipeline access). Managers cannot delegate rules settings or role settings. This delegation is stored in the database, not in Clerk.

---

## Database Conventions (Prisma)

- **Naming**: Models in PascalCase (`Campaign`, `CallRecord`), fields in camelCase (`createdAt`, `tenantId`)
- **IDs**: Use `cuid()` for primary keys — not auto-increment integers (better for distributed systems)
- **Timestamps**: Every model has `createdAt DateTime @default(now())` and `updatedAt DateTime @updatedAt`
- **Soft deletes**: Use `deletedAt DateTime?` where data should be retained (campaigns, contacts). Hard delete for transient data (notifications, sessions).
- **Enums**: Define Prisma enums for: `UserRole`, `CallOutcome`, `ContactList`, `CampaignStatus`, `PipelineStageType`, `TaskStatus`, `TaskPriority`
- **Relations**: Always define both sides of a relation. Use `@relation` with explicit names when a model has multiple relations to the same table.

### Core Models (reference, not exhaustive)

```
Tenant, User, Client, Campaign, Contact, CallRecord, PipelineDeal,
PipelineStage, Task, Script, ScriptVersion, CalendarEvent, Session,
Notification, Report
```

Full data model details are in Spec Section 15. Contact fields from CSV are in Spec Section 12.2.

---

## API Conventions

- **Route pattern**: `/api/[resource]/route.ts` for collection, `/api/[resource]/[id]/route.ts` for single item
- **HTTP methods**: GET (list/read), POST (create), PATCH (update), DELETE (remove)
- **Response format**: Always return `{ data: T }` for success, `{ error: string, details?: any }` for errors
- **Pagination**: Use cursor-based pagination with `cursor` and `limit` params. Default limit: 25, max: 100.
- **Filtering**: Use query params. Example: `/api/contacts?campaignId=xxx&list=prospect&search=john`
- **Validation**: Use Zod schemas for all request body validation. Define schemas next to the route file.
- **Error codes**: 400 (validation), 401 (not authenticated), 403 (not authorized), 404 (not found), 409 (conflict), 500 (server error)

---

## Frontend Conventions

### Component Patterns

```typescript
// Server component (default — no directive needed)
export default async function CampaignList() {
  const campaigns = await getCampaigns();
  return <CampaignTable campaigns={campaigns} />;
}

// Client component (only when needed)
"use client";
import { useState } from "react";
export function DialerControls() { ... }
```

### Styling Rules

- **Follow `/docs/LEADFORCE_UI_STYLE_GUIDE.md` for all visual decisions.**
- Use Tailwind utility classes. Extend the Tailwind config with LeadForce design tokens (colors, fonts).
- Use CSS variables for theme values (defined in `globals.css`).
- Glass panel base: always use the `glass-panel` utility class defined in globals.
- No inline `style` attributes except for dynamic values (e.g., progress bar width).
- No CSS modules or styled-components.

### Tailwind Config Extensions

```typescript
// tailwind.config.ts — extend with LeadForce tokens
theme: {
  extend: {
    colors: {
      dark: "#0b0e14",
      card: "rgba(22, 28, 38, 0.6)",
      accent: "#00d4ff",
    },
    fontFamily: {
      sans: ["Outfit", "sans-serif"],
      mono: ["JetBrains Mono", "monospace"],
    },
    borderRadius: {
      "3xl": "1.5rem",  // 24px — large panels
      "4xl": "2rem",    // 32px — hero panels
    },
  },
}
```

### Form Handling

- Use `react-hook-form` + Zod for client-side forms
- Disposition form, contact edit, task creation all use slide-in drawers (see style guide Section 6)
- Never use HTML `<form>` submission — always controlled with `onSubmit` handlers

### Error & Loading States

- Loading: use skeleton components that match the glass-panel style (shimmer animation on `bg-white/5` blocks)
- Empty states: centered icon + message + CTA button, inside a glass panel
- Error states: glass panel with `border-red-500/20` border tint, error icon, message, retry button
- Toast notifications: slide-up from bottom-right, auto-dismiss after 5s, glass-panel style

---

## Call Outcome Logic (Critical Business Rules)

These rules are non-negotiable. Reference Spec Section 7.3 for the full table.

### Conversation-Tagged Outcomes
These outcomes increment the conversation counter in reports:
`Not Relevant Contact`, `Disqualified`, `Lead`, `Call Back Later`, `Meeting Booked`

### Company-Wide DNC Triggers
- **Disqualified**: all other contacts at the same company → DNC (reason: "Disqualified — company-wide")
- **Meeting Booked**: all other contacts at the same company → DNC (reason: "Irrelevant — meeting secured")

### Auto-Assigned Outcomes
- **Call-back Attempted**: auto-assigned when a prospect calls back (inbound match on phone number). Contact → Lead list. Show voicemail play button if applicable.

### Lead Hover Logic
- **Not Interested**: contact waits 1 week before entering the Lead queue (prospect forgets and may be receptive next time)

### Future List
- After 8 unanswered dial attempts → Future list
- After 3 months → re-enter prospect queue, dial up to 3 more times
- If still unresponsive → permanent DNC
- Thresholds configurable in Settings

### Meeting Booked Lead Status Tracking
Every MB is categorized for client reports:
1. **First Conversation MB** — booked on first meaningful call
2. **Follow-Up MB** — booked on a subsequent follow-up
3. **Nurtured Lead MB** — booked with a lead in the list >1 month

---

## Session Tracking

- Sessions are pre-defined calling windows tracked for **invoicable hours worked**
- Session starts automatically on first call of the day for a campaign
- Session ends when SDR leaves calling page OR scheduled window ends + last call >5 min ago
- Reports use daily aggregate metrics, not per-session metrics
- Assume 1 session per workday per campaign

---

## Build Order (Phases)

Follow this order. Each phase should result in working, testable software.

### Phase 1 — Foundation ✅ Complete
- [x] Next.js project with TypeScript, Tailwind, Shadcn/UI
- [x] Tailwind config with LeadForce design tokens
- [x] Global CSS with glass-panel class, CSS variables, font imports
- [x] Clerk auth with roles (admin, manager, sdr, client)
- [x] Prisma schema: Tenant, User, Client, Campaign (core models)
- [x] App shell: Sidebar + Header layout (from style guide)
- [x] Basic CRUD: create client, create campaign, assign SDRs

### Phase 2 — Contacts & Data ✅ Complete (1 item deferred)
- [x] CSV import with validation, dedup, DNC check
- [x] Contacts page: searchable, filterable, inline-editable table
- [ ] ~~AI company summary generation on import (background job)~~ — **deferred**: no `src/lib/ai/` implementation yet; requires Anthropic API wiring and BullMQ job
- [x] Contact detail drawer

### Phase 3 — Dialer ✅ Complete (1 item deferred)
- [ ] ~~JustCall live API integration~~ — **deferred**: `TelephonyService` interface and mock are in place (`src/lib/telephony/`); actual JustCall implementation file not yet written
- [x] Power dialer UI (3-panel layout): QueuePanel, CallControls, ScriptPanel, DispositionForm
- [x] Call outcome logging with all routing logic (`src/lib/outcome-router.ts` with full test coverage)
- [x] Conversation tagging (outcome-router handles conversation-counted outcomes)
- [x] Company-wide DNC triggers (outcome-router)
- [x] Session tracking (dialer session API routes)
- [x] Script display (read-only sidebar): ScriptPanel

### Phase 4 — Pipeline & Tasks ✅ Complete (2 items deferred)
- [x] Pipeline Kanban board with drag-and-drop
- [x] Auto-create deal on Meeting Booked (`src/lib/auto-deal.ts` with tests)
- [x] Task management (CRUD, assignment, status): TaskDrawer, TaskList, TaskRow, tasks API
- [ ] ~~Calendar widget with Google Calendar sync~~ — **deferred**: schedule page exists as a placeholder; no calendar widget components or Google Calendar integration built
- [ ] ~~Notification system (in-app + email)~~ — **deferred**: no notification components, store, or API routes

### Phase 5 — Reports & Dashboard ✅ Complete (1 item partially deferred)
- [x] Dashboard: Manager view + SDR view
- [x] KPI cards with sparklines and trend badges
- [x] Campaign health scoring (CampaignHealthCard, CampaignHealthGrid)
- [x] Client-facing reports page with CampaignFilter, PeriodToggle, LeaderboardTable, MBStatusBreakdown
- [ ] ~~PDF report generation~~ — **deferred**: report data and UI exist; PDF export not implemented
- [x] SDR leaderboard with "Most Improved" display
- [x] MB lead status tracking in reports (`src/lib/mb-lead-status.ts` with tests)

### Phase 6 — Polish & Client Portal 🔄 In Progress
- [x] **Phase 6a complete**: Client portal invite flow, Clerk webhook provisioning, portal layout, dashboard (KPIs + deals list), pipeline with permission-gated drag-and-drop — spec at `docs/superpowers/specs/2026-05-08-phase6-client-portal-design.md`
- [ ] Script management (create, edit, version, branch, duplicate, import) — **next up**
- [ ] Settings page (all configuration options, including dialer thresholds and delegation rules)
- [ ] Email integration (Gmail embed on client dashboard) — **explicitly deferred** (out of scope per Phase 6a spec)
- [ ] Slide-in drawers audit: SlideDrawer component exists; verify all edit/create flows use it consistently
- [ ] Responsive behavior (tablet + mobile)

#### Deferred items (cross-phase backlog)
- AI company summary on CSV import (Phase 2) — needs `src/lib/ai/` + BullMQ job
- JustCall live telephony (Phase 3) — interface ready, implementation file missing
- Calendar widget + Google Calendar sync (Phase 4)
- Notification system in-app + email (Phase 4)
- PDF report export (Phase 5)

---

## Testing

- Use Vitest for unit tests
- Use Playwright for E2E tests on critical flows (login, create campaign, import CSV, make call, log outcome, check pipeline)
- Test call outcome routing logic thoroughly — this is the most complex business logic
- Test multi-tenancy isolation: ensure one tenant's data never leaks to another

---

## Git Conventions

- **Branch naming**: `feature/[page]-[description]` (e.g., `feature/dialer-call-outcomes`)
- **Commit messages**: imperative tense, concise (e.g., "Add contact search and filter to contacts table")
- **No force pushes to main**

---

## Performance Targets

- First Contentful Paint: <1.5s
- Time to Interactive: <3s
- Lighthouse score: >90 (performance, accessibility)
- API response times: <200ms for reads, <500ms for writes
- Dialer latency (click-to-ring): <1s perceived

---

## When In Doubt

1. Check the spec (`/docs/LeadForce_CRM_Specification_v1.1.docx`) for feature requirements
2. Check the style guide (`/docs/LEADFORCE_UI_STYLE_GUIDE.md`) for visual decisions
3. Check this file for architecture and conventions
4. If none of these answer the question, make a reasonable choice and note the assumption in a code comment
