# LeadForce CRM — UI Style Guide

> Reference document for Claude Code. This defines every visual decision for the LeadForce CRM frontend.
> Do not deviate from these conventions unless explicitly asked.

---

## 1. Design Philosophy

LeadForce uses a **dark-mode glass-panel aesthetic** designed for high-velocity sales workflows. The look is premium SaaS — closer to a fintech trading terminal than a generic CRM. Every surface should feel like frosted glass floating over a deep navy void. Data-heavy elements (KPIs, timers, stats) use monospaced type to feel "live" and precise. The overall tone is **professional, focused, and high-energy** without being distracting.

Key principles:
- **Glass over void**: cards and panels float with backdrop blur over the dark background
- **Cyan as the single hero accent**: one dominant accent color creates brand recognition
- **Data is the hero**: numbers are large, monospaced, and prominent — labels are small and muted
- **Progressive disclosure**: show summary first, detail on interaction (drawers, expandable rows)
- **Motion with purpose**: animations indicate state changes (call connected, task completed) not decoration

---

## 2. Color System

### Core Palette

| Token                  | Value                           | Usage                                      |
|------------------------|---------------------------------|--------------------------------------------|
| `--bg-dark`            | `#0b0e14`                       | Page background, sidebar background        |
| `--card-bg`            | `rgba(22, 28, 38, 0.6)`        | Glass panel fill                           |
| `--card-bg-solid`      | `#161c26`                       | Solid fallback where blur isn't supported  |
| `--border`             | `rgba(255, 255, 255, 0.08)`    | Default card/panel borders                 |
| `--border-hover`       | `rgba(255, 255, 255, 0.15)`    | Borders on hover                           |
| `--text-primary`       | `#e2e8f0`                       | Primary body text                          |
| `--text-secondary`     | `#94a3b8`                       | Secondary text, labels                     |
| `--text-muted`         | `#64748b`                       | Tertiary text, timestamps, placeholders    |
| `--text-disabled`      | `#475569`                       | Disabled/struck-through text               |

### Accent Colors

| Token                  | Value       | Usage                                          |
|------------------------|-------------|-------------------------------------------------|
| `--accent`             | `#00d4ff`   | Primary accent — links, active nav, CTAs, glows |
| `--accent-muted`       | `#00d4ff1a` | Accent backgrounds (10% opacity)               |
| `--accent-glow`        | `0 0 15px rgba(0, 212, 255, 0.3)` | Box-shadow for accent glow effect   |

### Status Colors

| Token            | Value       | Usage                                     |
|------------------|-------------|-------------------------------------------|
| `--success`      | `#10b981`   | Positive trends, healthy campaigns, done  |
| `--warning`      | `#f59e0b`   | Caution, medium health, pending           |
| `--danger`       | `#ef4444`   | Negative trends, low health, overdue      |
| `--info`         | `#3b82f6`   | Informational badges, neutral highlights  |

Each status color has a background variant at 10% opacity (e.g., `rgba(16, 185, 129, 0.1)` for success backgrounds).

### Call State Colors

| State          | Border/Glow Color | Animation        |
|----------------|-------------------|------------------|
| Idle           | `--border`        | None             |
| Ringing        | `--accent`        | Pulse (2s cycle) |
| Connected      | `--success`       | Pulse (2s cycle) |
| On Hold        | `--warning`       | Slow pulse (3s)  |
| Ended          | `--text-muted`    | Fade out (0.5s)  |

### Campaign Health Gradient

| Score Range | Color        | Label              |
|-------------|--------------|---------------------|
| 80–100      | `--success`  | Stable Performance  |
| 50–79       | `--warning`  | Needs Attention     |
| 0–49        | `--danger`   | Data Needs Cleaning |

Health bars use the corresponding color as the fill, always on a `bg-white/10` track.

---

## 3. Typography

### Font Stack

| Role          | Font Family      | Weight Range | Import                                          |
|---------------|------------------|--------------|--------------------------------------------------|
| UI / Copy     | `Outfit`         | 300–700      | Google Fonts: `Outfit:wght@300;400;500;600;700`  |
| Data / Mono   | `JetBrains Mono` | 400–600      | Google Fonts: `JetBrains+Mono:wght@400;500;600`  |

### Type Scale

| Element                    | Font         | Size         | Weight    | Color              |
|----------------------------|--------------|--------------|-----------|---------------------|
| Page title (h1)            | Outfit       | `text-xl` (20px)  | 600 (semibold) | `--text-primary`  |
| Section heading (h2)       | Outfit       | `text-lg` (18px)  | 600       | `--text-primary`     |
| Card heading (h3)          | Outfit       | `text-sm` (14px)  | 600       | `--text-primary`     |
| Body text                  | Outfit       | `text-sm` (14px)  | 400       | `--text-primary`     |
| Label / caption            | Outfit       | `text-xs` (12px)  | 500       | `--text-secondary`   |
| Micro label                | Outfit       | `text-[10px]`     | 500/600   | `--text-muted`       |
| KPI number (large)         | JetBrains Mono | `text-3xl` (30px) | 600    | `--text-primary`     |
| KPI number (medium)        | JetBrains Mono | `text-xl` (20px)  | 500    | `--text-primary`     |
| Data cell / stat           | JetBrains Mono | `text-sm` (14px)  | 400    | `--text-primary`     |
| Timer / counter            | JetBrains Mono | `text-2xl`+ (24px+) | 600  | `--accent`           |
| Badge / tag text           | Outfit       | `text-[10px]`     | 600       | Status color         |
| Sidebar nav item           | Outfit       | `text-sm` (14px)  | 400 (500 active) | gray-400 / accent |
| Sidebar brand name         | Outfit       | `text-xl` (20px)  | 700       | white→gray gradient  |

### Typography Rules

- **Never use Inter, Roboto, Arial, or system fonts** — Outfit and JetBrains Mono only
- All numbers, percentages, durations, and counts use `JetBrains Mono`
- Labels and descriptions use `Outfit`
- Uppercase tracking (`tracking-wider` or `tracking-widest`) is used only for micro-labels and section headers in panels
- No text larger than `text-3xl` except the brand name on login/splash screens

---

## 4. Layout & Spacing

### Page Structure

```
┌─────────────────────────────────────────────────┐
│ Sidebar (w-64, fixed left, full height)         │
│ ┌─────────────────────────────────────────────┐ │
│ │ Logo + Brand (p-6)                          │ │
│ │ Nav Items (px-4, mt-4)                      │ │
│ │ Daily Target Card (p-4, bottom area)        │ │
│ │ Settings Link (p-4, border-t, very bottom)  │ │
│ └─────────────────────────────────────────────┘ │
│                                                 │
│ Main Content (flex-1, overflow-y-auto)          │
│ ┌─────────────────────────────────────────────┐ │
│ │ Header (h-20, sticky top, border-b)         │ │
│ │ Content Area (p-8, space-y-8)               │ │
│ └─────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────┘
```

### Dialer Page (3-Panel Layout)

```
┌──────────┬────────────────────┬──────────┐
│ Queue    │ Call Controls       │ Script   │
│ (30%)    │ (40%)               │ (30%)    │
│          │                     │          │
│ Next 5   │ Timer + Controls    │ Branch   │
│ contacts │ AI Suggestions      │ tree     │
│          │ Disposition Form    │ Notes    │
└──────────┴────────────────────┴──────────┘
```

### Spacing Tokens

| Context              | Value     | Tailwind        |
|----------------------|-----------|-----------------|
| Page padding         | 32px      | `p-8`           |
| Section gap          | 32px      | `space-y-8` or `gap-8` |
| Card internal padding| 24px      | `p-6`           |
| Card gap (grid)      | 24px      | `gap-6`         |
| Compact card padding | 16px      | `p-4`           |
| Element gap (inline) | 12–16px   | `gap-3` / `gap-4` |
| Micro gap            | 4–8px     | `gap-1` / `gap-2` |

---

## 5. Components

### Glass Panel (Base Container)

Every card, panel, and content block uses this base:

```css
.glass-panel {
  background: rgba(22, 28, 38, 0.6);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.3);
}
```

- Border radius: `rounded-3xl` (24px) for large panels, `rounded-2xl` (16px) for cards, `rounded-xl` (12px) for inner elements
- Hover: `hover:border-[accent]/30` (accent tint on border)
- Some panels have a subtle gradient overlay: `bg-gradient-to-b from-white/5 to-transparent`

### KPI Card

Structure: Icon (top-left) → Trend badge (top-right) → Label (small, muted) → Value (large, mono) → Sparkline (bottom)

- Icon container: `w-12 h-12 rounded-2xl bg-[color]/10` with colored icon inside
- Trend badge: `text-xs font-semibold bg-[status]/10 text-[status] px-2 py-1 rounded-lg` with arrow icon
- Value: `text-3xl font-mono font-semibold`
- Sparkline: SVG `viewBox="0 0 100 30"`, stroke only (no fill), `stroke-2 opacity-30`, uses accent or status color

### Sidebar Navigation

- Container: `w-64`, solid `--bg-dark` background, `border-r border-white/5`
- Nav item (default): `px-3 py-2.5 rounded-xl text-gray-400 hover:text-white hover:bg-white/5`
- Nav item (active): `bg-white/5 text-[#00d4ff]`
- Icons: Lucide icon set via Iconify, `text-xl`
- Bottom section: Settings link separated by `border-t border-white/5`
- Daily target widget: glass-panel with progress bar (`bg-[accent] h-1.5 rounded-full` on `bg-white/10` track)

### Header Bar

- Height: `h-20`, sticky top, `border-b border-white/5`, solid `--bg-dark` background
- Left: Page title (h1) + subtitle with inline status
- Right: Organisation selector (rounded-full select with icon) → Notification bell (with red dot badge) → User info + avatar
- Organisation selector: `bg-[--bg-dark] border border-white/10 rounded-full` with focus ring `focus:ring-4 focus:ring-[accent]/10`

### Data Tables (Comfortable Density)

- Row height: ~56px (comfortable, not cramped, not spacious)
- Row padding: `p-4` (16px vertical/horizontal)
- Row hover: `hover:bg-white/[0.02]` (very subtle)
- Row dividers: `divide-y divide-white/5`
- Header row: `text-xs font-bold uppercase tracking-wider text-gray-500`
- Cell text: `text-sm` for labels, `font-mono text-sm` for data values
- Inline edit: on click, cell transforms to input with `bg-transparent border-b border-[accent]`
- Bulk action bar: appears at top when rows selected, glass-panel with action buttons

### Buttons

| Type        | Style                                                        |
|-------------|--------------------------------------------------------------|
| Primary     | `bg-gradient-to-r from-[#00d4ff] to-cyan-600 text-black font-semibold rounded-xl shadow-xl shadow-[accent]/30` |
| Secondary   | `bg-white/5 border border-white/10 text-gray-300 hover:bg-white/10 rounded-xl` |
| Ghost       | `text-gray-400 hover:text-white hover:bg-white/5 rounded-xl` |
| Danger      | `bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 rounded-xl` |
| Dashed/Add  | `border border-dashed border-white/10 text-gray-500 hover:text-white hover:border-white/20 rounded-xl` |
| FAB (mobile)| `w-14 h-14 rounded-full bg-gradient-to-r from-[accent] to-cyan-600 text-black shadow-xl` |

### Badges & Tags

- Status badge: `text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase` with `bg-[status]/10 text-[status]`
- Trend badge: same as status badge but with `rounded-lg` and includes arrow icon
- Count badge: `font-mono text-[10px] bg-[accent]/10 text-[accent] px-2 py-0.5 rounded-full`
- Notification dot: `w-2 h-2 bg-red-500 rounded-full border-2 border-[--bg-dark]` (absolute positioned)

### Calendar Widget

- Grid: 7 columns, `gap-1`, `text-xs` numbers
- Day cell: `h-8 rounded-lg hover:bg-white/10`
- Today/selected: `bg-[accent] text-black font-bold shadow-[0_0_15px_rgba(0,212,255,0.4)]`
- Has-event indicator: `border border-[accent]/30`
- Header: month/year label + chevron prev/next buttons

### Task List

- Checkbox (unchecked): `w-5 h-5 rounded border border-white/20 bg-white/5`, hover: `border-[accent]/50`
- Checkbox (checked): `border-[accent] bg-[accent]/20` with cyan check icon
- Task text (done): `text-gray-500 line-through decoration-gray-600`
- Task text (pending): `text-gray-300 group-hover:text-white`
- Row: `p-2.5 rounded-xl hover:bg-white/5 border border-transparent hover:border-white/10`

### Pipeline (Kanban Board)

- Column: glass-panel with header showing stage name + deal count badge
- Deal card: glass-panel `rounded-2xl p-4`, draggable, with subtle `hover:border-[accent]/20`
- Deal card glow: border color matches pipeline stage (e.g., green for "Meeting Confirmed", amber for "Proposal")
- Drag handle: `text-gray-600` grip dots icon, visible on hover

### Campaign Health Card

- Left: gradient icon container (`w-12 h-12 rounded-xl bg-gradient-to-br from-[color]-500 to-[color]-600 shadow-lg shadow-[color]-500/10`)
- Center: campaign name + health bar (`w-32 bg-white/10 h-1.5 rounded-full` with colored fill)
- Right: lead count + status label
- Row: `p-4 hover:bg-white/[0.02]` with bottom divider

### Leaderboard Row

- Avatar: `w-12 h-12 rounded-full border border-white/10`
- Rank badge: `w-5 h-5 rounded-full` absolute bottom-right of avatar. Gold (#f59e0b) for 1st, silver (#cbd5e1) for 2nd, bronze (#f97316) for 3rd
- Current user highlight: avatar border changes to `border-[accent]`
- Stats: `font-mono text-sm` for values, `text-[10px] text-gray-600` for labels

---

## 6. Slide-In Drawers

Used for: disposition forms, contact editing, task creation, deal details, script editing.

- **Enter from**: right side of screen
- **Width**: `w-[480px]` (medium) or `w-[640px]` (large, for script editor)
- **Backdrop**: `bg-black/40 backdrop-blur-sm` overlay on the rest of the page
- **Panel style**: solid `--card-bg-solid` background (not glass, since it overlays content), `border-l border-white/10`
- **Animation**: slide in from right, `transform translateX(100%) → translateX(0)`, `duration-300 ease-out`
- **Header**: sticky top, title + close button (X icon), `border-b border-white/5`
- **Footer**: sticky bottom, action buttons (Save/Cancel), `border-t border-white/5`
- **Body**: scrollable content area with `p-6 space-y-6`

---

## 7. Dialer — Active Call State (Energetic)

When a call is active, the center panel transforms to convey energy and urgency:

- **Center panel border**: animated pulse in `--success` (green) when connected, `--accent` (cyan) when ringing
- **Call timer**: `text-4xl font-mono text-[accent]` with subtle `text-shadow: 0 0 20px rgba(0,212,255,0.5)` glow
- **Audio waveform**: animated SVG bars (5–7 bars) that oscillate at different rates, `fill-[accent]/60`
- **Pulse animation on border**:
  ```css
  @keyframes call-pulse {
    0% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.5); }
    70% { box-shadow: 0 0 0 12px rgba(16, 185, 129, 0); }
    100% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); }
  }
  ```
- **Left and right panels**: slightly dimmed (`opacity-80`) during active call to focus attention on center
- **Disposition form**: slides up from bottom of center panel after call ends, with outcome buttons as large touch-friendly tiles
- **AI suggestion overlay**: appears as a floating pill at the top of the center panel during objections, `bg-[accent]/10 border border-[accent]/30 rounded-full px-4 py-2 text-sm`

---

## 8. Animations & Transitions

### Global Transitions

- All interactive elements: `transition-all duration-200` or `transition-colors duration-200`
- Hover color shifts: 200ms
- Panel/drawer open: 300ms ease-out
- Panel/drawer close: 200ms ease-in

### Specific Animations

| Animation       | Trigger                  | Properties                                     |
|-----------------|--------------------------|------------------------------------------------|
| `pulse-green`   | Active call connected    | Green box-shadow pulse, 2s infinite            |
| `pulse-cyan`    | Ringing / accent actions | Cyan box-shadow pulse, 2s infinite             |
| `pulse-amber`   | On hold                  | Amber box-shadow pulse, 3s infinite            |
| `fade-in`       | Content appearing        | opacity 0→1, 300ms ease-out                   |
| `slide-up`      | Toast / disposition form | translateY(10px)→0, opacity 0→1, 200ms         |
| `slide-in-right`| Drawer open              | translateX(100%)→0, 300ms ease-out             |
| `waveform`      | Active call audio        | scaleY oscillation on 5–7 bars, staggered      |
| Sparkline draw  | KPI card load            | stroke-dashoffset animation, 1s ease-out       |
| Progress fill   | Health bars, targets     | width 0→actual%, 800ms ease-out                |

### Rules

- Never animate layout shifts (no width/height transitions on content areas)
- Use `will-change: transform` on drawer panels and animated elements
- Respect `prefers-reduced-motion` — disable pulse and waveform, keep fade-in

---

## 9. Scrollbars

Custom thin scrollbar on all scrollable containers:

```css
.custom-scrollbar::-webkit-scrollbar { width: 4px; }
.custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
.custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.1); border-radius: 10px; }
```

Apply `custom-scrollbar` class to: main content area, drawer bodies, script panel, queue panel, and any panel with `overflow-y-auto`.

---

## 10. Icon System

- **Library**: Lucide icons via Iconify (`iconify-icon` web component or `lucide-react` in React)
- **Sizes**: `text-xl` (20px) for nav and card icons, `text-2xl` (24px) for KPI card icons, `text-sm` (14px) for inline/badge icons, `text-xs` (12px) for micro icons in badges
- **Color**: inherits from parent text color (typically gray-400, accent, or status colors)
- **Never use**: emoji, Font Awesome, or custom SVG icons where Lucide has an equivalent

### Key Icon Mappings

| Concept         | Lucide Icon              |
|-----------------|--------------------------|
| Dashboard       | `layout-dashboard`       |
| Campaigns       | `target`                 |
| Contacts        | `users`                  |
| Calling/Dialer  | `phone-call`             |
| Pipeline        | `kanban`                 |
| Reports         | `bar-chart-3`            |
| Settings        | `settings`               |
| Notifications   | `bell`                   |
| Organisation    | `building-2`             |
| Add/Create      | `plus`                   |
| Trend up        | `trending-up`            |
| Trend down      | `trending-down`          |
| Health good     | `shield-check`           |
| Health warning  | `alert-triangle`         |
| Health critical | `zap-off`                |
| Calendar        | `calendar-check-2`       |
| Check/Done      | `check`                  |
| Close/Dismiss   | `x`                      |
| Navigate        | `chevron-left/right/down`|

---

## 11. Responsive Behavior

- **Primary target**: Desktop (1280px+). The dialer is a desktop-first experience.
- **Tablet (768–1279px)**: Sidebar collapses to icon-only (w-16). KPI grid goes to 2 columns. Dialer goes to 2 panels (queue hidden, accessible via tab).
- **Mobile (<768px)**: Sidebar becomes bottom tab bar. Dialer is single-panel with swipe navigation. FAB button for quick-dial. Tables switch to card-based list view.
- **Breakpoints**: Use Tailwind defaults (`sm:640`, `md:768`, `lg:1024`, `xl:1280`, `2xl:1536`)

---

## 12. Light Mode (Future)

Light mode is not in scope for v1 but should be architecturally possible. All colors should reference CSS custom properties (not hardcoded hex in Tailwind classes) so a theme swap can be implemented later. The glass-panel effect will need a different treatment in light mode (lighter blur, visible shadows instead of glows).

---

## 13. Do NOT

- Use Inter, Roboto, Arial, or system fonts
- Use purple gradients, pastel palettes, or white backgrounds
- Use rounded-full on large containers (only on avatars, badges, pills, and FABs)
- Use more than one accent color (cyan only — status colors are functional, not decorative)
- Add shadows to elements inside glass panels (the panel itself has the shadow)
- Use opacity below 0.3 on interactive text (accessibility)
- Hardcode colors — always use CSS variables or Tailwind theme extension
