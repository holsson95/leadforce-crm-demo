# Pipeline Settings & Permissions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `/settings/pipeline` for per-client stage management and `/settings/permissions` for fine-grained `pipeline:write` access control using a generic `PermissionOverride` model.

**Architecture:** A new `PermissionOverride` model stores per-user or per-role permission grants/denials. `resolvePermission(userId, tenantId, role, permission)` in `auth.ts` evaluates overrides in priority order (user → role → null/default). The pipeline settings page uses `@dnd-kit/sortable` (already installed) for drag-to-reorder; the permissions page has role-level toggles and a per-member override table. Default stages are seeded into every new client on creation.

**Tech Stack:** Next.js 14 App Router, Prisma, `@dnd-kit/core` + `@dnd-kit/sortable` v10, `@dnd-kit/utilities`, Zod, Vitest, Sonner (toasts).

---

## File Map

**New files:**
- `src/lib/pipeline-defaults.ts` — `DEFAULT_STAGES` constant + `seedDefaultStages` function
- `src/lib/__tests__/pipeline-defaults.test.ts`
- `src/lib/__tests__/resolve-permission.test.ts`
- `src/app/api/pipeline/stages/[id]/route.ts` — PATCH (update name/color) + DELETE
- `src/app/api/pipeline/stages/reorder/route.ts` — PATCH (batch reorder)
- `src/app/api/settings/permissions/route.ts` — GET + PUT (upsert override)
- `src/app/api/settings/permissions/[id]/route.ts` — DELETE
- `src/app/(dashboard)/settings/pipeline/page.tsx`
- `src/app/(dashboard)/settings/permissions/page.tsx`
- `src/components/settings/ColorSwatchPicker.tsx`
- `src/components/settings/AddStageForm.tsx`
- `src/components/settings/StageRow.tsx`
- `src/components/settings/PipelineStagesPanel.tsx`
- `src/components/settings/PermissionToggleRow.tsx`
- `src/components/settings/PermissionsPanel.tsx`

**Modified files:**
- `prisma/schema.prisma` — add `PermissionOverride` model + `permissionOverrides` relation on `Tenant`
- `src/lib/auth.ts` — add `resolvePermission` async function + `db` import
- `src/app/api/pipeline/stages/route.ts` — add `POST` handler
- `src/app/api/clients/route.ts` — seed default stages after client creation
- `src/components/pipeline/ClientSelector.tsx` — add optional `basePath` prop (defaults to `/pipeline`)
- `src/components/settings/SettingsNav.tsx` — add Pipeline + Permissions entries
- `src/app/(dashboard)/settings/layout.tsx` — update `ROLE_SECTIONS`

---

## Task 1: Schema — Add `PermissionOverride` Model

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add the model and Tenant relation to schema.prisma**

In `prisma/schema.prisma`, add `permissionOverrides PermissionOverride[]` to the `Tenant` model (after `sdrPermissions SdrPermission[]`):

```prisma
model Tenant {
  # ... existing fields ...
  sdrPermissions SdrPermission[]
  permissionOverrides PermissionOverride[]   // <-- add this line
}
```

Then add the new model at the bottom of the file (after `SdrPermission`):

```prisma
model PermissionOverride {
  id          String   @id @default(cuid())
  tenantId    String
  subjectType String   // "user" | "role"
  subjectId   String   // userId  OR  "manager" | "sdr"
  permission  String   // e.g., "pipeline:write"
  granted     Boolean
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  tenant      Tenant   @relation(fields: [tenantId], references: [id])

  @@unique([tenantId, subjectType, subjectId, permission])
  @@index([tenantId])
}
```

- [ ] **Step 2: Run migration**

```bash
npx prisma migrate dev --name add-permission-override
```

Expected output includes: `The following migration(s) have been applied:` and `migrations/..._add_permission_override/migration.sql`.

- [ ] **Step 3: Verify Prisma client regenerated**

```bash
npx prisma generate
```

Expected: `Generated Prisma Client` with no errors.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "Add PermissionOverride schema model"
```

---

## Task 2: `pipeline-defaults.ts` — Default Stages + Seeding

**Files:**
- Create: `src/lib/pipeline-defaults.ts`
- Create: `src/lib/__tests__/pipeline-defaults.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/__tests__/pipeline-defaults.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DEFAULT_STAGES, seedDefaultStages } from '../pipeline-defaults'

const mockCreateMany = vi.fn()

vi.mock('@/lib/db', () => ({
  db: {
    pipelineStage: { createMany: mockCreateMany },
  },
  withTenant: (_id: string, fn: () => unknown) => fn(),
}))

describe('DEFAULT_STAGES', () => {
  it('has 6 stages', () => {
    expect(DEFAULT_STAGES).toHaveLength(6)
  })

  it('has sequential positions starting at 0', () => {
    DEFAULT_STAGES.forEach((s, i) => expect(s.position).toBe(i))
  })

  it('every stage has a non-empty name', () => {
    DEFAULT_STAGES.forEach(s => expect(s.name.length).toBeGreaterThan(0))
  })

  it('every stage has a valid hex color', () => {
    DEFAULT_STAGES.forEach(s => expect(s.color).toMatch(/^#[0-9a-f]{6}$/i))
  })
})

describe('seedDefaultStages', () => {
  beforeEach(() => vi.clearAllMocks())

  it('calls db.pipelineStage.createMany with tenantId and clientId on each stage', async () => {
    await seedDefaultStages('tenant1', 'client1')
    expect(mockCreateMany).toHaveBeenCalledWith({
      data: DEFAULT_STAGES.map(s => ({
        ...s,
        tenantId: 'tenant1',
        clientId: 'client1',
      })),
    })
  })

  it('calls createMany exactly once', async () => {
    await seedDefaultStages('t', 'c')
    expect(mockCreateMany).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
npx vitest run src/lib/__tests__/pipeline-defaults.test.ts
```

Expected: FAIL with `Cannot find module '../pipeline-defaults'`.

- [ ] **Step 3: Implement `pipeline-defaults.ts`**

Create `src/lib/pipeline-defaults.ts`:

```typescript
import { db } from '@/lib/db'

export type DefaultStage = { name: string; color: string; position: number }

export const DEFAULT_STAGES: DefaultStage[] = [
  { name: 'Prospecting',    color: '#3b82f6', position: 0 },
  { name: 'Qualified',      color: '#8b5cf6', position: 1 },
  { name: 'Demo Scheduled', color: '#06b6d4', position: 2 },
  { name: 'Proposal Sent',  color: '#f59e0b', position: 3 },
  { name: 'Won',            color: '#22c55e', position: 4 },
  { name: 'Lost',           color: '#ef4444', position: 5 },
]

export async function seedDefaultStages(tenantId: string, clientId: string): Promise<void> {
  await db.pipelineStage.createMany({
    data: DEFAULT_STAGES.map(s => ({ ...s, tenantId, clientId })),
  })
}
```

- [ ] **Step 4: Run test to confirm it passes**

```bash
npx vitest run src/lib/__tests__/pipeline-defaults.test.ts
```

Expected: all 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/pipeline-defaults.ts src/lib/__tests__/pipeline-defaults.test.ts
git commit -m "Add pipeline default stages and seeding helper"
```

---

## Task 3: `resolvePermission` in `auth.ts`

**Files:**
- Modify: `src/lib/auth.ts`
- Create: `src/lib/__tests__/resolve-permission.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/__tests__/resolve-permission.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { resolvePermission } from '../auth'

const mockFindMany = vi.fn()

vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn(),
  currentUser: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
  db: {
    permissionOverride: { findMany: mockFindMany },
  },
}))

describe('resolvePermission', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns true for admin without hitting the database', async () => {
    const result = await resolvePermission('user1', 'tenant1', 'admin', 'pipeline:write')
    expect(result).toBe(true)
    expect(mockFindMany).not.toHaveBeenCalled()
  })

  it('returns the user-level override value when a user override exists', async () => {
    mockFindMany.mockResolvedValue([
      { subjectType: 'user', subjectId: 'user1', granted: true },
    ])
    const result = await resolvePermission('user1', 'tenant1', 'manager', 'pipeline:write')
    expect(result).toBe(true)
  })

  it('user-level override wins over role-level override', async () => {
    mockFindMany.mockResolvedValue([
      { subjectType: 'role', subjectId: 'sdr',   granted: true  },
      { subjectType: 'user', subjectId: 'user1', granted: false },
    ])
    const result = await resolvePermission('user1', 'tenant1', 'sdr', 'pipeline:write')
    expect(result).toBe(false)
  })

  it('returns role-level override when no user override exists', async () => {
    mockFindMany.mockResolvedValue([
      { subjectType: 'role', subjectId: 'manager', granted: false },
    ])
    const result = await resolvePermission('user1', 'tenant1', 'manager', 'pipeline:write')
    expect(result).toBe(false)
  })

  it('returns null when no overrides exist (caller uses role default)', async () => {
    mockFindMany.mockResolvedValue([])
    const result = await resolvePermission('user1', 'tenant1', 'sdr', 'pipeline:write')
    expect(result).toBeNull()
  })

  it('queries db with tenantId, permission, and both subjectId values', async () => {
    mockFindMany.mockResolvedValue([])
    await resolvePermission('user42', 'tenantX', 'manager', 'pipeline:write')
    expect(mockFindMany).toHaveBeenCalledWith({
      where: {
        tenantId:  'tenantX',
        permission: 'pipeline:write',
        subjectId:  { in: ['user42', 'manager'] },
      },
    })
  })
})
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
npx vitest run src/lib/__tests__/resolve-permission.test.ts
```

Expected: FAIL with `resolvePermission is not a function` (or similar).

- [ ] **Step 3: Add `resolvePermission` to `auth.ts`**

Add to `src/lib/auth.ts`:

At the top, after the existing imports, add:
```typescript
import { db } from '@/lib/db'
```

After the closing brace of `getClerkMeta`, add:

```typescript
export async function resolvePermission(
  userId:     string,
  tenantId:   string,
  role:       string,
  permission: string,
): Promise<boolean | null> {
  if (role === 'admin') return true

  const overrides = await db.permissionOverride.findMany({
    where: {
      tenantId,
      permission,
      subjectId: { in: [userId, role] },
    },
  })

  const userOverride = overrides.find(o => o.subjectType === 'user' && o.subjectId === userId)
  if (userOverride) return userOverride.granted

  const roleOverride = overrides.find(o => o.subjectType === 'role' && o.subjectId === role)
  if (roleOverride) return roleOverride.granted

  return null
}
```

- [ ] **Step 4: Run test to confirm it passes**

```bash
npx vitest run src/lib/__tests__/resolve-permission.test.ts
```

Expected: all 6 tests PASS.

- [ ] **Step 5: Run the existing auth tests to confirm nothing broke**

```bash
npx vitest run src/lib/__tests__/auth.test.ts
```

Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/auth.ts src/lib/__tests__/resolve-permission.test.ts
git commit -m "Add resolvePermission for fine-grained access control"
```

---

## Task 4: Pipeline Stage Write APIs (POST, PATCH, DELETE, Reorder)

**Files:**
- Modify: `src/app/api/pipeline/stages/route.ts` — add POST
- Create: `src/app/api/pipeline/stages/[id]/route.ts` — PATCH + DELETE
- Create: `src/app/api/pipeline/stages/reorder/route.ts` — PATCH

All write routes share the same permission check pattern. Hardcoded role defaults: `admin` and `manager` have `pipeline:write` by default; `sdr` does not.

```typescript
// permission check helper — copy into each route file
const canWrite = await resolvePermission(userId, tenantId, role, 'pipeline:write')
const granted  = canWrite !== null ? canWrite : (role === 'admin' || role === 'manager')
if (!granted) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
```

- [ ] **Step 1: Add POST to `src/app/api/pipeline/stages/route.ts`**

The file currently only has a GET handler. Add after it:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { db, withTenant } from '@/lib/db'
import { hasPermission, getClerkMeta, resolvePermission } from '@/lib/auth'
```

Replace the existing import line `import { hasPermission, getClerkMeta } from '@/lib/auth'` with the one above (adds `resolvePermission`).

Then add after the existing `GET` export:

```typescript
const CreateStageSchema = z.object({
  clientId: z.string().min(1),
  name:     z.string().min(1).max(80),
  color:    z.string().regex(/^#[0-9a-f]{6}$/i),
})

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { role, tenantId } = await getClerkMeta()
    if (!tenantId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const canWrite = await resolvePermission(userId, tenantId, role, 'pipeline:write')
    const granted  = canWrite !== null ? canWrite : (role === 'admin' || role === 'manager')
    if (!granted) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const body   = await req.json()
    const parsed = CreateStageSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid body', details: parsed.error.flatten() }, { status: 400 })
    }

    const { clientId, name, color } = parsed.data

    const count = await withTenant(tenantId, () =>
      db.pipelineStage.count({ where: { clientId } })
    )

    const stage = await withTenant(tenantId, () =>
      db.pipelineStage.create({
        data:   { tenantId, clientId, name, color, position: count },
        select: { id: true, name: true, color: true, position: true },
      })
    )

    return NextResponse.json({ data: stage }, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
```

- [ ] **Step 2: Create `src/app/api/pipeline/stages/[id]/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { db, withTenant } from '@/lib/db'
import { getClerkMeta, resolvePermission } from '@/lib/auth'

const UpdateStageSchema = z.object({
  name:  z.string().min(1).max(80).optional(),
  color: z.string().regex(/^#[0-9a-f]{6}$/i).optional(),
})

async function checkWriteAccess(userId: string, tenantId: string, role: string) {
  const canWrite = await resolvePermission(userId, tenantId, role, 'pipeline:write')
  return canWrite !== null ? canWrite : (role === 'admin' || role === 'manager')
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { userId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { role, tenantId } = await getClerkMeta()
    if (!tenantId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    if (!(await checkWriteAccess(userId, tenantId, role))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params
    const body   = await req.json()
    const parsed = UpdateStageSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid body', details: parsed.error.flatten() }, { status: 400 })
    }

    const stage = await withTenant(tenantId, () =>
      db.pipelineStage.update({
        where:  { id },
        data:   parsed.data,
        select: { id: true, name: true, color: true, position: true },
      })
    )

    return NextResponse.json({ data: stage })
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { userId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { role, tenantId } = await getClerkMeta()
    if (!tenantId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    if (!(await checkWriteAccess(userId, tenantId, role))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params

    const dealCount = await withTenant(tenantId, () =>
      db.pipelineDeal.count({ where: { stageId: id } })
    )
    if (dealCount > 0) {
      return NextResponse.json(
        { error: 'Stage has active deals — move or close them first' },
        { status: 409 },
      )
    }

    await withTenant(tenantId, () =>
      db.pipelineStage.delete({ where: { id } })
    )

    return NextResponse.json({ data: { success: true } })
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
```

- [ ] **Step 3: Create `src/app/api/pipeline/stages/reorder/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { db, withTenant } from '@/lib/db'
import { getClerkMeta, resolvePermission } from '@/lib/auth'

const ReorderSchema = z.object({
  clientId: z.string().min(1),
  stageIds: z.array(z.string()).min(1),
})

export async function PATCH(req: NextRequest) {
  try {
    const { userId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { role, tenantId } = await getClerkMeta()
    if (!tenantId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const canWrite = await resolvePermission(userId, tenantId, role, 'pipeline:write')
    if (!(canWrite !== null ? canWrite : (role === 'admin' || role === 'manager'))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body   = await req.json()
    const parsed = ReorderSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid body', details: parsed.error.flatten() }, { status: 400 })
    }

    const { clientId, stageIds } = parsed.data

    const existing = await withTenant(tenantId, () =>
      db.pipelineStage.findMany({
        where:  { clientId },
        select: { id: true },
      })
    )
    const existingIds = new Set(existing.map(s => s.id))
    if (!stageIds.every(id => existingIds.has(id))) {
      return NextResponse.json({ error: 'Invalid stage IDs' }, { status: 400 })
    }

    await withTenant(tenantId, () =>
      Promise.all(
        stageIds.map((id, position) =>
          db.pipelineStage.update({ where: { id }, data: { position } })
        )
      )
    )

    return NextResponse.json({ data: { success: true } })
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add src/app/api/pipeline/stages/route.ts src/app/api/pipeline/stages/[id]/route.ts src/app/api/pipeline/stages/reorder/route.ts
git commit -m "Add pipeline stage write APIs (POST, PATCH, DELETE, reorder)"
```

---

## Task 5: Seed Default Stages on Client Creation

**Files:**
- Modify: `src/app/api/clients/route.ts`

- [ ] **Step 1: Import `seedDefaultStages` and call it after client creation**

In `src/app/api/clients/route.ts`, add the import at the top:

```typescript
import { seedDefaultStages } from '@/lib/pipeline-defaults'
```

In the `POST` handler, replace:

```typescript
  const client = await withTenant(tenantId, () =>
    db.client.create({ data: { ...result.data, tenantId } })
  )

  return NextResponse.json({ data: client }, { status: 201 })
```

With:

```typescript
  const client = await withTenant(tenantId, () =>
    db.client.create({ data: { ...result.data, tenantId } })
  )

  await seedDefaultStages(tenantId, client.id)

  return NextResponse.json({ data: client }, { status: 201 })
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/clients/route.ts
git commit -m "Seed default pipeline stages when a client is created"
```

---

## Task 6: Permissions APIs (GET + PUT + DELETE)

**Files:**
- Create: `src/app/api/settings/permissions/route.ts`
- Create: `src/app/api/settings/permissions/[id]/route.ts`

- [ ] **Step 1: Create `src/app/api/settings/permissions/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { getClerkMeta } from '@/lib/auth'

const UpsertSchema = z.object({
  subjectType: z.enum(['user', 'role']),
  subjectId:   z.string().min(1),
  permission:  z.string().min(1),
  granted:     z.boolean(),
})

export async function GET() {
  try {
    const { userId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { role, tenantId } = await getClerkMeta()
    if (role !== 'admin' || !tenantId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const overrides = await db.permissionOverride.findMany({
      where:   { tenantId },
      select:  { id: true, subjectType: true, subjectId: true, permission: true, granted: true },
      orderBy: [{ subjectType: 'asc' }, { subjectId: 'asc' }],
    })

    return NextResponse.json({ data: overrides })
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { userId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { role, tenantId } = await getClerkMeta()
    if (role !== 'admin' || !tenantId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body   = await req.json()
    const parsed = UpsertSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid body', details: parsed.error.flatten() }, { status: 400 })
    }

    const { subjectType, subjectId, permission, granted } = parsed.data

    if (subjectType === 'user') {
      const user = await db.user.findFirst({ where: { id: subjectId, tenantId } })
      if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const override = await db.permissionOverride.upsert({
      where: {
        tenantId_subjectType_subjectId_permission: {
          tenantId, subjectType, subjectId, permission,
        },
      },
      create: { tenantId, subjectType, subjectId, permission, granted },
      update: { granted },
      select: { id: true, subjectType: true, subjectId: true, permission: true, granted: true },
    })

    return NextResponse.json({ data: override })
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
```

- [ ] **Step 2: Create `src/app/api/settings/permissions/[id]/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { getClerkMeta } from '@/lib/auth'

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { userId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { role, tenantId } = await getClerkMeta()
    if (role !== 'admin' || !tenantId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params

    const existing = await db.permissionOverride.findUnique({ where: { id } })
    if (!existing || existing.tenantId !== tenantId) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    await db.permissionOverride.delete({ where: { id } })

    return NextResponse.json({ data: { success: true } })
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/settings/permissions/route.ts src/app/api/settings/permissions/[id]/route.ts
git commit -m "Add permissions settings API (GET, PUT upsert, DELETE)"
```

---

## Task 7: `ColorSwatchPicker` Component

**Files:**
- Create: `src/components/settings/ColorSwatchPicker.tsx`

- [ ] **Step 1: Create the component**

```typescript
'use client'

interface ColorSwatchPickerProps {
  value:    string
  onChange: (color: string) => void
}

export const STAGE_COLORS = [
  '#3b82f6', '#8b5cf6', '#06b6d4', '#f59e0b',
  '#22c55e', '#ef4444', '#ec4899', '#f97316',
  '#14b8a6', '#84cc16', '#6366f1', '#94a3b8',
]

export function ColorSwatchPicker({ value, onChange }: ColorSwatchPickerProps) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {STAGE_COLORS.map(color => (
        <button
          key={color}
          type="button"
          onClick={() => onChange(color)}
          className={`w-5 h-5 rounded-full transition-transform ${
            value === color
              ? 'ring-2 ring-white ring-offset-1 ring-offset-[#0b0e14] scale-110'
              : 'hover:scale-110'
          }`}
          style={{ backgroundColor: color }}
          aria-label={`Select color ${color}`}
        />
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/settings/ColorSwatchPicker.tsx
git commit -m "Add ColorSwatchPicker with 12 predefined stage colors"
```

---

## Task 8: `StageRow` + `AddStageForm` Components

**Files:**
- Create: `src/components/settings/StageRow.tsx`
- Create: `src/components/settings/AddStageForm.tsx`

- [ ] **Step 1: Create `src/components/settings/StageRow.tsx`**

```typescript
'use client'

import { useState, useRef, useEffect } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, Trash2 } from 'lucide-react'
import type { PipelineStageRow } from '@/types/models'

interface StageRowProps {
  stage:    PipelineStageRow
  onSave:   (id: string, name: string) => Promise<void>
  onDelete: (id: string) => Promise<void>
}

export function StageRow({ stage, onSave, onDelete }: StageRowProps) {
  const [editing, setEditing] = useState(false)
  const [name,    setName]    = useState(stage.name)
  const [saving,  setSaving]  = useState(false)
  const inputRef              = useRef<HTMLInputElement>(null)

  const {
    attributes, listeners, setNodeRef,
    transform, transition, isDragging,
  } = useSortable({ id: stage.id })

  const style = {
    transform:  CSS.Transform.toString(transform),
    transition,
    opacity:    isDragging ? 0.5 : 1,
  }

  useEffect(() => {
    if (editing) inputRef.current?.focus()
  }, [editing])

  const handleSaveName = async () => {
    const trimmed = name.trim()
    if (!trimmed) { setName(stage.name); setEditing(false); return }
    if (trimmed === stage.name) { setEditing(false); return }
    setSaving(true)
    await onSave(stage.id, trimmed)
    setSaving(false)
    setEditing(false)
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/[0.03] border border-white/5 group"
    >
      <button
        {...attributes}
        {...listeners}
        className="text-gray-600 hover:text-gray-400 cursor-grab active:cursor-grabbing touch-none flex-shrink-0"
        aria-label="Drag to reorder"
      >
        <GripVertical className="w-4 h-4" />
      </button>

      <span
        className="w-3 h-3 rounded-full flex-shrink-0"
        style={{ backgroundColor: stage.color }}
      />

      {editing ? (
        <input
          ref={inputRef}
          value={name}
          onChange={e => setName(e.target.value)}
          onBlur={handleSaveName}
          onKeyDown={e => {
            if (e.key === 'Enter') handleSaveName()
            if (e.key === 'Escape') { setName(stage.name); setEditing(false) }
          }}
          disabled={saving}
          className="flex-1 bg-white/5 border border-accent/30 rounded-lg px-2 py-0.5 text-sm text-white focus:outline-none"
        />
      ) : (
        <span
          onClick={() => setEditing(true)}
          className="flex-1 text-sm text-white cursor-text hover:text-accent transition-colors"
        >
          {stage.name}
        </span>
      )}

      <button
        onClick={() => onDelete(stage.id)}
        className="opacity-0 group-hover:opacity-100 text-gray-600 hover:text-red-400 transition-all flex-shrink-0"
        aria-label={`Delete ${stage.name}`}
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Create `src/components/settings/AddStageForm.tsx`**

```typescript
'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'
import { ColorSwatchPicker, STAGE_COLORS } from './ColorSwatchPicker'

interface AddStageFormProps {
  onAdd: (name: string, color: string) => Promise<void>
}

export function AddStageForm({ onAdd }: AddStageFormProps) {
  const [open,   setOpen]   = useState(false)
  const [name,   setName]   = useState('')
  const [color,  setColor]  = useState(STAGE_COLORS[0])
  const [saving, setSaving] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    setSaving(true)
    await onAdd(trimmed, color)
    setSaving(false)
    setName('')
    setColor(STAGE_COLORS[0])
    setOpen(false)
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 mt-3 text-xs text-gray-500 hover:text-accent transition-colors"
      >
        <Plus className="w-3.5 h-3.5" />
        Add stage
      </button>
    )
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-3 p-4 rounded-xl bg-white/[0.03] border border-white/5 space-y-3"
    >
      <input
        autoFocus
        value={name}
        onChange={e => setName(e.target.value)}
        placeholder="Stage name"
        className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-accent/50"
      />
      <ColorSwatchPicker value={color} onChange={setColor} />
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={!name.trim() || saving}
          className="px-4 py-1.5 rounded-xl bg-gradient-to-r from-[#00d4ff] to-cyan-600 text-black text-xs font-semibold disabled:opacity-50"
        >
          {saving ? 'Adding…' : 'Add stage'}
        </button>
        <button
          type="button"
          onClick={() => { setOpen(false); setName(''); setColor(STAGE_COLORS[0]) }}
          className="px-4 py-1.5 rounded-xl bg-white/5 text-gray-400 text-xs hover:text-white transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/settings/StageRow.tsx src/components/settings/AddStageForm.tsx
git commit -m "Add StageRow and AddStageForm components for pipeline settings"
```

---

## Task 9: `PipelineStagesPanel` Component

**Files:**
- Create: `src/components/settings/PipelineStagesPanel.tsx`

- [ ] **Step 1: Create the component**

```typescript
'use client'

import { useState } from 'react'
import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  SortableContext,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable'
import { toast } from 'sonner'
import { StageRow } from './StageRow'
import { AddStageForm } from './AddStageForm'
import type { PipelineStageRow } from '@/types/models'

interface PipelineStagesPanelProps {
  clientId:      string
  initialStages: PipelineStageRow[]
}

export function PipelineStagesPanel({ clientId, initialStages }: PipelineStagesPanelProps) {
  const [stages,      setStages]      = useState(initialStages)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  )

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex  = stages.findIndex(s => s.id === String(active.id))
    const newIndex  = stages.findIndex(s => s.id === String(over.id))
    const reordered = arrayMove(stages, oldIndex, newIndex).map((s, i) => ({ ...s, position: i }))
    setStages(reordered)

    const res = await fetch('/api/pipeline/stages/reorder', {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ clientId, stageIds: reordered.map(s => s.id) }),
    })
    if (!res.ok) {
      setStages(stages)
      toast.error('Failed to reorder stages')
    }
  }

  const handleSave = async (id: string, name: string) => {
    const res = await fetch(`/api/pipeline/stages/${id}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ name }),
    })
    if (!res.ok) { toast.error('Failed to save stage'); return }
    const { data } = await res.json()
    setStages(prev => prev.map(s => s.id === id ? { ...s, ...data } : s))
    toast.success('Stage saved')
  }

  const handleDelete = async (id: string) => {
    setDeleteError(null)
    const res = await fetch(`/api/pipeline/stages/${id}`, { method: 'DELETE' })
    if (res.status === 409) {
      const body = await res.json()
      setDeleteError((body as { error?: string }).error ?? 'Cannot delete stage')
      return
    }
    if (!res.ok) { toast.error('Failed to delete stage'); return }
    setStages(prev => prev.filter(s => s.id !== id))
    toast.success('Stage deleted')
  }

  const handleAdd = async (name: string, color: string) => {
    const res = await fetch('/api/pipeline/stages', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ clientId, name, color }),
    })
    if (!res.ok) { toast.error('Failed to add stage'); return }
    const { data } = await res.json()
    setStages(prev => [...prev, data as PipelineStageRow])
    toast.success('Stage added')
  }

  return (
    <div>
      {deleteError && (
        <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
          {deleteError}
        </div>
      )}

      {stages.length === 0 ? (
        <p className="text-sm text-gray-500 py-2">
          No stages yet. Add your first stage below.
        </p>
      ) : (
        <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
          <SortableContext
            items={stages.map(s => s.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-2">
              {stages.map(stage => (
                <StageRow
                  key={stage.id}
                  stage={stage}
                  onSave={handleSave}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      <AddStageForm onAdd={handleAdd} />
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/settings/PipelineStagesPanel.tsx
git commit -m "Add PipelineStagesPanel with DnD reorder and CRUD"
```

---

## Task 10: `/settings/pipeline` Page

**Files:**
- Modify: `src/components/pipeline/ClientSelector.tsx` — add optional `basePath` prop
- Create: `src/app/(dashboard)/settings/pipeline/page.tsx`

- [ ] **Step 1: Add `basePath` prop to `ClientSelector`**

In `src/components/pipeline/ClientSelector.tsx`, update the interface and `onChange` handler:

```typescript
'use client'

import { useRouter } from 'next/navigation'

interface ClientSelectorProps {
  clients:          { id: string; name: string }[]
  selectedClientId: string
  basePath?:        string
}

export function ClientSelector({ clients, selectedClientId, basePath = '/pipeline' }: ClientSelectorProps) {
  const router = useRouter()

  return (
    <select
      value={selectedClientId}
      onChange={(e) => router.push(`${basePath}?clientId=${e.target.value}`)}
      className="bg-[#0b0e14] border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#00d4ff]/30"
    >
      {clients.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
        </option>
      ))}
    </select>
  )
}
```

- [ ] **Step 2: Create `src/app/(dashboard)/settings/pipeline/page.tsx`**

```typescript
import { redirect } from 'next/navigation'
import { auth } from '@clerk/nextjs/server'
import { Kanban, Shield } from 'lucide-react'
import { db, withTenant } from '@/lib/db'
import { getCurrentUserRole, getCurrentTenantId, resolvePermission } from '@/lib/auth'
import { ClientSelector } from '@/components/pipeline/ClientSelector'
import { PipelineStagesPanel } from '@/components/settings/PipelineStagesPanel'

export default async function PipelineSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ clientId?: string }>
}) {
  const tenantId = await getCurrentTenantId()
  if (!tenantId) redirect('/sign-in')

  const role = await getCurrentUserRole()
  if (!role || role === 'client') redirect('/')

  const { userId } = await auth()
  const canWrite   = await resolvePermission(userId!, tenantId, role, 'pipeline:write')
  const hasAccess  = canWrite !== null ? canWrite : (role === 'admin' || role === 'manager')

  if (!hasAccess) {
    return (
      <div className="glass-panel rounded-3xl p-12 flex flex-col items-center justify-center gap-4 text-center">
        <Shield className="w-10 h-10 text-gray-600" />
        <div>
          <p className="text-gray-400 text-sm font-medium">Access restricted</p>
          <p className="text-gray-600 text-xs mt-1">
            You don't have permission to edit pipeline stages.
          </p>
        </div>
      </div>
    )
  }

  const clients = await withTenant(tenantId, () =>
    db.client.findMany({
      where:   { deletedAt: null },
      select:  { id: true, name: true },
      orderBy: { createdAt: 'asc' },
    })
  )

  if (clients.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-lg font-semibold text-white">Pipeline Stages</h2>
          <p className="text-sm text-gray-400 mt-0.5">
            Configure the stages for each client's pipeline.
          </p>
        </div>
        <div className="glass-panel rounded-3xl p-12 flex flex-col items-center justify-center gap-4 text-center">
          <Kanban className="w-10 h-10 text-gray-600" />
          <div>
            <p className="text-gray-400 text-sm font-medium">No clients yet</p>
            <p className="text-gray-600 text-xs mt-1">
              Create a client first to configure pipeline stages.
            </p>
          </div>
        </div>
      </div>
    )
  }

  const { clientId: qClientId } = await searchParams
  const selectedClientId = qClientId && clients.some(c => c.id === qClientId)
    ? qClientId
    : clients[0].id

  const stages = await withTenant(tenantId, () =>
    db.pipelineStage.findMany({
      where:   { clientId: selectedClientId },
      select:  { id: true, name: true, color: true, position: true },
      orderBy: { position: 'asc' },
    })
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">Pipeline Stages</h2>
          <p className="text-sm text-gray-400 mt-0.5">
            Configure the stages for each client's pipeline. Drag to reorder.
          </p>
        </div>
        <ClientSelector
          clients={clients}
          selectedClientId={selectedClientId}
          basePath="/settings/pipeline"
        />
      </div>
      <div className="glass-panel rounded-2xl p-5">
        <PipelineStagesPanel
          clientId={selectedClientId}
          initialStages={stages}
        />
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/pipeline/ClientSelector.tsx src/app/(dashboard)/settings/pipeline/page.tsx
git commit -m "Add pipeline settings page with per-client stage management"
```

---

## Task 11: `PermissionToggleRow` + `PermissionsPanel` Components

**Files:**
- Create: `src/components/settings/PermissionToggleRow.tsx`
- Create: `src/components/settings/PermissionsPanel.tsx`

- [ ] **Step 1: Create `src/components/settings/PermissionToggleRow.tsx`**

```typescript
'use client'

import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'

interface PermissionToggleRowProps {
  label:       string
  description?: string
  checked:     boolean
  inherited:   boolean
  saving:      boolean
  onChange:    (value: boolean) => void
}

export function PermissionToggleRow({
  label,
  description,
  checked,
  inherited,
  saving,
  onChange,
}: PermissionToggleRowProps) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-white/5 last:border-0">
      <div className="flex-1 min-w-0 pr-4">
        <div className="flex items-center gap-2">
          <span className="text-sm text-white">{label}</span>
          {inherited && (
            <Badge variant="outline" className="text-[10px] text-gray-500 border-white/10 px-1.5 py-0">
              Inherited
            </Badge>
          )}
        </div>
        {description && (
          <p className="text-xs text-gray-600 mt-0.5">{description}</p>
        )}
      </div>
      <Switch
        checked={checked}
        onCheckedChange={onChange}
        disabled={saving}
        className={inherited ? 'opacity-60' : ''}
      />
    </div>
  )
}
```

- [ ] **Step 2: Create `src/components/settings/PermissionsPanel.tsx`**

```typescript
'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { PermissionToggleRow } from './PermissionToggleRow'

type Override = {
  id:          string
  subjectType: string
  subjectId:   string
  permission:  string
  granted:     boolean
}

type Member = {
  id:    string
  name:  string
  email: string
  role:  'manager' | 'sdr'
}

interface PermissionsPanelProps {
  members:   Member[]
  overrides: Override[]
}

const ROLE_DEFAULTS: Record<string, boolean> = {
  manager: true,
  sdr:     false,
}

function findOverride(overrides: Override[], subjectType: string, subjectId: string) {
  return overrides.find(
    o => o.subjectType === subjectType && o.subjectId === subjectId && o.permission === 'pipeline:write'
  ) ?? null
}

export function PermissionsPanel({ members, overrides: initialOverrides }: PermissionsPanelProps) {
  const [overrides, setOverrides] = useState(initialOverrides)
  const [saving,    setSaving]    = useState<string | null>(null)

  const upsert = async (key: string, subjectType: 'user' | 'role', subjectId: string, granted: boolean) => {
    setSaving(key)
    try {
      const res = await fetch('/api/settings/permissions', {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ subjectType, subjectId, permission: 'pipeline:write', granted }),
      })
      if (!res.ok) { toast.error('Failed to save permission'); return }
      const { data } = await res.json()
      setOverrides(prev => {
        const without = prev.filter(
          o => !(o.subjectType === subjectType && o.subjectId === subjectId && o.permission === 'pipeline:write')
        )
        return [...without, data as Override]
      })
      toast.success('Saved')
    } finally {
      setSaving(null)
    }
  }

  const remove = async (key: string, overrideId: string, subjectType: string, subjectId: string) => {
    setSaving(key)
    try {
      const res = await fetch(`/api/settings/permissions/${overrideId}`, { method: 'DELETE' })
      if (!res.ok) { toast.error('Failed to reset permission'); return }
      setOverrides(prev =>
        prev.filter(
          o => !(o.subjectType === subjectType && o.subjectId === subjectId && o.permission === 'pipeline:write')
        )
      )
      toast.success('Reset to default')
    } finally {
      setSaving(null)
    }
  }

  const handleRoleToggle = async (roleId: string, newValue: boolean) => {
    const existing = findOverride(overrides, 'role', roleId)
    const inherited = ROLE_DEFAULTS[roleId] ?? false
    if (existing && newValue === inherited) {
      await remove(`role-${roleId}`, existing.id, 'role', roleId)
    } else {
      await upsert(`role-${roleId}`, 'role', roleId, newValue)
    }
  }

  const handleMemberToggle = async (member: Member, newValue: boolean) => {
    const roleOverride = findOverride(overrides, 'role', member.role)
    const inherited    = roleOverride?.granted ?? ROLE_DEFAULTS[member.role] ?? false
    const existing     = findOverride(overrides, 'user', member.id)

    if (existing && newValue === inherited) {
      await remove(`user-${member.id}`, existing.id, 'user', member.id)
    } else {
      await upsert(`user-${member.id}`, 'user', member.id, newValue)
    }
  }

  const resolveRole = (roleId: string) => {
    const override = findOverride(overrides, 'role', roleId)
    return { granted: override?.granted ?? ROLE_DEFAULTS[roleId] ?? false, hasOverride: !!override }
  }

  const resolveMember = (member: Member) => {
    const roleResolved = resolveRole(member.role)
    const userOverride = findOverride(overrides, 'user', member.id)
    return {
      granted:     userOverride?.granted ?? roleResolved.granted,
      inherited:   !userOverride,
    }
  }

  const managers = members.filter(m => m.role === 'manager')
  const sdrs      = members.filter(m => m.role === 'sdr')

  return (
    <div className="space-y-8">
      {/* Role Defaults */}
      <div className="glass-panel rounded-2xl p-5">
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-600 mb-4">
          Role Defaults
        </p>
        <p className="text-xs text-gray-500 mb-4">
          These apply to all members of a role unless overridden individually below.
        </p>
        {(['manager', 'sdr'] as const).map(roleId => {
          const { granted } = resolveRole(roleId)
          const key = `role-${roleId}`
          return (
            <PermissionToggleRow
              key={roleId}
              label={`${roleId === 'manager' ? 'Managers' : 'SDRs'} can edit pipeline stages`}
              checked={granted}
              inherited={false}
              saving={saving === key}
              onChange={v => handleRoleToggle(roleId, v)}
            />
          )
        })}
      </div>

      {/* Member Overrides */}
      <div className="glass-panel rounded-2xl p-5">
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-600 mb-4">
          Member Overrides
        </p>
        {members.length === 0 ? (
          <p className="text-sm text-gray-500">No team members to configure.</p>
        ) : (
          <div>
            {[...managers, ...sdrs].map(member => {
              const { granted, inherited } = resolveMember(member)
              const key = `user-${member.id}`
              return (
                <PermissionToggleRow
                  key={member.id}
                  label={member.name}
                  description={`${member.email} · ${member.role}`}
                  checked={granted}
                  inherited={inherited}
                  saving={saving === key}
                  onChange={v => handleMemberToggle(member, v)}
                />
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/settings/PermissionToggleRow.tsx src/components/settings/PermissionsPanel.tsx
git commit -m "Add PermissionToggleRow and PermissionsPanel components"
```

---

## Task 12: `/settings/permissions` Page

**Files:**
- Create: `src/app/(dashboard)/settings/permissions/page.tsx`

- [ ] **Step 1: Create the page**

```typescript
import { redirect } from 'next/navigation'
import { db, withTenant } from '@/lib/db'
import { getCurrentUserRole, getCurrentTenantId } from '@/lib/auth'
import { PermissionsPanel } from '@/components/settings/PermissionsPanel'

export default async function PermissionsSettingsPage() {
  const tenantId = await getCurrentTenantId()
  if (!tenantId) redirect('/sign-in')

  const role = await getCurrentUserRole()
  if (role !== 'admin') redirect('/settings/account')

  const [rawMembers, rawOverrides] = await Promise.all([
    withTenant(tenantId, () =>
      db.user.findMany({
        where:   { role: { in: ['manager', 'sdr'] } },
        select:  { id: true, name: true, email: true, role: true },
        orderBy: [{ role: 'asc' }, { name: 'asc' }],
      })
    ),
    db.permissionOverride.findMany({
      where:  { tenantId, permission: 'pipeline:write' },
      select: { id: true, subjectType: true, subjectId: true, permission: true, granted: true },
    }),
  ])

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-white">Permissions</h2>
        <p className="text-sm text-gray-400 mt-0.5">
          Control which roles and team members can edit pipeline stages.
        </p>
      </div>
      <PermissionsPanel
        members={rawMembers as { id: string; name: string; email: string; role: 'manager' | 'sdr' }[]}
        overrides={rawOverrides}
      />
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/(dashboard)/settings/permissions/page.tsx
git commit -m "Add permissions settings page"
```

---

## Task 13: Settings Nav + Layout Wiring

**Files:**
- Modify: `src/components/settings/SettingsNav.tsx`
- Modify: `src/app/(dashboard)/settings/layout.tsx`

- [ ] **Step 1: Add Pipeline and Permissions to `SettingsNav`**

In `src/components/settings/SettingsNav.tsx`, add `Kanban` and `Shield` to the import:

```typescript
import { Building2, Phone, Users, Globe, User, Kanban, Shield } from 'lucide-react'
```

Add two new entries to `ALL_SECTIONS` (after the existing `portal` entry, before `account`):

```typescript
const ALL_SECTIONS: SettingsSection[] = [
  { href: '/settings/company',     label: 'Company',          icon: Building2 },
  { href: '/settings/dialer',      label: 'Dialer Thresholds', icon: Phone     },
  { href: '/settings/team',        label: 'Team',             icon: Users     },
  { href: '/settings/portal',      label: 'Client Portal',    icon: Globe     },
  { href: '/settings/pipeline',    label: 'Pipeline',         icon: Kanban    },
  { href: '/settings/permissions', label: 'Permissions',      icon: Shield    },
  { href: '/settings/account',     label: 'Account',          icon: User      },
]
```

- [ ] **Step 2: Update `ROLE_SECTIONS` in `src/app/(dashboard)/settings/layout.tsx`**

Replace the existing `ROLE_SECTIONS` constant with:

```typescript
const ROLE_SECTIONS: Record<UserRole, string[]> = {
  admin:   ['/settings/company', '/settings/dialer', '/settings/team', '/settings/portal', '/settings/pipeline', '/settings/permissions', '/settings/account'],
  manager: ['/settings/team', '/settings/portal', '/settings/pipeline', '/settings/account'],
  sdr:     ['/settings/account', '/settings/pipeline'],
  client:  [],
}
```

- [ ] **Step 3: Run full test suite**

```bash
npx vitest run
```

Expected: all tests PASS (green). Fix any failures before committing.

- [ ] **Step 4: Commit**

```bash
git add src/components/settings/SettingsNav.tsx src/app/(dashboard)/settings/layout.tsx
git commit -m "Wire pipeline and permissions into settings nav and role sections"
```
