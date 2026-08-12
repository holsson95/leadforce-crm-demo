# LeadForce CRM Phase 1 — Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the complete Phase 1 foundation — Next.js 14 scaffold, LeadForce design system, Clerk auth with custom styled pages, Prisma schema with multi-tenancy, app shell (sidebar + header), and basic CRUD for clients and campaigns.

**Architecture:** Feature-by-feature, full stack. Each layer is complete before the next: design system → auth → DB schema → app shell → CRUD. Multi-tenancy enforced via Prisma middleware with `AsyncLocalStorage`. Roles and tenantId stored in Clerk `publicMetadata`. Server Components for data fetching, Server Actions for mutations, Zustand for client UI state.

**Tech Stack:** Next.js 14 App Router, TypeScript, Tailwind CSS 3, Shadcn/UI, `@clerk/nextjs` v5, Prisma, PostgreSQL (Supabase), Zustand, React Hook Form + Zod, Vitest + Testing Library, Lucide React, svix, tsx

---

## File Map

### Created
- `middleware.ts` — Clerk auth middleware, protects dashboard routes
- `tailwind.config.ts` — LeadForce design tokens (replaces create-next-app default)
- `src/app/globals.css` — CSS variables, `.glass-panel`, `.custom-scrollbar`, keyframe animations
- `src/app/layout.tsx` — Root layout: ClerkProvider + next/font
- `src/app/(auth)/layout.tsx` — Centered full-screen auth shell
- `src/app/(auth)/sign-in/[[...sign-in]]/page.tsx` — Styled Clerk sign-in
- `src/app/(auth)/sign-up/[[...sign-up]]/page.tsx` — Styled Clerk sign-up
- `src/app/(auth)/invite/page.tsx` — Invite acceptance (Clerk SignUp with role metadata)
- `src/app/(dashboard)/layout.tsx` — Sidebar + scrollable main column
- `src/app/(dashboard)/page.tsx` — Dashboard placeholder
- `src/app/(dashboard)/clients/page.tsx` — Clients list server component
- `src/app/(dashboard)/clients/actions.ts` — createClient, updateClient, deleteClient server actions
- `src/app/(dashboard)/campaigns/page.tsx` — Campaigns list server component
- `src/app/(dashboard)/campaigns/actions.ts` — createCampaign, updateCampaign, deleteCampaign server actions
- `src/app/api/clients/route.ts` — GET (list) + POST (create)
- `src/app/api/clients/[id]/route.ts` — PATCH (update) + DELETE (soft-delete)
- `src/app/api/campaigns/route.ts` — GET + POST
- `src/app/api/campaigns/[id]/route.ts` — PATCH + DELETE
- `src/app/api/webhooks/clerk/route.ts` — Sets publicMetadata.role on user.created
- `src/components/layout/Sidebar.tsx` — Nav sidebar with collapse toggle
- `src/components/layout/Header.tsx` — Sticky header: title, org selector, bell, user avatar
- `src/components/layout/PageShell.tsx` — Content wrapper with padding + scrollbar
- `src/components/shared/SlideDrawer.tsx` — Reusable right-side slide-in drawer
- `src/components/clients/ClientsTable.tsx` — Client list table with actions
- `src/components/clients/ClientDrawer.tsx` — Create/edit client form
- `src/components/campaigns/CampaignsTable.tsx` — Campaign list table with actions
- `src/components/campaigns/CampaignDrawer.tsx` — Create/edit campaign form
- `src/components/campaigns/SDRSelector.tsx` — Checkbox list for SDR assignment
- `src/lib/db.ts` — Prisma singleton + AsyncLocalStorage tenant middleware
- `src/lib/auth.ts` — hasPermission(), getCurrentUserRole(), getCurrentTenantId(), requirePermission()
- `src/stores/ui-store.ts` — Zustand: sidebarCollapsed, activeDrawer, drawerPayload
- `src/types/enums.ts` — UserRole, CampaignStatus TypeScript enums
- `src/types/models.ts` — ClientWithCampaignCount, CampaignWithDetails, UserSummary
- `prisma/schema.prisma` — Tenant, User, Client, Campaign, CampaignSDR + enums
- `prisma/seed.ts` — Creates one demo tenant
- `vitest.config.ts` — Vitest with jsdom and @/* alias
- `src/test/setup.ts` — @testing-library/jest-dom import
- `src/lib/__tests__/auth.test.ts` — Unit tests for hasPermission()
- `src/stores/__tests__/ui-store.test.ts` — Unit tests for Zustand actions

### Modified
- `package.json` — dependencies + test/db scripts
- `.env.local` — DATABASE_URL, Clerk keys, CLERK_WEBHOOK_SECRET

---

## Task 1: Scaffold + Install Dependencies

**Files:**
- Create: (repo root — Next.js project files)
- Create: `.env.local`

- [ ] **Step 1: Initialize Next.js 14 in the existing repo directory**

```bash
npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --no-git
```

When prompted about overwriting `README.md` → choose **N**. Accept all other defaults.

Expected: Next.js project files created. `package.json`, `next.config.ts`, `tsconfig.json`, etc. present.

- [ ] **Step 2: Install Phase 1 dependencies**

```bash
npm install @clerk/nextjs @prisma/client prisma zustand react-hook-form @hookform/resolvers zod lucide-react svix
npm install -D vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/jest-dom tsx
```

- [ ] **Step 3: Add test and DB scripts to package.json**

```bash
npm pkg set scripts.test="vitest" scripts.test:run="vitest run" scripts.db:generate="prisma generate" scripts.db:migrate="prisma migrate dev" scripts.db:seed="tsx prisma/seed.ts"
```

- [ ] **Step 4: Create .env.local**

```env
# Database (Supabase)
DATABASE_URL="<paste Supabase connection string from conversation>"

# Clerk
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY="<paste pk_test_... from conversation>"
CLERK_SECRET_KEY="<paste sk_test_... from conversation>"
NEXT_PUBLIC_CLERK_SIGN_IN_URL="/sign-in"
NEXT_PUBLIC_CLERK_SIGN_UP_URL="/sign-up"
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL="/"
NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL="/"

# Clerk Webhook (fill in after Step 9 creates the webhook endpoint)
CLERK_WEBHOOK_SECRET=""
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Scaffold Next.js 14 with Phase 1 dependencies"
```

---

## Task 2: Shadcn/UI Init

**Files:**
- Modify: `tailwind.config.ts` (Shadcn overwrites it — we fix it in Task 3)
- Modify: `src/app/globals.css` (Shadcn adds base CSS variables — we extend in Task 3)
- Create: `src/lib/utils.ts` (Shadcn creates the `cn` utility)
- Create: `src/components/ui/*` (Shadcn UI primitives)

- [ ] **Step 1: Init Shadcn with dark theme**

```bash
npx shadcn@latest init
```

When prompted:
- Style → **Default**
- Base color → **Slate**
- CSS variables → **Yes**

- [ ] **Step 2: Install all Shadcn components needed in Phase 1**

```bash
npx shadcn@latest add button input label select sheet checkbox badge avatar separator dropdown-menu form skeleton
```

Expected: `src/components/ui/` contains button.tsx, input.tsx, etc.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "Add Shadcn/UI with dark theme and Phase 1 components"
```

---

## Task 3: Design System — Tailwind Config + globals.css + Root Layout

**Files:**
- Modify: `tailwind.config.ts`
- Modify: `src/app/globals.css`
- Create: `src/app/layout.tsx`

- [ ] **Step 1: Replace tailwind.config.ts with LeadForce design tokens**

```typescript
// tailwind.config.ts
import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: ['class'],
  content: [
    './pages/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './app/**/*.{ts,tsx}',
    './src/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // LeadForce design tokens
        dark: '#0b0e14',
        'card-bg': 'rgba(22, 28, 38, 0.6)',
        'card-solid': '#161c26',
        accent: '#00d4ff',
        success: '#10b981',
        warning: '#f59e0b',
        danger: '#ef4444',
        info: '#3b82f6',
        // Shadcn/UI component tokens
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
      },
      fontFamily: {
        sans: ['var(--font-outfit)', 'sans-serif'],
        mono: ['var(--font-mono)', 'monospace'],
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
        '3xl': '1.5rem',
        '4xl': '2rem',
      },
      animation: {
        'call-pulse': 'call-pulse 2s infinite',
        'pulse-cyan': 'pulse-cyan 2s infinite',
        'pulse-amber': 'pulse-amber 3s infinite',
        'fade-in': 'fade-in 300ms ease-out',
        'slide-up': 'slide-up 200ms ease-out',
        'slide-in-right': 'slide-in-right 300ms ease-out',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
}

export default config
```

- [ ] **Step 2: Replace globals.css with LeadForce design system**

```css
/* src/app/globals.css */
@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap');

@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  /* === Shadcn/UI component tokens (HSL channel values — required by Tailwind color references) === */
  --background: 216 23% 8%;
  --foreground: 214 32% 91%;
  --card: 216 27% 12%;
  --card-foreground: 214 32% 91%;
  --popover: 216 27% 12%;
  --popover-foreground: 214 32% 91%;
  --primary: 191 100% 50%;
  --primary-foreground: 0 0% 0%;
  --secondary: 216 15% 15%;
  --secondary-foreground: 214 20% 70%;
  --muted: 216 15% 15%;
  --muted-foreground: 215 16% 47%;
  --accent: 191 100% 50%;       /* hsl(191 100% 50%) = #00d4ff */
  --accent-foreground: 0 0% 0%;
  --destructive: 0 84% 60%;
  --destructive-foreground: 0 0% 100%;
  --border: 216 15% 12%;
  --input: 216 15% 12%;
  --ring: 191 100% 50%;
  --radius: 0.75rem;

  /* === LeadForce design tokens (prefixed to avoid collisions with Shadcn vars above) === */
  --bg-dark: #0b0e14;
  --card-bg: rgba(22, 28, 38, 0.6);
  --card-bg-solid: #161c26;
  --panel-border: rgba(255, 255, 255, 0.08);    /* used in .glass-panel */
  --panel-border-hover: rgba(255, 255, 255, 0.15);
  --text-primary: #e2e8f0;
  --text-secondary: #94a3b8;
  --text-muted: #64748b;
  --text-disabled: #475569;
  --lf-accent: #00d4ff;         /* hex form for direct CSS; same value as --accent HSL above */
  --accent-muted: rgba(0, 212, 255, 0.1);
  --accent-glow: 0 0 15px rgba(0, 212, 255, 0.3);
  --success: #10b981;
  --warning: #f59e0b;
  --danger: #ef4444;
  --info: #3b82f6;
}

@layer base {
  * {
    @apply border-border;
  }
  body {
    background-color: #0b0e14;
    color: #e2e8f0;
    @apply font-sans antialiased;
  }
}

@layer utilities {
  .glass-panel {
    background: rgba(22, 28, 38, 0.6);
    backdrop-filter: blur(12px);
    border: 1px solid rgba(255, 255, 255, 0.08);
    box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.3);
  }

  .custom-scrollbar::-webkit-scrollbar {
    width: 4px;
  }
  .custom-scrollbar::-webkit-scrollbar-track {
    background: transparent;
  }
  .custom-scrollbar::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.1);
    border-radius: 10px;
  }
}

@keyframes call-pulse {
  0%   { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.5); }
  70%  { box-shadow: 0 0 0 12px rgba(16, 185, 129, 0); }
  100% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); }
}

@keyframes pulse-cyan {
  0%   { box-shadow: 0 0 0 0 rgba(0, 212, 255, 0.5); }
  70%  { box-shadow: 0 0 0 12px rgba(0, 212, 255, 0); }
  100% { box-shadow: 0 0 0 0 rgba(0, 212, 255, 0); }
}

@keyframes pulse-amber {
  0%   { box-shadow: 0 0 0 0 rgba(245, 158, 11, 0.5); }
  70%  { box-shadow: 0 0 0 12px rgba(245, 158, 11, 0); }
  100% { box-shadow: 0 0 0 0 rgba(245, 158, 11, 0); }
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
  .animate-pulse-cyan,
  .animate-pulse-amber {
    animation: none;
  }
}
```

- [ ] **Step 3: Create root layout with ClerkProvider and next/font**

```typescript
// src/app/layout.tsx
import type { Metadata } from 'next'
import { Outfit, JetBrains_Mono } from 'next/font/google'
import { ClerkProvider } from '@clerk/nextjs'
import './globals.css'

const outfit = Outfit({
  subsets: ['latin'],
  variable: '--font-outfit',
  weight: ['300', '400', '500', '600', '700'],
})

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  weight: ['400', '500', '600'],
})

export const metadata: Metadata = {
  title: 'LeadForce CRM',
  description: 'Sales engagement platform for SDR teams',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider>
      <html lang="en" className={`${outfit.variable} ${jetbrainsMono.variable}`}>
        <body>{children}</body>
      </html>
    </ClerkProvider>
  )
}
```

- [ ] **Step 4: Verify the dev server starts without errors**

```bash
npm run dev
```

Expected: Server running at http://localhost:3000, no TypeScript or Tailwind errors in the terminal.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Add LeadForce design system: Tailwind tokens, globals.css, root layout"
```

---

## Task 4: Vitest Setup

**Files:**
- Create: `vitest.config.ts`
- Create: `src/test/setup.ts`

- [ ] **Step 1: Create vitest.config.ts**

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
```

- [ ] **Step 2: Create test setup file**

```typescript
// src/test/setup.ts
import '@testing-library/jest-dom'
```

- [ ] **Step 3: Verify tailwindcss-animate was installed by Shadcn**

```bash
npm list tailwindcss-animate
```

Expected: `tailwindcss-animate@x.x.x` listed. If missing: `npm install tailwindcss-animate`.

- [ ] **Step 4: Verify Vitest runs**

```bash
npm run test:run
```

Expected: `No test files found, exiting with code 1` — this is correct, no tests exist yet.

- [ ] **Step 4: Commit**

```bash
git add vitest.config.ts src/test/setup.ts
git commit -m "Add Vitest with jsdom and Testing Library"
```

---

## Task 5: Auth Helper — hasPermission() (TDD)

**Files:**
- Create: `src/lib/__tests__/auth.test.ts`
- Create: `src/lib/auth.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/lib/__tests__/auth.test.ts
import { describe, it, expect } from 'vitest'
import { hasPermission } from '../auth'

describe('hasPermission', () => {
  it('grants admin all permissions', () => {
    expect(hasPermission('admin', 'clients:read')).toBe(true)
    expect(hasPermission('admin', 'clients:write')).toBe(true)
    expect(hasPermission('admin', 'campaigns:read')).toBe(true)
    expect(hasPermission('admin', 'campaigns:write')).toBe(true)
    expect(hasPermission('admin', 'sdrs:manage')).toBe(true)
  })

  it('grants manager all permissions', () => {
    expect(hasPermission('manager', 'clients:read')).toBe(true)
    expect(hasPermission('manager', 'clients:write')).toBe(true)
    expect(hasPermission('manager', 'campaigns:read')).toBe(true)
    expect(hasPermission('manager', 'campaigns:write')).toBe(true)
    expect(hasPermission('manager', 'sdrs:manage')).toBe(true)
  })

  it('grants sdr only campaigns:read', () => {
    expect(hasPermission('sdr', 'campaigns:read')).toBe(true)
    expect(hasPermission('sdr', 'campaigns:write')).toBe(false)
    expect(hasPermission('sdr', 'clients:read')).toBe(false)
    expect(hasPermission('sdr', 'clients:write')).toBe(false)
    expect(hasPermission('sdr', 'sdrs:manage')).toBe(false)
  })

  it('grants client only campaigns:read', () => {
    expect(hasPermission('client', 'campaigns:read')).toBe(true)
    expect(hasPermission('client', 'campaigns:write')).toBe(false)
    expect(hasPermission('client', 'clients:read')).toBe(false)
  })

  it('returns false for unknown role', () => {
    expect(hasPermission('unknown', 'clients:read')).toBe(false)
  })
})
```

- [ ] **Step 2: Run tests and confirm they fail**

```bash
npm run test:run
```

Expected: FAIL — `Cannot find module '../auth'`

- [ ] **Step 3: Implement auth.ts**

```typescript
// src/lib/auth.ts
import { auth } from '@clerk/nextjs/server'

export type Permission =
  | 'clients:read'
  | 'clients:write'
  | 'campaigns:read'
  | 'campaigns:write'
  | 'sdrs:manage'

const ROLE_PERMISSIONS: Record<string, Permission[]> = {
  admin:   ['clients:read', 'clients:write', 'campaigns:read', 'campaigns:write', 'sdrs:manage'],
  manager: ['clients:read', 'clients:write', 'campaigns:read', 'campaigns:write', 'sdrs:manage'],
  sdr:     ['campaigns:read'],
  client:  ['campaigns:read'],
}

export function hasPermission(role: string, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false
}

export async function getCurrentUserRole(): Promise<string | null> {
  const { sessionClaims } = await auth()
  return (sessionClaims?.publicMetadata as { role?: string })?.role ?? null
}

export async function getCurrentTenantId(): Promise<string | null> {
  const { sessionClaims } = await auth()
  return (sessionClaims?.publicMetadata as { tenantId?: string })?.tenantId ?? null
}

export async function requirePermission(permission: Permission): Promise<void> {
  const role = await getCurrentUserRole()
  if (!role || !hasPermission(role, permission)) {
    throw new Error('Forbidden')
  }
}
```

- [ ] **Step 4: Run tests and confirm they pass**

```bash
npm run test:run
```

Expected: PASS — 5 test suites passing

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth.ts src/lib/__tests__/auth.test.ts
git commit -m "Add auth helper with role-based permission checks (TDD)"
```

---

## Task 6: Zustand UI Store (TDD)

**Files:**
- Create: `src/stores/__tests__/ui-store.test.ts`
- Create: `src/stores/ui-store.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/stores/__tests__/ui-store.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { useUIStore } from '../ui-store'

describe('useUIStore', () => {
  beforeEach(() => {
    useUIStore.setState({
      sidebarCollapsed: false,
      activeDrawer: null,
      drawerPayload: null,
    })
  })

  it('starts with sidebar expanded', () => {
    expect(useUIStore.getState().sidebarCollapsed).toBe(false)
  })

  it('toggles sidebar collapsed state', () => {
    useUIStore.getState().toggleSidebar()
    expect(useUIStore.getState().sidebarCollapsed).toBe(true)
    useUIStore.getState().toggleSidebar()
    expect(useUIStore.getState().sidebarCollapsed).toBe(false)
  })

  it('opens a drawer with id and payload', () => {
    useUIStore.getState().openDrawer('create-client', { clientId: '123' })
    expect(useUIStore.getState().activeDrawer).toBe('create-client')
    expect(useUIStore.getState().drawerPayload).toEqual({ clientId: '123' })
  })

  it('opens a drawer without payload', () => {
    useUIStore.getState().openDrawer('create-campaign')
    expect(useUIStore.getState().activeDrawer).toBe('create-campaign')
    expect(useUIStore.getState().drawerPayload).toBeNull()
  })

  it('closes the active drawer and clears payload', () => {
    useUIStore.getState().openDrawer('create-client', { id: 'x' })
    useUIStore.getState().closeDrawer()
    expect(useUIStore.getState().activeDrawer).toBeNull()
    expect(useUIStore.getState().drawerPayload).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests and confirm they fail**

```bash
npm run test:run
```

Expected: FAIL — `Cannot find module '../ui-store'`

- [ ] **Step 3: Implement ui-store.ts**

```typescript
// src/stores/ui-store.ts
import { create } from 'zustand'

interface UIState {
  sidebarCollapsed: boolean
  toggleSidebar: () => void
  activeDrawer: string | null
  drawerPayload: unknown
  openDrawer: (id: string, payload?: unknown) => void
  closeDrawer: () => void
}

export const useUIStore = create<UIState>((set) => ({
  sidebarCollapsed: false,
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  activeDrawer: null,
  drawerPayload: null,
  openDrawer: (id, payload = null) => set({ activeDrawer: id, drawerPayload: payload }),
  closeDrawer: () => set({ activeDrawer: null, drawerPayload: null }),
}))
```

- [ ] **Step 4: Run tests and confirm they pass**

```bash
npm run test:run
```

Expected: PASS — all 5 store tests passing

- [ ] **Step 5: Commit**

```bash
git add src/stores/ui-store.ts src/stores/__tests__/ui-store.test.ts
git commit -m "Add Zustand UI store with sidebar collapse and drawer state (TDD)"
```

---

## Task 7: Clerk Middleware + Env Config

**Files:**
- Create: `middleware.ts`

- [ ] **Step 1: Create Clerk middleware**

```typescript
// middleware.ts
import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'

const isPublicRoute = createRouteMatcher([
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/invite(.*)',
  '/api/webhooks(.*)',
])

export default clerkMiddleware(async (auth, request) => {
  if (!isPublicRoute(request)) {
    await auth.protect()
  }
})

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
}
```

- [ ] **Step 2: Verify middleware compiles — run dev server**

```bash
npm run dev
```

Expected: Server starts, navigating to http://localhost:3000 redirects to `/sign-in` (Clerk's default hosted page, since custom pages don't exist yet).

- [ ] **Step 3: Commit**

```bash
git add middleware.ts
git commit -m "Add Clerk middleware protecting dashboard and API routes"
```

---

## Task 8: Auth Pages

**Files:**
- Create: `src/app/(auth)/layout.tsx`
- Create: `src/app/(auth)/sign-in/[[...sign-in]]/page.tsx`
- Create: `src/app/(auth)/sign-up/[[...sign-up]]/page.tsx`
- Create: `src/app/(auth)/invite/page.tsx`

- [ ] **Step 1: Create auth route group layout**

```typescript
// src/app/(auth)/layout.tsx
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4" style={{ backgroundColor: '#0b0e14' }}>
      <div className="mb-10 text-center">
        <div className="inline-flex items-center gap-3 mb-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-accent to-cyan-600" />
          <h1 className="text-3xl font-bold bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">
            LeadForce
          </h1>
        </div>
        <p className="text-gray-500 text-sm">Sales Engagement Platform</p>
      </div>
      {children}
    </div>
  )
}
```

- [ ] **Step 2: Create custom sign-in page**

```typescript
// src/app/(auth)/sign-in/[[...sign-in]]/page.tsx
import { SignIn } from '@clerk/nextjs'

const clerkAppearance = {
  variables: {
    colorBackground: '#161c26',
    colorInputBackground: 'rgba(255,255,255,0.05)',
    colorInputText: '#e2e8f0',
    colorText: '#e2e8f0',
    colorTextSecondary: '#94a3b8',
    colorPrimary: '#00d4ff',
    colorDanger: '#ef4444',
    borderRadius: '0.75rem',
    fontFamily: 'Outfit, sans-serif',
  },
  elements: {
    rootBox: 'w-full',
    card: 'glass-panel rounded-3xl !shadow-none',
    headerTitle: 'text-white font-semibold',
    headerSubtitle: 'text-gray-400',
    formFieldInput:
      'bg-white/5 border border-white/10 text-white placeholder:text-gray-600 rounded-xl focus:border-accent/50',
    formButtonPrimary:
      'bg-gradient-to-r from-[#00d4ff] to-cyan-600 text-black font-semibold rounded-xl shadow-xl hover:opacity-90',
    footerActionLink: 'text-accent hover:text-accent/80',
    dividerLine: 'bg-white/5',
    dividerText: 'text-gray-600',
    socialButtonsBlockButton:
      'bg-white/5 border border-white/10 text-gray-300 hover:bg-white/10 rounded-xl',
    formFieldLabel: 'text-gray-400 text-xs',
    identityPreviewText: 'text-gray-300',
  },
}

export default function SignInPage() {
  return <SignIn appearance={clerkAppearance} />
}
```

- [ ] **Step 3: Create custom sign-up page**

```typescript
// src/app/(auth)/sign-up/[[...sign-up]]/page.tsx
import { SignUp } from '@clerk/nextjs'

const clerkAppearance = {
  variables: {
    colorBackground: '#161c26',
    colorInputBackground: 'rgba(255,255,255,0.05)',
    colorInputText: '#e2e8f0',
    colorText: '#e2e8f0',
    colorTextSecondary: '#94a3b8',
    colorPrimary: '#00d4ff',
    colorDanger: '#ef4444',
    borderRadius: '0.75rem',
    fontFamily: 'Outfit, sans-serif',
  },
  elements: {
    rootBox: 'w-full',
    card: 'glass-panel rounded-3xl !shadow-none',
    headerTitle: 'text-white font-semibold',
    headerSubtitle: 'text-gray-400',
    formFieldInput:
      'bg-white/5 border border-white/10 text-white placeholder:text-gray-600 rounded-xl focus:border-accent/50',
    formButtonPrimary:
      'bg-gradient-to-r from-[#00d4ff] to-cyan-600 text-black font-semibold rounded-xl shadow-xl hover:opacity-90',
    footerActionLink: 'text-accent hover:text-accent/80',
    dividerLine: 'bg-white/5',
    dividerText: 'text-gray-600',
    socialButtonsBlockButton:
      'bg-white/5 border border-white/10 text-gray-300 hover:bg-white/10 rounded-xl',
    formFieldLabel: 'text-gray-400 text-xs',
  },
}

export default function SignUpPage() {
  return <SignUp appearance={clerkAppearance} />
}
```

- [ ] **Step 4: Create invite page**

The invite page renders a SignUp form. Role and tenantId are passed in `unsafe_metadata` via the URL, read by the Clerk webhook in Task 9.

```typescript
// src/app/(auth)/invite/page.tsx
import { SignUp } from '@clerk/nextjs'

const clerkAppearance = {
  variables: {
    colorBackground: '#161c26',
    colorInputBackground: 'rgba(255,255,255,0.05)',
    colorInputText: '#e2e8f0',
    colorText: '#e2e8f0',
    colorTextSecondary: '#94a3b8',
    colorPrimary: '#00d4ff',
    colorDanger: '#ef4444',
    borderRadius: '0.75rem',
    fontFamily: 'Outfit, sans-serif',
  },
  elements: {
    rootBox: 'w-full',
    card: 'glass-panel rounded-3xl !shadow-none',
    headerTitle: 'text-white font-semibold',
    headerSubtitle: 'text-gray-400',
    formFieldInput:
      'bg-white/5 border border-white/10 text-white placeholder:text-gray-600 rounded-xl focus:border-accent/50',
    formButtonPrimary:
      'bg-gradient-to-r from-[#00d4ff] to-cyan-600 text-black font-semibold rounded-xl shadow-xl hover:opacity-90',
    footerActionLink: 'text-accent hover:text-accent/80',
    formFieldLabel: 'text-gray-400 text-xs',
  },
}

interface InvitePageProps {
  searchParams: { role?: string; tenantId?: string }
}

export default function InvitePage({ searchParams }: InvitePageProps) {
  return (
    <div className="w-full max-w-md">
      {searchParams.role && (
        <p className="text-center text-sm text-gray-400 mb-6">
          You've been invited as a{' '}
          <span className="text-accent font-medium">{searchParams.role}</span>
        </p>
      )}
      <SignUp
        appearance={clerkAppearance}
        unsafeMetadata={{
          role: searchParams.role ?? 'sdr',
          tenantId: searchParams.tenantId ?? null,
        }}
      />
    </div>
  )
}
```

- [ ] **Step 5: Test auth pages in browser**

```bash
npm run dev
```

Navigate to http://localhost:3000/sign-in — expect to see the custom dark glass-panel sign-in form styled with Outfit font and cyan accent. Navigate to `/sign-up` and `/invite?role=sdr` and verify both render correctly.

- [ ] **Step 6: Commit**

```bash
git add src/app/(auth)/
git commit -m "Add custom Clerk auth pages with LeadForce design system styling"
```

---

## Task 9: Clerk Webhook Handler

**Files:**
- Create: `src/app/api/webhooks/clerk/route.ts`

- [ ] **Step 1: Create the webhook handler**

```typescript
// src/app/api/webhooks/clerk/route.ts
import { headers } from 'next/headers'
import { Webhook } from 'svix'
import type { WebhookEvent } from '@clerk/nextjs/server'
import { clerkClient } from '@clerk/nextjs/server'

export async function POST(req: Request) {
  const WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SECRET
  if (!WEBHOOK_SECRET) {
    return new Response('CLERK_WEBHOOK_SECRET not configured', { status: 500 })
  }

  const headerPayload = await headers()
  const svixId = headerPayload.get('svix-id')
  const svixTimestamp = headerPayload.get('svix-timestamp')
  const svixSignature = headerPayload.get('svix-signature')

  if (!svixId || !svixTimestamp || !svixSignature) {
    return new Response('Missing svix headers', { status: 400 })
  }

  const payload = await req.json()
  const body = JSON.stringify(payload)

  const wh = new Webhook(WEBHOOK_SECRET)
  let evt: WebhookEvent

  try {
    evt = wh.verify(body, {
      'svix-id': svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': svixSignature,
    }) as WebhookEvent
  } catch {
    return new Response('Invalid webhook signature', { status: 400 })
  }

  if (evt.type === 'user.created') {
    const { id, unsafe_metadata } = evt.data
    const role = (unsafe_metadata?.role as string) ?? 'sdr'
    const tenantId = (unsafe_metadata?.tenantId as string) ?? null

    const client = await clerkClient()
    await client.users.updateUser(id, {
      publicMetadata: { role, tenantId },
    })
  }

  return new Response('OK', { status: 200 })
}
```

- [ ] **Step 2: Register webhook in Clerk Dashboard**

In the Clerk Dashboard (https://dashboard.clerk.com):
1. Go to **Webhooks** → **Add Endpoint**
2. URL: `https://<your-deployment-url>/api/webhooks/clerk` (use ngrok for local dev: `npx ngrok http 3000`)
3. Events: select **user.created**
4. Copy the **Signing Secret** → paste into `.env.local` as `CLERK_WEBHOOK_SECRET`

- [ ] **Step 3: Commit**

```bash
git add src/app/api/webhooks/
git commit -m "Add Clerk webhook handler to set publicMetadata role on user.created"
```

---

## Task 10: Prisma Schema + Migration + Seed

**Files:**
- Create: `prisma/schema.prisma`
- Create: `prisma/seed.ts`

- [ ] **Step 1: Create prisma/schema.prisma**

```prisma
// prisma/schema.prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum UserRole {
  admin
  manager
  sdr
  client
}

enum CampaignStatus {
  draft
  active
  paused
  completed
}

model Tenant {
  id        String     @id @default(cuid())
  name      String
  slug      String     @unique
  createdAt DateTime   @default(now())
  updatedAt DateTime   @updatedAt
  users     User[]
  clients   Client[]
  campaigns Campaign[]
}

model User {
  id        String        @id @default(cuid())
  clerkId   String        @unique
  tenantId  String
  email     String
  name      String
  role      UserRole
  managerId String?
  createdAt DateTime      @default(now())
  updatedAt DateTime      @updatedAt
  deletedAt DateTime?
  tenant    Tenant        @relation(fields: [tenantId], references: [id])
  manager   User?         @relation("ManagerSDR", fields: [managerId], references: [id])
  reports   User[]        @relation("ManagerSDR")
  campaigns CampaignSDR[]
}

model Client {
  id          String     @id @default(cuid())
  tenantId    String
  name        String
  contactName String?
  email       String?
  phone       String?
  website     String?
  createdAt   DateTime   @default(now())
  updatedAt   DateTime   @updatedAt
  deletedAt   DateTime?
  tenant      Tenant     @relation(fields: [tenantId], references: [id])
  campaigns   Campaign[]
}

model Campaign {
  id               String         @id @default(cuid())
  tenantId         String
  clientId         String
  name             String
  status           CampaignStatus @default(draft)
  dailyTargetCalls Int?
  targetLists      Json           @default("[]")
  createdAt        DateTime       @default(now())
  updatedAt        DateTime       @updatedAt
  deletedAt        DateTime?
  tenant           Tenant         @relation(fields: [tenantId], references: [id])
  client           Client         @relation(fields: [clientId], references: [id])
  sdrs             CampaignSDR[]
}

model CampaignSDR {
  campaignId String
  userId     String
  assignedAt DateTime @default(now())
  campaign   Campaign @relation(fields: [campaignId], references: [id])
  user       User     @relation(fields: [userId], references: [id])

  @@id([campaignId, userId])
}
```

- [ ] **Step 2: Add prisma.seed config to package.json**

```bash
npm pkg set prisma.seed="tsx prisma/seed.ts"
```

- [ ] **Step 3: Create prisma/seed.ts**

```typescript
// prisma/seed.ts
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const existing = await prisma.tenant.findFirst({ where: { slug: 'leadforce-demo' } })
  if (existing) {
    console.log('Demo tenant already exists:', existing.id)
    console.log('Set publicMetadata.tenantId to this value in Clerk Dashboard for your user.')
    return
  }

  const tenant = await prisma.tenant.create({
    data: { name: 'LeadForce Demo', slug: 'leadforce-demo' },
  })

  console.log('Created demo tenant:', tenant.id)
  console.log('→ Go to Clerk Dashboard → Users → your user → publicMetadata')
  console.log(`→ Set: { "role": "admin", "tenantId": "${tenant.id}" }`)
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
```

- [ ] **Step 4: Generate Prisma client and run migration**

```bash
npm run db:generate
npm run db:migrate
```

When prompted for migration name: `init_core_models`

Expected output ends with: `Your database is now in sync with your schema.`

- [ ] **Step 5: Run seed to create demo tenant**

```bash
npm run db:seed
```

Expected: `Created demo tenant: <cuid>` followed by instructions to set Clerk publicMetadata.

- [ ] **Step 6: Set tenantId in Clerk Dashboard**

In Clerk Dashboard → Users → your user → Edit → **publicMetadata**:
```json
{ "role": "admin", "tenantId": "<tenant id from seed output>" }
```

- [ ] **Step 7: Commit**

```bash
git add prisma/
git commit -m "Add Prisma schema with Tenant/User/Client/Campaign models and seed"
```

---

## Task 11: Prisma DB Client + Tenant Middleware

**Files:**
- Create: `src/lib/db.ts`

- [ ] **Step 1: Create db.ts with AsyncLocalStorage tenant middleware**

```typescript
// src/lib/db.ts
import { PrismaClient } from '@prisma/client'
import { AsyncLocalStorage } from 'async_hooks'

declare global {
  // Prevent multiple PrismaClient instances in development hot-reload
  var __prisma: PrismaClient | undefined
}

const TENANT_MODELS = ['User', 'Client', 'Campaign']

const tenantStore = new AsyncLocalStorage<{ tenantId: string }>()

function createPrismaClient(): PrismaClient {
  const client = new PrismaClient()

  client.$use(async (params, next) => {
    const ctx = tenantStore.getStore()
    if (!ctx || !TENANT_MODELS.includes(params.model ?? '')) {
      return next(params)
    }
    const { tenantId } = ctx

    if (
      params.action === 'findMany' ||
      params.action === 'findFirst' ||
      params.action === 'findFirstOrThrow'
    ) {
      params.args ??= {}
      params.args.where = { ...params.args.where, tenantId, deletedAt: null }
    }

    if (
      params.action === 'findUnique' ||
      params.action === 'findUniqueOrThrow'
    ) {
      params.args ??= {}
      params.args.where = { ...params.args.where, tenantId }
    }

    if (params.action === 'create') {
      params.args.data = { ...params.args.data, tenantId }
    }

    if (params.action === 'update' || params.action === 'updateMany') {
      params.args ??= {}
      params.args.where = { ...params.args.where, tenantId }
    }

    if (params.action === 'delete' || params.action === 'deleteMany') {
      params.args ??= {}
      params.args.where = { ...params.args.where, tenantId }
    }

    return next(params)
  })

  return client
}

export const db = global.__prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') {
  global.__prisma = db
}

export function withTenant<T>(tenantId: string, fn: () => Promise<T>): Promise<T> {
  return tenantStore.run({ tenantId }, fn)
}
```

- [ ] **Step 2: Verify TypeScript compiles cleanly**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/db.ts
git commit -m "Add Prisma singleton with AsyncLocalStorage tenant middleware"
```

---

## Task 12: Shared Types

**Files:**
- Create: `src/types/enums.ts`
- Create: `src/types/models.ts`

- [ ] **Step 1: Create enums.ts**

```typescript
// src/types/enums.ts
export enum UserRole {
  admin = 'admin',
  manager = 'manager',
  sdr = 'sdr',
  client = 'client',
}

export enum CampaignStatus {
  draft = 'draft',
  active = 'active',
  paused = 'paused',
  completed = 'completed',
}
```

- [ ] **Step 2: Create models.ts**

```typescript
// src/types/models.ts
import type { Client, Campaign, User, CampaignSDR } from '@prisma/client'

export type ClientWithCampaignCount = Client & {
  _count: { campaigns: number }
}

export type CampaignWithDetails = Campaign & {
  client: Pick<Client, 'id' | 'name'>
  sdrs: (CampaignSDR & {
    user: Pick<User, 'id' | 'name' | 'email'>
  })[]
}

export type UserSummary = Pick<User, 'id' | 'name' | 'email' | 'role'>
```

- [ ] **Step 3: Commit**

```bash
git add src/types/
git commit -m "Add shared TypeScript types for frontend models"
```

---

## Task 13: SlideDrawer Component

**Files:**
- Create: `src/components/shared/SlideDrawer.tsx`

- [ ] **Step 1: Create SlideDrawer**

```typescript
// src/components/shared/SlideDrawer.tsx
'use client'

import { useEffect } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface SlideDrawerProps {
  open: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
  width?: 'md' | 'lg'
}

export function SlideDrawer({
  open,
  onClose,
  title,
  children,
  width = 'md',
}: SlideDrawerProps) {
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    if (open) document.addEventListener('keydown', handleEsc)
    return () => document.removeEventListener('keydown', handleEsc)
  }, [open, onClose])

  if (!open) return null

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          'fixed top-0 right-0 z-50 h-full flex flex-col will-change-transform animate-slide-in-right',
          'border-l border-white/10',
          width === 'md' ? 'w-[480px]' : 'w-[640px]'
        )}
        style={{ backgroundColor: '#161c26' }}
      >
        {/* Header */}
        <div className="flex-shrink-0 flex items-center justify-between px-6 h-16 border-b border-white/5">
          <h2 className="text-sm font-semibold text-white">{title}</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/5 transition-colors duration-200"
            aria-label="Close drawer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable content */}
        {children}
      </div>
    </>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/shared/
git commit -m "Add reusable SlideDrawer component with backdrop and keyboard dismiss"
```

---

## Task 14: Sidebar Component

**Files:**
- Create: `src/components/layout/Sidebar.tsx`

- [ ] **Step 1: Create Sidebar**

```typescript
// src/components/layout/Sidebar.tsx
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  Target,
  Users,
  PhoneCall,
  Kanban,
  ScrollText,
  CalendarCheck2,
  BarChart3,
  Upload,
  Settings,
  ChevronLeft,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useUIStore } from '@/stores/ui-store'

const NAV_ITEMS = [
  { href: '/',          label: 'Dashboard', icon: LayoutDashboard },
  { href: '/campaigns', label: 'Campaigns', icon: Target },
  { href: '/contacts',  label: 'Contacts',  icon: Users },
  { href: '/calling',   label: 'Calling',   icon: PhoneCall },
  { href: '/pipeline',  label: 'Pipeline',  icon: Kanban },
  { href: '/scripts',   label: 'Scripts',   icon: ScrollText },
  { href: '/schedule',  label: 'Schedule',  icon: CalendarCheck2 },
  { href: '/reports',   label: 'Reports',   icon: BarChart3 },
  { href: '/imports',   label: 'Imports',   icon: Upload },
]

export function Sidebar() {
  const pathname = usePathname()
  const { sidebarCollapsed, toggleSidebar } = useUIStore()

  return (
    <aside
      className={cn(
        'flex flex-col h-screen flex-shrink-0 transition-all duration-300',
        'border-r border-white/5',
        sidebarCollapsed ? 'w-16' : 'w-64'
      )}
      style={{ backgroundColor: '#0b0e14' }}
    >
      {/* Brand */}
      <div
        className={cn(
          'flex items-center p-6 flex-shrink-0',
          sidebarCollapsed && 'justify-center px-0'
        )}
      >
        <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-accent to-cyan-600 flex-shrink-0" />
        {!sidebarCollapsed && (
          <span className="ml-3 text-xl font-bold bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent select-none">
            LeadForce
          </span>
        )}
      </div>

      {/* Nav items */}
      <nav className="flex-1 px-4 mt-2 space-y-0.5 overflow-y-auto custom-scrollbar">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active =
            href === '/'
              ? pathname === '/'
              : pathname.startsWith(href)

          return (
            <Link
              key={href}
              href={href}
              title={sidebarCollapsed ? label : undefined}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-colors duration-200',
                active
                  ? 'bg-white/5 text-accent'
                  : 'text-gray-400 hover:text-white hover:bg-white/5',
                sidebarCollapsed && 'justify-center px-0'
              )}
            >
              <Icon className="w-5 h-5 flex-shrink-0" />
              {!sidebarCollapsed && <span>{label}</span>}
            </Link>
          )
        })}
      </nav>

      {/* Daily Target widget */}
      {!sidebarCollapsed && (
        <div className="mx-4 mb-4 glass-panel rounded-2xl p-4">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-3">
            Daily Target
          </p>
          <div className="flex items-end justify-between mb-2">
            <span className="font-mono text-2xl font-semibold text-white">0</span>
            <span className="font-mono text-sm text-gray-500">/ —</span>
          </div>
          <div className="h-1.5 rounded-full bg-white/10">
            <div className="h-1.5 rounded-full bg-accent" style={{ width: '0%' }} />
          </div>
          <p className="text-[10px] text-gray-600 mt-2">live data in phase 3</p>
        </div>
      )}

      {/* Bottom: settings + collapse toggle */}
      <div className="border-t border-white/5 p-4 space-y-0.5 flex-shrink-0">
        <Link
          href="/settings"
          title={sidebarCollapsed ? 'Settings' : undefined}
          className={cn(
            'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-gray-400 hover:text-white hover:bg-white/5 transition-colors duration-200',
            sidebarCollapsed && 'justify-center px-0'
          )}
        >
          <Settings className="w-5 h-5 flex-shrink-0" />
          {!sidebarCollapsed && <span>Settings</span>}
        </Link>

        <button
          onClick={toggleSidebar}
          title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className={cn(
            'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-gray-500 hover:text-white hover:bg-white/5 w-full transition-colors duration-200',
            sidebarCollapsed && 'justify-center px-0'
          )}
        >
          <ChevronLeft
            className={cn(
              'w-5 h-5 flex-shrink-0 transition-transform duration-300',
              sidebarCollapsed && 'rotate-180'
            )}
          />
          {!sidebarCollapsed && <span>Collapse</span>}
        </button>
      </div>
    </aside>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/layout/Sidebar.tsx
git commit -m "Add Sidebar component with nav items, daily target widget, and collapse toggle"
```

---

## Task 15: Header + PageShell + Dashboard Layout + Placeholder Dashboard

**Files:**
- Create: `src/components/layout/Header.tsx`
- Create: `src/components/layout/PageShell.tsx`
- Create: `src/app/(dashboard)/layout.tsx`
- Create: `src/app/(dashboard)/page.tsx`

- [ ] **Step 1: Create Header**

```typescript
// src/components/layout/Header.tsx
'use client'

import { Bell, Building2 } from 'lucide-react'
import { UserButton } from '@clerk/nextjs'

interface HeaderProps {
  title: string
  subtitle?: string
}

export function Header({ title, subtitle }: HeaderProps) {
  return (
    <header
      className="flex-shrink-0 h-20 sticky top-0 z-10 flex items-center justify-between px-8 border-b border-white/5"
      style={{ backgroundColor: '#0b0e14' }}
    >
      {/* Left: page title */}
      <div>
        <h1 className="text-xl font-semibold text-white">{title}</h1>
        {subtitle && (
          <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>
        )}
      </div>

      {/* Right: org selector, notifications, user */}
      <div className="flex items-center gap-4">
        {/* Org selector */}
        <button className="flex items-center gap-2 px-4 py-2 rounded-full border border-white/10 text-sm text-gray-300 hover:border-white/20 transition-colors duration-200" style={{ backgroundColor: '#0b0e14' }}>
          <Building2 className="w-4 h-4 text-gray-500" />
          <span>My Organisation</span>
        </button>

        {/* Notification bell */}
        <div className="relative">
          <button className="w-9 h-9 rounded-xl flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/5 transition-colors duration-200">
            <Bell className="w-5 h-5" />
          </button>
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full border-2 border-dark" />
        </div>

        {/* Clerk user button */}
        <UserButton
          appearance={{
            elements: {
              avatarBox: 'w-9 h-9 rounded-xl',
              userButtonPopoverCard: 'glass-panel border border-white/10 rounded-2xl',
              userButtonPopoverActionButton: 'text-gray-300 hover:text-white hover:bg-white/5 rounded-xl',
              userButtonPopoverActionButtonText: 'text-sm',
            },
          }}
        />
      </div>
    </header>
  )
}
```

- [ ] **Step 2: Create PageShell**

```typescript
// src/components/layout/PageShell.tsx
interface PageShellProps {
  children: React.ReactNode
}

export function PageShell({ children }: PageShellProps) {
  return (
    <div className="p-8 space-y-8">
      {children}
    </div>
  )
}
```

- [ ] **Step 3: Create dashboard layout**

```typescript
// src/app/(dashboard)/layout.tsx
import { Sidebar } from '@/components/layout/Sidebar'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex h-screen overflow-hidden bg-dark">
      <Sidebar />
      <main className="flex-1 overflow-y-auto custom-scrollbar">
        {children}
      </main>
    </div>
  )
}
```

- [ ] **Step 4: Create dashboard placeholder page**

```typescript
// src/app/(dashboard)/page.tsx
import { Header } from '@/components/layout/Header'
import { PageShell } from '@/components/layout/PageShell'

export default function DashboardPage() {
  return (
    <>
      <Header title="Dashboard" subtitle="Welcome to LeadForce" />
      <PageShell>
        <div className="glass-panel rounded-3xl p-12 flex flex-col items-center justify-center text-center">
          <div className="w-16 h-16 rounded-2xl bg-accent/10 flex items-center justify-center mb-4">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-accent to-cyan-600" />
          </div>
          <h2 className="text-lg font-semibold text-white mb-2">Phase 1 Foundation</h2>
          <p className="text-sm text-gray-500">Dashboard KPIs and campaign health arrive in Phase 5.</p>
        </div>
      </PageShell>
    </>
  )
}
```

- [ ] **Step 5: Test the authenticated app shell in browser**

```bash
npm run dev
```

Sign in at http://localhost:3000/sign-in. After auth, expect:
- Dark sidebar with LeadForce logo and all nav items
- Header with "Dashboard" title, org selector, notification bell, user avatar
- Placeholder dashboard card
- Sidebar collapse button works (click ← icon)

- [ ] **Step 6: Commit**

```bash
git add src/components/layout/ src/app/(dashboard)/
git commit -m "Add app shell: Sidebar, Header, PageShell, dashboard layout, and placeholder page"
```

---

## Task 16: Clients CRUD — Page + Drawer + Server Actions + API Routes

**Files:**
- Create: `src/app/(dashboard)/clients/page.tsx`
- Create: `src/app/(dashboard)/clients/actions.ts`
- Create: `src/components/clients/ClientsTable.tsx`
- Create: `src/components/clients/ClientDrawer.tsx`
- Create: `src/app/api/clients/route.ts`
- Create: `src/app/api/clients/[id]/route.ts`

- [ ] **Step 1: Create server actions for clients**

```typescript
// src/app/(dashboard)/clients/actions.ts
'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { db, withTenant } from '@/lib/db'
import { getCurrentTenantId, requirePermission } from '@/lib/auth'

const ClientSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  contactName: z.string().optional(),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  phone: z.string().optional(),
  website: z.string().url('Invalid URL').optional().or(z.literal('')),
})

export type ClientFormData = z.infer<typeof ClientSchema>

export async function createClient(data: ClientFormData) {
  await requirePermission('clients:write')
  const tenantId = await getCurrentTenantId()
  if (!tenantId) throw new Error('No tenant context')

  const parsed = ClientSchema.parse(data)

  await withTenant(tenantId, () =>
    db.client.create({
      data: {
        name: parsed.name,
        contactName: parsed.contactName || null,
        email: parsed.email || null,
        phone: parsed.phone || null,
        website: parsed.website || null,
      },
    })
  )

  revalidatePath('/clients')
}

export async function updateClient(id: string, data: ClientFormData) {
  await requirePermission('clients:write')
  const tenantId = await getCurrentTenantId()
  if (!tenantId) throw new Error('No tenant context')

  const parsed = ClientSchema.parse(data)

  await withTenant(tenantId, () =>
    db.client.update({
      where: { id },
      data: {
        name: parsed.name,
        contactName: parsed.contactName || null,
        email: parsed.email || null,
        phone: parsed.phone || null,
        website: parsed.website || null,
      },
    })
  )

  revalidatePath('/clients')
}

export async function deleteClient(id: string) {
  await requirePermission('clients:write')
  const tenantId = await getCurrentTenantId()
  if (!tenantId) throw new Error('No tenant context')

  await withTenant(tenantId, () =>
    db.client.update({
      where: { id },
      data: { deletedAt: new Date() },
    })
  )

  revalidatePath('/clients')
}
```

- [ ] **Step 2: Create ClientDrawer**

```typescript
// src/components/clients/ClientDrawer.tsx
'use client'

import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { SlideDrawer } from '@/components/shared/SlideDrawer'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createClient, updateClient } from '@/app/(dashboard)/clients/actions'
import type { ClientWithCampaignCount } from '@/types/models'

const ClientSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  contactName: z.string().optional(),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  phone: z.string().optional(),
  website: z.string().url('Invalid URL').optional().or(z.literal('')),
})

type ClientFormData = z.infer<typeof ClientSchema>

interface ClientDrawerProps {
  open: boolean
  onClose: () => void
  client: ClientWithCampaignCount | null
}

const inputClass =
  'bg-white/5 border-white/10 text-white placeholder:text-gray-600 focus:border-accent/50 focus:ring-1 focus:ring-accent/10 rounded-xl'

export function ClientDrawer({ open, onClose, client }: ClientDrawerProps) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ClientFormData>({ resolver: zodResolver(ClientSchema) })

  useEffect(() => {
    reset({
      name: client?.name ?? '',
      contactName: client?.contactName ?? '',
      email: client?.email ?? '',
      phone: client?.phone ?? '',
      website: client?.website ?? '',
    })
  }, [client, reset, open])

  const onSubmit = async (data: ClientFormData) => {
    if (client) {
      await updateClient(client.id, data)
    } else {
      await createClient(data)
    }
    onClose()
  }

  return (
    <SlideDrawer
      open={open}
      onClose={onClose}
      title={client ? 'Edit Client' : 'New Client'}
    >
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col flex-1 overflow-hidden">
        <div className="flex-1 overflow-y-auto p-6 space-y-5 custom-scrollbar">
          <div className="space-y-1.5">
            <Label className="text-xs text-gray-400">Company Name *</Label>
            <Input {...register('name')} placeholder="Acme Corporation" className={inputClass} />
            {errors.name && (
              <p className="text-xs text-danger">{errors.name.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-gray-400">Contact Name</Label>
            <Input {...register('contactName')} placeholder="John Smith" className={inputClass} />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-gray-400">Email</Label>
            <Input {...register('email')} type="email" placeholder="john@acme.com" className={inputClass} />
            {errors.email && (
              <p className="text-xs text-danger">{errors.email.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-gray-400">Phone</Label>
            <Input {...register('phone')} placeholder="+1 555 000 0000" className={inputClass} />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-gray-400">Website</Label>
            <Input {...register('website')} placeholder="https://acme.com" className={inputClass} />
            {errors.website && (
              <p className="text-xs text-danger">{errors.website.message}</p>
            )}
          </div>
        </div>

        <div className="flex-shrink-0 border-t border-white/5 p-6 flex gap-3">
          <Button
            type="submit"
            disabled={isSubmitting}
            className="flex-1 bg-gradient-to-r from-accent to-cyan-600 text-black font-semibold rounded-xl shadow-xl shadow-accent/30 hover:opacity-90"
          >
            {isSubmitting ? 'Saving…' : client ? 'Save Changes' : 'Create Client'}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            className="bg-white/5 border-white/10 text-gray-300 hover:bg-white/10 rounded-xl"
          >
            Cancel
          </Button>
        </div>
      </form>
    </SlideDrawer>
  )
}
```

- [ ] **Step 3: Create ClientsTable**

```typescript
// src/components/clients/ClientsTable.tsx
'use client'

import { useState } from 'react'
import { Plus, MoreHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ClientDrawer } from './ClientDrawer'
import { deleteClient } from '@/app/(dashboard)/clients/actions'
import type { ClientWithCampaignCount } from '@/types/models'

const COLUMNS = ['Name', 'Contact', 'Email', 'Campaigns', '']

interface ClientsTableProps {
  clients: ClientWithCampaignCount[]
}

export function ClientsTable({ clients }: ClientsTableProps) {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [selected, setSelected] = useState<ClientWithCampaignCount | null>(null)

  const openEdit = (client: ClientWithCampaignCount) => {
    setSelected(client)
    setDrawerOpen(true)
  }

  const openCreate = () => {
    setSelected(null)
    setDrawerOpen(true)
  }

  return (
    <div className="glass-panel rounded-3xl overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/5">
        <h2 className="text-sm font-semibold text-white">
          All Clients
          <span className="ml-2 font-mono text-[10px] bg-accent/10 text-accent px-2 py-0.5 rounded-full">
            {clients.length}
          </span>
        </h2>
        <Button
          onClick={openCreate}
          size="sm"
          className="bg-gradient-to-r from-accent to-cyan-600 text-black font-semibold rounded-xl shadow-xl shadow-accent/30 hover:opacity-90"
        >
          <Plus className="w-4 h-4 mr-1.5" />
          New Client
        </Button>
      </div>

      {/* Column headers */}
      <div className="grid grid-cols-[2fr_1.5fr_2fr_100px_44px] gap-4 px-6 py-3 border-b border-white/5">
        {COLUMNS.map((col) => (
          <span
            key={col}
            className="text-xs font-bold uppercase tracking-wider text-gray-500"
          >
            {col}
          </span>
        ))}
      </div>

      {/* Empty state */}
      {clients.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20">
          <p className="text-sm text-gray-500 mb-4">No clients yet</p>
          <Button
            variant="outline"
            size="sm"
            onClick={openCreate}
            className="border-dashed border-white/10 text-gray-500 hover:text-white hover:border-white/20 rounded-xl"
          >
            <Plus className="w-4 h-4 mr-1.5" />
            Add your first client
          </Button>
        </div>
      )}

      {/* Rows */}
      <div className="divide-y divide-white/5">
        {clients.map((client) => (
          <div
            key={client.id}
            onClick={() => openEdit(client)}
            className="grid grid-cols-[2fr_1.5fr_2fr_100px_44px] gap-4 px-6 py-4 items-center cursor-pointer hover:bg-white/[0.02] transition-colors duration-200"
          >
            <span className="text-sm font-medium text-white truncate">
              {client.name}
            </span>
            <span className="text-sm text-gray-400 truncate">
              {client.contactName ?? '—'}
            </span>
            <span className="text-sm text-gray-400 truncate">
              {client.email ?? '—'}
            </span>
            <Badge className="font-mono text-[10px] bg-accent/10 text-accent border-0 w-fit">
              {client._count.campaigns}
            </Badge>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="w-8 h-8 rounded-lg text-gray-500 hover:text-white"
                  onClick={(e) => e.stopPropagation()}
                >
                  <MoreHorizontal className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="rounded-xl border-white/10"
                style={{ backgroundColor: '#161c26' }}
              >
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation()
                    openEdit(client)
                  }}
                  className="text-gray-300 hover:text-white rounded-lg"
                >
                  Edit
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation()
                    deleteClient(client.id)
                  }}
                  className="text-red-400 hover:text-red-300 focus:text-red-300 rounded-lg"
                >
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ))}
      </div>

      <ClientDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        client={selected}
      />
    </div>
  )
}
```

- [ ] **Step 4: Create clients page**

```typescript
// src/app/(dashboard)/clients/page.tsx
import { redirect } from 'next/navigation'
import { Header } from '@/components/layout/Header'
import { PageShell } from '@/components/layout/PageShell'
import { ClientsTable } from '@/components/clients/ClientsTable'
import { db, withTenant } from '@/lib/db'
import { getCurrentTenantId, requirePermission } from '@/lib/auth'

async function getClients(tenantId: string) {
  return withTenant(tenantId, () =>
    db.client.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: { campaigns: { where: { deletedAt: null } } },
        },
      },
    })
  )
}

export default async function ClientsPage() {
  const tenantId = await getCurrentTenantId()
  if (!tenantId) redirect('/sign-in')

  try {
    await requirePermission('clients:read')
  } catch {
    redirect('/')
  }

  const clients = await getClients(tenantId)

  return (
    <>
      <Header title="Clients" subtitle="Manage your agency clients" />
      <PageShell>
        <ClientsTable clients={clients} />
      </PageShell>
    </>
  )
}
```

- [ ] **Step 5: Create API routes for clients**

```typescript
// src/app/api/clients/route.ts
import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { db, withTenant } from '@/lib/db'
import { hasPermission } from '@/lib/auth'

const CreateClientSchema = z.object({
  name: z.string().min(1),
  contactName: z.string().optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  website: z.string().url().optional(),
})

function getClerkMeta(sessionClaims: unknown) {
  const meta = (sessionClaims as Record<string, unknown>)?.publicMetadata as
    | { role?: string; tenantId?: string }
    | undefined
  return { role: meta?.role ?? '', tenantId: meta?.tenantId }
}

export async function GET(request: Request) {
  const { userId, sessionClaims } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { role, tenantId } = getClerkMeta(sessionClaims)
  if (!hasPermission(role, 'clients:read') || !tenantId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const cursor = searchParams.get('cursor')
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '25', 10), 100)

  const clients = await withTenant(tenantId, () =>
    db.client.findMany({
      take: limit,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { campaigns: true } } },
    })
  )

  const nextCursor = clients.length === limit ? clients[clients.length - 1].id : null
  return NextResponse.json({ data: clients, nextCursor })
}

export async function POST(request: Request) {
  const { userId, sessionClaims } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { role, tenantId } = getClerkMeta(sessionClaims)
  if (!hasPermission(role, 'clients:write') || !tenantId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json()
  const result = CreateClientSchema.safeParse(body)
  if (!result.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: result.error.flatten() },
      { status: 400 }
    )
  }

  const client = await withTenant(tenantId, () =>
    db.client.create({ data: result.data })
  )

  return NextResponse.json({ data: client }, { status: 201 })
}
```

```typescript
// src/app/api/clients/[id]/route.ts
import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { db, withTenant } from '@/lib/db'
import { hasPermission } from '@/lib/auth'

const UpdateClientSchema = z.object({
  name: z.string().min(1).optional(),
  contactName: z.string().optional().nullable(),
  email: z.string().email().optional().nullable(),
  phone: z.string().optional().nullable(),
  website: z.string().url().optional().nullable(),
})

function getClerkMeta(sessionClaims: unknown) {
  const meta = (sessionClaims as Record<string, unknown>)?.publicMetadata as
    | { role?: string; tenantId?: string }
    | undefined
  return { role: meta?.role ?? '', tenantId: meta?.tenantId }
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const { userId, sessionClaims } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { role, tenantId } = getClerkMeta(sessionClaims)
  if (!hasPermission(role, 'clients:write') || !tenantId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json()
  const result = UpdateClientSchema.safeParse(body)
  if (!result.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: result.error.flatten() },
      { status: 400 }
    )
  }

  const client = await withTenant(tenantId, () =>
    db.client.update({ where: { id: params.id }, data: result.data })
  )

  return NextResponse.json({ data: client })
}

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const { userId, sessionClaims } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { role, tenantId } = getClerkMeta(sessionClaims)
  if (!hasPermission(role, 'clients:write') || !tenantId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  await withTenant(tenantId, () =>
    db.client.update({
      where: { id: params.id },
      data: { deletedAt: new Date() },
    })
  )

  return NextResponse.json({ data: { success: true } })
}
```

- [ ] **Step 6: Test clients flow in browser**

```bash
npm run dev
```

Navigate to http://localhost:3000/clients. Expect: glass-panel table with "No clients yet" empty state. Click "New Client" → drawer slides in from right. Fill form, submit. Expect: client appears in table, drawer closes. Click client row → edit drawer opens with prefilled data. Click "..." menu → Delete → client disappears.

- [ ] **Step 7: Commit**

```bash
git add src/app/(dashboard)/clients/ src/components/clients/ src/app/api/clients/
git commit -m "Add Clients CRUD: list page, drawer, server actions, and API routes"
```

---

## Task 17: Campaigns CRUD — Page + Drawer + SDR Assignment + Server Actions + API Routes

**Files:**
- Create: `src/app/(dashboard)/campaigns/page.tsx`
- Create: `src/app/(dashboard)/campaigns/actions.ts`
- Create: `src/components/campaigns/CampaignsTable.tsx`
- Create: `src/components/campaigns/CampaignDrawer.tsx`
- Create: `src/components/campaigns/SDRSelector.tsx`
- Create: `src/app/api/campaigns/route.ts`
- Create: `src/app/api/campaigns/[id]/route.ts`

- [ ] **Step 1: Create campaign server actions**

```typescript
// src/app/(dashboard)/campaigns/actions.ts
'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { db, withTenant } from '@/lib/db'
import { getCurrentTenantId, requirePermission } from '@/lib/auth'

const CampaignSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  clientId: z.string().min(1, 'Client is required'),
  status: z.enum(['draft', 'active', 'paused', 'completed']).default('draft'),
  dailyTargetCalls: z.number().int().positive().nullable().optional(),
  sdrIds: z.array(z.string()).default([]),
})

export type CampaignFormData = z.infer<typeof CampaignSchema>

export async function createCampaign(data: CampaignFormData) {
  await requirePermission('campaigns:write')
  const tenantId = await getCurrentTenantId()
  if (!tenantId) throw new Error('No tenant context')

  const parsed = CampaignSchema.parse(data)

  await withTenant(tenantId, async () => {
    const campaign = await db.campaign.create({
      data: {
        name: parsed.name,
        clientId: parsed.clientId,
        status: parsed.status,
        dailyTargetCalls: parsed.dailyTargetCalls ?? null,
      },
    })

    if (parsed.sdrIds.length > 0) {
      await db.campaignSDR.createMany({
        data: parsed.sdrIds.map((userId) => ({
          campaignId: campaign.id,
          userId,
        })),
        skipDuplicates: true,
      })
    }
  })

  revalidatePath('/campaigns')
}

export async function updateCampaign(id: string, data: CampaignFormData) {
  await requirePermission('campaigns:write')
  const tenantId = await getCurrentTenantId()
  if (!tenantId) throw new Error('No tenant context')

  const parsed = CampaignSchema.parse(data)

  await withTenant(tenantId, async () => {
    await db.campaign.update({
      where: { id },
      data: {
        name: parsed.name,
        clientId: parsed.clientId,
        status: parsed.status,
        dailyTargetCalls: parsed.dailyTargetCalls ?? null,
      },
    })

    // Replace all SDR assignments atomically
    await db.campaignSDR.deleteMany({ where: { campaignId: id } })

    if (parsed.sdrIds.length > 0) {
      await db.campaignSDR.createMany({
        data: parsed.sdrIds.map((userId) => ({ campaignId: id, userId })),
        skipDuplicates: true,
      })
    }
  })

  revalidatePath('/campaigns')
}

export async function deleteCampaign(id: string) {
  await requirePermission('campaigns:write')
  const tenantId = await getCurrentTenantId()
  if (!tenantId) throw new Error('No tenant context')

  await withTenant(tenantId, () =>
    db.campaign.update({
      where: { id },
      data: { deletedAt: new Date() },
    })
  )

  revalidatePath('/campaigns')
}
```

- [ ] **Step 2: Create SDRSelector component**

```typescript
// src/components/campaigns/SDRSelector.tsx
'use client'

import { Checkbox } from '@/components/ui/checkbox'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import type { UserSummary } from '@/types/models'

interface SDRSelectorProps {
  sdrs: UserSummary[]
  selectedIds: string[]
  onChange: (ids: string[]) => void
}

export function SDRSelector({ sdrs, selectedIds, onChange }: SDRSelectorProps) {
  const toggle = (id: string) => {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter((s) => s !== id))
    } else {
      onChange([...selectedIds, id])
    }
  }

  if (sdrs.length === 0) {
    return (
      <p className="text-xs text-gray-500 py-4 text-center">
        No SDRs in this tenant yet
      </p>
    )
  }

  return (
    <div className="space-y-1 max-h-48 overflow-y-auto custom-scrollbar">
      {sdrs.map((sdr) => {
        const checked = selectedIds.includes(sdr.id)
        return (
          <label
            key={sdr.id}
            className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-white/5 cursor-pointer border border-transparent hover:border-white/10 transition-colors duration-200"
          >
            <Checkbox
              checked={checked}
              onCheckedChange={() => toggle(sdr.id)}
              className="border-white/20 data-[state=checked]:border-accent data-[state=checked]:bg-accent/20"
            />
            <Avatar className="w-7 h-7 rounded-lg flex-shrink-0">
              <AvatarFallback className="text-xs rounded-lg bg-white/5 text-gray-400">
                {sdr.name.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="text-sm text-gray-300 truncate">{sdr.name}</p>
              <p className="text-[10px] text-gray-600 truncate">{sdr.email}</p>
            </div>
          </label>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 3: Create CampaignDrawer**

```typescript
// src/components/campaigns/CampaignDrawer.tsx
'use client'

import { useEffect, useState } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { SlideDrawer } from '@/components/shared/SlideDrawer'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { SDRSelector } from './SDRSelector'
import { createCampaign, updateCampaign } from '@/app/(dashboard)/campaigns/actions'
import type { CampaignWithDetails, UserSummary } from '@/types/models'
import type { Client } from '@prisma/client'

const CampaignSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  clientId: z.string().min(1, 'Client is required'),
  status: z.enum(['draft', 'active', 'paused', 'completed']).default('draft'),
  dailyTargetCalls: z.number().int().positive().nullable().optional(),
  sdrIds: z.array(z.string()).default([]),
})

type CampaignFormData = z.infer<typeof CampaignSchema>

interface CampaignDrawerProps {
  open: boolean
  onClose: () => void
  campaign: CampaignWithDetails | null
  clients: Pick<Client, 'id' | 'name'>[]
  sdrs: UserSummary[]
}

const inputClass =
  'bg-white/5 border-white/10 text-white placeholder:text-gray-600 focus:border-accent/50 focus:ring-1 focus:ring-accent/10 rounded-xl'

const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  active: 'Active',
  paused: 'Paused',
  completed: 'Completed',
}

export function CampaignDrawer({
  open,
  onClose,
  campaign,
  clients,
  sdrs,
}: CampaignDrawerProps) {
  const [sdrIds, setSdrIds] = useState<string[]>([])

  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors, isSubmitting },
  } = useForm<CampaignFormData>({ resolver: zodResolver(CampaignSchema) })

  useEffect(() => {
    if (campaign) {
      reset({
        name: campaign.name,
        clientId: campaign.clientId,
        status: campaign.status,
        dailyTargetCalls: campaign.dailyTargetCalls ?? undefined,
        sdrIds: campaign.sdrs.map((s) => s.userId),
      })
      setSdrIds(campaign.sdrs.map((s) => s.userId))
    } else {
      reset({
        name: '',
        clientId: '',
        status: 'draft',
        dailyTargetCalls: undefined,
        sdrIds: [],
      })
      setSdrIds([])
    }
  }, [campaign, reset, open])

  const onSubmit = async (data: CampaignFormData) => {
    const payload = { ...data, sdrIds }
    if (campaign) {
      await updateCampaign(campaign.id, payload)
    } else {
      await createCampaign(payload)
    }
    onClose()
  }

  return (
    <SlideDrawer
      open={open}
      onClose={onClose}
      title={campaign ? 'Edit Campaign' : 'New Campaign'}
    >
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col flex-1 overflow-hidden">
        <div className="flex-1 overflow-y-auto p-6 space-y-5 custom-scrollbar">
          {/* Name */}
          <div className="space-y-1.5">
            <Label className="text-xs text-gray-400">Campaign Name *</Label>
            <Input {...register('name')} placeholder="Q1 Outreach" className={inputClass} />
            {errors.name && (
              <p className="text-xs text-danger">{errors.name.message}</p>
            )}
          </div>

          {/* Client */}
          <div className="space-y-1.5">
            <Label className="text-xs text-gray-400">Client *</Label>
            <Controller
              name="clientId"
              control={control}
              render={({ field }) => (
                <Select onValueChange={field.onChange} value={field.value}>
                  <SelectTrigger className={inputClass}>
                    <SelectValue placeholder="Select a client…" />
                  </SelectTrigger>
                  <SelectContent
                    className="rounded-xl border-white/10"
                    style={{ backgroundColor: '#161c26' }}
                  >
                    {clients.map((c) => (
                      <SelectItem
                        key={c.id}
                        value={c.id}
                        className="text-gray-300 focus:bg-white/5 focus:text-white rounded-lg"
                      >
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {errors.clientId && (
              <p className="text-xs text-danger">{errors.clientId.message}</p>
            )}
          </div>

          {/* Status */}
          <div className="space-y-1.5">
            <Label className="text-xs text-gray-400">Status</Label>
            <Controller
              name="status"
              control={control}
              render={({ field }) => (
                <Select onValueChange={field.onChange} value={field.value}>
                  <SelectTrigger className={inputClass}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent
                    className="rounded-xl border-white/10"
                    style={{ backgroundColor: '#161c26' }}
                  >
                    {Object.entries(STATUS_LABELS).map(([value, label]) => (
                      <SelectItem
                        key={value}
                        value={value}
                        className="text-gray-300 focus:bg-white/5 focus:text-white rounded-lg"
                      >
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>

          {/* Daily Target */}
          <div className="space-y-1.5">
            <Label className="text-xs text-gray-400">Daily Target Calls</Label>
            <Input
              {...register('dailyTargetCalls', { valueAsNumber: true })}
              type="number"
              min={1}
              placeholder="e.g. 50"
              className={inputClass}
            />
          </div>

          {/* SDR Assignment */}
          <div className="space-y-2">
            <Label className="text-xs text-gray-400">Assign SDRs</Label>
            <SDRSelector
              sdrs={sdrs}
              selectedIds={sdrIds}
              onChange={setSdrIds}
            />
          </div>
        </div>

        <div className="flex-shrink-0 border-t border-white/5 p-6 flex gap-3">
          <Button
            type="submit"
            disabled={isSubmitting}
            className="flex-1 bg-gradient-to-r from-accent to-cyan-600 text-black font-semibold rounded-xl shadow-xl shadow-accent/30 hover:opacity-90"
          >
            {isSubmitting ? 'Saving…' : campaign ? 'Save Changes' : 'Create Campaign'}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            className="bg-white/5 border-white/10 text-gray-300 hover:bg-white/10 rounded-xl"
          >
            Cancel
          </Button>
        </div>
      </form>
    </SlideDrawer>
  )
}
```

- [ ] **Step 4: Create CampaignsTable**

```typescript
// src/components/campaigns/CampaignsTable.tsx
'use client'

import { useState } from 'react'
import { Plus, MoreHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { CampaignDrawer } from './CampaignDrawer'
import { deleteCampaign } from '@/app/(dashboard)/campaigns/actions'
import type { CampaignWithDetails, UserSummary } from '@/types/models'
import type { Client } from '@prisma/client'

const STATUS_STYLES: Record<string, string> = {
  draft:     'bg-gray-500/10 text-gray-400',
  active:    'bg-success/10 text-success',
  paused:    'bg-warning/10 text-warning',
  completed: 'bg-info/10 text-info',
}

interface CampaignsTableProps {
  campaigns: CampaignWithDetails[]
  clients: Pick<Client, 'id' | 'name'>[]
  sdrs: UserSummary[]
}

export function CampaignsTable({ campaigns, clients, sdrs }: CampaignsTableProps) {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [selected, setSelected] = useState<CampaignWithDetails | null>(null)

  const openEdit = (campaign: CampaignWithDetails) => {
    setSelected(campaign)
    setDrawerOpen(true)
  }

  const openCreate = () => {
    setSelected(null)
    setDrawerOpen(true)
  }

  return (
    <div className="glass-panel rounded-3xl overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/5">
        <h2 className="text-sm font-semibold text-white">
          All Campaigns
          <span className="ml-2 font-mono text-[10px] bg-accent/10 text-accent px-2 py-0.5 rounded-full">
            {campaigns.length}
          </span>
        </h2>
        <Button
          onClick={openCreate}
          size="sm"
          className="bg-gradient-to-r from-accent to-cyan-600 text-black font-semibold rounded-xl shadow-xl shadow-accent/30 hover:opacity-90"
        >
          <Plus className="w-4 h-4 mr-1.5" />
          New Campaign
        </Button>
      </div>

      {/* Column headers */}
      <div className="grid grid-cols-[2fr_1.5fr_100px_120px_100px_44px] gap-4 px-6 py-3 border-b border-white/5">
        {['Name', 'Client', 'Status', 'SDRs', 'Target', ''].map((col) => (
          <span key={col} className="text-xs font-bold uppercase tracking-wider text-gray-500">
            {col}
          </span>
        ))}
      </div>

      {/* Empty state */}
      {campaigns.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20">
          <p className="text-sm text-gray-500 mb-4">No campaigns yet</p>
          <Button
            variant="outline"
            size="sm"
            onClick={openCreate}
            className="border-dashed border-white/10 text-gray-500 hover:text-white hover:border-white/20 rounded-xl"
          >
            <Plus className="w-4 h-4 mr-1.5" />
            Create your first campaign
          </Button>
        </div>
      )}

      {/* Rows */}
      <div className="divide-y divide-white/5">
        {campaigns.map((campaign) => {
          const visibleSdrs = campaign.sdrs.slice(0, 3)
          const overflowCount = campaign.sdrs.length - visibleSdrs.length

          return (
            <div
              key={campaign.id}
              onClick={() => openEdit(campaign)}
              className="grid grid-cols-[2fr_1.5fr_100px_120px_100px_44px] gap-4 px-6 py-4 items-center cursor-pointer hover:bg-white/[0.02] transition-colors duration-200"
            >
              <span className="text-sm font-medium text-white truncate">
                {campaign.name}
              </span>
              <span className="text-sm text-gray-400 truncate">
                {campaign.client.name}
              </span>
              <Badge
                className={`text-[10px] font-semibold uppercase border-0 w-fit ${STATUS_STYLES[campaign.status]}`}
              >
                {campaign.status}
              </Badge>
              {/* SDR avatar stack */}
              <div className="flex items-center -space-x-2">
                {visibleSdrs.map((s) => (
                  <Avatar
                    key={s.userId}
                    className="w-7 h-7 rounded-full border border-dark"
                  >
                    <AvatarFallback className="text-[10px] bg-white/10 text-gray-300">
                      {s.user.name.slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                ))}
                {overflowCount > 0 && (
                  <div className="w-7 h-7 rounded-full border border-dark bg-white/10 flex items-center justify-center">
                    <span className="text-[10px] text-gray-400 font-mono">
                      +{overflowCount}
                    </span>
                  </div>
                )}
                {campaign.sdrs.length === 0 && (
                  <span className="text-xs text-gray-600">—</span>
                )}
              </div>
              <span className="font-mono text-sm text-gray-400">
                {campaign.dailyTargetCalls ?? '—'}
              </span>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="w-8 h-8 rounded-lg text-gray-500 hover:text-white"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <MoreHorizontal className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  className="rounded-xl border-white/10"
                  style={{ backgroundColor: '#161c26' }}
                >
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.stopPropagation()
                      openEdit(campaign)
                    }}
                    className="text-gray-300 hover:text-white rounded-lg"
                  >
                    Edit
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.stopPropagation()
                      deleteCampaign(campaign.id)
                    }}
                    className="text-red-400 hover:text-red-300 focus:text-red-300 rounded-lg"
                  >
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )
        })}
      </div>

      <CampaignDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        campaign={selected}
        clients={clients}
        sdrs={sdrs}
      />
    </div>
  )
}
```

- [ ] **Step 5: Create campaigns page**

```typescript
// src/app/(dashboard)/campaigns/page.tsx
import { redirect } from 'next/navigation'
import { Header } from '@/components/layout/Header'
import { PageShell } from '@/components/layout/PageShell'
import { CampaignsTable } from '@/components/campaigns/CampaignsTable'
import { db, withTenant } from '@/lib/db'
import { getCurrentTenantId, getCurrentUserRole, hasPermission } from '@/lib/auth'

async function getPageData(tenantId: string, role: string) {
  return withTenant(tenantId, async () => {
    const campaigns = await db.campaign.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        client: { select: { id: true, name: true } },
        sdrs: {
          include: { user: { select: { id: true, name: true, email: true } } },
        },
      },
    })

    const clients = hasPermission(role, 'clients:read')
      ? await db.client.findMany({
          select: { id: true, name: true },
          orderBy: { name: 'asc' },
        })
      : []

    const sdrs = hasPermission(role, 'sdrs:manage')
      ? await db.user.findMany({
          where: { role: 'sdr' },
          select: { id: true, name: true, email: true, role: true },
          orderBy: { name: 'asc' },
        })
      : []

    return { campaigns, clients, sdrs }
  })
}

export default async function CampaignsPage() {
  const tenantId = await getCurrentTenantId()
  if (!tenantId) redirect('/sign-in')

  const role = await getCurrentUserRole()
  if (!role || !hasPermission(role, 'campaigns:read')) redirect('/')

  const { campaigns, clients, sdrs } = await getPageData(tenantId, role)

  return (
    <>
      <Header title="Campaigns" subtitle="Manage outreach campaigns and SDR assignments" />
      <PageShell>
        <CampaignsTable campaigns={campaigns} clients={clients} sdrs={sdrs} />
      </PageShell>
    </>
  )
}
```

- [ ] **Step 6: Create API routes for campaigns**

```typescript
// src/app/api/campaigns/route.ts
import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { db, withTenant } from '@/lib/db'
import { hasPermission } from '@/lib/auth'

const CreateCampaignSchema = z.object({
  name: z.string().min(1),
  clientId: z.string().min(1),
  status: z.enum(['draft', 'active', 'paused', 'completed']).default('draft'),
  dailyTargetCalls: z.number().int().positive().optional(),
})

function getClerkMeta(sessionClaims: unknown) {
  const meta = (sessionClaims as Record<string, unknown>)?.publicMetadata as
    | { role?: string; tenantId?: string }
    | undefined
  return { role: meta?.role ?? '', tenantId: meta?.tenantId }
}

export async function GET(request: Request) {
  const { userId, sessionClaims } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { role, tenantId } = getClerkMeta(sessionClaims)
  if (!hasPermission(role, 'campaigns:read') || !tenantId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const cursor = searchParams.get('cursor')
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '25', 10), 100)

  const campaigns = await withTenant(tenantId, () =>
    db.campaign.findMany({
      take: limit,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { createdAt: 'desc' },
      include: {
        client: { select: { id: true, name: true } },
        sdrs: { include: { user: { select: { id: true, name: true, email: true } } } },
      },
    })
  )

  const nextCursor = campaigns.length === limit ? campaigns[campaigns.length - 1].id : null
  return NextResponse.json({ data: campaigns, nextCursor })
}

export async function POST(request: Request) {
  const { userId, sessionClaims } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { role, tenantId } = getClerkMeta(sessionClaims)
  if (!hasPermission(role, 'campaigns:write') || !tenantId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json()
  const result = CreateCampaignSchema.safeParse(body)
  if (!result.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: result.error.flatten() },
      { status: 400 }
    )
  }

  const campaign = await withTenant(tenantId, () =>
    db.campaign.create({ data: result.data })
  )

  return NextResponse.json({ data: campaign }, { status: 201 })
}
```

```typescript
// src/app/api/campaigns/[id]/route.ts
import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { db, withTenant } from '@/lib/db'
import { hasPermission } from '@/lib/auth'

const UpdateCampaignSchema = z.object({
  name: z.string().min(1).optional(),
  clientId: z.string().optional(),
  status: z.enum(['draft', 'active', 'paused', 'completed']).optional(),
  dailyTargetCalls: z.number().int().positive().nullable().optional(),
})

function getClerkMeta(sessionClaims: unknown) {
  const meta = (sessionClaims as Record<string, unknown>)?.publicMetadata as
    | { role?: string; tenantId?: string }
    | undefined
  return { role: meta?.role ?? '', tenantId: meta?.tenantId }
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const { userId, sessionClaims } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { role, tenantId } = getClerkMeta(sessionClaims)
  if (!hasPermission(role, 'campaigns:write') || !tenantId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json()
  const result = UpdateCampaignSchema.safeParse(body)
  if (!result.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: result.error.flatten() },
      { status: 400 }
    )
  }

  const campaign = await withTenant(tenantId, () =>
    db.campaign.update({ where: { id: params.id }, data: result.data })
  )

  return NextResponse.json({ data: campaign })
}

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const { userId, sessionClaims } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { role, tenantId } = getClerkMeta(sessionClaims)
  if (!hasPermission(role, 'campaigns:write') || !tenantId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  await withTenant(tenantId, () =>
    db.campaign.update({
      where: { id: params.id },
      data: { deletedAt: new Date() },
    })
  )

  return NextResponse.json({ data: { success: true } })
}
```

- [ ] **Step 7: Test campaigns flow in browser**

```bash
npm run dev
```

Navigate to http://localhost:3000/campaigns. Expect: glass-panel table with "No campaigns yet" empty state. Click "New Campaign" → drawer slides in with name, client dropdown, status select, daily target, and SDR checklist. Create a client first if the dropdown is empty. Fill form, submit. Expect: campaign appears in table with status badge and SDR avatar stack. Click row → edit drawer with prefilled data and existing SDR selections. Delete via "..." menu.

- [ ] **Step 8: Run all tests**

```bash
npm run test:run
```

Expected: All unit tests (hasPermission + ui-store) PASS.

- [ ] **Step 9: Run TypeScript check**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 10: Final commit**

```bash
git add src/app/(dashboard)/campaigns/ src/components/campaigns/ src/app/api/campaigns/
git commit -m "Add Campaigns CRUD: list page, drawer, SDR assignment, server actions, and API routes"
```

---

## Phase 1 Complete ✓

At this point the following are working and testable:
- Next.js 14 App Router project with full LeadForce design system
- Custom Clerk auth pages (sign-in, sign-up, invite) styled to the design spec
- Clerk webhook setting role + tenantId on new users
- Prisma schema with Tenant/User/Client/Campaign + multi-tenancy middleware
- App shell: collapsible sidebar, sticky header, page shell
- Clients: list, create, edit, soft-delete (UI + server actions + API)
- Campaigns: list, create, edit, soft-delete, SDR assignment (UI + server actions + API)
- Unit tests for auth permission logic and Zustand store

**Next phase:** Phase 2 — CSV import, contacts page, AI company summary, contact detail drawer.
