# LeadForce CRM Phase 2 — Contacts & Data Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the Contact model, CSV import with validation/dedup/DNC review, a searchable/filterable contacts page, and a contact detail drawer.

**Architecture:** Pure TypeScript CSV parsing in `src/lib/csv/` (fully unit-testable, no Next.js deps). Server Actions for CRUD and import mutations, Server Components for data fetching. Filter state in URL params. All patterns follow Phase 1 exactly: `withTenant`, Zod validation, cursor pagination, glass-panel UI.

**Tech Stack:** Next.js 16 App Router, TypeScript, Prisma 7, Zod, react-hook-form, Tailwind CSS v4 tokens, Clerk v5, `papaparse` for client-side CSV parsing, Node.js `crypto` for dedup hashing, Vitest for unit tests.

---

## File Map

### Created
- `src/lib/csv/types.ts` — shared types: `ColumnMapping`, `ContactField`, `MappedRow`, `DuplicateRow`, `ImportPreviewResult`, `ImportResult`, `CONTACT_FIELDS` constant
- `src/lib/csv/dedup.ts` — `normalizeField`, `computeDedupeHash`
- `src/lib/csv/parse.ts` — `applyMapping`, `isValidRow`, `toMappedRow`, `processRows`
- `src/lib/csv/__tests__/dedup.test.ts` — unit tests for dedup
- `src/lib/csv/__tests__/parse.test.ts` — unit tests for parse
- `src/app/(dashboard)/contacts/actions.ts` — `ContactSchema`, `createContact`, `updateContact`, `deleteContact`
- `src/app/(dashboard)/imports/actions.ts` — `parseImportPreview`, `importContacts`
- `src/app/api/contacts/route.ts` — GET (paginated + filtered) + POST
- `src/app/api/contacts/[id]/route.ts` — PATCH + DELETE (soft)
- `src/components/contacts/ContactDrawer.tsx` — create/edit drawer
- `src/components/contacts/ContactFilters.tsx` — search + campaign/list filter dropdowns
- `src/components/contacts/ContactsTable.tsx` — glass-panel table with actions
- `src/components/imports/ColumnMapper.tsx` — map CSV headers to Contact fields
- `src/components/imports/DuplicateReview.tsx` — per-duplicate skip/overwrite UI
- `src/components/imports/ImportWizard.tsx` — 3-step wizard (upload, review, result)
- `src/app/(dashboard)/contacts/page.tsx` — server component
- `src/app/(dashboard)/imports/page.tsx` — server component shell + client wizard

### Modified
- `prisma/schema.prisma` — add `ContactList` enum, `Contact` model, `contacts` relation on `Campaign` and `Tenant`
- `src/lib/db.ts` — add `'Contact'` to `TENANT_MODELS`
- `src/lib/auth.ts` — add `contacts:read` and `contacts:write` permissions
- `src/lib/__tests__/auth.test.ts` — extend with contacts permission tests
- `src/types/enums.ts` — add `ContactList` enum
- `src/types/models.ts` — add `ContactWithCampaign` type

---

## Task 1: Install papaparse + Schema changes

**Files:**
- Modify: `prisma/schema.prisma`
- Modify: `src/lib/db.ts:10`

- [ ] **Step 1: Install papaparse**

```bash
cd /path/to/worktree
npm install papaparse
npm install --save-dev @types/papaparse
```

Expected: papaparse and @types/papaparse added to package.json.

- [ ] **Step 2: Add ContactList enum and Contact model to schema**

Replace the contents of `prisma/schema.prisma` with:

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
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

enum ContactList {
  prospect
  lead
  dnc
  future
  call_back
  meeting_booked
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
  contacts  Contact[]
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
  contacts         Contact[]
}

model CampaignSDR {
  campaignId String
  userId     String
  assignedAt DateTime @default(now())
  campaign   Campaign @relation(fields: [campaignId], references: [id])
  user       User     @relation(fields: [userId], references: [id])

  @@id([campaignId, userId])
}

model Contact {
  id          String      @id @default(cuid())
  tenantId    String
  campaignId  String
  firstName   String
  lastName    String
  email       String?
  phone       String?
  companyName String?
  jobTitle    String?
  address     String?
  city        String?
  state       String?
  zip         String?
  website     String?
  linkedinUrl String?
  list        ContactList @default(prospect)
  dncReason   String?
  dedupeHash  String
  createdAt   DateTime    @default(now())
  updatedAt   DateTime    @updatedAt
  deletedAt   DateTime?
  tenant      Tenant      @relation(fields: [tenantId], references: [id])
  campaign    Campaign    @relation(fields: [campaignId], references: [id])

  @@unique([tenantId, dedupeHash])
  @@index([tenantId, campaignId])
  @@index([tenantId, list])
}
```

- [ ] **Step 3: Add Contact to TENANT_MODELS in db.ts**

In `src/lib/db.ts`, change line 10:

```typescript
const TENANT_MODELS = new Set(['User', 'Client', 'Campaign', 'Contact'])
```

- [ ] **Step 4: Run migration**

```bash
npx prisma migrate dev --name add_contact_model
```

Expected output ends with: `Your database is now in sync with your schema.`

- [ ] **Step 5: Regenerate Prisma client**

```bash
npx prisma generate
```

Expected: `Generated Prisma Client` message.

- [ ] **Step 6: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no output (no errors).

- [ ] **Step 7: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/ src/lib/db.ts package.json package-lock.json
git commit -m "Add Contact model, ContactList enum, papaparse"
```

---

## Task 2: Types and permissions

**Files:**
- Modify: `src/types/enums.ts`
- Modify: `src/types/models.ts`
- Modify: `src/lib/auth.ts`
- Modify: `src/lib/__tests__/auth.test.ts`

- [ ] **Step 1: Write failing tests for new permissions**

Add to `src/lib/__tests__/auth.test.ts` inside the `hasPermission` describe block:

```typescript
it('grants sdr contacts:read', () => {
  expect(hasPermission('sdr', 'contacts:read')).toBe(true)
})
it('grants sdr contacts:write', () => {
  expect(hasPermission('sdr', 'contacts:write')).toBe(true)
})
it('denies client contacts:write', () => {
  expect(hasPermission('client', 'contacts:write')).toBe(false)
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- --reporter=verbose
```

Expected: 3 new failures (contacts:read/write not in Permission type yet).

- [ ] **Step 3: Add ContactList to enums.ts**

Replace `src/types/enums.ts` with:

```typescript
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

export enum ContactList {
  prospect = 'prospect',
  lead = 'lead',
  dnc = 'dnc',
  future = 'future',
  call_back = 'call_back',
  meeting_booked = 'meeting_booked',
}
```

- [ ] **Step 4: Add ContactWithCampaign to models.ts**

Replace `src/types/models.ts` with:

```typescript
import type { Client, Campaign, User, CampaignSDR, Contact } from '@prisma/client'

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

export type ContactWithCampaign = Contact & {
  campaign: Pick<Campaign, 'id' | 'name'>
}
```

- [ ] **Step 5: Add contacts permissions to auth.ts**

Replace `src/lib/auth.ts` with:

```typescript
import { auth } from '@clerk/nextjs/server'

export type Permission =
  | 'clients:read'
  | 'clients:write'
  | 'campaigns:read'
  | 'campaigns:write'
  | 'sdrs:manage'
  | 'contacts:read'
  | 'contacts:write'

export type UserRole = 'admin' | 'manager' | 'sdr' | 'client'

const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  admin:   ['clients:read', 'clients:write', 'campaigns:read', 'campaigns:write', 'sdrs:manage', 'contacts:read', 'contacts:write'],
  manager: ['clients:read', 'clients:write', 'campaigns:read', 'campaigns:write', 'sdrs:manage', 'contacts:read', 'contacts:write'],
  sdr:     ['campaigns:read', 'contacts:read', 'contacts:write'],
  client:  ['campaigns:read'],
}

export function hasPermission(role: string, permission: Permission): boolean {
  const perms = ROLE_PERMISSIONS[role as UserRole]
  return perms?.includes(permission) ?? false
}

export class ForbiddenError extends Error {
  readonly status = 403
  constructor() {
    super('Forbidden')
    this.name = 'ForbiddenError'
  }
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
    throw new ForbiddenError()
  }
}
```

- [ ] **Step 6: Run tests to verify all pass**

```bash
npm test -- --reporter=verbose
```

Expected: all tests pass (including the 3 new ones).

- [ ] **Step 7: Commit**

```bash
git add src/types/enums.ts src/types/models.ts src/lib/auth.ts src/lib/__tests__/auth.test.ts
git commit -m "Add ContactList enum, ContactWithCampaign type, contacts permissions"
```

---

## Task 3: CSV types

**Files:**
- Create: `src/lib/csv/types.ts`

- [ ] **Step 1: Create csv types file**

Create `src/lib/csv/types.ts`:

```typescript
export type ContactField =
  | 'firstName'
  | 'lastName'
  | 'email'
  | 'phone'
  | 'companyName'
  | 'jobTitle'
  | 'address'
  | 'city'
  | 'state'
  | 'zip'
  | 'website'
  | 'linkedinUrl'

export const CONTACT_FIELDS: { value: ContactField; label: string }[] = [
  { value: 'firstName',   label: 'First Name' },
  { value: 'lastName',    label: 'Last Name' },
  { value: 'email',       label: 'Email' },
  { value: 'phone',       label: 'Phone' },
  { value: 'companyName', label: 'Company Name' },
  { value: 'jobTitle',    label: 'Job Title' },
  { value: 'address',     label: 'Address' },
  { value: 'city',        label: 'City' },
  { value: 'state',       label: 'State' },
  { value: 'zip',         label: 'ZIP' },
  { value: 'website',     label: 'Website' },
  { value: 'linkedinUrl', label: 'LinkedIn URL' },
]

export type ColumnMapping = {
  csvHeader: string
  contactField: ContactField | null
}

export type RawRow = Record<string, string>

export type MappedRow = {
  firstName: string
  lastName: string
  email: string | null
  phone: string | null
  companyName: string | null
  jobTitle: string | null
  address: string | null
  city: string | null
  state: string | null
  zip: string | null
  website: string | null
  linkedinUrl: string | null
  dedupeHash: string
}

export type DuplicateRow = {
  incoming: MappedRow
  existing: {
    id: string
    firstName: string
    lastName: string
    email: string | null
    phone: string | null
    companyName: string | null
    list: string
  }
  resolution: 'skip' | 'overwrite'
}

export type ImportPreviewResult = {
  clean: MappedRow[]
  duplicates: DuplicateRow[]
  dnc: MappedRow[]
  invalidRowCount: number
}

export type ImportResult = {
  created: number
  overwritten: number
  skipped: number
  dncBlocked: number
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add src/lib/csv/types.ts
git commit -m "Add CSV shared types"
```

---

## Task 4: CSV dedup module

**Files:**
- Create: `src/lib/csv/dedup.ts`
- Create: `src/lib/csv/__tests__/dedup.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/csv/__tests__/dedup.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { computeDedupeHash, normalizeField } from '../dedup'

describe('normalizeField', () => {
  it('lowercases and trims', () => {
    expect(normalizeField('  JOHN@EXAMPLE.COM  ')).toBe('john@example.com')
  })
  it('removes internal whitespace', () => {
    expect(normalizeField('+1 555 000 0000')).toBe('+15550000000')
  })
  it('handles null', () => {
    expect(normalizeField(null)).toBe('')
  })
  it('handles undefined', () => {
    expect(normalizeField(undefined)).toBe('')
  })
})

describe('computeDedupeHash', () => {
  it('returns same hash for same email+phone regardless of case/spaces', () => {
    const a = computeDedupeHash('john@example.com', '5550001234')
    const b = computeDedupeHash('JOHN@EXAMPLE.COM', ' 555 000 1234 ')
    expect(a).toBe(b)
  })
  it('returns same hash when only email differs by case', () => {
    const a = computeDedupeHash('john@test.com', null)
    const b = computeDedupeHash('JOHN@TEST.COM', null)
    expect(a).toBe(b)
  })
  it('returns different hashes for different contacts', () => {
    const a = computeDedupeHash('john@test.com', null)
    const b = computeDedupeHash('jane@test.com', null)
    expect(a).not.toBe(b)
  })
  it('returns a UUID (36 chars) when both email and phone are null', () => {
    const hash = computeDedupeHash(null, null)
    expect(hash).toMatch(/^[0-9a-f-]{36}$/)
  })
  it('returns different UUIDs for two contacts with no email/phone', () => {
    const a = computeDedupeHash(null, null)
    const b = computeDedupeHash(null, null)
    expect(a).not.toBe(b)
  })
  it('returns a 64-char hex string for contacts with email or phone', () => {
    const hash = computeDedupeHash('test@test.com', null)
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- --reporter=verbose src/lib/csv/__tests__/dedup.test.ts
```

Expected: FAIL — `Cannot find module '../dedup'`.

- [ ] **Step 3: Implement dedup.ts**

Create `src/lib/csv/dedup.ts`:

```typescript
import { createHash, randomUUID } from 'crypto'

export function normalizeField(value: string | null | undefined): string {
  return (value ?? '').toLowerCase().replace(/\s+/g, '').trim()
}

export function computeDedupeHash(email: string | null, phone: string | null): string {
  const normalizedEmail = normalizeField(email)
  const normalizedPhone = normalizeField(phone)

  if (!normalizedEmail && !normalizedPhone) {
    return randomUUID()
  }

  return createHash('sha256')
    .update(`${normalizedEmail}|${normalizedPhone}`)
    .digest('hex')
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- --reporter=verbose src/lib/csv/__tests__/dedup.test.ts
```

Expected: 10 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/csv/dedup.ts src/lib/csv/__tests__/dedup.test.ts
git commit -m "Add CSV dedup module with tests"
```

---

## Task 5: CSV parse module

**Files:**
- Create: `src/lib/csv/parse.ts`
- Create: `src/lib/csv/__tests__/parse.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/csv/__tests__/parse.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { applyMapping, isValidRow, toMappedRow, processRows } from '../parse'
import type { ColumnMapping, RawRow } from '../types'

const mappings: ColumnMapping[] = [
  { csvHeader: 'First Name',     contactField: 'firstName' },
  { csvHeader: 'Last Name',      contactField: 'lastName' },
  { csvHeader: 'Email Address',  contactField: 'email' },
  { csvHeader: 'Phone',          contactField: 'phone' },
  { csvHeader: 'Company',        contactField: 'companyName' },
]

describe('applyMapping', () => {
  it('maps csv headers to contact fields', () => {
    const row: RawRow = {
      'First Name': 'John', 'Last Name': 'Doe',
      'Email Address': 'john@test.com', 'Phone': '', 'Company': 'Acme',
    }
    const result = applyMapping(row, mappings)
    expect(result.firstName).toBe('John')
    expect(result.email).toBe('john@test.com')
    expect(result.companyName).toBe('Acme')
  })
  it('ignores headers not present in mappings', () => {
    const row: RawRow = { 'First Name': 'John', 'Notes': 'ignored' }
    const result = applyMapping(row, mappings)
    expect(result).not.toHaveProperty('Notes')
  })
  it('skips columns with null contactField', () => {
    const m: ColumnMapping[] = [{ csvHeader: 'Notes', contactField: null }]
    const row: RawRow = { Notes: 'some note' }
    const result = applyMapping(row, m)
    expect(Object.keys(result)).toHaveLength(0)
  })
})

describe('isValidRow', () => {
  it('returns true when email present', () => {
    expect(isValidRow({ email: 'test@test.com' })).toBe(true)
  })
  it('returns true when phone present', () => {
    expect(isValidRow({ phone: '5550001234' })).toBe(true)
  })
  it('returns false when neither email nor phone', () => {
    expect(isValidRow({ firstName: 'John' })).toBe(false)
  })
  it('returns false when email and phone are empty strings', () => {
    expect(isValidRow({ email: '   ', phone: '  ' })).toBe(false)
  })
})

describe('toMappedRow', () => {
  it('converts mapped fields to MappedRow with dedupeHash', () => {
    const row = toMappedRow({ firstName: 'John', lastName: 'Doe', email: 'john@test.com', phone: null })
    expect(row.firstName).toBe('John')
    expect(row.email).toBe('john@test.com')
    expect(row.phone).toBeNull()
    expect(row.dedupeHash).toHaveLength(64)
  })
  it('sets optional fields to null when absent', () => {
    const row = toMappedRow({ email: 'a@b.com' })
    expect(row.firstName).toBe('')
    expect(row.companyName).toBeNull()
  })
})

describe('processRows', () => {
  it('filters out invalid rows and counts them', () => {
    const rows: RawRow[] = [
      { 'First Name': 'John', 'Last Name': 'Doe', 'Email Address': 'john@test.com', 'Phone': '', 'Company': '' },
      { 'First Name': 'No',   'Last Name': 'Contact', 'Email Address': '', 'Phone': '', 'Company': '' },
    ]
    const { valid, invalidCount } = processRows(rows, mappings)
    expect(valid).toHaveLength(1)
    expect(invalidCount).toBe(1)
  })
  it('returns empty arrays for empty input', () => {
    const { valid, invalidCount } = processRows([], mappings)
    expect(valid).toHaveLength(0)
    expect(invalidCount).toBe(0)
  })
  it('assigns a dedupeHash to each valid row', () => {
    const rows: RawRow[] = [
      { 'First Name': 'Jane', 'Last Name': 'Doe', 'Email Address': 'jane@test.com', 'Phone': '', 'Company': '' },
    ]
    const { valid } = processRows(rows, mappings)
    expect(valid[0].dedupeHash).toHaveLength(64)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- --reporter=verbose src/lib/csv/__tests__/parse.test.ts
```

Expected: FAIL — `Cannot find module '../parse'`.

- [ ] **Step 3: Implement parse.ts**

Create `src/lib/csv/parse.ts`:

```typescript
import { computeDedupeHash } from './dedup'
import type { RawRow, MappedRow, ColumnMapping, ContactField } from './types'

export function applyMapping(
  row: RawRow,
  mappings: ColumnMapping[]
): Partial<Record<ContactField, string>> {
  const result: Partial<Record<ContactField, string>> = {}
  for (const { csvHeader, contactField } of mappings) {
    if (contactField && csvHeader in row) {
      result[contactField] = row[csvHeader]?.trim() ?? ''
    }
  }
  return result
}

export function isValidRow(mapped: Partial<Record<ContactField, string>>): boolean {
  const email = mapped.email?.trim()
  const phone = mapped.phone?.trim()
  return !!(email || phone)
}

export function toMappedRow(mapped: Partial<Record<ContactField, string>>): MappedRow {
  const email = mapped.email?.trim() || null
  const phone = mapped.phone?.trim() || null
  return {
    firstName:   mapped.firstName?.trim()   ?? '',
    lastName:    mapped.lastName?.trim()    ?? '',
    email,
    phone,
    companyName: mapped.companyName?.trim() || null,
    jobTitle:    mapped.jobTitle?.trim()    || null,
    address:     mapped.address?.trim()     || null,
    city:        mapped.city?.trim()        || null,
    state:       mapped.state?.trim()       || null,
    zip:         mapped.zip?.trim()         || null,
    website:     mapped.website?.trim()     || null,
    linkedinUrl: mapped.linkedinUrl?.trim() || null,
    dedupeHash:  computeDedupeHash(email, phone),
  }
}

export function processRows(
  rawRows: RawRow[],
  mappings: ColumnMapping[]
): { valid: MappedRow[]; invalidCount: number } {
  let invalidCount = 0
  const valid: MappedRow[] = []

  for (const row of rawRows) {
    const mapped = applyMapping(row, mappings)
    if (!isValidRow(mapped)) {
      invalidCount++
      continue
    }
    valid.push(toMappedRow(mapped))
  }

  return { valid, invalidCount }
}
```

- [ ] **Step 4: Run all tests**

```bash
npm test -- --reporter=verbose
```

Expected: all tests pass (16+ tests total).

- [ ] **Step 5: Commit**

```bash
git add src/lib/csv/parse.ts src/lib/csv/__tests__/parse.test.ts
git commit -m "Add CSV parse module with tests"
```

---

## Task 6: Contact server actions (CRUD)

**Files:**
- Create: `src/app/(dashboard)/contacts/actions.ts`

- [ ] **Step 1: Create contacts/actions.ts**

Create `src/app/(dashboard)/contacts/actions.ts`:

```typescript
'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { db, withTenant } from '@/lib/db'
import { getCurrentTenantId, requirePermission } from '@/lib/auth'
import { computeDedupeHash } from '@/lib/csv/dedup'

export const ContactSchema = z.object({
  campaignId:  z.string().min(1, 'Campaign is required'),
  firstName:   z.string().min(1, 'First name is required'),
  lastName:    z.string().min(1, 'Last name is required'),
  email:       z.string().email('Invalid email').optional().or(z.literal('')),
  phone:       z.string().optional(),
  companyName: z.string().optional(),
  jobTitle:    z.string().optional(),
  address:     z.string().optional(),
  city:        z.string().optional(),
  state:       z.string().optional(),
  zip:         z.string().optional(),
  website:     z.string().url('Invalid URL').optional().or(z.literal('')),
  linkedinUrl: z.string().url('Invalid URL').optional().or(z.literal('')),
  list:        z.enum(['prospect', 'lead', 'dnc', 'future', 'call_back', 'meeting_booked']).default('prospect'),
  dncReason:   z.string().optional(),
})

export type ContactFormData = z.infer<typeof ContactSchema>

export async function createContact(data: ContactFormData) {
  await requirePermission('contacts:write')
  const tenantId = await getCurrentTenantId()
  if (!tenantId) throw new Error('No tenant context')

  const parsed = ContactSchema.parse(data)
  const dedupeHash = computeDedupeHash(parsed.email || null, parsed.phone || null)

  await withTenant(tenantId, () =>
    db.contact.create({
      data: {
        tenantId,
        campaignId:  parsed.campaignId,
        firstName:   parsed.firstName,
        lastName:    parsed.lastName,
        email:       parsed.email       || null,
        phone:       parsed.phone       || null,
        companyName: parsed.companyName || null,
        jobTitle:    parsed.jobTitle    || null,
        address:     parsed.address     || null,
        city:        parsed.city        || null,
        state:       parsed.state       || null,
        zip:         parsed.zip         || null,
        website:     parsed.website     || null,
        linkedinUrl: parsed.linkedinUrl || null,
        list:        parsed.list,
        dncReason:   parsed.dncReason   || null,
        dedupeHash,
      },
    })
  )

  revalidatePath('/contacts')
}

export async function updateContact(id: string, data: ContactFormData) {
  await requirePermission('contacts:write')
  const tenantId = await getCurrentTenantId()
  if (!tenantId) throw new Error('No tenant context')

  const parsed = ContactSchema.parse(data)
  const dedupeHash = computeDedupeHash(parsed.email || null, parsed.phone || null)

  await withTenant(tenantId, () =>
    db.contact.update({
      where: { id },
      data: {
        campaignId:  parsed.campaignId,
        firstName:   parsed.firstName,
        lastName:    parsed.lastName,
        email:       parsed.email       || null,
        phone:       parsed.phone       || null,
        companyName: parsed.companyName || null,
        jobTitle:    parsed.jobTitle    || null,
        address:     parsed.address     || null,
        city:        parsed.city        || null,
        state:       parsed.state       || null,
        zip:         parsed.zip         || null,
        website:     parsed.website     || null,
        linkedinUrl: parsed.linkedinUrl || null,
        list:        parsed.list,
        dncReason:   parsed.dncReason   || null,
        dedupeHash,
      },
    })
  )

  revalidatePath('/contacts')
}

export async function deleteContact(id: string) {
  await requirePermission('contacts:write')
  const tenantId = await getCurrentTenantId()
  if (!tenantId) throw new Error('No tenant context')

  await withTenant(tenantId, () =>
    db.contact.update({
      where: { id },
      data: { deletedAt: new Date() },
    })
  )

  revalidatePath('/contacts')
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add src/app/\(dashboard\)/contacts/actions.ts
git commit -m "Add contact server actions (create, update, delete)"
```

---

## Task 7: Import server actions

**Files:**
- Create: `src/app/(dashboard)/imports/actions.ts`

- [ ] **Step 1: Create imports/actions.ts**

Create `src/app/(dashboard)/imports/actions.ts`:

```typescript
'use server'

import { revalidatePath } from 'next/cache'
import { db, withTenant } from '@/lib/db'
import { getCurrentTenantId, requirePermission } from '@/lib/auth'
import { processRows } from '@/lib/csv/parse'
import type {
  ColumnMapping, RawRow, MappedRow,
  DuplicateRow, ImportPreviewResult, ImportResult,
} from '@/lib/csv/types'

export async function parseImportPreview(
  rawRows: RawRow[],
  mappings: ColumnMapping[],
  campaignId: string
): Promise<ImportPreviewResult> {
  await requirePermission('contacts:write')
  const tenantId = await getCurrentTenantId()
  if (!tenantId) throw new Error('No tenant context')

  const { valid, invalidCount } = processRows(rawRows, mappings)
  const hashes = valid.map((r) => r.dedupeHash)

  const existingInCampaign = await withTenant(tenantId, () =>
    db.contact.findMany({
      where: { campaignId, dedupeHash: { in: hashes }, deletedAt: null },
      select: {
        id: true, firstName: true, lastName: true,
        email: true, phone: true, companyName: true,
        list: true, dedupeHash: true,
      },
    })
  )
  const existingHashMap = new Map(existingInCampaign.map((c) => [c.dedupeHash, c]))

  const dncContacts = await withTenant(tenantId, () =>
    db.contact.findMany({
      where: { list: 'dnc', dedupeHash: { in: hashes }, deletedAt: null },
      select: { dedupeHash: true },
    })
  )
  const dncHashes = new Set(dncContacts.map((c) => c.dedupeHash))

  const clean: MappedRow[] = []
  const duplicates: DuplicateRow[] = []
  const dnc: MappedRow[] = []

  for (const row of valid) {
    if (dncHashes.has(row.dedupeHash)) {
      dnc.push(row)
    } else if (existingHashMap.has(row.dedupeHash)) {
      duplicates.push({
        incoming: row,
        existing: existingHashMap.get(row.dedupeHash)!,
        resolution: 'skip',
      })
    } else {
      clean.push(row)
    }
  }

  return { clean, duplicates, dnc, invalidRowCount: invalidCount }
}

export async function importContacts(
  cleanRows: MappedRow[],
  resolvedDuplicates: DuplicateRow[],
  campaignId: string
): Promise<ImportResult> {
  await requirePermission('contacts:write')
  const tenantId = await getCurrentTenantId()
  if (!tenantId) throw new Error('No tenant context')

  const toCreate = cleanRows.map((row) => ({ tenantId, campaignId, ...row }))
  const toOverwrite = resolvedDuplicates.filter((d) => d.resolution === 'overwrite')
  const skipped = resolvedDuplicates.filter((d) => d.resolution === 'skip').length

  const result = await withTenant(tenantId, () =>
    db.$transaction(async (tx) => {
      let created = 0
      if (toCreate.length > 0) {
        const res = await tx.contact.createMany({ data: toCreate, skipDuplicates: true })
        created = res.count
      }
      for (const dup of toOverwrite) {
        await tx.contact.update({
          where: { id: dup.existing.id },
          data: {
            firstName:   dup.incoming.firstName,
            lastName:    dup.incoming.lastName,
            email:       dup.incoming.email,
            phone:       dup.incoming.phone,
            companyName: dup.incoming.companyName,
            jobTitle:    dup.incoming.jobTitle,
            address:     dup.incoming.address,
            city:        dup.incoming.city,
            state:       dup.incoming.state,
            zip:         dup.incoming.zip,
            website:     dup.incoming.website,
            linkedinUrl: dup.incoming.linkedinUrl,
            dedupeHash:  dup.incoming.dedupeHash,
          },
        })
      }
      return created
    })
  )

  revalidatePath('/contacts')

  return {
    created: result,
    overwritten: toOverwrite.length,
    skipped,
    dncBlocked: 0,
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add src/app/\(dashboard\)/imports/actions.ts
git commit -m "Add import server actions (parseImportPreview, importContacts)"
```

---

## Task 8: Contact API routes

**Files:**
- Create: `src/app/api/contacts/route.ts`
- Create: `src/app/api/contacts/[id]/route.ts`

- [ ] **Step 1: Create contacts API collection route**

Create `src/app/api/contacts/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { db, withTenant } from '@/lib/db'
import { hasPermission } from '@/lib/auth'
import { computeDedupeHash } from '@/lib/csv/dedup'

const CreateContactSchema = z.object({
  campaignId:  z.string().min(1),
  firstName:   z.string().min(1),
  lastName:    z.string().min(1),
  email:       z.string().email().optional(),
  phone:       z.string().optional(),
  companyName: z.string().optional(),
  jobTitle:    z.string().optional(),
  address:     z.string().optional(),
  city:        z.string().optional(),
  state:       z.string().optional(),
  zip:         z.string().optional(),
  website:     z.string().url().optional(),
  linkedinUrl: z.string().url().optional(),
  list:        z.enum(['prospect', 'lead', 'dnc', 'future', 'call_back', 'meeting_booked']).default('prospect'),
  dncReason:   z.string().optional(),
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
  if (!hasPermission(role, 'contacts:read') || !tenantId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const cursor     = searchParams.get('cursor')
  const limit      = Math.min(parseInt(searchParams.get('limit') ?? '25', 10), 100)
  const campaignId = searchParams.get('campaignId') ?? undefined
  const list       = searchParams.get('list') ?? undefined
  const search     = searchParams.get('search') ?? undefined

  const where = {
    deletedAt: null,
    ...(campaignId ? { campaignId } : {}),
    ...(list ? { list: list as never } : {}),
    ...(search ? {
      OR: [
        { firstName:   { contains: search, mode: 'insensitive' as const } },
        { lastName:    { contains: search, mode: 'insensitive' as const } },
        { email:       { contains: search, mode: 'insensitive' as const } },
        { companyName: { contains: search, mode: 'insensitive' as const } },
      ],
    } : {}),
  }

  const contacts = await withTenant(tenantId, () =>
    db.contact.findMany({
      where,
      take: limit,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { createdAt: 'desc' },
      include: { campaign: { select: { id: true, name: true } } },
    })
  )

  const nextCursor = contacts.length === limit ? contacts[contacts.length - 1].id : null
  return NextResponse.json({ data: contacts, nextCursor })
}

export async function POST(request: Request) {
  const { userId, sessionClaims } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { role, tenantId } = getClerkMeta(sessionClaims)
  if (!hasPermission(role, 'contacts:write') || !tenantId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json()
  const result = CreateContactSchema.safeParse(body)
  if (!result.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: result.error.flatten() },
      { status: 400 }
    )
  }

  const dedupeHash = computeDedupeHash(result.data.email ?? null, result.data.phone ?? null)
  const contact = await withTenant(tenantId, () =>
    db.contact.create({ data: { ...result.data, tenantId, dedupeHash } })
  )

  return NextResponse.json({ data: contact }, { status: 201 })
}
```

- [ ] **Step 2: Create contacts API item route**

Create `src/app/api/contacts/[id]/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { db, withTenant } from '@/lib/db'
import { hasPermission } from '@/lib/auth'
import { computeDedupeHash } from '@/lib/csv/dedup'

const UpdateContactSchema = z.object({
  firstName:   z.string().min(1).optional(),
  lastName:    z.string().min(1).optional(),
  email:       z.string().email().nullable().optional(),
  phone:       z.string().nullable().optional(),
  companyName: z.string().nullable().optional(),
  jobTitle:    z.string().nullable().optional(),
  address:     z.string().nullable().optional(),
  city:        z.string().nullable().optional(),
  state:       z.string().nullable().optional(),
  zip:         z.string().nullable().optional(),
  website:     z.string().url().nullable().optional(),
  linkedinUrl: z.string().url().nullable().optional(),
  list:        z.enum(['prospect', 'lead', 'dnc', 'future', 'call_back', 'meeting_booked']).optional(),
  dncReason:   z.string().nullable().optional(),
})

function getClerkMeta(sessionClaims: unknown) {
  const meta = (sessionClaims as Record<string, unknown>)?.publicMetadata as
    | { role?: string; tenantId?: string }
    | undefined
  return { role: meta?.role ?? '', tenantId: meta?.tenantId }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId, sessionClaims } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { role, tenantId } = getClerkMeta(sessionClaims)
  if (!hasPermission(role, 'contacts:write') || !tenantId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const body = await request.json()
  const result = UpdateContactSchema.safeParse(body)
  if (!result.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: result.error.flatten() },
      { status: 400 }
    )
  }

  const data = result.data
  const updateData: typeof data & { dedupeHash?: string } = { ...data }
  if (data.email !== undefined || data.phone !== undefined) {
    updateData.dedupeHash = computeDedupeHash(data.email ?? null, data.phone ?? null)
  }

  const contact = await withTenant(tenantId, () =>
    db.contact.update({ where: { id }, data: updateData })
  )

  return NextResponse.json({ data: contact })
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId, sessionClaims } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { role, tenantId } = getClerkMeta(sessionClaims)
  if (!hasPermission(role, 'contacts:write') || !tenantId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  await withTenant(tenantId, () =>
    db.contact.update({ where: { id }, data: { deletedAt: new Date() } })
  )

  return NextResponse.json({ data: { success: true } })
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no output.

- [ ] **Step 4: Run all tests**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/contacts/
git commit -m "Add contacts API routes (GET, POST, PATCH, DELETE)"
```

---

## Task 9: ContactDrawer component

**Files:**
- Create: `src/components/contacts/ContactDrawer.tsx`

- [ ] **Step 1: Create ContactDrawer.tsx**

Create `src/components/contacts/ContactDrawer.tsx`:

```typescript
'use client'

import { useEffect } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import type { z } from 'zod'
import { SlideDrawer } from '@/components/shared/SlideDrawer'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { createContact, updateContact, ContactSchema } from '@/app/(dashboard)/contacts/actions'
import type { ContactWithCampaign } from '@/types/models'
import type { Campaign } from '@prisma/client'

type ContactFormData = z.infer<typeof ContactSchema>

interface ContactDrawerProps {
  open: boolean
  onClose: () => void
  contact: ContactWithCampaign | null
  campaigns: Pick<Campaign, 'id' | 'name'>[]
  defaultCampaignId?: string
}

const inputClass =
  'bg-white/5 border-white/10 text-white placeholder:text-gray-600 focus:border-[#00d4ff]/50 focus:ring-1 focus:ring-[#00d4ff]/10 rounded-xl'

const LIST_LABELS: Record<string, string> = {
  prospect:       'Prospect',
  lead:           'Lead',
  dnc:            'DNC',
  future:         'Future',
  call_back:      'Call Back',
  meeting_booked: 'Meeting Booked',
}

export function ContactDrawer({ open, onClose, contact, campaigns, defaultCampaignId }: ContactDrawerProps) {
  const {
    register,
    handleSubmit,
    reset,
    control,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<ContactFormData>({ resolver: zodResolver(ContactSchema) as never })

  const selectedList = watch('list')

  useEffect(() => {
    reset({
      campaignId:  contact?.campaignId  ?? defaultCampaignId ?? '',
      firstName:   contact?.firstName   ?? '',
      lastName:    contact?.lastName    ?? '',
      email:       contact?.email       ?? '',
      phone:       contact?.phone       ?? '',
      companyName: contact?.companyName ?? '',
      jobTitle:    contact?.jobTitle    ?? '',
      address:     contact?.address     ?? '',
      city:        contact?.city        ?? '',
      state:       contact?.state       ?? '',
      zip:         contact?.zip         ?? '',
      website:     contact?.website     ?? '',
      linkedinUrl: contact?.linkedinUrl ?? '',
      list:        contact?.list        ?? 'prospect',
      dncReason:   contact?.dncReason   ?? '',
    })
  }, [contact, reset, open, defaultCampaignId])

  const onSubmit = async (data: ContactFormData) => {
    if (contact) {
      await updateContact(contact.id, data)
    } else {
      await createContact(data)
    }
    onClose()
  }

  return (
    <SlideDrawer open={open} onClose={onClose} title={contact ? 'Edit Contact' : 'New Contact'} width="lg">
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col flex-1 overflow-hidden">
        <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">

          {/* Campaign */}
          <div className="space-y-1.5">
            <Label className="text-xs text-gray-400">Campaign *</Label>
            <Controller
              name="campaignId"
              control={control}
              render={({ field }) => (
                <Select onValueChange={field.onChange} value={field.value}>
                  <SelectTrigger className={inputClass}>
                    <SelectValue placeholder="Select a campaign…" />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl border-white/10 bg-card-solid">
                    {campaigns.map((c) => (
                      <SelectItem key={c.id} value={c.id}
                        className="text-gray-300 focus:bg-white/5 focus:text-white rounded-lg">
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {errors.campaignId && <p className="text-xs text-red-400">{errors.campaignId.message}</p>}
          </div>

          {/* Personal Info */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3">Personal Info</p>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-gray-400">First Name *</Label>
                  <Input {...register('firstName')} placeholder="John" className={inputClass} />
                  {errors.firstName && <p className="text-xs text-red-400">{errors.firstName.message}</p>}
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-gray-400">Last Name *</Label>
                  <Input {...register('lastName')} placeholder="Smith" className={inputClass} />
                  {errors.lastName && <p className="text-xs text-red-400">{errors.lastName.message}</p>}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-gray-400">Email</Label>
                <Input {...register('email')} type="email" placeholder="john@acme.com" className={inputClass} />
                {errors.email && <p className="text-xs text-red-400">{errors.email.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-gray-400">Phone</Label>
                <Input {...register('phone')} placeholder="+1 555 000 0000" className={inputClass} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-gray-400">Job Title</Label>
                <Input {...register('jobTitle')} placeholder="VP of Sales" className={inputClass} />
              </div>
            </div>
          </div>

          {/* Company */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3">Company</p>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-gray-400">Company Name</Label>
                <Input {...register('companyName')} placeholder="Acme Corp" className={inputClass} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-gray-400">Website</Label>
                <Input {...register('website')} placeholder="https://acme.com" className={inputClass} />
                {errors.website && <p className="text-xs text-red-400">{errors.website.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-gray-400">LinkedIn URL</Label>
                <Input {...register('linkedinUrl')} placeholder="https://linkedin.com/in/john" className={inputClass} />
                {errors.linkedinUrl && <p className="text-xs text-red-400">{errors.linkedinUrl.message}</p>}
              </div>
            </div>
          </div>

          {/* Location */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3">Location</p>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-gray-400">Address</Label>
                <Input {...register('address')} placeholder="123 Main St" className={inputClass} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-gray-400">City</Label>
                  <Input {...register('city')} placeholder="New York" className={inputClass} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-gray-400">State</Label>
                  <Input {...register('state')} placeholder="NY" className={inputClass} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-gray-400">ZIP</Label>
                <Input {...register('zip')} placeholder="10001" className={inputClass} />
              </div>
            </div>
          </div>

          {/* List Status */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3">List Status</p>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-gray-400">List</Label>
                <Controller
                  name="list"
                  control={control}
                  render={({ field }) => (
                    <Select onValueChange={field.onChange} value={field.value}>
                      <SelectTrigger className={inputClass}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="rounded-xl border-white/10 bg-card-solid">
                        {Object.entries(LIST_LABELS).map(([value, label]) => (
                          <SelectItem key={value} value={value}
                            className="text-gray-300 focus:bg-white/5 focus:text-white rounded-lg">
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
              {selectedList === 'dnc' && (
                <div className="space-y-1.5">
                  <Label className="text-xs text-gray-400">DNC Reason</Label>
                  <Input {...register('dncReason')} placeholder="e.g. Requested removal" className={inputClass} />
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex-shrink-0 border-t border-white/5 p-6 flex gap-3">
          <Button
            type="submit"
            disabled={isSubmitting}
            className="flex-1 bg-gradient-to-r from-[#00d4ff] to-cyan-600 text-black font-semibold rounded-xl hover:opacity-90"
          >
            {isSubmitting ? 'Saving…' : contact ? 'Save Changes' : 'Create Contact'}
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

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add src/components/contacts/ContactDrawer.tsx
git commit -m "Add ContactDrawer component"
```

---

## Task 10: ContactFilters component

**Files:**
- Create: `src/components/contacts/ContactFilters.tsx`

- [ ] **Step 1: Create ContactFilters.tsx**

Create `src/components/contacts/ContactFilters.tsx`:

```typescript
'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useCallback } from 'react'
import { Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import type { Campaign } from '@prisma/client'

interface ContactFiltersProps {
  campaigns: Pick<Campaign, 'id' | 'name'>[]
}

const LIST_OPTIONS = [
  { value: '',               label: 'All Lists' },
  { value: 'prospect',       label: 'Prospect' },
  { value: 'lead',           label: 'Lead' },
  { value: 'dnc',            label: 'DNC' },
  { value: 'future',         label: 'Future' },
  { value: 'call_back',      label: 'Call Back' },
  { value: 'meeting_booked', label: 'Meeting Booked' },
]

export function ContactFilters({ campaigns }: ContactFiltersProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const updateParam = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString())
      if (value) {
        params.set(key, value)
      } else {
        params.delete(key)
      }
      params.delete('cursor')
      router.push(`${pathname}?${params.toString()}`)
    },
    [router, pathname, searchParams]
  )

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <div className="relative flex-1 min-w-[200px] max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
        <Input
          placeholder="Search contacts…"
          defaultValue={searchParams.get('search') ?? ''}
          onChange={(e) => updateParam('search', e.target.value)}
          className="pl-9 bg-white/5 border-white/10 text-white placeholder:text-gray-600 focus:border-[#00d4ff]/50 focus:ring-1 focus:ring-[#00d4ff]/10 rounded-xl"
        />
      </div>

      <Select
        value={searchParams.get('campaignId') ?? ''}
        onValueChange={(v) => updateParam('campaignId', v)}
      >
        <SelectTrigger className="w-48 bg-white/5 border-white/10 text-white rounded-xl">
          <SelectValue placeholder="All Campaigns" />
        </SelectTrigger>
        <SelectContent className="rounded-xl border-white/10 bg-card-solid">
          <SelectItem value="" className="text-gray-300 focus:bg-white/5 focus:text-white rounded-lg">
            All Campaigns
          </SelectItem>
          {campaigns.map((c) => (
            <SelectItem key={c.id} value={c.id}
              className="text-gray-300 focus:bg-white/5 focus:text-white rounded-lg">
              {c.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={searchParams.get('list') ?? ''}
        onValueChange={(v) => updateParam('list', v)}
      >
        <SelectTrigger className="w-44 bg-white/5 border-white/10 text-white rounded-xl">
          <SelectValue placeholder="All Lists" />
        </SelectTrigger>
        <SelectContent className="rounded-xl border-white/10 bg-card-solid">
          {LIST_OPTIONS.map(({ value, label }) => (
            <SelectItem key={value || 'all'} value={value}
              className="text-gray-300 focus:bg-white/5 focus:text-white rounded-lg">
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add src/components/contacts/ContactFilters.tsx
git commit -m "Add ContactFilters component"
```

---

## Task 11: ContactsTable component

**Files:**
- Create: `src/components/contacts/ContactsTable.tsx`

- [ ] **Step 1: Create ContactsTable.tsx**

Create `src/components/contacts/ContactsTable.tsx`:

```typescript
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
import { ContactDrawer } from './ContactDrawer'
import { deleteContact } from '@/app/(dashboard)/contacts/actions'
import type { ContactWithCampaign } from '@/types/models'
import type { Campaign } from '@prisma/client'

const LIST_STYLES: Record<string, string> = {
  prospect:       'bg-accent/10 text-[#00d4ff]',
  lead:           'bg-emerald-500/10 text-emerald-400',
  dnc:            'bg-red-500/10 text-red-400',
  future:         'bg-gray-500/10 text-gray-400',
  call_back:      'bg-amber-500/10 text-amber-400',
  meeting_booked: 'bg-purple-500/10 text-purple-400',
}

const LIST_LABELS: Record<string, string> = {
  prospect:       'Prospect',
  lead:           'Lead',
  dnc:            'DNC',
  future:         'Future',
  call_back:      'Call Back',
  meeting_booked: 'Meeting Booked',
}

interface ContactsTableProps {
  contacts: ContactWithCampaign[]
  campaigns: Pick<Campaign, 'id' | 'name'>[]
  defaultCampaignId?: string
  nextCursor: string | null
}

export function ContactsTable({ contacts, campaigns, defaultCampaignId, nextCursor }: ContactsTableProps) {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [selected, setSelected] = useState<ContactWithCampaign | null>(null)

  const openEdit = (contact: ContactWithCampaign) => { setSelected(contact); setDrawerOpen(true) }
  const openCreate = () => { setSelected(null); setDrawerOpen(true) }

  return (
    <div className="glass-panel rounded-3xl overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/5">
        <h2 className="text-sm font-semibold text-white">
          Contacts
          <span className="ml-2 font-mono text-[10px] bg-accent/10 text-[#00d4ff] px-2 py-0.5 rounded-full">
            {contacts.length}
          </span>
        </h2>
        <Button
          type="button"
          onClick={openCreate}
          size="sm"
          className="bg-gradient-to-r from-[#00d4ff] to-cyan-600 text-black font-semibold rounded-xl hover:opacity-90"
        >
          <Plus className="w-4 h-4 mr-1.5" />
          New Contact
        </Button>
      </div>

      <div className="grid grid-cols-[2fr_1.5fr_1.5fr_1.5fr_130px_1.5fr_44px] gap-4 px-6 py-3 border-b border-white/5">
        {['Name', 'Company', 'Phone', 'Email', 'List', 'Campaign', ''].map((col) => (
          <span key={col} className="text-xs font-bold uppercase tracking-wider text-gray-500">{col}</span>
        ))}
      </div>

      {contacts.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20">
          <p className="text-sm text-gray-500 mb-4">No contacts found</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={openCreate}
            className="border-dashed border-white/10 text-gray-500 hover:text-white hover:border-white/20 rounded-xl"
          >
            <Plus className="w-4 h-4 mr-1.5" />
            Add your first contact
          </Button>
        </div>
      )}

      <div className="divide-y divide-white/5">
        {contacts.map((contact) => (
          <div
            key={contact.id}
            onClick={() => openEdit(contact)}
            className="grid grid-cols-[2fr_1.5fr_1.5fr_1.5fr_130px_1.5fr_44px] gap-4 px-6 py-4 items-center cursor-pointer hover:bg-white/[0.02] transition-colors duration-200"
          >
            <span className="text-sm font-medium text-white truncate">
              {contact.firstName} {contact.lastName}
            </span>
            <span className="text-sm text-gray-400 truncate">{contact.companyName ?? '—'}</span>
            <span className="text-sm text-gray-400 truncate font-mono">{contact.phone ?? '—'}</span>
            <span className="text-sm text-gray-400 truncate">{contact.email ?? '—'}</span>
            <Badge className={`text-[10px] font-semibold border-0 w-fit ${LIST_STYLES[contact.list]}`}>
              {LIST_LABELS[contact.list]}
            </Badge>
            <span className="text-sm text-gray-400 truncate">{contact.campaign.name}</span>
            <DropdownMenu>
              <DropdownMenuTrigger
                className="w-8 h-8 rounded-lg text-gray-500 hover:text-white flex items-center justify-center"
                onClick={(e) => e.stopPropagation()}
              >
                <MoreHorizontal className="w-4 h-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="rounded-xl border-white/10 bg-card-solid">
                <DropdownMenuItem
                  onClick={(e) => { e.stopPropagation(); openEdit(contact) }}
                  className="text-gray-300 hover:text-white rounded-lg cursor-pointer"
                >
                  Edit
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={async (e) => {
                    e.stopPropagation()
                    if (!window.confirm(`Delete ${contact.firstName} ${contact.lastName}?`)) return
                    await deleteContact(contact.id)
                  }}
                  className="text-red-400 hover:text-red-300 focus:text-red-300 rounded-lg cursor-pointer"
                >
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ))}
      </div>

      {nextCursor && (
        <div className="px-6 py-4 border-t border-white/5 flex justify-center">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="border-white/10 text-gray-400 hover:text-white hover:border-white/20 rounded-xl"
            onClick={() => {
              const url = new URL(window.location.href)
              url.searchParams.set('cursor', nextCursor)
              window.location.href = url.toString()
            }}
          >
            Load more
          </Button>
        </div>
      )}

      <ContactDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        contact={selected}
        campaigns={campaigns}
        defaultCampaignId={defaultCampaignId}
      />
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add src/components/contacts/ContactsTable.tsx
git commit -m "Add ContactsTable component"
```

---

## Task 12: Contacts page

**Files:**
- Create: `src/app/(dashboard)/contacts/page.tsx`

- [ ] **Step 1: Create contacts page**

Create `src/app/(dashboard)/contacts/page.tsx`:

```typescript
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import { Header } from '@/components/layout/Header'
import { PageShell } from '@/components/layout/PageShell'
import { ContactsTable } from '@/components/contacts/ContactsTable'
import { ContactFilters } from '@/components/contacts/ContactFilters'
import { db, withTenant } from '@/lib/db'
import { getCurrentTenantId, getCurrentUserRole, hasPermission } from '@/lib/auth'

interface SearchParams {
  campaignId?: string
  list?: string
  search?: string
  cursor?: string
}

async function getPageData(tenantId: string, role: string, sp: SearchParams) {
  return withTenant(tenantId, async () => {
    const limit = 25
    const { campaignId, list, search, cursor } = sp

    const where = {
      deletedAt: null,
      ...(campaignId ? { campaignId } : {}),
      ...(list ? { list: list as never } : {}),
      ...(search ? {
        OR: [
          { firstName:   { contains: search, mode: 'insensitive' as const } },
          { lastName:    { contains: search, mode: 'insensitive' as const } },
          { email:       { contains: search, mode: 'insensitive' as const } },
          { companyName: { contains: search, mode: 'insensitive' as const } },
        ],
      } : {}),
    }

    const contacts = await db.contact.findMany({
      where,
      take: limit,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { createdAt: 'desc' },
      include: { campaign: { select: { id: true, name: true } } },
    })

    const campaigns = hasPermission(role, 'campaigns:read')
      ? await db.campaign.findMany({
          where: { deletedAt: null },
          select: { id: true, name: true },
          orderBy: { name: 'asc' },
        })
      : []

    const nextCursor = contacts.length === limit ? contacts[contacts.length - 1].id : null

    return { contacts, campaigns, nextCursor }
  })
}

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const tenantId = await getCurrentTenantId()
  if (!tenantId) redirect('/sign-in')

  const role = await getCurrentUserRole()
  if (!role || !hasPermission(role, 'contacts:read')) redirect('/')

  const sp = await searchParams
  const { contacts, campaigns, nextCursor } = await getPageData(tenantId, role, sp)

  return (
    <>
      <Header title="Contacts" subtitle="Manage your campaign contacts" />
      <PageShell>
        <div className="space-y-4">
          <Suspense>
            <ContactFilters campaigns={campaigns} />
          </Suspense>
          <ContactsTable
            contacts={contacts}
            campaigns={campaigns}
            defaultCampaignId={sp.campaignId}
            nextCursor={nextCursor}
          />
        </div>
      </PageShell>
    </>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add src/app/\(dashboard\)/contacts/
git commit -m "Add contacts page"
```

---

## Task 13: ColumnMapper component

**Files:**
- Create: `src/components/imports/ColumnMapper.tsx`

- [ ] **Step 1: Create ColumnMapper.tsx**

Create `src/components/imports/ColumnMapper.tsx`:

```typescript
'use client'

import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { CONTACT_FIELDS } from '@/lib/csv/types'
import type { ColumnMapping } from '@/lib/csv/types'

interface ColumnMapperProps {
  headers: string[]
  mappings: ColumnMapping[]
  onChange: (mappings: ColumnMapping[]) => void
}

export function ColumnMapper({ headers, mappings, onChange }: ColumnMapperProps) {
  const updateMapping = (csvHeader: string, contactField: string) => {
    onChange(
      mappings.map((m) =>
        m.csvHeader === csvHeader
          ? { ...m, contactField: (contactField as ColumnMapping['contactField']) || null }
          : m
      )
    )
  }

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2 px-3 pb-2 border-b border-white/5">
        <span className="text-xs font-bold uppercase tracking-wider text-gray-500">CSV Column</span>
        <span className="text-xs font-bold uppercase tracking-wider text-gray-500">Maps To</span>
      </div>
      {headers.map((header) => {
        const mapping = mappings.find((m) => m.csvHeader === header)
        return (
          <div key={header} className="grid grid-cols-2 gap-2 items-center">
            <span className="text-sm text-gray-300 font-mono truncate px-3">{header}</span>
            <Select
              value={mapping?.contactField ?? ''}
              onValueChange={(v) => updateMapping(header, v)}
            >
              <SelectTrigger className="bg-white/5 border-white/10 text-white rounded-xl text-sm">
                <SelectValue placeholder="Skip column" />
              </SelectTrigger>
              <SelectContent className="rounded-xl border-white/10 bg-card-solid">
                <SelectItem value=""
                  className="text-gray-500 focus:bg-white/5 focus:text-white rounded-lg">
                  Skip column
                </SelectItem>
                {CONTACT_FIELDS.map(({ value, label }) => (
                  <SelectItem key={value} value={value}
                    className="text-gray-300 focus:bg-white/5 focus:text-white rounded-lg">
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add src/components/imports/ColumnMapper.tsx
git commit -m "Add ColumnMapper component"
```

---

## Task 14: DuplicateReview component

**Files:**
- Create: `src/components/imports/DuplicateReview.tsx`

- [ ] **Step 1: Create DuplicateReview.tsx**

Create `src/components/imports/DuplicateReview.tsx`:

```typescript
'use client'

import type { DuplicateRow, MappedRow } from '@/lib/csv/types'

interface DuplicateReviewProps {
  duplicates: DuplicateRow[]
  dnc: MappedRow[]
  onChange: (duplicates: DuplicateRow[]) => void
}

export function DuplicateReview({ duplicates, dnc, onChange }: DuplicateReviewProps) {
  const updateResolution = (index: number, resolution: 'skip' | 'overwrite') => {
    onChange(duplicates.map((d, i) => (i === index ? { ...d, resolution } : d)))
  }

  return (
    <div className="space-y-6">
      {duplicates.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-white mb-3">
            Duplicates
            <span className="ml-2 font-mono text-[10px] bg-amber-500/10 text-amber-400 px-2 py-0.5 rounded-full">
              {duplicates.length}
            </span>
          </h3>
          <div className="space-y-2">
            {duplicates.map((dup, i) => (
              <div key={i} className="glass-panel rounded-2xl p-4 space-y-3">
                <div className="grid grid-cols-2 gap-4 text-xs">
                  <div>
                    <p className="text-gray-500 mb-1 uppercase tracking-wider font-semibold text-[10px]">Existing</p>
                    <p className="text-white">{dup.existing.firstName} {dup.existing.lastName}</p>
                    <p className="text-gray-400">{dup.existing.email ?? '—'}</p>
                    <p className="text-gray-400">{dup.existing.companyName ?? '—'}</p>
                    <p className="text-[10px] font-mono text-gray-600 mt-1">{dup.existing.list}</p>
                  </div>
                  <div>
                    <p className="text-gray-500 mb-1 uppercase tracking-wider font-semibold text-[10px]">Incoming</p>
                    <p className="text-white">{dup.incoming.firstName} {dup.incoming.lastName}</p>
                    <p className="text-gray-400">{dup.incoming.email ?? '—'}</p>
                    <p className="text-gray-400">{dup.incoming.companyName ?? '—'}</p>
                  </div>
                </div>
                <div className="flex gap-4 border-t border-white/5 pt-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name={`dup-${i}`}
                      value="skip"
                      checked={dup.resolution === 'skip'}
                      onChange={() => updateResolution(i, 'skip')}
                      className="accent-gray-400"
                    />
                    <span className="text-xs text-gray-400">Skip</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name={`dup-${i}`}
                      value="overwrite"
                      checked={dup.resolution === 'overwrite'}
                      onChange={() => updateResolution(i, 'overwrite')}
                      className="accent-[#00d4ff]"
                    />
                    <span className="text-xs text-gray-400">Overwrite with incoming</span>
                  </label>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {dnc.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-white mb-3">
            DNC — Always Skipped
            <span className="ml-2 font-mono text-[10px] bg-red-500/10 text-red-400 px-2 py-0.5 rounded-full">
              {dnc.length}
            </span>
          </h3>
          <div className="space-y-1">
            {dnc.map((row, i) => (
              <div key={i}
                className="flex items-center gap-4 px-4 py-2.5 rounded-xl bg-red-500/5 border border-red-500/10">
                <span className="text-sm text-gray-400">{row.firstName} {row.lastName}</span>
                <span className="text-sm text-gray-600">{row.email ?? row.phone ?? '—'}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add src/components/imports/DuplicateReview.tsx
git commit -m "Add DuplicateReview component"
```

---

## Task 15: ImportWizard component

**Files:**
- Create: `src/components/imports/ImportWizard.tsx`

- [ ] **Step 1: Create ImportWizard.tsx**

Create `src/components/imports/ImportWizard.tsx`:

```typescript
'use client'

import { useState, useRef } from 'react'
import { Upload, ArrowRight, ArrowLeft, CheckCircle } from 'lucide-react'
import Papa from 'papaparse'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { ColumnMapper } from './ColumnMapper'
import { DuplicateReview } from './DuplicateReview'
import { parseImportPreview, importContacts } from '@/app/(dashboard)/imports/actions'
import type {
  ColumnMapping, RawRow, ImportPreviewResult, DuplicateRow, ContactField,
} from '@/lib/csv/types'
import type { Campaign } from '@prisma/client'

type Step = 'upload' | 'review' | 'result'

interface ImportWizardProps {
  campaigns: Pick<Campaign, 'id' | 'name'>[]
}

function guessField(header: string): ContactField | null {
  const h = header.toLowerCase().replace(/[^a-z]/g, '')
  if (h.includes('firstname') || h === 'first')   return 'firstName'
  if (h.includes('lastname')  || h === 'last')    return 'lastName'
  if (h.includes('email'))                         return 'email'
  if (h.includes('phone') || h.includes('mobile') || h.includes('cell')) return 'phone'
  if (h.includes('company') || h.includes('organization')) return 'companyName'
  if (h.includes('title') || h.includes('jobtitle') || h.includes('position')) return 'jobTitle'
  if (h.includes('address') || h.includes('street')) return 'address'
  if (h.includes('city'))                          return 'city'
  if (h.includes('state') || h.includes('province')) return 'state'
  if (h.includes('zip') || h.includes('postal'))  return 'zip'
  if (h.includes('website') || h.includes('domain')) return 'website'
  if (h.includes('linkedin'))                      return 'linkedinUrl'
  return null
}

export function ImportWizard({ campaigns }: ImportWizardProps) {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [step, setStep]           = useState<Step>('upload')
  const [campaignId, setCampaignId] = useState('')
  const [fileName, setFileName]   = useState('')
  const [rawRows, setRawRows]     = useState<RawRow[]>([])
  const [headers, setHeaders]     = useState<string[]>([])
  const [mappings, setMappings]   = useState<ColumnMapping[]>([])
  const [preview, setPreview]     = useState<ImportPreviewResult | null>(null)
  const [duplicates, setDuplicates] = useState<DuplicateRow[]>([])
  const [result, setResult]       = useState<{ created: number; overwritten: number; skipped: number; dncBlocked: number } | null>(null)
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState<string | null>(null)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name)
    setError(null)

    Papa.parse<RawRow>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (res) => {
        const hdrs = res.meta.fields ?? []
        setHeaders(hdrs)
        setRawRows(res.data)
        setMappings(hdrs.map((h) => ({ csvHeader: h, contactField: guessField(h) })))
      },
    })
  }

  const handlePreview = async () => {
    if (!campaignId)    { setError('Please select a campaign'); return }
    if (!rawRows.length){ setError('Please upload a CSV file'); return }

    const emailMapped = mappings.some((m) => m.contactField === 'email')
    const phoneMapped = mappings.some((m) => m.contactField === 'phone')
    if (!emailMapped && !phoneMapped) {
      setError('Map at least one of: Email, Phone')
      return
    }

    setLoading(true)
    setError(null)
    try {
      const res = await parseImportPreview(rawRows, mappings, campaignId)
      setPreview(res)
      setDuplicates(res.duplicates)
      setStep('review')
    } catch {
      setError('Failed to process file. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleImport = async () => {
    if (!preview) return
    setLoading(true)
    setError(null)
    try {
      const res = await importContacts(preview.clean, duplicates, campaignId)
      setResult({ ...res, dncBlocked: preview.dnc.length })
      setStep('result')
    } catch {
      setError('Import failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const steps: Step[] = ['upload', 'review', 'result']
  const stepLabels = { upload: 'Upload & Map', review: 'Review', result: 'Done' }

  return (
    <div className="glass-panel rounded-3xl overflow-hidden">
      {/* Step indicator */}
      <div className="flex items-center gap-2 px-6 py-4 border-b border-white/5">
        {steps.map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-mono font-semibold ${
              step === s
                ? 'bg-accent/20 text-[#00d4ff]'
                : steps.indexOf(step) > i
                  ? 'bg-emerald-500/20 text-emerald-400'
                  : 'bg-white/5 text-gray-500'
            }`}>
              {i + 1}
            </div>
            <span className={`text-xs font-medium ${step === s ? 'text-white' : 'text-gray-500'}`}>
              {stepLabels[s]}
            </span>
            {i < steps.length - 1 && <span className="text-gray-600 text-xs mx-1">→</span>}
          </div>
        ))}
      </div>

      <div className="p-6">
        {/* Step 1: Upload & Map */}
        {step === 'upload' && (
          <div className="space-y-6">
            <div className="space-y-1.5">
              <Label className="text-xs text-gray-400">Campaign *</Label>
              <Select value={campaignId} onValueChange={setCampaignId}>
                <SelectTrigger className="bg-white/5 border-white/10 text-white rounded-xl">
                  <SelectValue placeholder="Select a campaign…" />
                </SelectTrigger>
                <SelectContent className="rounded-xl border-white/10 bg-card-solid">
                  {campaigns.map((c) => (
                    <SelectItem key={c.id} value={c.id}
                      className="text-gray-300 focus:bg-white/5 focus:text-white rounded-lg">
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-white/10 rounded-2xl p-10 flex flex-col items-center justify-center cursor-pointer hover:border-white/20 hover:bg-white/[0.02] transition-colors"
            >
              <Upload className="w-8 h-8 text-gray-500 mb-3" />
              {fileName ? (
                <p className="text-sm text-white font-medium">{fileName}</p>
              ) : (
                <>
                  <p className="text-sm text-gray-400">Drop a CSV here or click to browse</p>
                  <p className="text-xs text-gray-600 mt-1">Max 10MB · .csv only</p>
                </>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                className="hidden"
                onChange={handleFileChange}
              />
            </div>

            {headers.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3">
                  Map Columns — {rawRows.length} rows detected
                </p>
                <ColumnMapper headers={headers} mappings={mappings} onChange={setMappings} />
              </div>
            )}

            {error && <p className="text-sm text-red-400">{error}</p>}

            <div className="flex justify-end">
              <Button
                type="button"
                onClick={handlePreview}
                disabled={loading || !rawRows.length || !campaignId}
                className="bg-gradient-to-r from-[#00d4ff] to-cyan-600 text-black font-semibold rounded-xl hover:opacity-90"
              >
                {loading ? 'Processing…' : 'Preview Import'}
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          </div>
        )}

        {/* Step 2: Review */}
        {step === 'review' && preview && (
          <div className="space-y-6">
            <div className="flex items-center gap-6 p-4 glass-panel rounded-2xl">
              <div className="text-center">
                <p className="font-mono text-2xl font-semibold text-white">{preview.clean.length}</p>
                <p className="text-xs text-gray-500 mt-0.5">clean</p>
              </div>
              <div className="w-px h-10 bg-white/10" />
              <div className="text-center">
                <p className="font-mono text-2xl font-semibold text-amber-400">{preview.duplicates.length}</p>
                <p className="text-xs text-gray-500 mt-0.5">duplicates</p>
              </div>
              <div className="w-px h-10 bg-white/10" />
              <div className="text-center">
                <p className="font-mono text-2xl font-semibold text-red-400">{preview.dnc.length}</p>
                <p className="text-xs text-gray-500 mt-0.5">DNC</p>
              </div>
              {preview.invalidRowCount > 0 && (
                <>
                  <div className="w-px h-10 bg-white/10" />
                  <div className="text-center">
                    <p className="font-mono text-2xl font-semibold text-gray-500">{preview.invalidRowCount}</p>
                    <p className="text-xs text-gray-500 mt-0.5">invalid</p>
                  </div>
                </>
              )}
            </div>

            <DuplicateReview duplicates={duplicates} dnc={preview.dnc} onChange={setDuplicates} />

            {error && <p className="text-sm text-red-400">{error}</p>}

            <div className="flex justify-between">
              <Button
                type="button"
                variant="outline"
                onClick={() => setStep('upload')}
                className="bg-white/5 border-white/10 text-gray-300 hover:bg-white/10 rounded-xl"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back
              </Button>
              <Button
                type="button"
                onClick={handleImport}
                disabled={loading}
                className="bg-gradient-to-r from-[#00d4ff] to-cyan-600 text-black font-semibold rounded-xl hover:opacity-90"
              >
                {loading
                  ? 'Importing…'
                  : `Import ${preview.clean.length + duplicates.filter((d) => d.resolution === 'overwrite').length} Contacts`}
              </Button>
            </div>
          </div>
        )}

        {/* Step 3: Result */}
        {step === 'result' && result && (
          <div className="flex flex-col items-center py-12 space-y-6">
            <CheckCircle className="w-16 h-16 text-emerald-400" />
            <div className="text-center">
              <h3 className="text-lg font-semibold text-white mb-2">Import Complete</h3>
              <p className="text-sm text-gray-400">
                {result.created} imported · {result.overwritten} overwritten · {result.skipped} skipped · {result.dncBlocked} DNC blocked
              </p>
            </div>
            <Button
              type="button"
              onClick={() => router.push(`/contacts?campaignId=${campaignId}`)}
              className="bg-gradient-to-r from-[#00d4ff] to-cyan-600 text-black font-semibold rounded-xl hover:opacity-90"
            >
              Go to Contacts
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add src/components/imports/ImportWizard.tsx
git commit -m "Add ImportWizard component"
```

---

## Task 16: Imports page

**Files:**
- Create: `src/app/(dashboard)/imports/page.tsx`

- [ ] **Step 1: Create imports page**

Create `src/app/(dashboard)/imports/page.tsx`:

```typescript
import { redirect } from 'next/navigation'
import { Header } from '@/components/layout/Header'
import { PageShell } from '@/components/layout/PageShell'
import { ImportWizard } from '@/components/imports/ImportWizard'
import { db, withTenant } from '@/lib/db'
import { getCurrentTenantId, getCurrentUserRole, hasPermission } from '@/lib/auth'

export default async function ImportsPage() {
  const tenantId = await getCurrentTenantId()
  if (!tenantId) redirect('/sign-in')

  const role = await getCurrentUserRole()
  if (!role || !hasPermission(role, 'contacts:write')) redirect('/')

  const campaigns = await withTenant(tenantId, () =>
    db.campaign.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    })
  )

  return (
    <>
      <Header title="Import Contacts" subtitle="Upload a CSV to add contacts to a campaign" />
      <PageShell>
        <ImportWizard campaigns={campaigns} />
      </PageShell>
    </>
  )
}
```

- [ ] **Step 2: Run all tests**

```bash
npm test -- --reporter=verbose
```

Expected: all tests pass.

- [ ] **Step 3: Verify full TypeScript compile**

```bash
npx tsc --noEmit
```

Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add src/app/\(dashboard\)/imports/
git commit -m "Add imports page"
```

---

## Self-Review Checklist (run after all tasks)

After completing all 16 tasks, verify:

1. `npm test` — all tests pass
2. `npx tsc --noEmit` — no TypeScript errors
3. Spec coverage:
   - ✅ Contact model + ContactList enum in schema
   - ✅ `contacts:read` / `contacts:write` permissions
   - ✅ CSV types, dedup, parse modules with tests
   - ✅ createContact, updateContact, deleteContact server actions
   - ✅ parseImportPreview, importContacts server actions
   - ✅ GET/POST /api/contacts, PATCH/DELETE /api/contacts/[id]
   - ✅ ContactDrawer (create/edit, all sections, DNC reason conditional)
   - ✅ ContactFilters (search, campaign filter, list filter)
   - ✅ ContactsTable (all columns, badges, pagination)
   - ✅ Contacts page (server component, URL params, Suspense)
   - ✅ ColumnMapper, DuplicateReview, ImportWizard components
   - ✅ Imports page
