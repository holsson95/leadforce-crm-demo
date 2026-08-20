# LeadForce CRM (Public Demo)

A high-performance sales engagement platform built for outsourced SDR teams and sales agencies. LeadForce combines a power dialer, campaign management, pipeline tracking, and client reporting into a single workspace.

This repository is a **public portfolio demo** built from a real client project. Telephony and email/invite flows are fully simulated — no real phone calls are ever placed and no real emails are ever sent — and all data is fictional. See [About this demo](#about-this-demo) below.

---

## About this demo

- **One-click access.** Click "View Demo" on the sign-in screen — no signup, no email required.
- **Two fictional tenants** ("Acme Outreach" and "Nova Sales") with their own reps, clients, campaigns, contacts, and pipeline, seeded by `scripts/seed-demo.ts`. A switcher in the header lets you flip between them live to see multi-tenant data isolation in action.
- **Simulated telephony.** `src/lib/telephony/mock.ts` drives the dialer's call states locally — there's no real telephony API this build can reach.
- **Data resets daily** via a Vercel Cron job (`/api/cron/reset-demo`) that re-runs the seed script, so feel free to edit, delete, or create anything.

---

## Overview

LeadForce is designed for companies that run outbound calling campaigns on behalf of their clients. SDRs work through prospect lists using a built-in power dialer, log structured call outcomes, and automatically feed qualified leads into campaign pipelines. Managers get real-time visibility into campaign health, SDR performance, and data quality — all from a single dashboard.

### Key Features

- **Power Dialer** — auto-dial through prospect queues with live call controls, AI objection handling, and AI call summarization
- **Campaign Management** — organize all activity by client and campaign with per-campaign scripts, pipelines, and reporting
- **Smart Call Outcomes** — structured disposition system with automatic list routing, conversation tagging, and company-wide DNC triggers
- **Pipeline Tracking** — Kanban boards per campaign with auto-deal creation on meeting booked
- **Dual Reporting** — client-facing reports (live dashboard + weekly PDF) and internal performance metrics with SDR leaderboard
- **Campaign Data Health** — automated health scoring to surface which campaigns need new data or a strategy change
- **Contact Management** — searchable, editable contact lists with inline editing, bulk actions, and full call history
- **Script Engine** — branching decision-tree scripts assigned per campaign with version tracking and performance comparison
- **Session Tracking** — automatic calling session detection for invoicable hours tracking
- **Client Portal** — limited login for clients to view aggregate metrics and manage their own pipeline

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14+ (App Router), React, TypeScript |
| UI | Shadcn/UI, Tailwind CSS |
| Fonts | Outfit (UI), JetBrains Mono (data) |
| Icons | Lucide React |
| Database | PostgreSQL (Supabase/Neon) with Prisma ORM |
| Auth | Clerk (multi-tenant, role-based) |
| AI | Google Gemini API (company summaries) |
| Telephony | Simulated in this demo, behind the same abstraction layer a real provider would use |
| Hosting | Vercel (app + cron jobs) |

---

## Getting Started

### Prerequisites

- Node.js v18+
- npm
- Git
- A Postgres database (Supabase or Neon both work)
- A Clerk account with API keys

### Installation

```bash
# Clone the repository
git clone https://github.com/<you>/leadforce-crm-demo.git
cd leadforce-crm-demo

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env.local
# Fill in your keys — see .env.example for what each one is for

# Generate Prisma client and run migrations
npx prisma generate
npx prisma migrate dev

# Seed the two demo tenants
npm run db:seed:demo

# Start the development server
npm run dev
```

The app will be available at `http://localhost:3000`.

### Environment Variables

See [.env.example](.env.example) for the full list with explanations — copy it to `.env.local` and fill in real values. The last section (`NEXT_PUBLIC_DEMO_EMAIL` / `NEXT_PUBLIC_DEMO_PASSWORD` / `DEMO_USER_CLERK_ID`) is only needed to power the "View Demo" one-click login; everything else is standard Clerk + Postgres + Gemini setup.

---

## Project Structure

```
leadforce-crm/
├── CLAUDE.md                    # AI assistant project context
├── docs/
│   ├── LeadForce_CRM_Specification.docx
│   └── LEADFORCE_UI_STYLE_GUIDE.md
├── prisma/
│   └── schema.prisma
├── src/
│   ├── app/                     # Next.js App Router (pages + API)
│   │   ├── (auth)/              # Sign-in ("View Demo" one-click login); signup/invite are disabled in this build
│   │   ├── (dashboard)/         # Main app (sidebar layout)
│   │   ├── client-portal/       # Client-facing views
│   │   └── api/                 # API routes
│   ├── components/
│   │   ├── ui/                  # Shadcn/UI primitives
│   │   ├── layout/              # Sidebar, Header, PageShell
│   │   ├── dialer/              # Power dialer components
│   │   ├── pipeline/            # Kanban board, deal cards
│   │   └── shared/              # Glass panels, drawers, badges
│   ├── lib/
│   │   ├── telephony/           # Telephony abstraction layer
│   │   ├── ai/                  # AI service abstraction
│   │   ├── jobs/                # Background job definitions
│   │   └── utils/               # Helpers, formatters
│   ├── hooks/                   # Custom React hooks
│   ├── stores/                  # Zustand state stores
│   └── types/                   # Shared TypeScript types
└── tailwind.config.ts
```

---

## User Roles

| Role | Description |
|---|---|
| **Admin** | Full system access. Configures settings, integrations, and permissions. |
| **Manager** | Creates campaigns, imports data, manages SDRs, views all KPIs. Can also make calls. Can delegate partial permissions to SDRs. |
| **SDR / Caller** | Makes calls, logs outcomes, manages own tasks and pipeline deals. |
| **Client** | External client with limited access to view reports and edit their own pipeline. |

---

## Development

### Available Scripts

```bash
npm run dev          # Start development server
npm run build        # Production build
npm run start        # Start production server
npm run lint         # Run ESLint
npm run test         # Run Vitest unit tests
npm run test:e2e     # Run Playwright E2E tests
npx prisma studio    # Open Prisma database browser
npx prisma db push   # Push schema changes to database
```

### Branch Naming

```
feature/[page]-[description]    # feature/dialer-call-outcomes
fix/[page]-[description]        # fix/contacts-search-filter
```

### Commit Messages

Use imperative tense: "Add contact search filter" not "Added contact search filter".

---

## Architecture Notes

### Multi-Tenancy

Every tenant-specific table includes a `tenantId` column. Tenant isolation is enforced at two levels: Prisma middleware automatically filters all queries by tenant, and Supabase RLS policies act as a database-level safety net.

### Telephony Abstraction

All telephony operations go through a `TelephonyService` interface (`src/lib/telephony/types.ts`). This demo build only ships `MockTelephonyService` — there is no real provider implementation in this repo, so it's structurally impossible for it to place a real call. A real provider (JustCall, Twilio, etc.) would be a drop-in implementation of the same interface; components and API routes never import a provider directly.

### AI Abstraction

Same pattern as telephony. An `AIService` interface wraps company summary generation, call summarization, and live objection handling. Anthropic API is the initial implementation.

---

## Documentation

| Document | Description |
|---|---|
| `CLAUDE.md` | AI development context — tech stack, conventions, architecture decisions, build order |
| `docs/LeadForce_CRM_Specification.docx` | Full product specification (24 sections) |
| `docs/LEADFORCE_UI_STYLE_GUIDE.md` | Complete UI design system — colors, typography, components, animations |

---

## License

Proprietary. All rights reserved.
