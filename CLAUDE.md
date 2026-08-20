# LeadForce CRM — Public Demo Build

## Context

This is a **public portfolio demo**, forked from a real client project (LeadForce CRM — a multi-tenant CRM with a power dialer and real-time call tracking, originally built for an outsourced SDR agency). This repo will be public on GitHub and linked from a developer portfolio site. It must never contain the original client's name, branding, real data, or live credentials.

The goal: preserve everything technically impressive about the original build (multi-tenancy, real-time call state, tenant isolation) while making it fully safe to run publicly with zero real client exposure.

## Non-negotiables

- **No real client name, logo, or branding anywhere** — in the UI, seed data, env files, commit history going forward, or README.
- **No live telephony integrations.** JustCall/Twilio must not be reachable from this repo at all — not even behind a disabled flag. Replace entirely with a simulated provider (see below).
- **No real API keys or secrets** — `.env.example` only, with obviously fake placeholder values.
- **No real invite/email flows.** Auth must not be able to send real emails to arbitrary addresses a visitor types in.

## What to build

### 1. Simulated telephony provider
Replace the real telephony abstraction layer's implementation with a mock provider that:
- Generates fake call lifecycle events (ringing → connected → outcome) on a timer or on user action.
- Publishes these events through the existing Socket.io/Redis pub/sub exactly as the real provider would, so the real-time UI (call state, live dashboard) works unmodified.
- Never makes any outbound network call to a real telephony API.

Implement this behind the same interface the real JustCall/Twilio adapters used, so it's a drop-in swap, not a UI rewrite.

### 2. Seed script with two fake tenants
Create a seed script (e.g. `scripts/seed-demo.ts`) that populates:
- Two clearly fictional tenant companies (e.g. "Acme Outreach" and "Nova Sales") — no resemblance to any real company.
- A handful of reps, leads, and campaigns per tenant, with realistic-looking but fake names/emails/phone numbers.
- Enough call history per tenant to make the dashboard and reporting views look populated, not empty.

This seed script is also what powers the tenant-isolation demo: switching between the two tenants in the UI should show clearly different data through the identical interface.

### 3. Simplified demo auth
- Replace the real Clerk invite/signup flow with a single "View Demo" entry point that logs straight into a pre-seeded account.
- No real signup form, no ability to trigger an invite email to an arbitrary address.
- If Clerk is kept for session handling, configure it so new real signups aren't possible — this is a demo, not a live product.

### 4. Guard or fake destructive actions
Any action that deletes or meaningfully mutates data (delete lead, remove campaign, edit tenant settings) should either:
- No-op with a success toast/UI update that doesn't persist to the database, or
- Be gated behind a "demo actions are reset hourly" notice if you do let them persist.

### 5. Scheduled reset job
Add a scheduled job (Vercel Cron or equivalent) that re-runs the seed script on an interval (hourly is reasonable) to reset the database to its clean seeded state, undoing any visitor edits.

### 6. Demo mode banner
A small, persistent, non-intrusive banner (e.g. top of page) stating this is a demo with sample data — not a real client's live system.

## Stack / deployment target

- Keep the existing stack: Next.js, TypeScript, PostgreSQL (Prisma), Redis.
- Deploy on free-tier infrastructure: Vercel (hosting + cron), Neon or Supabase (Postgres), Upstash (Redis).
- No paid infrastructure — this is a demo, not a production service.

## Working process

1. Start by auditing the codebase for anything client-identifying (grep for the real client/company name, check env files, check seed/fixture data if any exists) and flag it before changing anything else.
2. Build the simulated telephony provider next — it's the riskiest thing to get wrong (must be impossible for it to reach a real telephony API).
3. Then seed data, then auth simplification, then the reset job and banner last.
4. After each major step, tell me what changed and what still needs a human decision (e.g. exact fake company names, copy for the demo banner) rather than guessing on content.
