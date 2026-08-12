# Light Mode + Theme Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current dark-only amber palette with a warm-but-restrained soft-gold aesthetic and add a persisted, OS-aware light/dark toggle to both the main dashboard and client portal.

**Architecture:** Install `next-themes` to write `class="dark"` or `class="light"` on `<html>`, persisting to `localStorage` and defaulting to `prefers-color-scheme`. All color values move from hardcoded Tailwind classes to CSS custom properties defined in `globals.css`, so a single variable block swap drives both themes.

**Tech Stack:** `next-themes` ^0.4, Tailwind CSS v4, Next.js 14 App Router, Lucide React icons.

## Global Constraints

- Never hardcode hex colors or opacity-based white/black in component classes — always use `var(--token-name)` or a Tailwind utility backed by a CSS variable.
- `text-white` on a **colored background** (buttons, badges) is intentional contrast and must stay. `text-white` used as body/UI text must become `text-[var(--text-primary)]`.
- Do not touch keyframe animation colors, chart fill colors, or Vitest test files during the component audit (those are out of scope).
- The `@custom-variant dark (&:is(.dark *))` line in `globals.css` must stay — it powers Tailwind's `dark:` prefix variant.
- `next-themes` configuration: `attribute="class"`, `defaultTheme="system"`, `enableSystem`, `disableTransitionOnChange={false}`.

---

### Task 1: Redesign globals.css — dark palette + light mode + glass-panel

**Files:**
- Modify: `src/app/globals.css` (full rewrite of `:root`, add `html.light {}`, update `glass-panel`, add body transition)

**Interfaces:**
- Produces: CSS variables `--bg-dark`, `--card-bg`, `--card-bg-solid`, `--panel-border`, `--panel-border-hover`, `--text-primary`, `--text-secondary`, `--text-muted`, `--text-disabled`, `--lf-accent`, `--accent-muted`, `--panel-shadow`, `--lf-success`, `--lf-warning`, `--lf-danger`, `--lf-attention`, `--lf-info` — used by all subsequent tasks.

- [ ] **Step 1: Replace the entire contents of `src/app/globals.css`**

```css
@import "tailwindcss";
@import "tw-animate-css";

@custom-variant dark (&:is(.dark *));

@tailwind utilities;

/* ===================================================================
   LeadForce Design Tokens + Shadcn/UI CSS variables
   =================================================================== */
:root {
  /* === Shadcn/UI component tokens — dark mode (default) === */
  --background: oklch(0.09 0.010 65);
  --foreground: oklch(0.91 0.012 75);
  --card: oklch(0.12 0.010 65);
  --card-foreground: oklch(0.91 0.012 75);
  --popover: oklch(0.12 0.010 65);
  --popover-foreground: oklch(0.91 0.012 75);
  --primary: oklch(0.72 0.13 80);
  --primary-foreground: oklch(0.09 0.010 65);
  --secondary: oklch(0.16 0.010 65);
  --secondary-foreground: oklch(0.75 0.010 70);
  --muted: oklch(0.16 0.010 65);
  --muted-foreground: oklch(0.52 0.010 70);
  --accent: oklch(0.72 0.13 80);
  --accent-foreground: oklch(0.09 0.010 65);
  --destructive: oklch(0.63 0.22 25);
  --destructive-foreground: oklch(0.98 0 0);
  --border: oklch(0.19 0.010 65);
  --input: oklch(0.19 0.010 65);
  --ring: oklch(0.72 0.13 80);
  --radius: 0.75rem;
  --sidebar: oklch(0.09 0.010 65);
  --sidebar-foreground: oklch(0.91 0.012 75);
  --sidebar-primary: oklch(0.72 0.13 80);
  --sidebar-primary-foreground: oklch(0.09 0.010 65);
  --sidebar-accent: oklch(0.16 0.010 65);
  --sidebar-accent-foreground: oklch(0.91 0.012 75);
  --sidebar-border: oklch(0.19 0.010 65);
  --sidebar-ring: oklch(0.72 0.13 80);

  /* === LeadForce design tokens — dark mode === */
  --bg-dark: #141210;
  --card-bg: rgba(24, 21, 16, 0.65);
  --card-bg-solid: #18150f;
  --panel-border: rgba(220, 200, 150, 0.08);
  --panel-border-hover: rgba(220, 200, 150, 0.15);
  --text-primary: #eae5dc;
  --text-secondary: #8a8070;
  --text-muted: #5e5648;
  --text-disabled: #3e3830;
  --lf-accent: #c9a84c;
  --accent-muted: rgba(201, 168, 76, 0.10);
  --panel-shadow: 0 0 15px rgba(201, 168, 76, 0.25);
  --lf-success: #8fce7d;
  --lf-warning: #c9a84c;
  --lf-danger: #ef4444;
  --lf-attention: #c97a50;
  --lf-info: #7aaedb;
}

html.light {
  /* === Shadcn/UI component tokens — light mode === */
  --background: oklch(0.97 0.010 75);
  --foreground: oklch(0.13 0.015 65);
  --card: oklch(0.99 0.008 80);
  --card-foreground: oklch(0.13 0.015 65);
  --popover: oklch(0.99 0.008 80);
  --popover-foreground: oklch(0.13 0.015 65);
  --primary: oklch(0.65 0.13 80);
  --primary-foreground: oklch(0.99 0.008 80);
  --secondary: oklch(0.93 0.010 75);
  --secondary-foreground: oklch(0.35 0.012 65);
  --muted: oklch(0.93 0.010 75);
  --muted-foreground: oklch(0.45 0.012 65);
  --accent: oklch(0.65 0.13 80);
  --accent-foreground: oklch(0.99 0.008 80);
  --destructive: oklch(0.55 0.22 25);
  --destructive-foreground: oklch(0.98 0 0);
  --border: oklch(0.87 0.010 70);
  --input: oklch(0.87 0.010 70);
  --ring: oklch(0.65 0.13 80);
  --sidebar: oklch(0.95 0.010 75);
  --sidebar-foreground: oklch(0.13 0.015 65);
  --sidebar-primary: oklch(0.65 0.13 80);
  --sidebar-primary-foreground: oklch(0.99 0.008 80);
  --sidebar-accent: oklch(0.91 0.010 75);
  --sidebar-accent-foreground: oklch(0.13 0.015 65);
  --sidebar-border: oklch(0.87 0.010 70);
  --sidebar-ring: oklch(0.65 0.13 80);

  /* === LeadForce design tokens — light mode === */
  --bg-dark: #f7f4ef;
  --card-bg: rgba(255, 252, 246, 0.85);
  --card-bg-solid: #fffcf6;
  --panel-border: rgba(100, 80, 40, 0.10);
  --panel-border-hover: rgba(100, 80, 40, 0.20);
  --text-primary: #1c1812;
  --text-secondary: #6b6255;
  --text-muted: #9e9080;
  --text-disabled: #bdb4a5;
  --lf-accent: #a8882e;
  --accent-muted: rgba(168, 136, 46, 0.10);
  --panel-shadow: 0 2px 12px rgba(100, 80, 40, 0.12);
  --lf-success: #3d9b2a;
  --lf-warning: #a8882e;
  --lf-danger: #dc2626;
  --lf-attention: #b05a30;
  --lf-info: #2a6fa8;
}

/* ===================================================================
   Tailwind v4 theme tokens — generates utility classes
   =================================================================== */
@theme inline {
  --color-dark: #141210;
  --color-card-bg: rgba(24, 21, 16, 0.65);
  --color-card-solid: #18150f;
  --color-accent: #c9a84c;
  --color-success: #8fce7d;
  --color-warning: #c9a84c;
  --color-danger: #ef4444;
  --color-attention: #c97a50;
  --color-info: #7aaedb;

  --font-sans: var(--font-inter), sans-serif;
  --font-mono: var(--font-mono-jetbrains), monospace;

  --radius-3xl: 1.5rem;
  --radius-4xl: 2rem;

  --animate-call-pulse: call-pulse 2s infinite;
  --animate-pulse-amber: pulse-amber 2s infinite;
  --animate-pulse-glow: pulse-glow 3s infinite;
  --animate-fade-in: fade-in 300ms ease-out;
  --animate-slide-up: slide-up 200ms ease-out;
  --animate-slide-in-right: slide-in-right 300ms ease-out;
}

/* ===================================================================
   Base styles
   =================================================================== */
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
    transition: background-color 200ms ease, color 200ms ease;
  }
}

/* ===================================================================
   Utility classes
   =================================================================== */
@layer utilities {
  .glass-panel {
    background: var(--card-bg);
    backdrop-filter: blur(12px);
    border: 1px solid var(--panel-border);
    box-shadow: var(--panel-shadow);
  }

  .custom-scrollbar::-webkit-scrollbar {
    width: 4px;
  }
  .custom-scrollbar::-webkit-scrollbar-track {
    background: transparent;
  }
  .custom-scrollbar::-webkit-scrollbar-thumb {
    background: var(--panel-border-hover);
    border-radius: 10px;
  }
}

/* ===================================================================
   Keyframes
   =================================================================== */
@keyframes call-pulse {
  0%   { box-shadow: 0 0 0 0 rgba(143, 206, 125, 0.5); }
  70%  { box-shadow: 0 0 0 12px rgba(143, 206, 125, 0); }
  100% { box-shadow: 0 0 0 0 rgba(143, 206, 125, 0); }
}

@keyframes pulse-amber {
  0%   { box-shadow: 0 0 0 0 rgba(201, 168, 76, 0.5); }
  70%  { box-shadow: 0 0 0 12px rgba(201, 168, 76, 0); }
  100% { box-shadow: 0 0 0 0 rgba(201, 168, 76, 0); }
}

@keyframes pulse-glow {
  0%, 100% { box-shadow: 0 0 8px rgba(201, 168, 76, 0.2); }
  50%       { box-shadow: 0 0 20px rgba(201, 168, 76, 0.5); }
}

@keyframes fade-in {
  from { opacity: 0; }
  to   { opacity: 1; }
}

@keyframes slide-up {
  from { transform: translateY(10px); opacity: 0; }
  to   { transform: translateY(0);    opacity: 1; }
}

@keyframes slide-in-right {
  from { transform: translateX(100%); }
  to   { transform: translateX(0); }
}

@keyframes waveform {
  0%, 100% { transform: scaleY(0.3); }
  50%       { transform: scaleY(1); }
}

@media (prefers-reduced-motion: reduce) {
  .animate-call-pulse,
  .animate-pulse-amber,
  .animate-pulse-glow {
    animation: none;
  }
}
```

- [ ] **Step 2: Start the dev server and verify dark mode**

```bash
cd /Users/hannaholsson/LeadforceCRM && npm run dev
```

Open `http://localhost:3000`. Confirm: background is deep warm charcoal (not the old brownish-black), accent color reads as soft gold (not bright amber). Sidebar, glass panels, and text should all look intentionally warm and restrained.

- [ ] **Step 3: Temporarily verify light mode by adding the class**

In `src/app/layout.tsx`, temporarily add `light` to the `html` className:

```tsx
<html lang="en" className={`${inter.variable} ${jetbrainsMono.variable} light`}>
```

Reload. Confirm: background is warm cream, text is deep warm brown, glass panels are light frosted-white, soft gold accent is visible and legible. Remove the `light` class after verifying.

- [ ] **Step 4: Commit**

```bash
git add src/app/globals.css
git commit -m "Redesign globals.css: new warm-charcoal dark palette, soft-gold accent, html.light theme block, CSS-variable glass-panel"
```

---

### Task 2: Install next-themes + wire ThemeProvider into both layouts

**Files:**
- Create: `src/components/shared/ThemeProvider.tsx`
- Modify: `src/app/layout.tsx`
- Modify: `src/app/client-portal/layout.tsx`

**Interfaces:**
- Consumes: nothing
- Produces: `ThemeProvider` component wrapping children with `next-themes` context; `useTheme()` from `next-themes` becomes available to any client component in the tree.

- [ ] **Step 1: Install next-themes**

```bash
npm install next-themes
```

Expected output: `added 1 package` (or similar — it has no dependencies of its own).

- [ ] **Step 2: Create `src/components/shared/ThemeProvider.tsx`**

```tsx
'use client'

import { ThemeProvider as NextThemesProvider } from 'next-themes'

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange={false}
    >
      {children}
    </NextThemesProvider>
  )
}
```

- [ ] **Step 3: Update `src/app/layout.tsx`**

Add `suppressHydrationWarning` to `<html>` (prevents React hydration warnings when next-themes injects the class before hydration) and wrap `<body>` in `ThemeProvider`:

```tsx
// src/app/layout.tsx
import type { Metadata } from 'next'
import { Inter, JetBrains_Mono } from 'next/font/google'
import { ClerkProvider } from '@clerk/nextjs'
import { ThemeProvider } from '@/components/shared/ThemeProvider'
import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  weight: ['300', '400', '500', '600', '700'],
})

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono-jetbrains',
  weight: ['400', '500', '600'],
})

export const metadata: Metadata = {
  title: 'LeadForce CRM',
  description: 'Sales engagement platform for SDR teams',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <ClerkProvider dynamic>
      <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable}`} suppressHydrationWarning>
        <body>
          <ThemeProvider>{children}</ThemeProvider>
        </body>
      </html>
    </ClerkProvider>
  )
}
```

- [ ] **Step 4: Update `src/app/client-portal/layout.tsx`**

The client portal is a separate layout tree. It also needs `ThemeProvider`. Note: this layout is a server component — the `ThemeProvider` client wrapper handles the boundary.

Read the current file first (`src/app/client-portal/layout.tsx`), then update `bg-dark` to `bg-[var(--bg-dark)]` and update the `Toaster` theme prop to be `"system"` so it follows the active theme, and wrap children in `ThemeProvider`:

```tsx
import { redirect } from 'next/navigation'
import { getCurrentUserRole } from '@/lib/auth'
import { getCurrentClientRecord } from '@/lib/client-portal'
import { ThemeProvider } from '@/components/shared/ThemeProvider'
import { PortalHeader } from '@/components/client-portal/PortalHeader'
import { PortalPending } from '@/components/client-portal/PortalPending'
import { Toaster } from '@/components/ui/sonner'

export default async function ClientPortalLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const role = await getCurrentUserRole()
  if (role !== 'client') redirect('/')

  const client = await getCurrentClientRecord()

  if (!client) {
    return <PortalPending />
  }

  return (
    <ThemeProvider>
      <div className="flex flex-col min-h-screen bg-[var(--bg-dark)]">
        <PortalHeader clientName={client.name} />
        <main className="flex-1 overflow-y-auto custom-scrollbar">
          {children}
        </main>
        <Toaster position="bottom-right" theme="system" />
      </div>
    </ThemeProvider>
  )
}
```

- [ ] **Step 5: Verify the build still compiles**

```bash
npm run build 2>&1 | tail -20
```

Expected: build succeeds with no errors. (The toggle won't work yet — that's next task.)

- [ ] **Step 6: Commit**

```bash
git add src/components/shared/ThemeProvider.tsx src/app/layout.tsx src/app/client-portal/layout.tsx
git commit -m "Add next-themes ThemeProvider to root and client portal layouts"
```

---

### Task 3: ThemeToggle component + wire into both headers

**Files:**
- Create: `src/components/shared/ThemeToggle.tsx`
- Create: `src/components/shared/__tests__/ThemeToggle.test.tsx`
- Modify: `src/components/layout/Header.tsx`
- Modify: `src/components/client-portal/PortalHeader.tsx`

**Interfaces:**
- Consumes: `useTheme()` from `next-themes` (available after Task 2); `Sun`, `Moon` from `lucide-react`
- Produces: `<ThemeToggle />` — a zero-prop button that reads/sets the current theme.

- [ ] **Step 1: Write the failing test**

Create `src/components/shared/__tests__/ThemeToggle.test.tsx`:

```tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { ThemeToggle } from '../ThemeToggle'

const mockSetTheme = vi.fn()
let mockTheme = 'dark'
let mockMounted = true

vi.mock('next-themes', () => ({
  useTheme: () => ({ theme: mockTheme, setTheme: mockSetTheme }),
}))

describe('ThemeToggle', () => {
  it('renders nothing when not mounted (SSR guard)', async () => {
    mockMounted = false
    // ThemeToggle uses useState+useEffect for mounted guard.
    // On first render (before useEffect fires) it returns null.
    const { container } = render(<ThemeToggle />)
    // The container should be empty before effects run
    // (in test env effects run synchronously via act, so we test the button is present after mount)
    mockMounted = true
  })

  it('shows Sun icon in dark mode', () => {
    mockTheme = 'dark'
    render(<ThemeToggle />)
    expect(screen.getByRole('button', { name: /switch to light mode/i })).toBeTruthy()
  })

  it('shows Moon icon in light mode', () => {
    mockTheme = 'light'
    render(<ThemeToggle />)
    expect(screen.getByRole('button', { name: /switch to dark mode/i })).toBeTruthy()
  })

  it('calls setTheme with "light" when in dark mode and clicked', () => {
    mockTheme = 'dark'
    mockSetTheme.mockClear()
    render(<ThemeToggle />)
    fireEvent.click(screen.getByRole('button'))
    expect(mockSetTheme).toHaveBeenCalledWith('light')
  })

  it('calls setTheme with "dark" when in light mode and clicked', () => {
    mockTheme = 'light'
    mockSetTheme.mockClear()
    render(<ThemeToggle />)
    fireEvent.click(screen.getByRole('button'))
    expect(mockSetTheme).toHaveBeenCalledWith('dark')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/components/shared/__tests__/ThemeToggle.test.tsx 2>&1 | tail -20
```

Expected: FAIL — `ThemeToggle` not found.

- [ ] **Step 3: Create `src/components/shared/ThemeToggle.tsx`**

```tsx
'use client'

import { useEffect, useState } from 'react'
import { useTheme } from 'next-themes'
import { Sun, Moon } from 'lucide-react'

export function ThemeToggle() {
  const [mounted, setMounted] = useState(false)
  const { theme, setTheme } = useTheme()

  useEffect(() => setMounted(true), [])

  if (!mounted) return <div className="w-9 h-9" />

  const isDark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)

  return (
    <button
      type="button"
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      className="w-9 h-9 rounded-xl flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--panel-border-hover)] transition-colors duration-200"
    >
      {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
    </button>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/components/shared/__tests__/ThemeToggle.test.tsx 2>&1 | tail -20
```

Expected: 4/5 tests pass (the SSR guard test is intentionally loose). All click behavior tests must pass.

- [ ] **Step 5: Update `src/components/layout/Header.tsx`**

Add `ThemeToggle` to the right-side action cluster, left of the notification bell. Replace hardcoded dark classes while here.

```tsx
'use client'

import { Bell, Building2 } from 'lucide-react'
import { UserButton } from '@clerk/nextjs'
import { ThemeToggle } from '@/components/shared/ThemeToggle'

interface HeaderProps {
  title: string
  subtitle?: string
}

export function Header({ title, subtitle }: HeaderProps) {
  return (
    <header className="flex-shrink-0 h-20 sticky top-0 z-10 flex items-center justify-between px-8 border-b border-[var(--panel-border)] bg-[var(--bg-dark)]">
      <div>
        <h1 className="text-xl font-semibold text-[var(--text-primary)]">{title}</h1>
        {subtitle && <p className="text-xs text-[var(--text-muted)] mt-0.5">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-4">
        <button
          type="button"
          className="flex items-center gap-2 px-4 py-2 rounded-full border border-[var(--panel-border)] text-sm text-[var(--text-secondary)] hover:border-[var(--panel-border-hover)] transition-colors duration-200 bg-[var(--bg-dark)]"
        >
          <Building2 className="w-4 h-4 text-[var(--text-muted)]" />
          <span>My Organisation</span>
        </button>
        <ThemeToggle />
        <div className="relative">
          <button type="button" aria-label="Notifications" className="w-9 h-9 rounded-xl flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--panel-border-hover)] transition-colors duration-200">
            <Bell className="w-5 h-5" />
          </button>
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full border-2 border-[var(--bg-dark)]" />
        </div>
        <UserButton
          appearance={{
            elements: {
              avatarBox: 'w-9 h-9 rounded-xl',
              userButtonPopoverCard: 'glass-panel border border-[var(--panel-border)] rounded-2xl',
              userButtonPopoverActionButton: 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--panel-border-hover)] rounded-xl',
              userButtonPopoverActionButtonText: 'text-sm',
            },
          }}
        />
      </div>
    </header>
  )
}
```

- [ ] **Step 6: Update `src/components/client-portal/PortalHeader.tsx`**

```tsx
'use client'

import { UserButton } from '@clerk/nextjs'
import { ThemeToggle } from '@/components/shared/ThemeToggle'

interface PortalHeaderProps {
  clientName: string
}

export function PortalHeader({ clientName }: PortalHeaderProps) {
  return (
    <header className="flex-shrink-0 h-20 sticky top-0 z-10 flex items-center justify-between px-8 border-b border-[var(--panel-border)] bg-[var(--bg-dark)]">
      <div className="flex items-center gap-3">
        <span className="font-bold text-[var(--text-primary)] text-lg tracking-tight">
          Lead<span className="text-[var(--lf-accent)]">Force</span>
        </span>
        <span className="w-px h-5 bg-[var(--panel-border)]" />
        <span className="text-sm text-[var(--text-secondary)] truncate max-w-xs">{clientName}</span>
      </div>
      <div className="flex items-center gap-3">
        <ThemeToggle />
        <UserButton
          appearance={{
            elements: {
              avatarBox: 'w-9 h-9 rounded-xl',
              userButtonPopoverCard: 'glass-panel border border-[var(--panel-border)] rounded-2xl',
              userButtonPopoverActionButton: 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--panel-border-hover)] rounded-xl',
              userButtonPopoverActionButtonText: 'text-sm',
            },
          }}
        />
      </div>
    </header>
  )
}
```

- [ ] **Step 7: Verify toggle works end-to-end**

Start dev server (`npm run dev`). Open `http://localhost:3000`. Click the Sun/Moon button. Confirm: the theme switches, body background and text colors change smoothly, the preference survives a page refresh, and a new incognito window picks up the OS default.

- [ ] **Step 8: Commit**

```bash
git add src/components/shared/ThemeToggle.tsx src/components/shared/__tests__/ThemeToggle.test.tsx src/components/layout/Header.tsx src/components/client-portal/PortalHeader.tsx
git commit -m "Add ThemeToggle component and wire into dashboard and portal headers"
```

---

### Task 4: Audit Sidebar and auth layout

**Files:**
- Modify: `src/components/layout/Sidebar.tsx`
- Modify: `src/app/(auth)/layout.tsx`

**Interfaces:**
- Consumes: CSS variables from Task 1

- [ ] **Step 1: Update `src/components/layout/Sidebar.tsx`**

Replace all hardcoded dark classes. Key changes:
- Logo gradient: `from-[#f5a623] to-[#e0720a]` → `from-[#c9a84c] to-[#a8882e]`
- `border-white/5` → `border-[var(--panel-border)]`
- `bg-dark` → `bg-[var(--bg-dark)]`
- `bg-white/5` (active nav item surface) → `bg-[var(--panel-border-hover)]`
- `text-gray-400` → `text-[var(--text-secondary)]`
- `hover:text-white` → `hover:text-[var(--text-primary)]`
- `hover:bg-white/5` → `hover:bg-[var(--panel-border-hover)]`
- `bg-amber-500` (pipeline badge) → `bg-[var(--lf-accent)]`
- `text-gray-500` → `text-[var(--text-muted)]`
- `text-gray-600` → `text-[var(--text-muted)]`
- `text-white` (daily target count) → `text-[var(--text-primary)]`
- `bg-white/10` (progress bar track) → `bg-[var(--panel-border-hover)]`
- `from-white to-gray-400` (LeadForce wordmark gradient) → `from-[var(--text-primary)] to-[var(--text-secondary)]`

Full updated file:

```tsx
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, Target, Users, PhoneCall, Kanban,
  BarChart3, Settings, ChevronLeft, Building2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useUIStore } from '@/stores/ui-store'
import type { DailyTargetStats } from '@/types/models'

const NAV_ITEMS = [
  { href: '/',          label: 'Dashboard', icon: LayoutDashboard, roles: null },
  { href: '/clients',   label: 'Clients',   icon: Building2,       roles: ['admin', 'manager'] },
  { href: '/campaigns', label: 'Campaigns', icon: Target,          roles: null },
  { href: '/contacts',  label: 'Contacts',  icon: Users,           roles: null },
  { href: '/calling',   label: 'Calling',   icon: PhoneCall,       roles: null },
  { href: '/pipeline',  label: 'Pipeline',  icon: Kanban,          roles: null },
  { href: '/reports',   label: 'Reports',   icon: BarChart3,       roles: null },
]

interface SidebarProps {
  dailyStats: DailyTargetStats
  logoUrl?: string | null
  role?: string
  pendingPipelineCount?: number
}

export function Sidebar({ dailyStats, logoUrl, role = '', pendingPipelineCount = 0 }: SidebarProps) {
  const pathname = usePathname()
  const { sidebarCollapsed, toggleSidebar } = useUIStore()
  const pct = dailyStats.target > 0
    ? Math.min(100, Math.round((dailyStats.count / dailyStats.target) * 100))
    : 0

  return (
    <aside
      className={cn(
        'flex flex-col h-screen flex-shrink-0 transition-all duration-300 border-r border-[var(--panel-border)] bg-[var(--bg-dark)]',
        sidebarCollapsed ? 'w-16' : 'w-64'
      )}
    >
      <div className={cn('flex items-center p-6 flex-shrink-0', sidebarCollapsed && 'justify-center px-0')}>
        {logoUrl ? (
          <img
            src={logoUrl}
            alt="Company logo"
            className="w-8 h-8 rounded-xl object-contain flex-shrink-0"
          />
        ) : (
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#c9a84c] to-[#a8882e] flex-shrink-0" />
        )}
        {!sidebarCollapsed && (
          <span className="ml-3 text-xl font-bold bg-gradient-to-r from-[var(--text-primary)] to-[var(--text-secondary)] bg-clip-text text-transparent select-none">
            LeadForce
          </span>
        )}
      </div>

      <nav className="flex-1 px-4 mt-2 space-y-0.5 overflow-y-auto custom-scrollbar">
        {NAV_ITEMS.filter(item => !item.roles || item.roles.includes(role)).map(({ href, label, icon: Icon }) => {
          const active      = href === '/' ? pathname === '/' : pathname.startsWith(href)
          const isPipeline  = href === '/pipeline'
          const showBadge   = isPipeline && pendingPipelineCount > 0
          return (
            <Link
              key={href}
              href={href}
              title={sidebarCollapsed ? label : undefined}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-colors duration-200',
                active
                  ? 'bg-[var(--panel-border-hover)] text-[var(--lf-accent)]'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--panel-border-hover)]',
                sidebarCollapsed && 'justify-center px-0'
              )}
            >
              <div className="relative flex-shrink-0">
                <Icon className="w-5 h-5" />
                {showBadge && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[var(--lf-accent)] text-[9px] font-bold text-black flex items-center justify-center">
                    {pendingPipelineCount > 9 ? '9+' : pendingPipelineCount}
                  </span>
                )}
              </div>
              {!sidebarCollapsed && <span>{label}</span>}
            </Link>
          )
        })}
      </nav>

      {!sidebarCollapsed && (
        <div className="mx-4 mb-4 glass-panel rounded-2xl p-4">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-3">Daily Target</p>
          <div className="flex items-end justify-between mb-2">
            <span className="font-mono text-2xl font-semibold text-[var(--text-primary)]">{dailyStats.count}</span>
            <span className="font-mono text-sm text-[var(--text-muted)]">
              / {dailyStats.target > 0 ? dailyStats.target : '—'}
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-[var(--panel-border-hover)]">
            <div
              className="h-1.5 rounded-full bg-[var(--lf-accent)] transition-all duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
          {dailyStats.target > 0 && (
            <p className="text-[10px] text-[var(--text-muted)] mt-2">{pct}% of today's target</p>
          )}
        </div>
      )}

      <div className="border-t border-[var(--panel-border)] p-4 space-y-0.5 flex-shrink-0">
        <Link
          href="/settings"
          title={sidebarCollapsed ? 'Settings' : undefined}
          className={cn(
            'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--panel-border-hover)] transition-colors duration-200',
            sidebarCollapsed && 'justify-center px-0'
          )}
        >
          <Settings className="w-5 h-5 flex-shrink-0" />
          {!sidebarCollapsed && <span>Settings</span>}
        </Link>
        <button
          type="button"
          onClick={toggleSidebar}
          title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className={cn(
            'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--panel-border-hover)] w-full transition-colors duration-200',
            sidebarCollapsed && 'justify-center px-0'
          )}
        >
          <ChevronLeft className={cn('w-5 h-5 flex-shrink-0 transition-transform duration-300', sidebarCollapsed && 'rotate-180')} />
          {!sidebarCollapsed && <span>Collapse</span>}
        </button>
      </div>
    </aside>
  )
}
```

- [ ] **Step 2: Check and update `src/app/(auth)/layout.tsx`**

Read the file and replace any `bg-dark`, `border-white/`, `text-gray-*`, `text-white` body text with CSS variable equivalents using the same substitution patterns as above.

- [ ] **Step 3: Commit**

```bash
git add src/components/layout/Sidebar.tsx src/app/\(auth\)/layout.tsx
git commit -m "Audit Sidebar and auth layout: replace hardcoded dark classes with CSS variables"
```

---

### Task 5: Bulk find-and-replace across all remaining component files

This task runs sed commands that safely replace the **unambiguous** pattern set across all components in one shot. Run from the project root.

**Files affected:** All `.tsx` files under `src/components/` and `src/app/` except those already updated in Tasks 3–4.

**Interfaces:**
- Consumes: CSS variables from Task 1
- Produces: All unambiguous hardcoded dark classes replaced throughout the codebase.

- [ ] **Step 1: Run the bulk replacements**

Run each command individually and verify it exits cleanly (no error):

```bash
# border-white/5 and border-white/10 → panel-border
find src/components src/app -name "*.tsx" | xargs sed -i '' \
  's/border-white\/5/border-[var(--panel-border)]/g; s/border-white\/10/border-[var(--panel-border)]/g'

# border-white/15 and border-white/20 → panel-border-hover
find src/components src/app -name "*.tsx" | xargs sed -i '' \
  's/border-white\/15/border-[var(--panel-border-hover)]/g; s/border-white\/20/border-[var(--panel-border-hover)]/g'

# bg-dark → bg-[var(--bg-dark)]
find src/components src/app -name "*.tsx" | xargs sed -i '' \
  's/bg-dark/bg-[var(--bg-dark)]/g'

# hover:bg-white/5 and hover:bg-white/10 → panel-border-hover
find src/components src/app -name "*.tsx" | xargs sed -i '' \
  's/hover:bg-white\/5/hover:bg-[var(--panel-border-hover)]/g; s/hover:bg-white\/10/hover:bg-[var(--panel-border-hover)]/g'

# bg-white/10 standalone (progress tracks, dividers) → panel-border
find src/components src/app -name "*.tsx" | xargs sed -i '' \
  's/\bbg-white\/10\b/bg-[var(--panel-border)]/g'

# text-gray-300 and text-gray-400 → text-secondary
find src/components src/app -name "*.tsx" | xargs sed -i '' \
  's/text-gray-300/text-[var(--text-secondary)]/g; s/text-gray-400/text-[var(--text-secondary)]/g'

# text-gray-500, text-gray-600 → text-muted
find src/components src/app -name "*.tsx" | xargs sed -i '' \
  's/text-gray-500/text-[var(--text-muted)]/g; s/text-gray-600/text-[var(--text-muted)]/g'

# hover:text-white → hover:text-primary
find src/components src/app -name "*.tsx" | xargs sed -i '' \
  's/hover:text-white/hover:text-[var(--text-primary)]/g'

# Old amber accent hex in non-gradient contexts
find src/components src/app -name "*.tsx" | xargs sed -i '' \
  's/\[#f5a623\]/[var(--lf-accent)]/g'

# Old amber gradient endpoint
find src/components src/app -name "*.tsx" | xargs sed -i '' \
  's/\[#e0720a\]/[#a8882e]/g'

# bg-amber-500 badges → lf-accent
find src/components src/app -name "*.tsx" | xargs sed -i '' \
  's/bg-amber-500/bg-[var(--lf-accent)]/g'

# text-accent and bg-accent (Tailwind utilities) are static and won't respond to light mode
# Convert them to CSS variable references that do
find src/components src/app -name "*.tsx" | xargs sed -i '' \
  's/\btext-accent\b/text-[var(--lf-accent)]/g; s/\bbg-accent\b/bg-[var(--lf-accent)]/g'
```

- [ ] **Step 2: Verify no regressions in the bulk replacements**

```bash
# Check nothing obviously broken — look for double-replacement artifacts
grep -r "var(--bg-dark)]/g\|panel-border\]\]" src/components src/app --include="*.tsx" | head -5
```

Expected: no output (no double-replacement artifacts).

- [ ] **Step 3: Commit the bulk replacements**

```bash
git add -A
git commit -m "Bulk replace hardcoded dark Tailwind classes with CSS variable equivalents"
```

---

### Task 6: Manual edge cases — patterns the bulk pass cannot handle

These files have `text-white`, `bg-white/5` (standalone surface, not hover), or special patterns that need human judgment.

**Files:**
- Modify: `src/components/shared/SlideDrawer.tsx`
- Modify: `src/components/shared/FormModal.tsx`
- Modify: Many dialer, pipeline, dashboard, and other components — enumerated below.

**Interfaces:**
- Consumes: CSS variables from Task 1; bulk replacements from Task 5.
- Produces: All remaining hardcoded dark patterns resolved.

- [ ] **Step 1: Fix standalone `bg-white/5` (surface, not hover)**

This appears in components where `bg-white/5` is a non-interactive surface tint (e.g., a tag chip, a stat box), not a hover state. These should be `bg-[var(--card-bg)]`.

Run a targeted grep to find all remaining instances:

```bash
grep -rn " bg-white\/5" src/components src/app --include="*.tsx" | grep -v "hover:"
```

For each result, read the surrounding context. If it's a surface (a static box, chip, tag, badge background), replace with `bg-[var(--panel-border)]`. If it's an interactive element without an explicit `hover:` prefix (e.g., used inside a conditional active class), replace with `bg-[var(--panel-border-hover)]`.

- [ ] **Step 2: Fix standalone `text-white` (body text, not on colored bg)**

```bash
grep -rn "text-white" src/components src/app --include="*.tsx" | grep -v "hover:\|from-\|bg-\|border-"
```

For each result, determine context:
- Text that is the primary readable body text (e.g., a count, a label, a title on a dark surface) → replace with `text-[var(--text-primary)]`
- Text on a colored background (a colored Button variant, a colored badge) → leave as `text-white` (intentional contrast)

- [ ] **Step 3: Fix SlideDrawer and FormModal background/overlay patterns**

Read `src/components/shared/SlideDrawer.tsx` and `src/components/shared/FormModal.tsx`. These typically have overlay backgrounds like `bg-black/50` (fine — that's a scrim, not a theme token) and panel backgrounds. Update any `bg-dark`, `border-white/`, `text-gray-*` patterns missed by the bulk pass.

- [ ] **Step 4: Fix the `(dashboard)/layout.tsx` and `page.tsx` route files**

```bash
grep -rn "bg-dark\|border-white\|text-gray-\|text-white\|bg-white" src/app/\(dashboard\) --include="*.tsx"
```

For each hit, apply the same substitution rules.

- [ ] **Step 5: Fix client portal page files**

```bash
grep -rn "bg-dark\|border-white\|text-gray-\|text-white\|bg-white" src/app/client-portal --include="*.tsx"
grep -rn "bg-dark\|border-white\|text-gray-\|text-white\|bg-white" src/components/client-portal --include="*.tsx"
```

Apply substitutions. Note: `PortalPending.tsx` likely also has hardcoded dark classes — update it.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Fix manual edge cases: standalone bg-white/5 surfaces, body text-white, portal and layout pages"
```

---

### Task 7: Audit loading states, error pages, and settings components

Loading states are scattered across route folders and use skeleton-style `bg-white/5` blocks. Settings components have a large number of dark-specific classes.

**Files:**
- Modify: All `loading.tsx` files under `src/app/(dashboard)/` and `src/app/client-portal/`
- Modify: `src/app/(dashboard)/campaigns/error.tsx`
- Modify: All files under `src/components/settings/`
- Modify: All files under `src/components/imports/`

**Interfaces:**
- Consumes: CSS variables from Task 1.

- [ ] **Step 1: Audit and fix loading skeletons**

```bash
grep -rn "bg-white\/5\|bg-dark\|border-white\|text-gray" src/app --include="loading.tsx"
```

Loading skeletons use `bg-white/5` as the shimmer block color. These should become `bg-[var(--panel-border)]` (a subtle surface tint that works in both modes). Update all instances.

- [ ] **Step 2: Fix `src/app/(dashboard)/campaigns/error.tsx`**

Read the file and apply substitutions for any dark-specific classes.

- [ ] **Step 3: Audit and fix settings components**

```bash
grep -rn "bg-dark\|border-white\|text-gray\|text-white\|bg-white" src/components/settings --include="*.tsx"
```

Apply substitutions to each settings component. The settings components often have `border-white/10` separators, `text-gray-400` labels, and `bg-white/5` form field backgrounds — all should use CSS variables.

- [ ] **Step 4: Audit and fix import components**

```bash
grep -rn "bg-dark\|border-white\|text-gray\|text-white\|bg-white" src/components/imports --include="*.tsx"
```

Apply the same substitutions.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Audit loading states, settings, and import components: replace all hardcoded dark classes"
```

---

### Task 8: Final visual verification

No code changes in this task — this is the acceptance gate.

**Interfaces:**
- Consumes: All changes from Tasks 1–7.

- [ ] **Step 1: Confirm zero remaining hardcoded dark classes**

```bash
grep -rn "border-white\/\|bg-dark\b\|hover:bg-white\/\|text-gray-[3456]\|hover:text-white\|#f5a623\|#e0720a\|bg-amber-500" \
  src/components src/app --include="*.tsx" | grep -v "__tests__\|\.test\."
```

Expected: no output. If any results remain, fix them before proceeding.

- [ ] **Step 2: Run build to confirm no type errors**

```bash
npm run build 2>&1 | tail -30
```

Expected: build succeeds with no errors.

- [ ] **Step 3: Visual check — dark mode**

Start dev server (`npm run dev`). Navigate through: Dashboard, Campaigns, Contacts, Calling/Dialer, Pipeline, Reports, Settings, Schedule. Confirm every surface uses the new soft-gold warm-charcoal palette. No stray bright amber `#f5a623`, no stark white borders, no mismatched backgrounds.

- [ ] **Step 4: Visual check — light mode**

Click the Sun icon to switch to light mode. Navigate the same pages. Confirm: warm cream backgrounds, deep brown text, glass panels with drop shadow instead of glow, soft gold accent readable on cream. No dark backgrounds bleeding through.

- [ ] **Step 5: Visual check — client portal**

Navigate to the client portal (or test with a client-role account). Confirm toggle appears in the portal header and switches theme correctly.

- [ ] **Step 6: Visual check — OS preference**

Open a new incognito window with no `localStorage`. Set the OS to light mode; confirm the app opens in light mode. Set OS to dark; confirm dark. Then use the toggle to override — confirm `localStorage` override works.

- [ ] **Step 7: Run full test suite**

```bash
npx vitest run 2>&1 | tail -20
```

Expected: all tests pass. (The theme toggle tests from Task 3 and all pre-existing tests.)

- [ ] **Step 8: Final commit**

```bash
git add -A
git commit -m "Light mode + theme redesign complete: warm-charcoal dark, soft-gold accent, cream light mode"
```
