# LeadForce CRM

A high-performance sales engagement platform built for outsourced SDR teams and sales agencies. LeadForce combines a power dialer, campaign management, pipeline tracking, and client reporting into a single workspace.

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
| Database | PostgreSQL (Supabase) with Prisma ORM |
| Auth | Clerk (multi-tenant, role-based) |
| Real-Time | Socket.io, Redis pub/sub |
| Job Queue | BullMQ, Redis |
| File Storage | Cloudflare R2 |
| AI | Anthropic API |
| Telephony | JustCall API (behind abstraction layer) |
| Hosting | Vercel (frontend), Railway (backend services) |

---

## Getting Started

### Prerequisites

- Node.js v18+
- npm or pnpm
- Git
- A Supabase project (PostgreSQL with RLS enabled)
- A Clerk account with API keys

### Installation

```bash
# Clone the repository
git clone https://github.com/your-org/leadforce-crm.git
cd leadforce-crm

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env.local
# Fill in your keys (see Environment Variables below)

# Generate Prisma client and run migrations
npx prisma generate
npx prisma db push

# Start the development server
npm run dev
```

The app will be available at `http://localhost:3000`.

### Environment Variables

Create a `.env.local` file in the project root:

```env
# Database (Supabase)
DATABASE_URL="postgresql://..."

# Clerk Authentication
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY="pk_..."
CLERK_SECRET_KEY="sk_..."
NEXT_PUBLIC_CLERK_SIGN_IN_URL="/sign-in"
NEXT_PUBLIC_CLERK_SIGN_UP_URL="/sign-up"
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL="/"
NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL="/"

# Redis
REDIS_URL="redis://..."

# JustCall (Phase 3)
JUSTCALL_API_KEY=""
JUSTCALL_API_SECRET=""
JUSTCALL_WEBHOOK_SECRET=""

# Anthropic AI
ANTHROPIC_API_KEY=""

# Cloudflare R2
R2_ACCOUNT_ID=""
R2_ACCESS_KEY_ID=""
R2_SECRET_ACCESS_KEY=""
R2_BUCKET_NAME=""

# App
NEXT_PUBLIC_APP_URL="http://localhost:3000"
```

---

## Project Structure

```
leadforce-crm/
├── CLAUDE.md                    # AI assistant project context
├── docs/
│   ├── LeadForce_CRM_Specification_v1.1.docx
│   └── LEADFORCE_UI_STYLE_GUIDE.md
├── prisma/
│   └── schema.prisma
├── src/
│   ├── app/                     # Next.js App Router (pages + API)
│   │   ├── (auth)/              # Login, signup, invite flows
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

All telephony operations go through a `TelephonyService` interface. JustCall is the initial implementation. This abstraction allows adding Twilio or other providers without modifying business logic. Components and API routes never import JustCall directly.

### AI Abstraction

Same pattern as telephony. An `AIService` interface wraps company summary generation, call summarization, and live objection handling. Anthropic API is the initial implementation.

---

## Documentation

| Document | Description |
|---|---|
| `CLAUDE.md` | AI development context — tech stack, conventions, architecture decisions, build order |
| `docs/LeadForce_CRM_Specification_v1.1.docx` | Full product specification (24 sections) |
| `docs/LEADFORCE_UI_STYLE_GUIDE.md` | Complete UI design system — colors, typography, components, animations |

---

## License

Proprietary. All rights reserved.
