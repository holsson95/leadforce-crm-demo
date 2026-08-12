# Calling Page — Profile View Design

**Date:** 2026-07-22  
**Scope:** Add a Profile view to the Calling page as an alternative to the existing list view, with a toggle to switch between them.

---

## 1. Summary

The List view is good for scanning many contacts quickly. The Profile view gives an SDR all context they need for a single contact in one screen — contact details, live local time, company info, AI summary, activity history, and action buttons — without opening drawers or switching pages.

---

## 2. Schema changes

### 2a. Extend `ContactSummary` type (no DB change)

`ContactSummary` in `src/types/models.ts` gains three new fields:

```ts
email:   string | null
country: string | null
city:    string | null
```

These are returned by the queue API (`/api/dialer/queue`) so they're always available in both views without a secondary fetch.

### 2b. New `CompanySummary` model

Add to `prisma/schema.prisma`:

```prisma
enum CompanySummaryStatus {
  pending
  generating
  ready
  failed
}

model CompanySummary {
  id            String               @id @default(cuid())
  tenantId      String
  websiteDomain String               // normalized: "acme.com" (no www, no scheme)
  summary       String?
  status        CompanySummaryStatus @default(pending)
  generatedAt   DateTime?
  createdAt     DateTime             @default(now())
  updatedAt     DateTime             @updatedAt
  tenant        Tenant               @relation(fields: [tenantId], references: [id])

  @@unique([tenantId, websiteDomain])
  @@index([tenantId])
}
```

Also add `companySummaries CompanySummary[]` to the `Tenant` model relation block.

Run `prisma migrate dev`.

---

## 3. View toggle

### Location

Inside `QueuePanel.tsx`, in the campaign selector header row (same row as the existing "Filters" button). The toggle sits to the **left** of the Filters button.

### Visual spec

```
Container:  bg #211d16 · border 0.5px solid #322c22 · border-radius 20px · padding 3px
Active tab: bg #f5a623 · text/icon #211a0c · font-weight 600 · border-radius 18px
Inactive:   transparent · text/icon #857c69
Each tab:   ~28px × 26px · icon only (List icon / LayoutGrid or User icon)
```

Use `List` (list icon) for List view and `Contact` / `SquareUser` icon for Profile view (both from `lucide-react`).

### Persistence

Store `callingView: 'list' | 'profile'` in the Zustand `persist` store (`leadforce-dialer-called-today` key). Add it to `partialize` so it survives page refreshes.

---

## 4. Profile icon on list rows

Each `ContactRow` in the list gets a small `SquareUser` icon button (~17px) as a new column on the far right (before or replacing the call button? — add it **between** the call button and the notes button, or as a new rightmost column — see section 9 for the exact grid change).

- Color: `#f5a623` when that row is the active queue position (`isActive === true`), otherwise `#6c6353`
- On click: switch `callingView` to `'profile'` and navigate Profile view to that contact's index in `allContacts`

The GRID constant gains one extra column for this icon.

---

## 5. Shared state — Profile view queue

The Profile view consumes **the same `allContacts` array** already computed in `QueuePanel`:

```ts
const allContacts = currentContact ? [currentContact, ...queue] : [...queue]
```

**`profileIndex`** (a new field in the Zustand store) tracks position within `allContacts`. It is NOT persisted (resets to 0 on page load).

- "Contact {n} of {total}" = `profileIndex + 1` of `totalContacts` (from store)
- Next: `profileIndex++`, if we've reached the end of what's loaded and `allContacts.length < totalContacts`, call `loadQueue(allContacts.length)` to fetch more
- Previous: `profileIndex--`
- When `profileIndex === 0`, the contact at index 0 is also `currentContact` (the active call target)

Add these to the store (not persisted):

```ts
profileIndex:    number       // default 0
setProfileIndex: (n: number) => void
```

---

## 6. Profile view layout

Rendered inside `QueuePanel`'s scrollable body area when `callingView === 'profile'`, replacing the contact list. Max-width ~720px centered, `padding 24px`, `border-radius 16px`, `background #17140f`.

### 6a. Top row (3 columns)

**Left:** `← Queue` back link — color `#857c69`, 12px, returns to list view (sets `callingView` to `'list'`).

**Center:** `Contact {n} of {total}` — color `#857c69`, 12px.

**Right (stacked):**
- Location pill: map-pin icon (color `#f5a623`) + `{city}, {country}` text — pill bg `#211d16`, border `0.5px solid #322c22`, text color `#b3aa96`, 11px
- Live local time: clock icon + `{HH:MM AM/PM} local` — 11px, color `#6c6353`, updates every 60s

If city and country are both null, omit the location pill and live time.

### 6b. Name block (centered)

- Full name: 26px, weight 600, color `#f3ede2`
- LinkedIn icon-button (if `linkedinUrl` set): 20px circle, bg `#211d16`, border `0.5px solid #322c22`, LinkedIn icon `#f5a623`, links out in new tab
- Job title: 14px, color `#857c69`, below name

### 6c. Contact info row (2-column grid, 12px gap)

Left card — **Mobile**: label (11px, `#6c6353`) + number (14px, `#f3ede2`, font-mono) + copy icon  
Right card — **Email**: same pattern, text truncated with ellipsis

Card style: bg `#211d16`, border `0.5px solid #322c22`, border-radius 10px, padding 12px 14px.

Copy button: `#857c69` icon, on click → clipboard write + icon swaps to `Check` for 1.5s (existing `MobilePhoneCell` pattern).

Show only the card(s) where a value exists. If neither exists, omit the row.

### 6d. Company card

Header row: small icon square (bg `#322c22`, `Building2` icon `#f5a623`, 20px × 20px) + company name (15px, weight 500, `#f3ede2`) + employee count (12px, `#6c6353`) + company website link right-aligned (`ExternalLink` icon, `#f5a623`, 12px, opens new tab)

Below a divider (`0.5px solid #322c22`):

AI summary section:
- Label: `Sparkles` icon + "AI summary" text, 11px, `#6c6353`
- While status is `pending` or `generating`: 3-line shimmer skeleton (bg `rgba(255,255,255,0.04)`, animated pulse)
- While status is `ready`: paragraph text, 13px, `#b3aa96`, line-height 1.6
- While status is `failed` or no website: "Summary unavailable" in `#6c6353`, 12px, italic

Card style: bg `#211d16`, border `0.5px solid #322c22`, border-radius 12px, padding 16px 18px.

If `companyName` is null, omit the entire company card.

### 6e. Activity section

Full-width collapsible row (collapsed by default):

Header: "Activity — {n} prior attempts" left, `ChevronDown` right  
Style: bg `#211d16`, border `0.5px solid #322c22`, border-radius 10px, padding 10px 14px

Expanded: renders the same `NoteEntry[]` timeline the `ContactNotesModal` already renders, fetched from `GET /api/contacts/${id}/notes`. Uses the existing entry rendering (date, outcome badge, note content). Load on first expand, cache per contact.

"n prior attempts" = count of entries where `type === 'call'`.

---

## 7. Bottom action buttons

Fixed to the bottom of the Profile view panel. Five elements left to right:

```
[No Answer] [Outcome] [Notes] | divider | [Next →]
```

### 7a. Shared icon button style (first three)

52px circle, label below (10px), hover tooltip (bg `#322c22`, text `#f3ede2`, 11px, with pointer triangle).

### 7b. No Answer (`CircleX` icon)

- Click: immediately calls `logManualOutcome(contactId, 'no_answer', '')` — no modal
- Selected state: fill `#3a2118`, border `1.5px solid #d98a5f`, icon/label `#e08a7c`
- When selected:
  - Disables Outcome button (opacity 0.5, cursor not-allowed, icon/label `#4a4535`)
  - Shows status chip above buttons: pill bg `#2b201a`, border `0.5px solid #3d2c22`, text "Marked as No Answer — outcome not required", color `#d98a5f`
- Clicking again: deselects (removes the chip, re-enables Outcome) — toggle behavior
- Note: `logManualOutcome` in the store advances the queue. In profile view, after logging No Answer, auto-advance `profileIndex` to the next contact (same as clicking Next).

### 7c. Outcome (`CircleDashed` icon)

- Disabled when No Answer is selected
- Click (if enabled): opens `OutcomeSearchDropdown` (new component, see section 8)
- After selecting an outcome: calls `logManualOutcome(contactId, outcome, '')` immediately, closes the dropdown, and auto-advances `profileIndex` to the next contact
- Button briefly highlights (fill `#2a1f0d`, border `1.5px solid #c4872a`, icon/label `#f5a623`) and status chip shows the chosen outcome label before the advance animation
- Does NOT require SDR to click Next — outcome commits and advances in one action

### 7d. Notes (`MessageSquare` icon)

- Click: opens the existing `ContactNotesModal` with `hideOutcome={true}` (hides the "Log Outcome" tab)
- After a note is saved: button highlights (fill `#16281f`, border `1.5px solid #5fa87f`, icon/label `#7dd6ab`) + count badge (17px circle, bg `#5fa87f`, text `#0d1a13`, weight 600, 10px) showing total notes count
- Note count: fetched alongside the notes modal data from `GET /api/contacts/${id}/notes`

### 7e. Next (`→` arrow, solid pill)

- bg `#f5a623`, text `#211a0c`, weight 600, `ArrowRight` icon
- Advances `profileIndex` by 1; if at end of loaded contacts and `allContacts.length < totalContacts`, calls `loadQueue`

---

## 8. OutcomeSearchDropdown component

New file: `src/components/dialer/OutcomeSearchDropdown.tsx`

- Floats above the Outcome button (position absolute, bottom: calc(100% + 8px))
- Search input at top (bg `#211d16`, placeholder "Search outcomes…")
- List of all `CALL_OUTCOMES_FOR_FILTER` entries, filtered by search text
- Reuses color dots from `outcome-colors.ts`
- Click on an outcome: calls the `onSelect(outcome)` callback and closes
- Keyboard: arrow keys to navigate, Enter to select, Escape to close

---

## 9. List view visual refresh + grid change

### 9a. Grid — proportional columns + profile icon

The current grid gives `1fr` to the contact column and a fixed `110px` to company, which leaves a large gap between the two on wider panels. Replace with proportional fractions so both columns flex together:

```ts
// Before
const GRID = 'grid-cols-[12px_1fr_110px_48px_24px_24px_140px_24px]'

// After
const GRID = 'grid-cols-[12px_2fr_1fr_48px_24px_24px_140px_24px_24px]'
```

- `2fr` — contact name + title (takes 2/3 of flexible space)
- `1fr` — company name + employee count (takes 1/3 of flexible space, no longer fixed at 110px)
- Final `24px` — new profile-jump button (`SquareUser`)

The company column header label and `CompanyCell` component must both drop `text-right` / `items-end` alignment — they now left-align naturally within the wider column.

Both `ContactRow` and `CalledTodayRow` need the new profile-button column (empty `<div>` for `CalledTodayRow`).

### 9b. Typography — slightly larger, still tight

| Element | Current | New |
|---------|---------|-----|
| Contact name | `text-xs` (12px) | `text-[13px]` |
| Job title | `text-[10px]` | `text-[11px]` |
| Company name | `text-[10px]` | `text-[11px]` |
| Employee count | `text-[10px]` | `text-[10px]` (unchanged — secondary info) |
| Mobile phone | `text-[10px]` | `text-[11px]` |
| Column headers | `text-[10px]` | `text-[10px]` (unchanged — metadata) |

### 9c. Row density

Row vertical padding: `py-2.5` → `py-2`. This makes the list denser and gives each row a tighter feel without reducing readability (the larger font compensates).

---

## 10. Live local time — timezone derivation

New file: `src/lib/timezone.ts`

Use the `city-timezones` npm package (install it). It maps city names to IANA timezone strings. Usage:

```ts
import cityTimezones from 'city-timezones'

export function getCityTimezone(city: string, country: string): string | null {
  const results = cityTimezones.lookupViaCity(city)
  if (results.length === 0) return null
  // If country is known, prefer the match for that country
  const match = results.find(r => r.iso2 === country) ?? results[0]
  return match.timezone
}
```

Fall back: if lookup fails, return null (omit the live time display).

In `ProfileViewCard.tsx`: compute `localTimeString` using `Intl.DateTimeFormat` with the resolved timezone. Update every 60s via `setInterval`.

---

## 11. AI company summary API

### Route: `GET /api/contacts/[id]/company-summary`

1. Load the contact, confirm it belongs to the current tenant
2. Extract `website` field; normalize to domain (strip `http://`, `www.`, path)
3. Look up `CompanySummary` by `(tenantId, websiteDomain)`
4. **If not found:** create record with `status: 'generating'`, then run generation synchronously (see below), respond with result
5. **If found with status `ready`:** return `{ status: 'ready', summary: string }`
6. **If found with status `generating`:** return `{ status: 'generating' }` (client polls)
7. **If found with status `failed`:** return `{ status: 'failed' }`

Generation flow (synchronous in the API route, with a 15s timeout):
1. `fetch(websiteUrl, { signal: AbortSignal.timeout(8000) })` — get HTML
2. Strip HTML tags, truncate to ~3000 chars
3. Call Anthropic API (`claude-haiku-4-5-20251001` — cheap, fast): "Summarize this company in 2-4 sentences for a sales rep: focus on what they do, company size, and any notable facts. Company website content: {text}"
4. Store `summary`, set `status: 'ready'`, `generatedAt: now()`
5. On any error: set `status: 'failed'`, return failed status

### No existing AI lib — create it

`src/lib/ai/types.ts`:
```ts
export interface AIService {
  summarizeCompany(websiteText: string, companyName?: string): Promise<string>
}
```

`src/lib/ai/anthropic.ts`: implement using `@anthropic-ai/sdk`. Read `ANTHROPIC_API_KEY` from env.

### Client-side polling in ProfileViewCard

When company card is visible and contact has a `website`:
1. Fetch `GET /api/contacts/${id}/company-summary` on mount
2. If `status === 'generating'`, poll every 3s (up to 20 attempts = 60s) until `ready` or `failed`
3. Show shimmer skeleton during pending/generating
4. Show summary or "unavailable" once resolved

---

## 12. ContactNotesModal changes

Add optional prop `hideOutcome?: boolean` to `ContactNotesModalProps`. When true:
- Hide the tab bar entirely (no "Add Note" / "Log Outcome" tabs)
- Always show the note composer (the tab bar is only there to toggle between the two; if outcome is hidden, there's no need for tabs)

---

## 13. File summary

| File | Action | Notes |
|------|--------|-------|
| `prisma/schema.prisma` | Modify | Add `CompanySummary` model + enum + Tenant relation |
| `src/types/models.ts` | Modify | Extend `ContactSummary` with `email`, `country`, `city` |
| `src/app/api/dialer/queue/route.ts` | Modify | Include `email`, `country`, `city` in select |
| `src/stores/dialer-store.ts` | Modify | Add `callingView`, `profileIndex`, `setProfileIndex` |
| `src/components/dialer/QueuePanel.tsx` | Modify | View toggle, profile icon column, render ProfileViewCard, list view visual refresh (grid, font sizes, row density) |
| `src/components/dialer/ContactNotesModal.tsx` | Modify | Add `hideOutcome` prop |
| `src/components/dialer/ProfileViewCard.tsx` | **Create** | Main profile view component |
| `src/components/dialer/OutcomeSearchDropdown.tsx` | **Create** | Searchable outcome picker |
| `src/lib/timezone.ts` | **Create** | City → IANA timezone lookup via `city-timezones` |
| `src/lib/ai/types.ts` | **Create** | AIService interface |
| `src/lib/ai/anthropic.ts` | **Create** | Anthropic implementation |
| `src/app/api/contacts/[id]/company-summary/route.ts` | **Create** | Get/trigger company AI summary |

---

## 14. Out of scope

- Modifying how `logManualOutcome` advances the queue in list view (unchanged)
- Redesigning the existing list view layout
- Tablet/mobile responsive adjustments
- BullMQ background job for summary generation (synchronous inline for now)
- Per-second clock ticking (60s polling is specified)
