# Calling Page — Profile View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Profile view to the Calling page — a full-contact detail card with AI summary, live local time, and action buttons — plus a view toggle, list view visual refresh, and all shared state wired through the existing Zustand dialer store.

**Architecture:** Shared queue state lives entirely in the Zustand store (`callingView`, `profileIndex`, `advanceProfile`); QueuePanel conditionally renders either the existing list or a new `ProfileViewCard` composed from `ProfileCompanyCard` and `ProfileActionBar`. Company AI summaries are generated synchronously on first request and cached in a new `CompanySummary` DB table keyed by `(tenantId, websiteDomain)`.

**Tech Stack:** Next.js 14 App Router · React/TypeScript · Prisma · Zustand persist · `@anthropic-ai/sdk` · `city-timezones` · Vitest · Lucide React icons

## Global Constraints

- All colors and sizing must match the spec exactly: bg `#17140f`, accent `#f5a623`, muted text `#857c69`, card bg `#211d16`, card border `0.5px solid #322c22`
- No new npm packages beyond `city-timezones` and `@anthropic-ai/sdk`
- Font: Inter throughout Profile view (the project already uses Outfit as `font-sans`; add `font-['Inter',sans-serif]` inline on the Profile view container)
- `withTenant` is NOT required for `CompanySummary` queries — always pass `tenantId` explicitly in where/data (CompanySummary is not in `TENANT_MODELS` in `src/lib/db.ts`)
- All API routes use the same auth pattern: `auth()` → `getClerkMeta()` → `hasPermission(role, 'calls:write')`
- Icons: Lucide React only — `SquareUser`, `List`, `MapPin`, `Clock`, `Linkedin`, `Building2`, `ExternalLink`, `Copy`, `Check`, `CircleX`, `CircleDashed`, `MessageSquare`, `ArrowRight`, `ChevronDown`, `Sparkles`
- Vitest for all automated tests; component tests skip rendering (test logic only)
- `ANTHROPIC_API_KEY` must be present in `.env.local`

---

### Task 1: CompanySummary schema + migration

**Files:**
- Modify: `prisma/schema.prisma`
- Modify: `src/lib/db.ts` (no change needed — see note below)

**Interfaces:**
- Produces: `CompanySummary` Prisma model accessible as `db.companySummary`; unique constraint `tenantId_websiteDomain`

- [ ] **Step 1: Add enum and model to schema**

In `prisma/schema.prisma`, add the enum after the existing `MBLeadStatus` enum (line 62), and the model after `PermissionOverride`:

```prisma
enum CompanySummaryStatus {
  pending
  generating
  ready
  failed
}
```

```prisma
model CompanySummary {
  id            String               @id @default(cuid())
  tenantId      String
  websiteDomain String
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

- [ ] **Step 2: Add relation to Tenant model**

In the `model Tenant` block (currently ends with `permissionOverrides PermissionOverride[]` around line 84), add:

```prisma
  companySummaries CompanySummary[]
```

- [ ] **Step 3: Run migration**

```bash
npx prisma migrate dev --name add-company-summary
```

Expected: migration file created, `db push` succeeded, `CompanySummary` table exists.

- [ ] **Step 4: Verify Prisma client regenerated**

```bash
npx prisma generate
```

Confirm `db.companySummary` is accessible: run `npx tsx -e "import { db } from './src/lib/db'; db.companySummary.count().then(console.log)"` (expect `0`).

- [ ] **Step 5: Commit**

```bash
git add prisma/
git commit -m "Add CompanySummary schema for AI company summaries"
```

---

### Task 2: ContactSummary type + queue route

**Files:**
- Modify: `src/types/models.ts` (lines 44–53)
- Modify: `src/app/api/dialer/queue/route.ts` (lines 169–220)

**Interfaces:**
- Produces: `ContactSummary` now includes `email: string | null`, `country: string | null`, `city: string | null` — used by Profile view for contact info cards and timezone lookup

- [ ] **Step 1: Extend ContactSummary type**

In `src/types/models.ts`, replace the `ContactSummary` type (lines 44–53):

```typescript
export type ContactSummary = Pick<
  Contact,
  'id' | 'firstName' | 'lastName' | 'mobilePhone' | 'corporatePhone' | 'companyName' | 'status'
> & {
  jobTitle:      string | null
  employeeCount: number | null
  linkedinUrl:   string | null
  website:       string | null
  email:         string | null
  country:       string | null
  city:          string | null
  callHistory:   CallHistoryRecord[]
}
```

- [ ] **Step 2: Add fields to queue route select**

In `src/app/api/dialer/queue/route.ts`, inside the `db.contact.findMany` select block (around line 169), add after `website: true,`:

```typescript
          email:         true,
          country:       true,
          city:          true,
```

- [ ] **Step 3: Add fields to the data mapping**

In the same file, inside the `data` mapping (around line 201), add after `website: c.website,`:

```typescript
      email:    c.email,
      country:  c.country,
      city:     c.city,
```

- [ ] **Step 4: Check TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors. Fix any type errors (e.g. `patchContact` in the store may need updating if it references `ContactSummary` fields).

- [ ] **Step 5: Commit**

```bash
git add src/types/models.ts src/app/api/dialer/queue/route.ts
git commit -m "Extend ContactSummary with email, country, city for profile view"
```

---

### Task 3: Timezone utility

**Files:**
- Create: `src/lib/timezone.ts`
- Create: `src/lib/__tests__/timezone.test.ts`

**Interfaces:**
- Produces:
  - `getCityTimezone(city: string, country?: string | null): string | null` — returns an IANA timezone string or null
  - `formatLocalTime(timezone: string): string` — returns e.g. `"10:42 PM"`

- [ ] **Step 1: Install city-timezones**

```bash
npm install city-timezones
```

If TypeScript complains about missing types, create `src/types/city-timezones.d.ts`:
```typescript
declare module 'city-timezones' {
  interface CityData {
    city: string; city_ascii: string; lat: number; lng: number;
    country: string; iso2: string; iso3: string; admin_name: string;
    capital: string; population: number; id: number; timezone: string;
  }
  function lookupViaCity(city: string): CityData[];
  export default { lookupViaCity };
}
```

- [ ] **Step 2: Write the failing test**

Create `src/lib/__tests__/timezone.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { getCityTimezone, formatLocalTime } from '../timezone'

describe('getCityTimezone', () => {
  it('resolves Sydney to Australia/Sydney', () => {
    expect(getCityTimezone('Sydney', 'AU')).toBe('Australia/Sydney')
  })

  it('resolves Melbourne to Australia/Melbourne', () => {
    expect(getCityTimezone('Melbourne', 'AU')).toBe('Australia/Melbourne')
  })

  it('resolves London to Europe/London', () => {
    expect(getCityTimezone('London', 'GB')).toBe('Europe/London')
  })

  it('returns null for unknown city', () => {
    expect(getCityTimezone('XyzNoSuchCityEver')).toBeNull()
  })

  it('uses country to disambiguate when city name is shared', () => {
    const au = getCityTimezone('Perth', 'AU')
    expect(au).toBe('Australia/Perth')
  })

  it('falls back to first result when country not provided', () => {
    const result = getCityTimezone('Sydney')
    expect(result).toBeTruthy()
  })
})

describe('formatLocalTime', () => {
  it('returns a formatted AM/PM time string', () => {
    const result = formatLocalTime('Australia/Sydney')
    expect(result).toMatch(/^\d{1,2}:\d{2}\s*(AM|PM)$/i)
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

```bash
npx vitest run src/lib/__tests__/timezone.test.ts
```

Expected: FAIL — `Cannot find module '../timezone'`

- [ ] **Step 4: Create timezone.ts**

Create `src/lib/timezone.ts`:

```typescript
import cityTimezones from 'city-timezones'

export function getCityTimezone(city: string, country?: string | null): string | null {
  const results = cityTimezones.lookupViaCity(city)
  if (!results.length) return null
  const match = country
    ? (results.find((r) => r.iso2 === country.toUpperCase()) ?? results[0])
    : results[0]
  return match.timezone
}

export function formatLocalTime(timezone: string): string {
  return new Intl.DateTimeFormat('en-AU', {
    timeZone: timezone,
    hour:     'numeric',
    minute:   '2-digit',
    hour12:   true,
  }).format(new Date())
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npx vitest run src/lib/__tests__/timezone.test.ts
```

Expected: all 6 tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/timezone.ts src/lib/__tests__/timezone.test.ts
git commit -m "Add timezone utility for profile view live local time"
```

---

### Task 4: AI lib — interface + Anthropic implementation

**Files:**
- Create: `src/lib/ai/types.ts`
- Create: `src/lib/ai/anthropic.ts`

**Interfaces:**
- Produces:
  - `AIService.summarizeCompany(websiteText: string, companyName?: string): Promise<string>`
  - `anthropicService: AIService` — the concrete implementation

- [ ] **Step 1: Check/install @anthropic-ai/sdk**

```bash
cat package.json | grep anthropic
```

If not present:
```bash
npm install @anthropic-ai/sdk
```

- [ ] **Step 2: Add ANTHROPIC_API_KEY to env**

Add to `.env.local` (create if not present):
```
ANTHROPIC_API_KEY=your_key_here
```

- [ ] **Step 3: Create types.ts**

Create `src/lib/ai/types.ts`:

```typescript
export interface AIService {
  summarizeCompany(websiteText: string, companyName?: string): Promise<string>
}
```

- [ ] **Step 4: Create anthropic.ts**

Create `src/lib/ai/anthropic.ts`:

```typescript
import Anthropic from '@anthropic-ai/sdk'
import type { AIService } from './types'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export const anthropicService: AIService = {
  async summarizeCompany(websiteText, companyName) {
    const context = companyName ? `Company name: ${companyName}\n\n` : ''
    const msg = await client.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 300,
      messages: [
        {
          role:    'user',
          content: `${context}Website content:\n${websiteText}\n\nWrite a 2–4 sentence summary of this company for a sales representative. Focus on what the company does, their target market, and any notable facts. Be concise and factual. Do not use the company name as the first word.`,
        },
      ],
    })
    const block = msg.content[0]
    if (block.type !== 'text') throw new Error('Unexpected Anthropic response type')
    return block.text.trim()
  },
}
```

- [ ] **Step 5: Check TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors in the new files.

- [ ] **Step 6: Commit**

```bash
git add src/lib/ai/
git commit -m "Add AI service interface and Anthropic implementation"
```

---

### Task 5: Company summary API route

**Files:**
- Create: `src/app/api/contacts/[id]/company-summary/route.ts`

**Interfaces:**
- Consumes: `anthropicService` from Task 4; `CompanySummary` model from Task 1; `contact.website` from existing schema
- Produces: `GET /api/contacts/:id/company-summary` → `{ status: 'unavailable' | 'generating' | 'ready' | 'failed', summary?: string | null }`

- [ ] **Step 1: Create the route**

Create `src/app/api/contacts/[id]/company-summary/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db, withTenant } from '@/lib/db'
import { hasPermission, getClerkMeta } from '@/lib/auth'
import { anthropicService } from '@/lib/ai/anthropic'

function normalizeDomain(url: string): string {
  try {
    const href = url.startsWith('http') ? url : `https://${url}`
    return new URL(href).hostname.replace(/^www\./i, '').toLowerCase()
  } catch {
    return url.toLowerCase()
      .replace(/^(?:https?:\/\/)?(?:www\.)?/i, '')
      .split('/')[0]
      .split('?')[0]
  }
}

async function extractText(html: string): Promise<string> {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z#0-9]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 3000)
}

async function runGeneration(domain: string, tenantId: string, companyName: string | null) {
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 8000)
    let html: string
    try {
      const res = await fetch(`https://${domain}`, {
        signal:  controller.signal,
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LeadForceBot/1.0)' },
      })
      html = await res.text()
    } finally {
      clearTimeout(timer)
    }
    const text    = await extractText(html)
    const summary = await anthropicService.summarizeCompany(text, companyName ?? undefined)
    await db.companySummary.update({
      where: { tenantId_websiteDomain: { tenantId, websiteDomain: domain } },
      data:  { summary, status: 'ready', generatedAt: new Date() },
    })
  } catch {
    await db.companySummary.update({
      where: { tenantId_websiteDomain: { tenantId, websiteDomain: domain } },
      data:  { status: 'failed' },
    })
  }
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { userId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { role, tenantId } = await getClerkMeta()
    if (!hasPermission(role, 'calls:write') || !tenantId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id: contactId } = await params

    const contact = await withTenant(tenantId, () =>
      db.contact.findUnique({
        where:  { id: contactId },
        select: { website: true, companyName: true },
      })
    )
    if (!contact?.website) {
      return NextResponse.json({ status: 'unavailable' })
    }

    const domain = normalizeDomain(contact.website)

    const existing = await db.companySummary.findUnique({
      where: { tenantId_websiteDomain: { tenantId, websiteDomain: domain } },
    })

    if (existing?.status === 'ready') {
      return NextResponse.json({ status: 'ready', summary: existing.summary })
    }
    if (existing?.status === 'failed') {
      return NextResponse.json({ status: 'failed' })
    }
    if (existing?.status === 'generating') {
      // Another concurrent request is generating — tell client to poll
      return NextResponse.json({ status: 'generating' })
    }

    // No record yet — create and generate synchronously
    await db.companySummary.create({
      data: { tenantId, websiteDomain: domain, status: 'generating' },
    })

    await runGeneration(domain, tenantId, contact.companyName)

    const result = await db.companySummary.findUnique({
      where: { tenantId_websiteDomain: { tenantId, websiteDomain: domain } },
    })

    return NextResponse.json({
      status:  result?.status ?? 'failed',
      summary: result?.summary ?? null,
    })
  } catch (err) {
    console.error('[company-summary] GET error', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
```

- [ ] **Step 2: Check TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Manual smoke test**

Start dev server (`npm run dev`), navigate to Calling page, open browser console. Paste (with a real contact ID from your DB):

```js
fetch('/api/contacts/REPLACE_WITH_CONTACT_ID/company-summary').then(r=>r.json()).then(console.log)
```

Expected: `{ status: 'unavailable' }` if contact has no website, or `{ status: 'ready', summary: '...' }` after generation completes.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/contacts/
git commit -m "Add company summary API route with Anthropic-backed generation"
```

---

### Task 6: ContactNotesModal — hideOutcome + onNoteSaved props

**Files:**
- Modify: `src/components/dialer/ContactNotesModal.tsx`

**Interfaces:**
- Consumes: existing `ContactNotesModalProps`
- Produces: two new optional props:
  - `hideOutcome?: boolean` — omits the "Log Outcome" tab entirely
  - `onNoteSaved?: () => void` — called after a note is successfully added

- [ ] **Step 1: Add props to interface**

In `ContactNotesModal.tsx`, update the `ContactNotesModalProps` interface (around line 24):

```typescript
interface ContactNotesModalProps {
  contactId:    string
  contactName:  string
  open:         boolean
  onClose:      () => void
  hideOutcome?: boolean
  onNoteSaved?: () => void
}
```

- [ ] **Step 2: Accept props in function signature**

Update the function signature (around line 31):

```typescript
export function ContactNotesModal({
  contactId,
  contactName,
  open,
  onClose,
  hideOutcome = false,
  onNoteSaved,
}: ContactNotesModalProps) {
```

- [ ] **Step 3: Call onNoteSaved after successful note add**

In `handleAddNote`, after `setNoteText('')` (around line 82):

```typescript
      setNoteText('')
      onNoteSaved?.()
```

- [ ] **Step 4: Hide tab bar and lock to note view when hideOutcome is true**

Replace the tab bar + content section (lines 167–214) with:

```typescript
        <div className="border-t border-white/5 flex-shrink-0">
          {!hideOutcome && (
            <div className="flex gap-1 p-3 pb-0">
              <button
                onClick={() => setTab('note')}
                className={cn(
                  'flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors',
                  tab === 'note' ? 'bg-white/10 text-white' : 'text-gray-500 hover:text-gray-300',
                )}
              >
                Add Note
              </button>
              <button
                onClick={() => setTab('outcome')}
                className={cn(
                  'flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors',
                  tab === 'outcome' ? 'bg-white/10 text-white' : 'text-gray-500 hover:text-gray-300',
                )}
              >
                Log Outcome
              </button>
            </div>
          )}

          {(tab === 'note' || hideOutcome) ? (
            <div className="p-4 space-y-2">
              <textarea
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                placeholder="Add a note…"
                rows={2}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-gray-600 resize-none focus:outline-none focus:border-[#f5a623]/50 focus:ring-1 focus:ring-[#f5a623]/10"
              />
              {saveError && (
                <p className="text-xs text-red-400">Failed to save note. Try again.</p>
              )}
              <Button
                onClick={handleAddNote}
                disabled={!noteText.trim() || submitting}
                className="w-full bg-white/5 border border-white/10 text-gray-300 rounded-xl hover:bg-white/10 disabled:opacity-40"
              >
                <Plus className="w-3.5 h-3.5 mr-1.5" />
                {submitting ? 'Saving…' : 'Add Note'}
              </Button>
            </div>
          ) : (
            <div className="p-4">
              <DispositionForm campaignId={campaignId} onSubmit={handleLogOutcome} loading={outcomeLoading} />
            </div>
          )}
        </div>
```

- [ ] **Step 5: Check TypeScript compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
git add src/components/dialer/ContactNotesModal.tsx
git commit -m "Add hideOutcome and onNoteSaved props to ContactNotesModal"
```

---

### Task 7: OutcomeSearchDropdown component

**Files:**
- Create: `src/components/dialer/OutcomeSearchDropdown.tsx`

**Interfaces:**
- Consumes: `CALL_OUTCOMES_FOR_FILTER` from `@/lib/dialer-filters`; `OUTCOME_COLOR`, `DOT_CLASS` from `./outcome-colors`
- Produces:
  ```typescript
  interface OutcomeSearchDropdownProps {
    onSelect: (outcome: CallOutcome) => void
    onClose:  () => void
  }
  ```

- [ ] **Step 1: Create the component**

Create `src/components/dialer/OutcomeSearchDropdown.tsx`:

```typescript
'use client'

import { useEffect, useRef, useState } from 'react'
import type { CallOutcome } from '@prisma/client'
import { cn } from '@/lib/utils'
import { CALL_OUTCOMES_FOR_FILTER } from '@/lib/dialer-filters'
import { OUTCOME_COLOR, DOT_CLASS } from './outcome-colors'

interface OutcomeSearchDropdownProps {
  onSelect: (outcome: CallOutcome) => void
  onClose:  () => void
}

export function OutcomeSearchDropdown({ onSelect, onClose }: OutcomeSearchDropdownProps) {
  const [search, setSearch]       = useState('')
  const [activeIdx, setActiveIdx] = useState(0)
  const containerRef              = useRef<HTMLDivElement>(null)
  const inputRef                  = useRef<HTMLInputElement>(null)

  const filtered = CALL_OUTCOMES_FOR_FILTER.filter(({ label }) =>
    label.toLowerCase().includes(search.toLowerCase())
  )

  useEffect(() => { inputRef.current?.focus() }, [])
  useEffect(() => { setActiveIdx(0) }, [search])

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return }
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActiveIdx((i) => Math.min(i + 1, filtered.length - 1))
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActiveIdx((i) => Math.max(i - 1, 0))
      }
      if (e.key === 'Enter' && filtered[activeIdx]) {
        onSelect(filtered[activeIdx].value)
      }
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [filtered, activeIdx, onSelect, onClose])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [onClose])

  return (
    <div
      ref={containerRef}
      className="absolute bottom-[calc(100%+8px)] left-1/2 -translate-x-1/2 z-50 w-64 rounded-xl border border-[#322c22] bg-[#211d16] shadow-2xl shadow-black/60 flex flex-col"
    >
      <div className="p-2 border-b border-[#322c22]">
        <input
          ref={inputRef}
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search outcomes…"
          className="w-full bg-[#17140f] border border-[#322c22] rounded-lg px-3 py-1.5 text-xs text-[#f3ede2] placeholder:text-[#6c6353] focus:outline-none focus:border-[#f5a623]/40"
        />
      </div>
      <div className="overflow-y-auto max-h-56 p-1">
        {filtered.length === 0 ? (
          <p className="text-[11px] text-[#6c6353] text-center py-3">No outcomes match</p>
        ) : (
          filtered.map(({ value, label }, i) => (
            <button
              key={value}
              onClick={() => onSelect(value)}
              className={cn(
                'w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left text-xs transition-colors',
                i === activeIdx
                  ? 'bg-white/8 text-[#f3ede2]'
                  : 'text-[#b3aa96] hover:bg-white/5 hover:text-[#f3ede2]',
              )}
            >
              <span className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', DOT_CLASS[OUTCOME_COLOR[value]])} />
              {label}
            </button>
          ))
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Check TypeScript compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/components/dialer/OutcomeSearchDropdown.tsx
git commit -m "Add OutcomeSearchDropdown for profile view outcome selection"
```

---

### Task 8: Zustand store — callingView + profileIndex

**Files:**
- Modify: `src/stores/dialer-store.ts`

**Interfaces:**
- Produces (new store fields/actions):
  - `callingView: 'list' | 'profile'` — persisted
  - `profileIndex: number` — not persisted (defaults to 0 on reload)
  - `setCallingView(view: 'list' | 'profile'): void`
  - `setProfileIndex(index: number): void`
  - `advanceProfile(): Promise<void>` — increments profileIndex, loads more from API if near end

- [ ] **Step 1: Add fields to DialerState interface**

In `src/stores/dialer-store.ts`, add to the `DialerState` interface (after `pendingFilters` on line 30):

```typescript
  callingView:      'list' | 'profile'
  profileIndex:     number

  setCallingView(view: 'list' | 'profile'): void
  setProfileIndex(index: number): void
  advanceProfile(): Promise<void>
```

- [ ] **Step 2: Add initial state values**

In the `persist(...)` create function, add initial state values (after `pendingFilters: {}` around line 80):

```typescript
      callingView:  'list',
      profileIndex: 0,
```

- [ ] **Step 3: Reset profileIndex in setCampaign**

In the `setCampaign` action (around line 82), add `profileIndex: 0` to the set call:

```typescript
      setCampaign(id, contacts, total) {
        set({
          campaignId:         id,
          currentContact:     null,
          queue:              contacts,
          totalContacts:      total,
          callStatus:         'idle',
          activeCallRecordId: null,
          callStartedAt:      null,
          queueFilters:       {},
          pendingFilters:     {},
          profileIndex:       0,
        })
      },
```

- [ ] **Step 4: Reset profileIndex in applyFilters, removeFilter, clearFilters**

In `applyFilters` (around line 343):
```typescript
      async applyFilters() {
        const { pendingFilters, callStatus } = get()
        set({ queueFilters: { ...pendingFilters }, profileIndex: 0 })
        if (callStatus === 'idle') await get().loadQueue()
      },
```

In `removeFilter` (around line 348):
```typescript
      async removeFilter(keys) {
        const { queueFilters, callStatus } = get()
        const next = { ...queueFilters }
        for (const key of keys) delete next[key]
        set({ queueFilters: next, pendingFilters: { ...next }, profileIndex: 0 })
        if (callStatus === 'idle') await get().loadQueue()
      },
```

In `clearFilters` (around line 356):
```typescript
      async clearFilters() {
        const { callStatus } = get()
        set({ queueFilters: {}, pendingFilters: {}, profileIndex: 0 })
        if (callStatus === 'idle') await get().loadQueue()
      },
```

- [ ] **Step 5: Add the three new actions**

After `clearFilters` and before the closing `}` of the create function, add:

```typescript
      setCallingView(view) {
        set({ callingView: view })
      },

      setProfileIndex(index) {
        set({ profileIndex: index })
      },

      async advanceProfile() {
        const { profileIndex, queue, currentContact, totalContacts } = get()
        const loadedCount = (currentContact ? 1 : 0) + queue.length
        const next        = profileIndex + 1
        if (next >= loadedCount && loadedCount < totalContacts) {
          await get().loadQueue(loadedCount)
        }
        set({ profileIndex: next })
      },
```

- [ ] **Step 6: Add callingView to partialize (persist it)**

In the `partialize` function (around line 363):

```typescript
      partialize: (state) => ({
        calledToday:     state.calledToday,
        calledTodayDate: state.calledTodayDate,
        callingView:     state.callingView,
      }),
```

- [ ] **Step 7: Check TypeScript compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 8: Commit**

```bash
git add src/stores/dialer-store.ts
git commit -m "Add callingView and profileIndex state to dialer store"
```

---

### Task 9: QueuePanel — list view visual refresh

**Files:**
- Modify: `src/components/dialer/QueuePanel.tsx`

**Interfaces:**
- No new interface — this is a visual-only change to the existing list

- [ ] **Step 1: Update GRID constant for proportional columns**

In `QueuePanel.tsx`, replace line 30:

```typescript
// drag | name+title | company+employees | history dots | notes | quick-log | mobile | call
const GRID = 'grid-cols-[12px_2fr_1fr_48px_24px_24px_140px_24px]'
```

(The profile-button column is added in Task 10; this task only changes `1fr_110px` → `2fr_1fr`.)

- [ ] **Step 2: Fix CompanyCell alignment**

`CompanyCell` currently uses `items-end` (right-align). With a proportional column it should left-align. Replace the `CompanyCell` function:

```typescript
function CompanyCell({ contact }: { contact: ContactSummary }) {
  return (
    <div className="flex flex-col overflow-hidden w-full">
      {contact.companyName && (
        <p className="text-[11px] text-gray-400 truncate leading-tight">
          {contact.companyName}
        </p>
      )}
      {contact.employeeCount != null && (
        <p className="text-[10px] text-gray-600 leading-tight">
          {contact.employeeCount.toLocaleString()} emp
        </p>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Update ContactRow font sizes and padding**

Inside `ContactRow`, in the row div's className, change `py-2.5` → `py-2`:
```typescript
        className={cn(
          `group grid ${GRID} items-center gap-3 px-4 py-2 cursor-pointer transition-colors`,
```

In the name paragraph, change `text-xs` → `text-[13px]`:
```typescript
              <p className="text-[13px] font-semibold text-white truncate leading-tight">
```

In the job title paragraph, change `text-[10px]` → `text-[11px]`:
```typescript
              <p className="text-[11px] text-gray-500 truncate leading-tight mt-0.5">{contact.jobTitle}</p>
```

- [ ] **Step 4: Update CalledTodayRow font sizes and padding**

In `CalledTodayRow`, change `py-2.5` → `py-2`, and the name `text-xs` → `text-[13px]`, job title `text-[10px]` → `text-[11px]`:

```typescript
function CalledTodayRow({ contact }: { contact: ContactSummary }) {
  // ...
  return (
    <div className={`group grid ${GRID} items-center gap-3 px-4 py-2 border-b border-white/5 opacity-60 hover:opacity-80 transition-opacity`}>
      <div className="w-3 flex-shrink-0" />
      <div className="min-w-0">
        <p className="text-[13px] font-semibold text-white truncate leading-tight">
          {contact.firstName} {contact.lastName}
        </p>
        {contact.jobTitle && (
          <p className="text-[11px] text-gray-500 truncate leading-tight mt-0.5">{contact.jobTitle}</p>
        )}
      </div>
      <CompanyCell contact={contact} />
      {/* ... rest unchanged */}
```

- [ ] **Step 5: Update column header font sizes**

The column headers use `text-[10px]` — leave those unchanged (they are metadata labels, not data).

Update the `MobilePhoneCell` number from `text-[10px]` → `text-[11px]`:
```typescript
        <span
          onClick={handleCopy}
          className="font-mono text-[11px] text-gray-400 whitespace-nowrap cursor-pointer hover:text-gray-200 transition-colors"
```

- [ ] **Step 6: Check TypeScript compiles and visually review**

```bash
npx tsc --noEmit
npm run dev
```

Navigate to Calling page → select a campaign. Verify: rows are slightly tighter, contact names are 13px, company names align left without the large gap.

- [ ] **Step 7: Commit**

```bash
git add src/components/dialer/QueuePanel.tsx
git commit -m "Refresh list view: proportional grid columns, larger fonts, tighter rows"
```

---

### Task 10: QueuePanel — view toggle + profile icon column

**Files:**
- Modify: `src/components/dialer/QueuePanel.tsx`

**Interfaces:**
- Consumes: `callingView`, `setCallingView`, `setProfileIndex` from store (Task 8)
- Produces: segmented List/Profile toggle in header; profile icon on each row that opens Profile view at that contact's index

- [ ] **Step 1: Update GRID to add profile icon column**

Update the GRID constant (now it has 8 columns — add the 9th):

```typescript
// drag | name+title | company | history | notes | quick-log | mobile | call | profile
const GRID = 'grid-cols-[12px_2fr_1fr_48px_24px_24px_140px_24px_24px]'
```

- [ ] **Step 2: Add profile icon to ContactRow**

Add `allContactsIndex: number` and `onOpenProfile: (index: number) => void` to `ContactRow`'s props interface:

```typescript
function ContactRow({
  contact,
  isActive,
  isExpanded,
  isLoading,
  users,
  onToggle,
  cachedContact,
  onSaved,
  allContactsIndex,
  onOpenProfile,
}: {
  contact: ContactSummary
  isActive: boolean
  isExpanded: boolean
  isLoading: boolean
  users: { id: string; name: string }[]
  onToggle: (id: string) => void
  cachedContact: ContactWithCampaign | null
  onSaved: (updated: ContactWithCampaign) => void
  allContactsIndex: number
  onOpenProfile: (index: number) => void
}) {
```

Inside `ContactRow`'s JSX, after the call button, add a new column for the profile icon:

```tsx
        <button
          onClick={(e) => { e.stopPropagation(); onOpenProfile(allContactsIndex) }}
          className={cn(
            'w-6 h-6 flex items-center justify-center rounded-lg flex-shrink-0 transition-colors',
            isActive
              ? 'text-[#f5a623] hover:bg-[#f5a623]/10'
              : 'text-[#6c6353] hover:text-[#857c69] hover:bg-white/5',
          )}
          title="Open profile view"
        >
          <SquareUser className="w-[17px] h-[17px]" />
        </button>
```

- [ ] **Step 3: Add empty column to CalledTodayRow**

In `CalledTodayRow`, add an empty `<div />` as the last column (after the call button):

```tsx
      <button ...>{/* call button */}</button>
      <div />
```

- [ ] **Step 4: Update column headers row**

In the column headers section (around line 501), add an empty `<div />` after the last existing `<div />` to align with the new column:

```tsx
          <div />  {/* profile icon column */}
```

- [ ] **Step 5: Add SquareUser import**

At the top of `QueuePanel.tsx`, add `SquareUser` to the Lucide import:

```typescript
import { Phone, GripVertical, ChevronDown, ChevronLeft, ChevronRight, Copy, Check, Globe, Filter, List, SquareUser } from 'lucide-react'
```

(`List` is also added here for the toggle, used in Step 6.)

- [ ] **Step 6: Add view toggle to header**

In the `QueuePanel` function, read from the store:

```typescript
  const { callingView, setCallingView, setProfileIndex, ...rest } = useDialerStore()
```

(Keep the existing destructuring; add these three to it.)

Add `handleOpenProfile`:
```typescript
  const handleOpenProfile = (index: number) => {
    setProfileIndex(index)
    setCallingView('profile')
  }
```

In the header area (the div containing the "Filters" button), add the toggle left of the Filters button:

```tsx
          {campaignId && (
            <div className="flex items-center gap-2">
              {/* View toggle */}
              <div
                className="flex items-center p-[3px] rounded-[20px]"
                style={{ background: '#211d16', border: '0.5px solid #322c22' }}
              >
                {(['list', 'profile'] as const).map((v) => (
                  <button
                    key={v}
                    onClick={() => setCallingView(v)}
                    className={cn(
                      'flex items-center justify-center w-7 h-[26px] rounded-[18px] transition-colors',
                      callingView === v
                        ? 'bg-[#f5a623] text-[#211a0c]'
                        : 'text-[#857c69] hover:text-[#b3aa96]',
                    )}
                    title={v === 'list' ? 'List view' : 'Profile view'}
                  >
                    {v === 'list'
                      ? <List className="w-3.5 h-3.5" />
                      : <SquareUser className="w-3.5 h-3.5" />
                    }
                  </button>
                ))}
              </div>

              {/* Filters button */}
              <button
                onClick={() => setFilterDrawerOpen(true)}
                className={cn(
                  'flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-medium transition-colors',
                  activeFilterCount(queueFilters) > 0
                    ? 'bg-[#f5a623]/10 text-[#f5a623] border border-[#f5a623]/20'
                    : 'text-gray-500 hover:text-white hover:bg-white/5',
                )}
              >
                <Filter className="w-3 h-3" />
                Filters
                {activeFilterCount(queueFilters) > 0 && (
                  <span className="bg-[#f5a623] text-[#0b0e14] rounded-full w-3.5 h-3.5 flex items-center justify-center text-[9px] font-bold">
                    {activeFilterCount(queueFilters)}
                  </span>
                )}
              </button>
            </div>
          )}
```

(This replaces the existing Filters button standalone render — wrap it in the container above.)

- [ ] **Step 7: Pass new props when rendering ContactRow**

In the `DndContext`/`SortableContext` map (around line 526):

```tsx
              {pageContacts.map((contact, i) => (
                <ContactRow
                  key={contact.id}
                  contact={contact}
                  isActive={contact.id === currentContact?.id}
                  isExpanded={contact.id === expandedContactId}
                  isLoading={contact.id === loadingContactId}
                  users={users}
                  onToggle={handleToggle}
                  cachedContact={contactCache[contact.id] ?? null}
                  onSaved={handleSaved}
                  allContactsIndex={pageOffset + i}
                  onOpenProfile={handleOpenProfile}
                />
              ))}
```

- [ ] **Step 8: Check TypeScript + visual review**

```bash
npx tsc --noEmit
npm run dev
```

Verify: toggle appears in header, clicking List/Profile switches highlight, profile icon appears on each row (amber when active row, dark when inactive).

- [ ] **Step 9: Commit**

```bash
git add src/components/dialer/QueuePanel.tsx
git commit -m "Add view toggle and profile icon column to QueuePanel"
```

---

### Task 11: ProfileCompanyCard

**Files:**
- Create: `src/components/dialer/ProfileCompanyCard.tsx`

**Interfaces:**
- Consumes: `ContactSummary` (has `website`, `companyName`, `employeeCount`); `GET /api/contacts/:id/company-summary`
- Props:
  ```typescript
  interface ProfileCompanyCardProps {
    contact: ContactSummary
  }
  ```

- [ ] **Step 1: Create ProfileCompanyCard.tsx**

Create `src/components/dialer/ProfileCompanyCard.tsx`:

```typescript
'use client'

import { useEffect, useRef, useState } from 'react'
import { Building2, ExternalLink, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ContactSummary } from '@/types/models'

type SummaryStatus = 'idle' | 'loading' | 'generating' | 'ready' | 'failed' | 'unavailable'

interface ProfileCompanyCardProps {
  contact: ContactSummary
}

export function ProfileCompanyCard({ contact }: ProfileCompanyCardProps) {
  const [status,  setStatus]  = useState<SummaryStatus>('idle')
  const [summary, setSummary] = useState<string | null>(null)
  const pollRef               = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (!contact.website) { setStatus('unavailable'); return }
    setStatus('loading')
    setSummary(null)

    let attempts = 0
    const MAX_POLLS = 20

    const fetchSummary = async () => {
      try {
        const res  = await fetch(`/api/contacts/${contact.id}/company-summary`)
        const json = await res.json() as { status: string; summary?: string | null }

        if (json.status === 'ready') {
          setSummary(json.summary ?? null)
          setStatus('ready')
          if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
          return
        }
        if (json.status === 'failed' || json.status === 'unavailable') {
          setStatus(json.status as SummaryStatus)
          if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
          return
        }
        // 'generating' — keep polling
        setStatus('generating')
        attempts++
        if (attempts >= MAX_POLLS) {
          setStatus('failed')
          if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
        }
      } catch {
        setStatus('failed')
        if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
      }
    }

    void fetchSummary()
    // Poll every 3s while generating
    pollRef.current = setInterval(() => {
      if (status === 'ready' || status === 'failed' || status === 'unavailable') return
      void fetchSummary()
    }, 3000)

    return () => {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
    }
  // Re-run when contact changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contact.id])

  if (!contact.companyName) return null

  const websiteHref = contact.website
    ? (contact.website.startsWith('http') ? contact.website : `https://${contact.website}`)
    : null

  return (
    <div
      className="rounded-xl p-4"
      style={{ background: '#211d16', border: '0.5px solid #322c22' }}
    >
      {/* Header row */}
      <div className="flex items-center gap-2">
        <div
          className="w-8 h-8 flex items-center justify-center rounded-lg flex-shrink-0"
          style={{ background: '#322c22' }}
        >
          <Building2 className="w-4 h-4 text-[#f5a623]" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[15px] font-medium text-[#f3ede2] truncate leading-tight">
            {contact.companyName}
          </p>
          {contact.employeeCount != null && (
            <p className="text-[12px] text-[#6c6353] leading-tight">
              {contact.employeeCount.toLocaleString()} employees
            </p>
          )}
        </div>
        {websiteHref && (
          <a
            href={websiteHref}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-[12px] text-[#f5a623] hover:text-[#f5a623]/80 flex-shrink-0"
          >
            <ExternalLink className="w-3 h-3" />
          </a>
        )}
      </div>

      {/* Divider */}
      <div className="my-3" style={{ borderTop: '0.5px solid #322c22' }} />

      {/* AI Summary */}
      <div className="flex items-start gap-1.5">
        <Sparkles className="w-3 h-3 text-[#6c6353] mt-0.5 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-[11px] text-[#6c6353] mb-1.5">AI summary</p>
          {(status === 'loading' || status === 'generating' || status === 'idle') && (
            <div className="space-y-2">
              {[100, 80, 60].map((w) => (
                <div
                  key={w}
                  className="h-3 rounded animate-pulse"
                  style={{ width: `${w}%`, background: 'rgba(255,255,255,0.04)' }}
                />
              ))}
            </div>
          )}
          {status === 'ready' && summary && (
            <p className="text-[13px] text-[#b3aa96] leading-relaxed">{summary}</p>
          )}
          {(status === 'failed' || status === 'unavailable') && (
            <p className="text-[12px] text-[#6c6353] italic">Summary unavailable</p>
          )}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Check TypeScript compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/components/dialer/ProfileCompanyCard.tsx
git commit -m "Add ProfileCompanyCard with AI summary and polling"
```

---

### Task 12: ProfileActionBar

**Files:**
- Create: `src/components/dialer/ProfileActionBar.tsx`

**Interfaces:**
- Consumes: `logManualOutcome`, `advanceProfile` from store; `ContactNotesModal` (Task 6); `OutcomeSearchDropdown` (Task 7)
- Props:
  ```typescript
  interface ProfileActionBarProps {
    contact:          ContactSummary
    initialNoteCount: number
    onNoteSaved:      () => void
  }
  ```

- [ ] **Step 1: Create ProfileActionBar.tsx**

Create `src/components/dialer/ProfileActionBar.tsx`:

```typescript
'use client'

import { useState } from 'react'
import { CircleX, CircleDashed, MessageSquare, ArrowRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useDialerStore } from '@/stores/dialer-store'
import type { CallOutcome } from '@prisma/client'
import type { ContactSummary } from '@/types/models'
import { ContactNotesModal } from './ContactNotesModal'
import { OutcomeSearchDropdown } from './OutcomeSearchDropdown'
import { OUTCOME_LABEL } from './outcome-colors'

interface ProfileActionBarProps {
  contact:          ContactSummary
  initialNoteCount: number
  onNoteSaved:      () => void
}

interface ActionButtonProps {
  icon:      React.ReactNode
  label:     string
  tooltip:   string
  onClick?:  () => void
  disabled?: boolean
  selected?: 'noAnswer' | 'outcome' | 'notes' | null
}

function ActionButton({ icon, label, tooltip, onClick, disabled, selected }: ActionButtonProps) {
  const [showTip, setShowTip] = useState(false)

  const circleClass = cn(
    'w-[52px] h-[52px] rounded-full flex items-center justify-center transition-all',
    disabled && 'opacity-50 cursor-not-allowed',
    !disabled && 'cursor-pointer',
    selected === 'noAnswer' && 'border-[1.5px] border-[#d98a5f] text-[#e08a7c]',
    selected === 'noAnswer' && '[background:#3a2118]',
    selected === 'outcome'  && 'border-[1.5px] border-[#c4872a] text-[#f5a623]',
    selected === 'outcome'  && '[background:#2a1f0d]',
    selected === 'notes'    && 'border-[1.5px] border-[#5fa87f] text-[#7dd6ab]',
    selected === 'notes'    && '[background:#16281f]',
    !selected && !disabled  && 'border border-[#322c22] text-[#857c69] hover:text-[#b3aa96] hover:bg-white/5',
    !selected && disabled   && 'border border-[#322c22] text-[#4a4535]',
  )

  return (
    <div className="relative flex flex-col items-center gap-1">
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        onClick={disabled ? undefined : onClick}
        onMouseEnter={() => setShowTip(true)}
        onMouseLeave={() => setShowTip(false)}
        className={circleClass}
        style={
          selected === 'noAnswer' ? { background: '#3a2118' }
          : selected === 'outcome' ? { background: '#2a1f0d' }
          : selected === 'notes'   ? { background: '#16281f' }
          : undefined
        }
      >
        {icon}
      </div>
      <span className={cn(
        'text-[10px]',
        selected ? 'text-[#b3aa96]' : disabled ? 'text-[#4a4535]' : 'text-[#857c69]',
      )}>
        {label}
      </span>
      {showTip && (
        <div
          className="absolute bottom-[calc(100%+8px)] left-1/2 -translate-x-1/2 px-2 py-1 rounded text-[11px] text-[#f3ede2] whitespace-nowrap z-50 pointer-events-none"
          style={{ background: '#322c22' }}
        >
          {tooltip}
          <div
            className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0"
            style={{
              borderLeft: '4px solid transparent',
              borderRight: '4px solid transparent',
              borderTop: '4px solid #322c22',
            }}
          />
        </div>
      )}
    </div>
  )
}

export function ProfileActionBar({ contact, initialNoteCount, onNoteSaved }: ProfileActionBarProps) {
  const { logManualOutcome, advanceProfile } = useDialerStore()

  const [noAnswerSelected,  setNoAnswerSelected]  = useState(false)
  const [selectedOutcome,   setSelectedOutcome]   = useState<CallOutcome | null>(null)
  const [outcomeDropOpen,   setOutcomeDropOpen]   = useState(false)
  const [notesOpen,         setNotesOpen]         = useState(false)
  const [noteCount,         setNoteCount]         = useState(initialNoteCount)
  const [hasNotedThisView,  setHasNotedThisView]  = useState(false)
  const [loading,           setLoading]           = useState(false)

  const statusLabel =
    noAnswerSelected     ? 'Marked as No Answer — outcome not required'
    : selectedOutcome    ? OUTCOME_LABEL[selectedOutcome]
    : null

  const handleNoAnswer = async () => {
    if (loading) return
    if (noAnswerSelected) {
      setNoAnswerSelected(false)
      return
    }
    setLoading(true)
    try {
      await logManualOutcome(contact.id, 'no_answer', '')
      await advanceProfile()
    } finally {
      setLoading(false)
      setNoAnswerSelected(false)
      setSelectedOutcome(null)
    }
  }

  const handleOutcomeSelect = async (outcome: CallOutcome) => {
    setOutcomeDropOpen(false)
    if (loading) return
    setLoading(true)
    try {
      await logManualOutcome(contact.id, outcome, '')
      setSelectedOutcome(outcome)
      await advanceProfile()
    } finally {
      setLoading(false)
      setSelectedOutcome(null)
    }
  }

  const handleNoteSaved = () => {
    setNoteCount((n) => n + 1)
    setHasNotedThisView(true)
    onNoteSaved()
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Status chip */}
      {statusLabel && (
        <div
          className="px-3 py-2 rounded-full text-[11px] text-center"
          style={{
            background: '#2b201a',
            border:     '0.5px solid #3d2c22',
            color:      noAnswerSelected ? '#d98a5f' : '#f5a623',
          }}
        >
          {statusLabel}
        </div>
      )}

      {/* Button row */}
      <div className="flex items-end justify-between">
        {/* Left group */}
        <div className="flex items-end gap-4">
          <ActionButton
            icon={<CircleX className="w-5 h-5" />}
            label="No Answer"
            tooltip="Mark as no answer (no outcome required)"
            onClick={handleNoAnswer}
            disabled={loading}
            selected={noAnswerSelected ? 'noAnswer' : null}
          />

          <div className="relative">
            <ActionButton
              icon={<CircleDashed className="w-5 h-5" />}
              label="Outcome"
              tooltip="Log a call outcome"
              onClick={() => !noAnswerSelected && setOutcomeDropOpen((v) => !v)}
              disabled={noAnswerSelected || loading}
              selected={selectedOutcome ? 'outcome' : null}
            />
            {outcomeDropOpen && (
              <OutcomeSearchDropdown
                onSelect={handleOutcomeSelect}
                onClose={() => setOutcomeDropOpen(false)}
              />
            )}
          </div>

          <div className="relative">
            <ActionButton
              icon={<MessageSquare className="w-5 h-5" />}
              label={noteCount > 0 ? `Notes` : 'Notes'}
              tooltip="Add or view notes"
              onClick={() => setNotesOpen(true)}
              selected={hasNotedThisView ? 'notes' : null}
            />
            {noteCount > 0 && (
              <div
                className="absolute -top-1 -right-1 w-[17px] h-[17px] rounded-full flex items-center justify-center text-[10px] font-semibold"
                style={{ background: '#5fa87f', color: '#0d1a13' }}
              >
                {noteCount}
              </div>
            )}
          </div>
        </div>

        {/* Divider */}
        <div className="w-px h-10 self-center" style={{ background: '#322c22' }} />

        {/* Next */}
        <button
          onClick={() => void advanceProfile()}
          disabled={loading}
          className="flex items-center gap-2 px-5 py-3 rounded-full text-[13px] font-semibold transition-colors disabled:opacity-50"
          style={{ background: '#f5a623', color: '#211a0c' }}
        >
          Next
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>

      <ContactNotesModal
        contactId={contact.id}
        contactName={`${contact.firstName} ${contact.lastName}`}
        open={notesOpen}
        onClose={() => setNotesOpen(false)}
        hideOutcome={true}
        onNoteSaved={handleNoteSaved}
      />
    </div>
  )
}
```

- [ ] **Step 2: Check TypeScript compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/components/dialer/ProfileActionBar.tsx
git commit -m "Add ProfileActionBar with No Answer, Outcome, Notes, and Next actions"
```

---

### Task 13: ProfileViewCard + wire into QueuePanel

**Files:**
- Create: `src/components/dialer/ProfileViewCard.tsx`
- Modify: `src/components/dialer/QueuePanel.tsx` (add conditional render)

**Interfaces:**
- Consumes: `ProfileCompanyCard` (Task 11); `ProfileActionBar` (Task 12); `getCityTimezone`, `formatLocalTime` (Task 3); `ContactSummary` (Task 2 — includes email, country, city)
- Props:
  ```typescript
  interface ProfileViewCardProps {
    contact:       ContactSummary
    contactIndex:  number   // 0-based position in allContacts
    totalContacts: number
  }
  ```

- [ ] **Step 1: Create ProfileViewCard.tsx**

Create `src/components/dialer/ProfileViewCard.tsx`:

```typescript
'use client'

import { useEffect, useRef, useState } from 'react'
import { MapPin, Clock, Copy, Check, ChevronDown, ArrowLeft } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useDialerStore } from '@/stores/dialer-store'
import { getCityTimezone, formatLocalTime } from '@/lib/timezone'
import type { ContactSummary } from '@/types/models'
import { ProfileCompanyCard } from './ProfileCompanyCard'
import { ProfileActionBar } from './ProfileActionBar'
import { OUTCOME_LABEL, OUTCOME_COLOR, TEXT_CLASS } from './outcome-colors'

type NoteEntry = {
  id:         string
  type:       'call' | 'note'
  callerName: string
  createdAt:  string
  outcome:    string | null
  content:    string
}

interface ProfileViewCardProps {
  contact:       ContactSummary
  contactIndex:  number
  totalContacts: number
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try { await navigator.clipboard.writeText(value) } catch { /* ignore */ }
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <button onClick={handleCopy} className="text-[#857c69] hover:text-[#f3ede2] transition-colors">
      {copied
        ? <Check className="w-3 h-3 text-emerald-400" />
        : <Copy className="w-3 h-3" />
      }
    </button>
  )
}

function ContactInfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="flex flex-col gap-1 rounded-[10px] px-[14px] py-3"
      style={{ background: '#211d16', border: '0.5px solid #322c22' }}
    >
      <p className="text-[11px] text-[#6c6353]">{label}</p>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[14px] text-[#f3ede2] font-mono truncate">{value}</p>
        <CopyButton value={value} />
      </div>
    </div>
  )
}

export function ProfileViewCard({ contact, contactIndex, totalContacts }: ProfileViewCardProps) {
  const { setCallingView } = useDialerStore()

  const [localTime,       setLocalTime]       = useState<string | null>(null)
  const [notes,           setNotes]           = useState<NoteEntry[] | null>(null)
  const [activityOpen,    setActivityOpen]    = useState(false)
  const intervalRef                           = useRef<ReturnType<typeof setInterval> | null>(null)

  // Live local time
  useEffect(() => {
    if (!contact.city) { setLocalTime(null); return }
    const tz = getCityTimezone(contact.city, contact.country)
    if (!tz) { setLocalTime(null); return }

    const tick = () => setLocalTime(formatLocalTime(tz))
    tick()
    intervalRef.current = setInterval(tick, 60_000)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [contact.city, contact.country])

  // Notes + activity fetch
  useEffect(() => {
    setNotes(null)
    setActivityOpen(false)
    fetch(`/api/contacts/${contact.id}/notes`)
      .then((r) => r.json())
      .then(({ data }) => setNotes(data ?? []))
      .catch(() => setNotes([]))
  }, [contact.id])

  const noteCount = notes?.filter((e) => e.type === 'note').length ?? 0
  const callCount = notes?.filter((e) => e.type === 'call').length ?? 0

  const linkedinHref = contact.linkedinUrl
    ? (contact.linkedinUrl.startsWith('http') ? contact.linkedinUrl : `https://${contact.linkedinUrl}`)
    : null

  const locationLabel = [contact.city, contact.country].filter(Boolean).join(', ')

  return (
    <div
      className="flex flex-col gap-4 max-w-[720px] mx-auto w-full p-6 rounded-2xl font-['Inter',sans-serif]"
      style={{ background: '#17140f' }}
    >
      {/* Top row */}
      <div className="flex items-start justify-between gap-4">
        <button
          onClick={() => setCallingView('list')}
          className="flex items-center gap-1 text-[12px] text-[#857c69] hover:text-[#b3aa96] transition-colors flex-shrink-0"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Queue
        </button>

        <p className="text-[12px] text-[#857c69] flex-shrink-0">
          Contact {contactIndex + 1} of {totalContacts}
        </p>

        {locationLabel ? (
          <div className="flex flex-col items-end gap-1">
            <div
              className="flex items-center gap-1 px-2.5 py-1 rounded-full"
              style={{ background: '#211d16', border: '0.5px solid #322c22' }}
            >
              <MapPin className="w-3 h-3 text-[#f5a623] flex-shrink-0" />
              <span className="text-[11px] text-[#b3aa96]">{locationLabel}</span>
            </div>
            {localTime && (
              <div className="flex items-center gap-1">
                <Clock className="w-3 h-3 text-[#6c6353]" />
                <span className="text-[11px] text-[#6c6353]">{localTime} local</span>
              </div>
            )}
          </div>
        ) : (
          <div className="w-20" />
        )}
      </div>

      {/* Name block */}
      <div className="flex flex-col items-center gap-1">
        <div className="flex items-center gap-2">
          <p className="text-[26px] font-semibold text-[#f3ede2] leading-tight">
            {contact.firstName} {contact.lastName}
          </p>
          {linkedinHref && (
            <a
              href={linkedinHref}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center w-6 h-6 rounded-full flex-shrink-0"
              style={{ background: '#211d16', border: '0.5px solid #322c22' }}
              title="LinkedIn"
            >
              <svg className="w-3.5 h-3.5 text-[#f5a623]" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.32 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.79M6.88 8.56a1.68 1.68 0 0 0 1.68-1.68c0-.93-.75-1.69-1.68-1.69a1.69 1.69 0 0 0-1.69 1.69c0 .93.76 1.68 1.69 1.68m1.39 9.94v-8.37H5.5v8.37h2.77z"/>
              </svg>
            </a>
          )}
        </div>
        {contact.jobTitle && (
          <p className="text-[14px] text-[#857c69]">{contact.jobTitle}</p>
        )}
      </div>

      {/* Contact info cards */}
      {(contact.mobilePhone || contact.email) && (
        <div className="grid grid-cols-2 gap-3">
          {contact.mobilePhone && (
            <ContactInfoCard label="Mobile" value={contact.mobilePhone} />
          )}
          {contact.email && (
            <ContactInfoCard label="Email" value={contact.email} />
          )}
        </div>
      )}

      {/* Company card */}
      <ProfileCompanyCard contact={contact} />

      {/* Activity section */}
      <div>
        <button
          onClick={() => setActivityOpen((v) => !v)}
          className="w-full flex items-center justify-between rounded-[10px] px-[14px] py-[10px] transition-colors hover:bg-white/[0.02]"
          style={{ background: '#211d16', border: '0.5px solid #322c22' }}
        >
          <span className="text-[12px] text-[#857c69]">
            Activity — {callCount} prior attempt{callCount !== 1 ? 's' : ''}
          </span>
          <ChevronDown
            className={cn('w-3.5 h-3.5 text-[#6c6353] transition-transform duration-150', activityOpen && 'rotate-180')}
          />
        </button>

        {activityOpen && (
          <div
            className="mt-1 rounded-[10px] overflow-hidden"
            style={{ border: '0.5px solid #322c22' }}
          >
            {!notes ? (
              <div className="px-4 py-6 text-center text-[12px] text-[#6c6353]">Loading…</div>
            ) : notes.length === 0 ? (
              <div className="px-4 py-6 text-center text-[12px] text-[#6c6353]">No activity yet</div>
            ) : (
              <ul className="divide-y" style={{ borderColor: '#322c22' }}>
                {notes.map((entry) => {
                  const date = new Date(entry.createdAt).toLocaleString('en-GB', {
                    day: '2-digit', month: 'short', year: '2-digit',
                    hour: '2-digit', minute: '2-digit',
                  })
                  return (
                    <li key={entry.id} className="px-4 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[12px] font-semibold text-[#f3ede2]">{entry.callerName}</span>
                            {entry.outcome && OUTCOME_LABEL[entry.outcome as keyof typeof OUTCOME_LABEL] && (
                              <span className={cn(
                                'text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-white/5',
                                TEXT_CLASS[OUTCOME_COLOR[entry.outcome as keyof typeof OUTCOME_COLOR]],
                              )}>
                                {OUTCOME_LABEL[entry.outcome as keyof typeof OUTCOME_LABEL]}
                              </span>
                            )}
                            {entry.type === 'note' && (
                              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-white/5 text-[#6c6353]">
                                Note
                              </span>
                            )}
                          </div>
                          {entry.content && (
                            <p className="text-[13px] text-[#b3aa96] mt-1">{entry.content}</p>
                          )}
                        </div>
                        <span className="text-[10px] text-[#6c6353] flex-shrink-0 mt-0.5">{date}</span>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        )}
      </div>

      {/* Action bar */}
      <ProfileActionBar
        contact={contact}
        initialNoteCount={noteCount}
        onNoteSaved={() => {
          setNotes((prev) => prev ? [...prev] : prev)
        }}
      />
    </div>
  )
}
```

- [ ] **Step 2: Wire ProfileViewCard into QueuePanel**

In `QueuePanel.tsx`, add the import near the top:

```typescript
import { ProfileViewCard } from './ProfileViewCard'
```

In the `QueuePanel` function, add reads from the store:

```typescript
  const {
    campaignId, currentContact, queue, calledToday, totalContacts,
    queueFilters,
    callingView, profileIndex,
    setCampaign, startSession, loadQueue, reorderQueue, syncQueue,
    resetCalledTodayIfStale,
  } = useDialerStore()
```

Add `profileContact` after `allContacts`:

```typescript
  const allContacts: ContactSummary[] = [
    ...(currentContact ? [currentContact] : []),
    ...queue,
  ]

  const safeProfileIndex  = Math.min(profileIndex, Math.max(0, allContacts.length - 1))
  const profileContact    = allContacts[safeProfileIndex] ?? null
```

In the `{/* Contact list */}` scrollable body section, wrap the existing content with a conditional:

```tsx
      {/* Contact list / Profile view */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {!campaignId ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm text-gray-500">Select a campaign to begin</p>
          </div>
        ) : callingView === 'profile' && profileContact ? (
          <ProfileViewCard
            contact={profileContact}
            contactIndex={safeProfileIndex}
            totalContacts={totalContacts}
          />
        ) : allContacts.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm text-gray-500">Queue empty</p>
          </div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={pageContacts.map((c) => c.id)} strategy={verticalListSortingStrategy}>
              {pageContacts.map((contact, i) => (
                <ContactRow
                  key={contact.id}
                  contact={contact}
                  isActive={contact.id === currentContact?.id}
                  isExpanded={contact.id === expandedContactId}
                  isLoading={contact.id === loadingContactId}
                  users={users}
                  onToggle={handleToggle}
                  cachedContact={contactCache[contact.id] ?? null}
                  onSaved={handleSaved}
                  allContactsIndex={pageOffset + i}
                  onOpenProfile={handleOpenProfile}
                />
              ))}
            </SortableContext>
          </DndContext>
        )}
      </div>
```

Also hide pagination controls and calledToday section when in profile view. Wrap both sections:

```tsx
      {/* Pagination — hide in profile view */}
      {callingView === 'list' && allContacts.length > 0 && (
        <div className="flex items-center justify-between px-4 py-2.5 border-t border-white/5 flex-shrink-0">
          {/* ... existing pagination JSX unchanged ... */}
        </div>
      )}

      {/* Calls made today — hide in profile view */}
      {callingView === 'list' && calledToday.length > 0 && (
        <div className="border-t border-white/10 flex-shrink-0">
          {/* ... existing calledToday JSX unchanged ... */}
        </div>
      )}
```

- [ ] **Step 3: Check TypeScript compiles**

```bash
npx tsc --noEmit
```

Fix any type errors.

- [ ] **Step 4: Manual end-to-end test**

```bash
npm run dev
```

Test the following flows:
1. Select a campaign → toggle to Profile view → contact displays with name, job title, mobile/email cards
2. Click "← Queue" → returns to List view with filters intact
3. Click profile icon on a list row → Profile view opens on that contact
4. Click "No Answer" → outcome logged, advances to next contact
5. Click "Outcome" → search dropdown appears, select an outcome → closes and advances
6. Click "Notes" → modal opens with note composer only (no Log Outcome tab)
7. Add a note → badge count appears on Notes button
8. Click "Next" → advances to next contact
9. Verify "Contact N of {total}" counter updates correctly
10. Verify location pill and live time appear for contacts with city data
11. Verify AI summary skeleton appears for contacts with a website, then populates
12. Toggle List view → grid is proportional, fonts are larger, rows are tighter

- [ ] **Step 5: Commit**

```bash
git add src/components/dialer/ProfileViewCard.tsx src/components/dialer/QueuePanel.tsx
git commit -m "Add ProfileViewCard and wire into QueuePanel for profile view toggle"
```

---

## Self-Review

**Spec coverage check:**

| Spec section | Covered by task |
|---|---|
| View toggle (segmented control, colors, persistence) | Task 8, Task 10 |
| Profile icon on list rows (amber if active, dark otherwise) | Task 10 |
| Shared state (profileIndex, same queue) | Task 8, Task 13 |
| Profile view layout (top row, name block, contact cards) | Task 13 |
| Location pill + live local time | Task 3, Task 13 |
| Company card + AI summary | Task 4, Task 5, Task 11 |
| Activity history (collapsed, timeline reuse) | Task 13 |
| No Answer button (toggle, status chip, auto-advance) | Task 12 |
| Outcome button (searchable dropdown, auto-advance) | Task 7, Task 12 |
| Notes button (hideOutcome, onNoteSaved, badge count) | Task 6, Task 12 |
| Next button (advance profile, load more) | Task 8, Task 12 |
| List view visual refresh (grid, font sizes, row density) | Task 9 |
| ContactSummary extended with email/country/city | Task 2 |
| CompanySummary schema | Task 1 |
| CompanySummary per websiteDomain (not per contact) | Task 5 |
| city-timezones for timezone lookup | Task 3 |

All spec sections are covered. ✓
