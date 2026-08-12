# Light Mode + Theme Redesign — Design Spec

**Date:** 2026-07-22
**Status:** Approved

---

## Overview

Add a light/dark mode toggle to LeadForce CRM covering both the main dashboard and client portal. Simultaneously redesign the dark theme — replacing the current heavy brown-black + amber palette with a "warm but restrained" aesthetic using deep warm charcoal and soft gold. Both modes are designed together as a cohesive pair.

---

## Goals

- Full production-quality light mode — not an inversion, a designed theme
- Theme persists via `localStorage`; defaults to OS `prefers-color-scheme`; falls back to dark
- Toggle available in both dashboard `Header` and client portal header
- No flash of wrong theme on page load (SSR-safe)

---

## Architecture

### Library: `next-themes`

`next-themes` is the sole new dependency. It provides:

- A `ThemeProvider` that writes `class="dark"` or `class="light"` to `<html>`
- A blocking inline script injected before React hydrates — prevents FOCT (flash of correct theme) on SSR/SSG
- `useTheme()` hook for reading and setting the active theme in client components
- Automatic `localStorage` read/write
- Automatic `prefers-color-scheme` detection as the first-visit default

**Configuration:**

```tsx
<ThemeProvider
  attribute="class"
  defaultTheme="system"
  enableSystem
  disableTransitionOnChange={false}
/>
```

- `attribute="class"` — theme class goes on `<html>`, matching the existing `@custom-variant dark (&:is(.dark *))` in globals.css
- `defaultTheme="system"` + `enableSystem` — respects OS preference on first visit
- `disableTransitionOnChange={false}` — allows CSS `transition` on color changes for a smooth swap

### Provider Placement

`ThemeProvider` is added to two layouts:

| Layout | File |
|---|---|
| Main app | `src/app/layout.tsx` |
| Client portal | `src/app/client-portal/layout.tsx` |

Both layouts share `globals.css`, so the palette is defined once.

### ThemeToggle Component

New file: `src/components/shared/ThemeToggle.tsx`

- `"use client"` component
- Uses `useTheme()` from `next-themes`
- Renders a Sun icon (in dark mode, clicking switches to light) or Moon icon (in light mode, clicking switches to dark)
- Mounted-check guard (`const [mounted, setMounted] = useState(false)`) to prevent SSR hydration mismatch — renders a placeholder until mounted
- Styled as an icon button matching the existing notification bell button in Header

**Placed in:**
- `src/components/layout/Header.tsx` — in the right-side action cluster, left of the notification bell
- `src/app/client-portal/layout.tsx` header area (or its header component if one exists)

---

## Color Palette

### Dark Mode — `:root` (redesigned)

Replaces the current dark palette entirely.

**Shadcn/UI tokens (oklch):**

| Variable | Value | Role |
|---|---|---|
| `--background` | `oklch(0.09 0.010 65)` | Page background (`#141210`) |
| `--foreground` | `oklch(0.91 0.012 75)` | Primary text (`#eae5dc`) |
| `--card` | `oklch(0.12 0.010 65)` | Card background |
| `--card-foreground` | `oklch(0.91 0.012 75)` | Card text |
| `--popover` | `oklch(0.12 0.010 65)` | Popover/dropdown bg |
| `--popover-foreground` | `oklch(0.91 0.012 75)` | Popover text |
| `--primary` | `oklch(0.72 0.13 80)` | Soft gold accent (`#c9a84c`) |
| `--primary-foreground` | `oklch(0.09 0.010 65)` | Text on primary |
| `--secondary` | `oklch(0.16 0.010 65)` | Secondary surface |
| `--secondary-foreground` | `oklch(0.75 0.010 70)` | Secondary text |
| `--muted` | `oklch(0.16 0.010 65)` | Muted surface |
| `--muted-foreground` | `oklch(0.52 0.010 70)` | Muted text |
| `--accent` | `oklch(0.72 0.13 80)` | Accent (matches primary) |
| `--accent-foreground` | `oklch(0.09 0.010 65)` | Text on accent |
| `--destructive` | `oklch(0.63 0.22 25)` | Danger red (unchanged) |
| `--destructive-foreground` | `oklch(0.98 0 0)` | Text on destructive |
| `--border` | `oklch(0.19 0.010 65)` | Border |
| `--input` | `oklch(0.19 0.010 65)` | Input border |
| `--ring` | `oklch(0.72 0.13 80)` | Focus ring |
| `--sidebar` | `oklch(0.09 0.010 65)` | Sidebar background |
| `--sidebar-foreground` | `oklch(0.91 0.012 75)` | Sidebar text |
| `--sidebar-primary` | `oklch(0.72 0.13 80)` | Sidebar active |
| `--sidebar-primary-foreground` | `oklch(0.09 0.010 65)` | Sidebar active text |
| `--sidebar-accent` | `oklch(0.16 0.010 65)` | Sidebar hover |
| `--sidebar-accent-foreground` | `oklch(0.91 0.012 75)` | Sidebar hover text |
| `--sidebar-border` | `oklch(0.19 0.010 65)` | Sidebar border |
| `--sidebar-ring` | `oklch(0.72 0.13 80)` | Sidebar ring |

**LeadForce design tokens (hex/rgba):**

| Variable | Value | Role |
|---|---|---|
| `--bg-dark` | `#141210` | Body background |
| `--card-bg` | `rgba(24, 21, 16, 0.65)` | Glass panel fill |
| `--card-bg-solid` | `#18150f` | Solid card fill |
| `--panel-border` | `rgba(220, 200, 150, 0.08)` | Default border |
| `--panel-border-hover` | `rgba(220, 200, 150, 0.15)` | Hovered border |
| `--text-primary` | `#eae5dc` | Body text |
| `--text-secondary` | `#8a8070` | Secondary text |
| `--text-muted` | `#5e5648` | Muted/disabled text |
| `--text-disabled` | `#3e3830` | Disabled text |
| `--lf-accent` | `#c9a84c` | Soft gold (replaces `#f5a623`) |
| `--accent-muted` | `rgba(201, 168, 76, 0.10)` | Accent wash |
| `--panel-shadow` | `0 0 15px rgba(201, 168, 76, 0.25)` | Panel glow (dark) / drop shadow (light) |
| `--lf-success` | `#8fce7d` | Success (unchanged) |
| `--lf-warning` | `#c9a84c` | Warning (matches accent) |
| `--lf-danger` | `#ef4444` | Danger (unchanged) |
| `--lf-attention` | `#c97a50` | Attention (slightly muted) |
| `--lf-info` | `#7aaedb` | Info (unchanged) |

**`@theme inline` updates:**

| Variable | New Value |
|---|---|
| `--color-dark` | `#141210` |
| `--color-card-bg` | `rgba(24, 21, 16, 0.65)` |
| `--color-card-solid` | `#18150f` |
| `--color-accent` | `#c9a84c` |

---

### Light Mode — `.light` class on `<html>`

Defined as a `html.light { }` block in `globals.css` that overrides all CSS variables.

**Shadcn/UI tokens (oklch):**

| Variable | Value | Role |
|---|---|---|
| `--background` | `oklch(0.97 0.010 75)` | Warm cream (`#f7f4ef`) |
| `--foreground` | `oklch(0.13 0.015 65)` | Deep warm brown (`#1c1812`) |
| `--card` | `oklch(0.99 0.008 80)` | Warm white card |
| `--card-foreground` | `oklch(0.13 0.015 65)` | Card text |
| `--popover` | `oklch(0.99 0.008 80)` | Dropdown bg |
| `--popover-foreground` | `oklch(0.13 0.015 65)` | Dropdown text |
| `--primary` | `oklch(0.65 0.13 80)` | Soft gold (slightly deeper for contrast on light) |
| `--primary-foreground` | `oklch(0.99 0.008 80)` | Text on primary |
| `--secondary` | `oklch(0.93 0.010 75)` | Light secondary surface |
| `--secondary-foreground` | `oklch(0.35 0.012 65)` | Secondary text |
| `--muted` | `oklch(0.93 0.010 75)` | Muted surface |
| `--muted-foreground` | `oklch(0.45 0.012 65)` | Muted text |
| `--accent` | `oklch(0.65 0.13 80)` | Accent (matches primary) |
| `--accent-foreground` | `oklch(0.99 0.008 80)` | Text on accent |
| `--destructive` | `oklch(0.55 0.22 25)` | Danger (slightly deeper for light bg) |
| `--destructive-foreground` | `oklch(0.98 0 0)` | Text on destructive |
| `--border` | `oklch(0.87 0.010 70)` | Warm light border |
| `--input` | `oklch(0.87 0.010 70)` | Input border |
| `--ring` | `oklch(0.65 0.13 80)` | Focus ring |
| `--sidebar` | `oklch(0.95 0.010 75)` | Sidebar (slightly off-cream) |
| `--sidebar-foreground` | `oklch(0.13 0.015 65)` | Sidebar text |
| `--sidebar-primary` | `oklch(0.65 0.13 80)` | Sidebar active |
| `--sidebar-primary-foreground` | `oklch(0.99 0.008 80)` | Sidebar active text |
| `--sidebar-accent` | `oklch(0.91 0.010 75)` | Sidebar hover |
| `--sidebar-accent-foreground` | `oklch(0.13 0.015 65)` | Sidebar hover text |
| `--sidebar-border` | `oklch(0.87 0.010 70)` | Sidebar border |
| `--sidebar-ring` | `oklch(0.65 0.13 80)` | Sidebar ring |

**LeadForce design tokens:**

| Variable | Value | Role |
|---|---|---|
| `--bg-dark` | `#f7f4ef` | Body background (cream) |
| `--card-bg` | `rgba(255, 252, 246, 0.85)` | Glass panel fill |
| `--card-bg-solid` | `#fffcf6` | Solid card fill |
| `--panel-border` | `rgba(100, 80, 40, 0.10)` | Subtle warm border |
| `--panel-border-hover` | `rgba(100, 80, 40, 0.20)` | Hovered border |
| `--text-primary` | `#1c1812` | Body text |
| `--text-secondary` | `#6b6255` | Secondary text |
| `--text-muted` | `#9e9080` | Muted text |
| `--text-disabled` | `#bdb4a5` | Disabled text |
| `--lf-accent` | `#a8882e` | Soft gold (deeper for light bg contrast) |
| `--accent-muted` | `rgba(168, 136, 46, 0.10)` | Accent wash |
| `--panel-shadow` | `0 2px 12px rgba(100, 80, 40, 0.12)` | Subtle drop shadow instead of glow |
| `--lf-success` | `#3d9b2a` | Success (deeper for light bg) |
| `--lf-warning` | `#a8882e` | Warning (matches accent) |
| `--lf-danger` | `#dc2626` | Danger |
| `--lf-attention` | `#b05a30` | Attention |
| `--lf-info` | `#2a6fa8` | Info (deeper for light bg) |

---

## Glass Panel

`glass-panel` utility in `globals.css` is updated to use CSS variables so it renders correctly in both modes:

```css
.glass-panel {
  background: var(--card-bg);
  backdrop-filter: blur(12px);
  border: 1px solid var(--panel-border);
  box-shadow: var(--panel-shadow); /* glow in dark, drop shadow in light */
}
```

In dark mode this produces the existing frosted-glass-over-void effect. In light mode the cream fill + warm border + subtle drop shadow gives a floating card feel consistent with the light aesthetic.

---

## Component Audit — Hardcoded Class Replacement

A sweep of all components replaces dark-specific hardcoded Tailwind classes with CSS-variable-based equivalents. Key patterns:

| Hardcoded class | Replace with |
|---|---|
| `bg-dark` | `bg-[var(--bg-dark)]` |
| `border-white/5`, `border-white/10` | `border-[var(--panel-border)]` |
| `bg-white/5` (hover state) | `hover:bg-[var(--panel-border-hover)]` |
| `text-gray-400`, `text-gray-500` | `text-[var(--text-secondary)]` or `text-[var(--text-muted)]` |
| `text-white` (body text, not brand) | `text-[var(--text-primary)]` |
| `bg-white/5` (surface) | `bg-[var(--card-bg)]` |

Shadcn/UI primitives (Button, Input, Select, etc.) already reference `--background`, `--foreground`, `--border` etc. — these update automatically with no component changes needed.

The audit covers: `Header.tsx`, `Sidebar.tsx`, `PageShell.tsx`, and all components under `dialer/`, `contacts/`, `pipeline/`, `dashboard/`, `reports/`, `shared/`, `schedule/`, `scripts/`, and the client portal layout and components.

---

## ThemeToggle Component

**File:** `src/components/shared/ThemeToggle.tsx`

```tsx
"use client"
// Renders Sun (dark mode) or Moon (light mode)
// Mounted guard prevents SSR hydration mismatch
```

- Uses `useTheme()` from `next-themes`
- Renders `null` until mounted (avoids hydration mismatch)
- `Sun` icon shown when in dark mode (click → light)
- `Moon` icon shown when in light mode (click → dark)
- Styled to match the existing `Bell` notification button in Header: `w-9 h-9 rounded-xl flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--panel-border-hover)] transition-colors duration-200`

---

## Transitions

A CSS transition is added to `body` for smooth theme swaps:

```css
body {
  transition: background-color 200ms ease, color 200ms ease;
}
```

Panels and cards get `transition-colors duration-200` via Tailwind where needed.

---

## Files Created / Modified

| File | Change |
|---|---|
| `src/app/globals.css` | Replace `:root` dark tokens, add `.light {}` block, update `glass-panel`, add body transition |
| `src/app/layout.tsx` | Add `ThemeProvider` wrapper |
| `src/app/client-portal/layout.tsx` | Add `ThemeProvider` wrapper |
| `src/components/shared/ThemeToggle.tsx` | New component |
| `src/components/layout/Header.tsx` | Add `ThemeToggle` to action cluster |
| `src/components/layout/Sidebar.tsx` | Hardcoded class audit |
| All components under `dialer/`, `contacts/`, `pipeline/`, `dashboard/`, `reports/`, `shared/`, `schedule/`, `scripts/` | Hardcoded class audit |
| Client portal components | Hardcoded class audit + `ThemeToggle` placement |

---

## Out of Scope

- Per-user theme persistence in the database (localStorage is sufficient)
- Custom accent color picker
- High-contrast accessibility mode
- Any changes to keyframe animations or chart colors (those remain as-is for now)
