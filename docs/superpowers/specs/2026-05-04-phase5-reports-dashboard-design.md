# Phase 5: Reports & Dashboard — Design Spec

**Date:** 2026-05-04
**Scope:** Internal dashboard (`/`) and reports page (`/reports`). Client portal and PDF export deferred to Phase 6.

---

## Goals

- Replace the Phase 1 dashboard placeholder with role-aware KPI cards, campaign health scoring, and a leaderboard snapshot.
- Add a `/reports` page with a full SDR leaderboard and MB lead status breakdown.
- Store MB lead status classification (`first_conversation`, `follow_up`, `nurtured_lead`) at call-log time.

---

## Architecture

**Pattern:** Pure Server Components + URL search params (Option A). Matches the existing pattern used by Pipeline and Schedule pages. No new API routes. Period filter is URL-based (`?period=week` default, `?period=month`), making reports linkable and shareable.

**Data access:** All queries go through helper functions in `src/lib/reports.ts`. Pages call these helpers directly — no client-side fetch, no extra network hops.

---

## Dashboard Page (`/`)

### Role behavior
Both `manager`/`admin` and `sdr` roles see all three sections. The only difference is KPI card data source:
- **Manager/Admin:** team aggregate — all SDRs in the tenant
- **SDR:** personal numbers — their own calls/conversations/MBs only

### Section 1 — KPI Cards (4 cards)
| Card | Metric |
|------|--------|
| Calls Made | Total dials in current week |
| Conversations | Conversation-tagged outcomes |
| Meeting Bookings | `outcome = meeting_booked` count |
| Conversion Rate | MBs ÷ conversations × 100% |

Each card contains:
- Large metric number (current week)
- 7-point SVG sparkline — one data point per day for the last 7 days
- Trend badge — percentage change vs prior 7 days, green if positive, red if negative

Dashboard always shows "this week" (no period toggle — that lives on Reports).

### Section 2 — Campaign Health Grid
One card per active campaign. Visible to all roles.

**Health score formula:**
- Activity rate = actual calls ÷ (daily target × calendar days elapsed in current week)
- Conversion rate = MBs ÷ conversations (0 if no conversations)
- Composite = (activity rate × 0.6) + (conversion rate × 0.4) × 100
- Green: ≥ 70 | Yellow: 40–69 | Red: < 40

Each card shows: campaign name, client name, color-coded score badge, and three sub-metrics (activity rate %, conversion rate %, total MBs).

Campaigns with no `dailyTarget` set are excluded from the health grid (no target = no meaningful activity rate).

### Section 3 — Leaderboard Snapshot
Top 5 SDRs by composite score (same formula as full leaderboard). Visible to all roles.
Columns: rank (1–5 with gold/silver/bronze for top 3), SDR name, score, MBs.
"See full leaderboard →" links to `/reports`.

---

## Reports Page (`/reports`)

### Period toggle
Two link buttons in the page header: "This Week" and "This Month". Active state driven by `searchParams.period` (`week` default, `month`). Switching updates the URL and triggers a Server Component re-render.

### Section 1 — SDR Leaderboard (full)
Columns: Rank, SDR Name, Calls, Conversations, MBs, Score.

**Composite score formula:**
```
score = (calls × 0.3) + (conversations × 0.4) + (MBs × 0.3)
```
Normalized to 0–100 relative to the top performer in the period.

**Most Improved badge:** The SDR with the highest percentage increase in composite score vs the prior equivalent period (prior week or prior month) gets a "Most Improved" badge next to their name. Requires ≥1 call in both periods to qualify.

Top 3 rows: gold / silver / bronze rank indicators.

### Section 2 — MB Lead Status Breakdown
Summary counts at the top: total MBs, First Conversation count, Follow-Up count, Nurtured Lead count.

Detail table columns: Contact Name, Company, SDR, Campaign, Date, Category.
Filterable by campaign via a dropdown (URL param `?campaignId=...`).

---

## Schema Changes

```prisma
enum MBLeadStatus {
  first_conversation
  follow_up
  nurtured_lead
}

// Add to CallRecord model:
mbLeadStatus MBLeadStatus?   // null unless outcome = meeting_booked
```

---

## MB Lead Status Classification Logic

Runs inside the `log-outcome` transaction when `outcome === 'meeting_booked'`:

1. Count prior `CallRecord` rows for this contact where `conversationTagged = true`.
2. If count === 0 → `first_conversation`
3. Else if `contact.createdAt < now - 30 days` → `nurtured_lead`
4. Else → `follow_up`

This logic is extracted into a pure function `classifyMBLeadStatus(priorConversationCount, contactCreatedAt): MBLeadStatus` for testability.

---

## File Map

### New files
| File | Purpose |
|------|---------|
| `src/lib/reports.ts` | Query helpers: `getDashboardKpis`, `getCampaignHealth`, `getLeaderboard`, `getMBBreakdown` |
| `src/lib/__tests__/reports.test.ts` | Unit tests: composite score, health formula, MB classification |
| `src/components/dashboard/KpiCard.tsx` | KPI card with sparkline + trend badge |
| `src/components/dashboard/Sparkline.tsx` | Inline SVG sparkline (7-point path) |
| `src/components/dashboard/CampaignHealthCard.tsx` | Single campaign health card |
| `src/components/dashboard/CampaignHealthGrid.tsx` | Grid of health cards |
| `src/components/dashboard/LeaderboardSnapshot.tsx` | Top-5 leaderboard for dashboard |
| `src/components/reports/LeaderboardTable.tsx` | Full SDR leaderboard table |
| `src/components/reports/MBStatusBreakdown.tsx` | MB category summary + detail table |
| `src/components/reports/PeriodToggle.tsx` | Week/month link toggle |
| `src/app/(dashboard)/reports/page.tsx` | Reports Server Component |

### Modified files
| File | Change |
|------|--------|
| `prisma/schema.prisma` | Add `MBLeadStatus` enum + `mbLeadStatus` field on `CallRecord` |
| `src/app/(dashboard)/page.tsx` | Replace placeholder with full dashboard |
| `src/app/api/dialer/log-outcome/route.ts` | Calculate + store `mbLeadStatus` on `meeting_booked` |
| `src/components/layout/Sidebar.tsx` | Wire "Daily Target" widget: shows today's call count for the current user (SDR: their calls today; manager: team total today) vs the sum of daily targets across their active campaigns |

---

## Testing

- Unit tests for `classifyMBLeadStatus` — all three branches
- Unit tests for composite score normalization
- Unit tests for campaign health composite formula
- Unit test for "Most Improved" calculation (handles zero-call edge case)

---

## Out of Scope (Phase 6)

- Client portal dashboard
- PDF report generation
- Email delivery of reports
