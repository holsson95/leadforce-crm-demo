# Campaign Filters, Calling Page Polish & Font Size Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add campaign name search and status filtering, fix the QueuePanel dropdown overlap, hide the calling page's right column, and bump the global font size by ~6%.

**Architecture:** All four changes are isolated UI modifications — no API routes, schema changes, or shared state touched. Task order is independent; each task can be committed and verified on its own.

**Tech Stack:** Next.js 14 App Router, React, TypeScript, Tailwind CSS (v4), Shadcn/UI (Base UI), Lucide React

## Global Constraints

- No new npm dependencies — use existing Shadcn/UI components and Lucide icons already in the project
- LeadForce accent color: `#00d4ff`; glass panel base class: `glass-panel`
- Active filter pill style: `bg-[#00d4ff]/10 text-[#00d4ff] border border-[#00d4ff]/20`
- Inactive filter pill style: `text-gray-500 hover:text-white hover:bg-white/5 border border-transparent`
- No inline `style` attributes except for dynamic values
- Pixel-based text sizes (`text-[10px]`, `text-[9px]`) are intentionally unaffected by the font-size bump

---

### Task 1: Global font size bump

**Files:**
- Modify: `src/app/globals.css`

**Interfaces:**
- Consumes: nothing
- Produces: nothing (CSS-only; all rem-based text scales proportionally)

- [ ] **Step 1: Add font-size to the html selector in the base layer**

Open `src/app/globals.css`. Find the `@layer base` block (around line 96). Add an `html` rule inside it, before the existing `body` rule:

```css
@layer base {
  html {
    font-size: 106.25%;
  }
  * {
    border-color: var(--border);
    outline-color: var(--ring);
  }
  body {
    background-color: var(--bg-dark);
    color: var(--text-primary);
    font-family: var(--font-sans);
    -webkit-font-smoothing: antialiased;
  }
}
```

- [ ] **Step 2: Verify**

Run `npm run dev`. Open any page. Text at `text-sm` (0.875rem) should render at ~14.9px instead of 14px — subtly more readable. Check that no layout breaks (grid columns, panel heights, sidebars).

- [ ] **Step 3: Commit**

```bash
git add src/app/globals.css
git commit -m "Bump base font size to ~17px for improved readability"
```

---

### Task 2: Fix campaign dropdown overlap in QueuePanel

**Files:**
- Modify: `src/components/dialer/QueuePanel.tsx`

**Interfaces:**
- Consumes: nothing
- Produces: outer wrapper class string used by Task 3

- [ ] **Step 1: Remove overflow-hidden from the QueuePanel outer wrapper**

In `src/components/dialer/QueuePanel.tsx`, find line 442 (the opening div of the returned JSX inside `QueuePanel`):

```tsx
<div className="glass-panel rounded-3xl flex flex-col w-2/3 flex-shrink-0 overflow-hidden relative">
```

Remove `overflow-hidden`:

```tsx
<div className="glass-panel rounded-3xl flex flex-col w-2/3 flex-shrink-0 relative">
```

The inner contact list div at line 502 (`<div className="flex-1 overflow-y-auto min-h-0">`) already owns its own scroll, so nothing changes functionally.

- [ ] **Step 2: Verify**

Navigate to `/calling`. Open the campaign dropdown. The `SelectContent` should appear cleanly below the trigger without clipping or overlapping. Test with a single-item campaign list — verify the one option appears below the trigger bar, not on top of it. Scroll the contact list — confirm it still scrolls normally within the panel.

- [ ] **Step 3: Commit**

```bash
git add src/components/dialer/QueuePanel.tsx
git commit -m "Fix campaign dropdown overlap by removing overflow-hidden from QueuePanel wrapper"
```

---

### Task 3: Hide right column on calling page; expand QueuePanel to full width

**Files:**
- Modify: `src/app/(dashboard)/calling/page.tsx`
- Modify: `src/components/dialer/QueuePanel.tsx`

**Interfaces:**
- Consumes: Task 2 (QueuePanel outer wrapper already has `overflow-hidden` removed)
- Produces: nothing

- [ ] **Step 1: Remove the right column from the calling page layout**

Replace the full contents of `src/app/(dashboard)/calling/page.tsx` with:

```tsx
import { redirect } from 'next/navigation'
import { getCurrentTenantId } from '@/lib/auth'
import { db, withTenant } from '@/lib/db'
import { QueuePanel } from '@/components/dialer/QueuePanel'

export default async function CallingPage() {
  const tenantId = await getCurrentTenantId()
  if (!tenantId) redirect('/sign-in')

  const [campaigns, users] = await Promise.all([
    withTenant(tenantId, () =>
      db.campaign.findMany({
        where:   { status: 'active', archivedAt: null, deletedAt: null },
        select:  { id: true, name: true },
        orderBy: { name: 'asc' },
      })
    ),
    withTenant(tenantId, () =>
      db.user.findMany({
        where:   { deletedAt: null },
        select:  { id: true, name: true },
        orderBy: { name: 'asc' },
      })
    ),
  ])

  return (
    <div className="flex h-full gap-4 p-4 overflow-hidden">
      <QueuePanel campaigns={campaigns} users={users} />
    </div>
  )
}
```

- [ ] **Step 2: Expand QueuePanel to full width**

In `src/components/dialer/QueuePanel.tsx` line 442, change `w-2/3` to `w-full`:

```tsx
<div className="glass-panel rounded-3xl flex flex-col w-full flex-shrink-0 relative">
```

- [ ] **Step 3: Verify**

Navigate to `/calling`. The QueuePanel should fill the entire content area horizontally. No call controls or script panel visible. Queue list, campaign selector, filters, pagination, and "Calls made today" all work normally.

- [ ] **Step 4: Commit**

```bash
git add src/app/(dashboard)/calling/page.tsx src/components/dialer/QueuePanel.tsx
git commit -m "Temporarily hide CallControls and ScriptPanel; expand QueuePanel to full width"
```

---

### Task 4: Campaign search and status filter bar

**Files:**
- Modify: `src/components/campaigns/CampaignsTable.tsx`

**Interfaces:**
- Consumes: `campaigns: CampaignWithDetails[]` prop (already passed in from `campaigns/page.tsx`)
- Produces: nothing (self-contained client state; no props change)

- [ ] **Step 1: Add Search to the Lucide import and add filter state**

In `src/components/campaigns/CampaignsTable.tsx`, update the Lucide import line (line 4) to include `Search`:

```tsx
import { Plus, MoreHorizontal, Search } from 'lucide-react'
```

Inside the `CampaignsTable` component body, after the existing `useState` declarations (after `lifecycleModal` state), add:

```tsx
const [searchQuery, setSearchQuery] = useState('')
const [statusFilter, setStatusFilter] = useState<'all' | 'draft' | 'active' | 'paused' | 'completed'>('all')

const filteredCampaigns = campaigns.filter((c) => {
  const matchesSearch = c.name.toLowerCase().includes(searchQuery.toLowerCase())
  const matchesStatus = statusFilter === 'all' || c.status === statusFilter
  return matchesSearch && matchesStatus
})
```

- [ ] **Step 2: Update the count badge to use filteredCampaigns.length**

Find the badge inside the header div (line 56–58):

```tsx
<span className="ml-2 font-mono text-[10px] bg-accent/10 text-[#00d4ff] px-2 py-0.5 rounded-full">
  {campaigns.length}
</span>
```

Change `campaigns.length` to `filteredCampaigns.length`:

```tsx
<span className="ml-2 font-mono text-[10px] bg-accent/10 text-[#00d4ff] px-2 py-0.5 rounded-full">
  {filteredCampaigns.length}
</span>
```

- [ ] **Step 3: Insert the filter row between the header and the column headers**

Find the column headers div (line 73):

```tsx
<div className="grid grid-cols-[2fr_1.5fr_100px_120px_100px_44px] gap-4 px-6 py-3 border-b border-white/5">
```

Insert the following block immediately before it:

```tsx
{/* Filter row */}
<div className="flex items-center gap-3 px-6 py-3 border-b border-white/5">
  <div className="relative flex-1 max-w-xs">
    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500 pointer-events-none" />
    <input
      type="text"
      value={searchQuery}
      onChange={(e) => setSearchQuery(e.target.value)}
      placeholder="Search campaigns…"
      className="w-full bg-white/5 border border-white/10 rounded-xl pl-8 pr-3 py-1.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[#00d4ff]/40 focus:bg-white/[0.07] transition-colors"
    />
  </div>
  <div className="flex items-center gap-1.5">
    {(['all', 'draft', 'active', 'paused', 'completed'] as const).map((s) => (
      <button
        key={s}
        type="button"
        onClick={() => setStatusFilter(s)}
        className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold capitalize transition-colors ${
          statusFilter === s
            ? 'bg-[#00d4ff]/10 text-[#00d4ff] border border-[#00d4ff]/20'
            : 'text-gray-500 hover:text-white hover:bg-white/5 border border-transparent'
        }`}
      >
        {s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
      </button>
    ))}
  </div>
</div>
```

- [ ] **Step 4: Update the empty state and the campaign list render**

Find the empty state block (around line 79):

```tsx
{campaigns.length === 0 && (
  <div className="flex flex-col items-center justify-center py-20">
    <p className="text-sm text-gray-500 mb-4">No campaigns yet</p>
    {canManage && (
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={openCreate}
        className="border-dashed border-white/10 text-gray-500 hover:text-white hover:border-white/20 rounded-xl"
      >
        <Plus className="w-4 h-4 mr-1.5" />
        Create your first campaign
      </Button>
    )}
  </div>
)}
```

Replace it with:

```tsx
{filteredCampaigns.length === 0 && (
  <div className="flex flex-col items-center justify-center py-20">
    {campaigns.length === 0 ? (
      <>
        <p className="text-sm text-gray-500 mb-4">No campaigns yet</p>
        {canManage && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={openCreate}
            className="border-dashed border-white/10 text-gray-500 hover:text-white hover:border-white/20 rounded-xl"
          >
            <Plus className="w-4 h-4 mr-1.5" />
            Create your first campaign
          </Button>
        )}
      </>
    ) : (
      <p className="text-sm text-gray-500">No campaigns match your filters</p>
    )}
  </div>
)}
```

Then find the `.map` call in the campaign list (around line 98):

```tsx
{campaigns.map((campaign) => {
```

Change it to:

```tsx
{filteredCampaigns.map((campaign) => {
```

- [ ] **Step 5: Verify**

Navigate to `/campaigns`.
- Filter row appears between the "All Campaigns" header and the column headers.
- Typing in the search box narrows the list in real time (case-insensitive).
- Clicking a status pill filters by that status; the active pill gets the cyan highlight.
- Both filters compose: searching "Acme" + status "active" shows only matching active campaigns.
- The count badge reflects the filtered count.
- With no matches and existing campaigns: "No campaigns match your filters" (no CTA).
- With genuinely zero campaigns: "No campaigns yet" + create CTA.

- [ ] **Step 6: Commit**

```bash
git add src/components/campaigns/CampaignsTable.tsx
git commit -m "Add campaign name search and status filter bar to campaigns table"
```
