# LeadForce CRM — Phase 1 Foundation Design

**Date:** 2026-04-19
**Scope:** Full Phase 1 — project scaffold, design system, auth, Prisma schema, app shell, basic CRUD
**Approach:** Feature-by-feature, full stack (Option B) — each layer complete before the next starts

---

## 1. Project Scaffold & Design System

### Stack
- Next.js 14 App Router + TypeScript
- Shadcn/UI (dark theme)
- Tailwind CSS with LeadForce design tokens
- Package manager: npm

### tailwind.config.ts extensions
```typescript
theme: {
  extend: {
    colors: {
      dark: "#0b0e14",
      card: "rgba(22, 28, 38, 0.6)",
      accent: "#00d4ff",
      success: "#10b981",
      warning: "#f59e0b",
      danger: "#ef4444",
      info: "#3b82f6",
    },
    fontFamily: {
      sans: ["Outfit", "sans-serif"],
      mono: ["JetBrains Mono", "monospace"],
    },
    borderRadius: {
      "3xl": "1.5rem",
      "4xl": "2rem",
    },
  },
}
```

### globals.css contents
- Google Fonts imports: Outfit (300–700) and JetBrains Mono (400–600)
- CSS custom properties: `--bg-dark`, `--card-bg`, `--card-bg-solid`, `--border`, `--border-hover`, `--text-primary`, `--text-secondary`, `--text-muted`, `--text-disabled`, `--accent`, `--accent-muted`, `--accent-glow`, `--success`, `--warning`, `--danger`, `--info`
- `.glass-panel` utility: `background: rgba(22,28,38,0.6); backdrop-filter: blur(12px); border: 1px solid rgba(255,255,255,0.08); box-shadow: 0 8px 32px 0 rgba(0,0,0,0.3)`
- `.custom-scrollbar` utility: 4px wide, transparent track, `rgba(255,255,255,0.1)` thumb
- Keyframe animations: `call-pulse` (green box-shadow), `pulse-cyan`, `pulse-amber`, `fade-in`, `slide-up`, `slide-in-right`, `waveform` (scaleY oscillation)
- `prefers-reduced-motion` block disabling pulse and waveform animations

---

## 2. Authentication

### Clerk configuration
- Keys stored in `.env.local` (`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`)
- `middleware.ts` at root: protects `/(dashboard)` and `/api/**`, redirects to `/sign-in`
- Roles stored as `publicMetadata.role`: `admin | manager | sdr | client`
- `src/lib/auth.ts` exports `hasPermission(userId, permission)` helper — reads Clerk `publicMetadata.role`

### Auth pages (`src/app/(auth)/`)
Three pages: `sign-in`, `sign-up`, `invite`

**Shared layout:** Full-screen `--bg-dark` background, centered column, LeadForce wordmark at top, glass-panel card (`max-w-md rounded-3xl`) containing the Clerk component.

**Styling via Clerk `appearance` prop:**
- Variables: dark background, `--border` borders, `--accent` primary color, Outfit font
- Elements: inputs with `border-white/10` and `bg-white/5`, primary button as cyan gradient, all text using design system colors

**Invite page:** Accepts `?role=` and `?token=` query params. Renders Clerk `<SignUp>` with the invite token pre-filled. A Clerk webhook (`/api/webhooks/clerk`) listens for `user.created` events and sets `publicMetadata.role` from the invite metadata.

---

## 3. Prisma Schema (Core Models)

### Connection
- Provider: `postgresql`
- URL: Supabase connection string in `.env.local` as `DATABASE_URL`

### Models

**Tenant**
```prisma
model Tenant {
  id        String   @id @default(cuid())
  name      String
  slug      String   @unique
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  users     User[]
  clients   Client[]
  campaigns Campaign[]
}
```

**User**
```prisma
model User {
  id        String    @id @default(cuid())
  clerkId   String    @unique
  tenantId  String
  email     String
  name      String
  role      UserRole
  managerId String?
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt
  deletedAt DateTime?
  tenant    Tenant    @relation(fields: [tenantId], references: [id])
  manager   User?     @relation("ManagerSDR", fields: [managerId], references: [id])
  reports   User[]    @relation("ManagerSDR")
  campaigns CampaignSDR[]
}
```

**Client**
```prisma
model Client {
  id          String    @id @default(cuid())
  tenantId    String
  name        String
  contactName String?
  email       String?
  phone       String?
  website     String?
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
  deletedAt   DateTime?
  tenant      Tenant    @relation(fields: [tenantId], references: [id])
  campaigns   Campaign[]
}
```

**Campaign**
```prisma
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
```

**CampaignSDR** (join table)
```prisma
model CampaignSDR {
  campaignId  String
  userId      String
  assignedAt  DateTime @default(now())
  campaign    Campaign @relation(fields: [campaignId], references: [id])
  user        User     @relation(fields: [userId], references: [id])
  @@id([campaignId, userId])
}
```

**Enums**
```prisma
enum UserRole { admin manager sdr client }
enum CampaignStatus { draft active paused completed }
```

### Multi-tenancy enforcement
Prisma middleware (`src/lib/db.ts`) intercepts all `findMany`, `findFirst`, `findUnique`, `update`, `delete` operations and automatically injects `tenantId` filtering. Tenant context is stored in Node.js `AsyncLocalStorage` and set at the start of each request (in middleware or a layout server component) from the authenticated Clerk user's `publicMetadata.tenantId`. Individual queries never need to pass `tenantId` manually.

---

## 4. App Shell

### Layout file: `src/app/(dashboard)/layout.tsx`
Full-height flex row: `<Sidebar />` (fixed left) + `<main>` (flex-1, overflow-y-auto, custom-scrollbar).

### Sidebar (`src/components/layout/Sidebar.tsx`)
- Width: `w-64` (expanded) / `w-16` (collapsed, icon-only)
- Background: `--bg-dark`, `border-r border-white/5`
- Collapse toggle stored in Zustand `ui-store` (`sidebarCollapsed` boolean)
- **Top section:** Logo mark + "LeadForce" wordmark (`text-xl font-bold`, white→gray gradient), `p-6`
- **Nav items** (`px-4 mt-4`): Dashboard, Campaigns, Contacts, Calling, Pipeline, Scripts, Schedule, Reports, Imports — each with Lucide icon + label. Active: `bg-white/5 text-accent`. Default: `text-gray-400 hover:text-white hover:bg-white/5 rounded-xl`
- **Daily Target widget** (above bottom section): glass-panel, shows the SDR's daily call target (from their active campaign's `dailyTargetCalls`) vs `0` actual (placeholder — real data wired in Phase 3), cyan progress bar on `bg-white/10` track, numbers in `font-mono`
- **Bottom:** Settings link, separated by `border-t border-white/5`

### Header (`src/components/layout/Header.tsx`)
- Height: `h-20`, sticky top-0, `border-b border-white/5`, `--bg-dark` background, `px-8`
- **Left:** `<PageTitle>` server component slot — page title (`text-xl font-semibold`) + muted subtitle
- **Right:** Org selector (`rounded-full`, Building2 icon, `bg-dark border border-white/10`) → Notification bell (Bell icon + red dot badge) → User avatar + name

### PageShell (`src/components/layout/PageShell.tsx`)
Thin wrapper: `<div className="p-8 space-y-8">`. All page content renders inside this.

### Zustand stores (`src/stores/`)
- `ui-store.ts`: `sidebarCollapsed`, `activeDrawer`, `drawerPayload`

---

## 5. Basic CRUD

All pages are server components by default. Mutations use Server Actions. Forms use `react-hook-form` + Zod. Create/edit UIs are 480px slide-in drawers (right edge). All pages restricted to `admin` and `manager` roles except campaign list for SDRs (read-only, filtered to assigned campaigns).

### Clients (`/clients`)
**List page:** Glass-panel table — columns: Name, Contact, Email, Campaigns (count badge), Created. Hover row: `hover:bg-white/[0.02]`. Row click opens edit drawer. "New Client" button (primary, top-right) opens create drawer.

**Create/Edit drawer:** Fields: Name (required), Contact Name, Email, Phone, Website. Footer: Save / Cancel. Server Action: `createClient` / `updateClient` → `revalidatePath('/clients')`. Soft delete via `...` row menu → `deleteClient` (sets `deletedAt`).

**Zod schema:**
```typescript
const ClientSchema = z.object({
  name: z.string().min(1),
  contactName: z.string().optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  website: z.string().url().optional(),
})
```

### Campaigns (`/campaigns`)
**List page:** Glass-panel table — columns: Name, Client (with client name), Status (badge), SDRs (avatar stack, max 3 + overflow count), Daily Target, Created. "New Campaign" button opens create drawer.

**Create/Edit drawer:** Fields: Name (required), Client (dropdown of tenant clients), Status (select), Daily Target (number input). SDR assignment section: scrollable checklist of tenant SDRs (`role = sdr`) with checkboxes, avatars, and names. Selected SDRs update `CampaignSDR` join table on save.

**Server Actions:** `createCampaign`, `updateCampaign`, `deleteCampaign`, `updateCampaignSDRs` → `revalidatePath('/campaigns')`.

### API Routes
Thin API layer mirrors server actions for future use:
- `GET /api/campaigns` — list with pagination (cursor-based, limit 25)
- `POST /api/campaigns` — create
- `PATCH /api/campaigns/[id]` — update
- `DELETE /api/campaigns/[id]` — soft delete
- Same pattern for `/api/clients`

All routes validate with Zod, return `{ data: T }` or `{ error: string }`, check auth via `hasPermission()`.

---

## Implementation Order

1. `npx create-next-app` scaffold + install dependencies
2. Tailwind config + globals.css (design tokens, glass-panel, animations)
3. Shadcn/UI init + configure dark theme
4. Clerk install + middleware + `.env.local`
5. Auth pages (sign-in, sign-up, invite) with Clerk appearance styling
6. Clerk webhook for role assignment
7. Prisma schema + Supabase connection + initial migration
8. `src/lib/db.ts` with tenantId middleware
9. `src/lib/auth.ts` with `hasPermission()` helper
10. Zustand stores (`ui-store`)
11. Sidebar component
12. Header component + PageShell
13. Dashboard layout wiring Sidebar + Header
14. Clients list page + drawer + server actions
15. Campaigns list page + drawer + server actions + SDR assignment
16. API routes for clients and campaigns
