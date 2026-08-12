# Design Spec: Campaign Filters, Calling Page Polish, Font Size

**Date:** 2026-07-21  
**Status:** Approved

---

## Overview

Four targeted UI improvements:
1. Search and status filter bar on the Campaigns page
2. Fix campaign dropdown overlap in the Calling page queue panel
3. Temporarily hide the right column (CallControls + ScriptPanel) on the Calling page
4. Slightly increase base font size globally

---

## 1. Campaign Search + Status Filter Bar

### Where
`src/components/campaigns/CampaignsTable.tsx`

### What
A filter row inserted between the "All Campaigns / New Campaign" header and the column headers, inside the existing glass panel.

**Left:** A text input with a Search icon, placeholder "Search campaigns…". Filters the rendered list as the user types — case-insensitive match against `campaign.name`.

**Right:** Status pills — `All · Draft · Active · Paused · Completed`. Clicking a pill sets the active status filter. The active pill gets an accent highlight (`bg-accent/10 text-[#00d4ff] border border-accent/20`). Inactive pills are `text-gray-500 hover:text-white`.

**Composition:** Search and status filter compose — both apply simultaneously.

**Count badge:** The `{campaigns.length}` badge next to "All Campaigns" updates to show the filtered count (`filteredCampaigns.length`).

**Empty state:** When filters are active and nothing matches, show "No campaigns match your filters" instead of "No campaigns yet". The "Create your first campaign" CTA is hidden when a filter is active.

### Implementation
- All filtering is `useState` client-side in `CampaignsTable`. No API or server changes.
- `searchQuery: string` and `statusFilter: string` ('all' | 'draft' | 'active' | 'paused' | 'completed') state vars.
- Derived `filteredCampaigns` computed from both filters applied to the `campaigns` prop.
- Render `filteredCampaigns` in place of `campaigns`.

---

## 2. Campaign Dropdown Overlap Fix (Calling Page)

### Where
`src/components/dialer/QueuePanel.tsx`

### Problem
The outer QueuePanel wrapper has `overflow-hidden`, which clips the Select dropdown portal when there are few items. The dropdown appears to overlap the trigger instead of rendering cleanly below it.

### Fix
Remove `overflow-hidden` from the outer QueuePanel wrapper div. The inner contact list div (`flex-1 overflow-y-auto min-h-0`) already handles its own scrolling — removing `overflow-hidden` from the outer wrapper does not affect scroll behavior.

The rounded corners (`rounded-3xl`) are not dependent on `overflow-hidden` and remain.

**Before:**
```
className="glass-panel rounded-3xl flex flex-col w-2/3 flex-shrink-0 overflow-hidden relative"
```

**After:**
```
className="glass-panel rounded-3xl flex flex-col w-2/3 flex-shrink-0 relative"
```

---

## 3. Hide Right Column on Calling Page (Temporary)

### Where
`src/app/(dashboard)/calling/page.tsx` and `src/components/dialer/QueuePanel.tsx`

### What
The right column (`<div className="w-1/3 flex flex-col gap-4 min-w-0">` containing `<CallControls />` and `<ScriptPanel />`) is removed from the calling page layout for now.

QueuePanel currently hardcodes `w-2/3` on its outer wrapper. Change this to `w-full` so it fills the available space when the right column is absent.

**calling/page.tsx before:**
```tsx
<div className="flex h-full gap-4 p-4 overflow-hidden">
  <QueuePanel campaigns={campaigns} users={users} />
  <div className="w-1/3 flex flex-col gap-4 min-w-0">
    <CallControls />
    <ScriptPanel />
  </div>
</div>
```

**calling/page.tsx after:**
```tsx
<div className="flex h-full gap-4 p-4 overflow-hidden">
  <QueuePanel campaigns={campaigns} users={users} />
</div>
```

**QueuePanel.tsx:** Change `w-2/3` → `w-full` on the outer wrapper.

---

## 4. Global Font Size Increase (~6%)

### Where
`src/app/globals.css`

### What
Add `font-size: 106.25%;` to the `html` selector, setting the root to ~17px (up from the browser default of 16px). All `rem`-based Tailwind text sizes scale proportionally:

| Class | Before | After |
|-------|--------|-------|
| `text-xs` (0.75rem) | 12px | ~12.75px |
| `text-sm` (0.875rem) | 14px | ~14.88px |
| `text-base` (1rem) | 16px | ~17px |

Pixel-based sizes (e.g. `text-[10px]`) are unaffected. This is intentional — those are already very small and the user can address them separately if needed.

No component changes required.

---

## Files Changed

| File | Change |
|------|--------|
| `src/components/campaigns/CampaignsTable.tsx` | Add search input + status pills, derive `filteredCampaigns` |
| `src/components/dialer/QueuePanel.tsx` | Remove `overflow-hidden` from outer wrapper, change `w-2/3` to `w-full` |
| `src/app/(dashboard)/calling/page.tsx` | Remove right column div with CallControls + ScriptPanel |
| `src/app/globals.css` | Add `font-size: 106.25%` to `html` selector |

No API routes, Prisma schema, or other components are touched.
