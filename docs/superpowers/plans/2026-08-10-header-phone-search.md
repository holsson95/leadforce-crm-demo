# Header Contact Lookup by Phone Number Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an SDR type or paste a phone number (or name/company) into an always-visible search box in the app header and immediately see which contact it belongs to, from any dashboard page.

**Architecture:** Two precomputed, indexed digit-only columns on `Contact` (`mobilePhoneDigits`, `corporatePhoneDigits`) are kept in sync at every contact write site, mirroring the existing `dedupeHash` pattern. A new `GET /api/contacts/lookup` endpoint does an exact match on those columns (plus a text search on name/email/company) and returns up to 8 results. A header-mounted `HeaderSearch` client component debounces input, calls that endpoint, and on selecting a result opens a new read-only `ContactLookupDrawer` (built on the existing `SlideDrawer` primitive, reusing the existing `ContactExpandPanel` view/edit component from the dialer) so the SDR can see — and, if needed, edit — the contact without leaving the page they were on.

**Tech Stack:** Next.js 14 App Router, Prisma + PostgreSQL, Zod, Vitest + React Testing Library, Tailwind (LeadForce CSS variables), Zustand (`dialer-store`, indirectly via reused `ContactExpandPanel`).

## Global Constraints

- Every tenant-scoped query must filter by `tenantId` — use `withTenant()` from `src/lib/db.ts` and, in API routes, also pass `tenantId` explicitly in the Prisma `where` (matches the existing double-enforcement pattern already used in `src/app/api/contacts/route.ts` and `src/app/api/contacts/[id]/route.ts`).
- API response shape: `{ data: T }` on success, `{ error: string, details?: any }` on failure (per `CLAUDE.md` API Conventions).
- No inline `style` attributes except dynamic values; use the LeadForce CSS variables (`--panel-border`, `--text-primary`, `--text-secondary`, `--text-muted`, `--lf-accent`, `--card-bg`, `--card-bg-solid`) already used throughout `src/components/`.
- One component per file, filename matches component name in PascalCase, no barrel exports.
- Client components require `'use client'` at the top; keep server components server-only otherwise.
- Tests use Vitest (`npm run test:run` for a one-shot run) — pure logic in `src/lib/**/__tests__/*.test.ts`, interactive components in `src/components/**/__tests__/*.test.tsx` using `@testing-library/react`, following the existing `global.fetch = vi.fn()` mocking pattern seen in `src/components/dialer/__tests__/ProfileActionBar.test.tsx`.
- Phone matching is **exact**, not partial: both stored values and the search query are normalized to digits the same way, so `equals` (index-backed) is used, never `contains` (which would force a sequential scan on the new index).

---

### Task 1: `normalizePhoneDigits` utility

**Files:**
- Create: `src/lib/utils/phone.ts`
- Test: `src/lib/__tests__/phone.test.ts`

**Interfaces:**
- Produces: `normalizePhoneDigits(value: string | null | undefined): string | null` — strips all non-digit characters; if the result is 11 digits and starts with `1`, drops that leading digit; returns `null` for empty/whitespace-only/null/undefined input.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/__tests__/phone.test.ts
import { describe, it, expect } from 'vitest'
import { normalizePhoneDigits } from '../utils/phone'

describe('normalizePhoneDigits', () => {
  it('strips formatting characters', () => {
    expect(normalizePhoneDigits('555-123-4567')).toBe('5551234567')
  })

  it('strips a leading US country code (+1)', () => {
    expect(normalizePhoneDigits('+1 (555) 123-4567')).toBe('5551234567')
  })

  it('strips a leading US country code with no plus sign', () => {
    expect(normalizePhoneDigits('15551234567')).toBe('5551234567')
  })

  it('leaves a 10-digit number as-is', () => {
    expect(normalizePhoneDigits('5551234567')).toBe('5551234567')
  })

  it('does not strip a leading 1 when the total is not 11 digits', () => {
    expect(normalizePhoneDigits('123')).toBe('123')
  })

  it('leaves non-US-length numbers as-is (no country-code assumption)', () => {
    expect(normalizePhoneDigits('442079460958')).toBe('442079460958')
  })

  it('returns null for null', () => {
    expect(normalizePhoneDigits(null)).toBeNull()
  })

  it('returns null for undefined', () => {
    expect(normalizePhoneDigits(undefined)).toBeNull()
  })

  it('returns null for an empty string', () => {
    expect(normalizePhoneDigits('')).toBeNull()
  })

  it('returns null for a string with no digits', () => {
    expect(normalizePhoneDigits('n/a')).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/phone.test.ts`
Expected: FAIL — `Cannot find module '../utils/phone'` (file doesn't exist yet).

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/utils/phone.ts
export function normalizePhoneDigits(value: string | null | undefined): string | null {
  if (!value) return null
  const digits = value.replace(/\D/g, '')
  if (digits.length === 11 && digits.startsWith('1')) {
    return digits.slice(1)
  }
  return digits || null
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/__tests__/phone.test.ts`
Expected: PASS (10 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/utils/phone.ts src/lib/__tests__/phone.test.ts
git commit -m "Add normalizePhoneDigits utility for phone number matching"
```

---

### Task 2: Contact schema — precomputed digit columns + backfill

**Files:**
- Modify: `prisma/schema.prisma` (`Contact` model, currently lines 175-220)
- Create: `prisma/migrations/<timestamp>_add_contact_phone_digits/migration.sql` (generated, then hand-edited)

**Interfaces:**
- Produces: `Contact.mobilePhoneDigits: string | null` and `Contact.corporatePhoneDigits: string | null` on the generated Prisma Client, each backed by a `@@index([tenantId, <field>])`.

- [ ] **Step 1: Add the two fields and indexes to the schema**

In `prisma/schema.prisma`, in the `Contact` model, add the new fields directly after `corporatePhone` (currently line 184):

```prisma
  mobilePhone        String?
  corporatePhone     String?
  mobilePhoneDigits    String?
  corporatePhoneDigits String?
```

And add two new indexes alongside the existing ones (currently lines 216-219):

```prisma
  @@unique([tenantId, dedupeHash])
  @@index([tenantId, campaignId])
  @@index([tenantId, status])
  @@index([tenantId, accountOwnerId])
  @@index([tenantId, mobilePhoneDigits])
  @@index([tenantId, corporatePhoneDigits])
```

- [ ] **Step 2: Generate the migration without applying it**

Run: `npx prisma migrate dev --name add_contact_phone_digits --create-only`
Expected: creates `prisma/migrations/<timestamp>_add_contact_phone_digits/migration.sql` containing `ALTER TABLE "Contact" ADD COLUMN "mobilePhoneDigits" TEXT, ADD COLUMN "corporatePhoneDigits" TEXT;` plus two `CREATE INDEX` statements. Does not touch the database yet.

- [ ] **Step 3: Append a backfill for existing rows to the generated migration file**

Open the generated `migration.sql` and append (this mirrors `normalizePhoneDigits` exactly — strip non-digits, drop a leading US country-code `1` when the result is 11 digits):

```sql
-- Backfill mobilePhoneDigits / corporatePhoneDigits for existing rows,
-- using the same normalization as src/lib/utils/phone.ts.
UPDATE "Contact"
SET "mobilePhoneDigits" = (
  CASE
    WHEN length(regexp_replace("mobilePhone", '\D', '', 'g')) = 11
     AND left(regexp_replace("mobilePhone", '\D', '', 'g'), 1) = '1'
    THEN substring(regexp_replace("mobilePhone", '\D', '', 'g') from 2)
    ELSE nullif(regexp_replace("mobilePhone", '\D', '', 'g'), '')
  END
)
WHERE "mobilePhone" IS NOT NULL;

UPDATE "Contact"
SET "corporatePhoneDigits" = (
  CASE
    WHEN length(regexp_replace("corporatePhone", '\D', '', 'g')) = 11
     AND left(regexp_replace("corporatePhone", '\D', '', 'g'), 1) = '1'
    THEN substring(regexp_replace("corporatePhone", '\D', '', 'g') from 2)
    ELSE nullif(regexp_replace("corporatePhone", '\D', '', 'g'), '')
  END
)
WHERE "corporatePhone" IS NOT NULL;
```

- [ ] **Step 4: Apply the migration**

Run: `npx prisma migrate dev`
Expected: applies the pending migration, regenerates the Prisma Client (`mobilePhoneDigits`/`corporatePhoneDigits` now appear on `Contact` in `@prisma/client` types).

- [ ] **Step 5: Manually verify the backfill**

Run: `npx prisma studio` (or a one-off query) and check a handful of existing contacts that have `mobilePhone` set — confirm `mobilePhoneDigits` is populated and digit-only, e.g. a contact with `mobilePhone = "+1 (555) 123-4567"` should show `mobilePhoneDigits = "5551234567"`.

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "Add indexed phone-digit columns to Contact for lookup matching"
```

---

### Task 3: `buildContactLookupWhere` query builder

**Files:**
- Create: `src/lib/contact-lookup.ts`
- Test: `src/lib/__tests__/contact-lookup.test.ts`

**Interfaces:**
- Consumes: `normalizePhoneDigits` from `src/lib/utils/phone.ts` (Task 1); `mobilePhoneDigits`/`corporatePhoneDigits` fields on `Contact` (Task 2).
- Produces: `buildContactLookupWhere(tenantId: string, query: string): Prisma.ContactWhereInput`, used by the lookup route in Task 6.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/__tests__/contact-lookup.test.ts
import { describe, it, expect } from 'vitest'
import { buildContactLookupWhere } from '../contact-lookup'

describe('buildContactLookupWhere', () => {
  it('matches nothing for an empty query', () => {
    const where = buildContactLookupWhere('tenant1', '')
    expect(where).toEqual({ tenantId: 'tenant1', deletedAt: null, OR: [] })
  })

  it('matches nothing for a whitespace-only query', () => {
    const where = buildContactLookupWhere('tenant1', '   ')
    expect(where).toEqual({ tenantId: 'tenant1', deletedAt: null, OR: [] })
  })

  it('builds text-only OR clauses for a name query', () => {
    const where = buildContactLookupWhere('tenant1', 'john') as { OR: unknown[] }
    expect(where.OR).toEqual([
      { firstName: { contains: 'john', mode: 'insensitive' } },
      { lastName: { contains: 'john', mode: 'insensitive' } },
      { email: { contains: 'john', mode: 'insensitive' } },
      { companyName: { contains: 'john', mode: 'insensitive' } },
    ])
  })

  it('adds exact digit-match clauses for a phone-shaped query', () => {
    const where = buildContactLookupWhere('tenant1', '+1 (555) 123-4567') as { OR: unknown[] }
    expect(where.OR).toContainEqual({ mobilePhoneDigits: { equals: '5551234567' } })
    expect(where.OR).toContainEqual({ corporatePhoneDigits: { equals: '5551234567' } })
  })

  it('always scopes to tenantId and excludes soft-deleted contacts', () => {
    const where = buildContactLookupWhere('tenant1', 'john') as { tenantId: string; deletedAt: null }
    expect(where.tenantId).toBe('tenant1')
    expect(where.deletedAt).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/contact-lookup.test.ts`
Expected: FAIL — `Cannot find module '../contact-lookup'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/contact-lookup.ts
import type { Prisma } from '@prisma/client'
import { normalizePhoneDigits } from './utils/phone'

export function buildContactLookupWhere(tenantId: string, query: string): Prisma.ContactWhereInput {
  const trimmed = query.trim()
  if (!trimmed) {
    return { tenantId, deletedAt: null, OR: [] }
  }

  const digits = normalizePhoneDigits(trimmed)

  const or: Prisma.ContactWhereInput[] = [
    { firstName:   { contains: trimmed, mode: 'insensitive' } },
    { lastName:    { contains: trimmed, mode: 'insensitive' } },
    { email:       { contains: trimmed, mode: 'insensitive' } },
    { companyName: { contains: trimmed, mode: 'insensitive' } },
  ]

  if (digits) {
    or.push({ mobilePhoneDigits: { equals: digits } })
    or.push({ corporatePhoneDigits: { equals: digits } })
  }

  return { tenantId, deletedAt: null, OR: or }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/__tests__/contact-lookup.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/contact-lookup.ts src/lib/__tests__/contact-lookup.test.ts
git commit -m "Add buildContactLookupWhere query builder for contact search"
```

---

### Task 4: Populate digit fields at contact create/update write sites

**Files:**
- Modify: `src/app/(dashboard)/contacts/actions.ts:10-51` (`createContact`) and `:53-96` (`updateContact`)
- Modify: `src/app/api/contacts/route.ts:91-115` (`POST`)
- Modify: `src/app/api/contacts/[id]/route.ts:59-119` (`PATCH`)

**Interfaces:**
- Consumes: `normalizePhoneDigits` from `src/lib/utils/phone.ts` (Task 1); `mobilePhoneDigits`/`corporatePhoneDigits` columns (Task 2).

- [ ] **Step 1: Update `createContact` in `src/app/(dashboard)/contacts/actions.ts`**

Add the import and compute the two fields alongside `dedupeHash`:

```ts
import { computeDedupeHash } from '@/lib/csv/dedup'
import { normalizePhoneDigits } from '@/lib/utils/phone'
```

In `createContact`, right after the existing `dedupeHash` line:

```ts
  const parsed = ContactSchema.parse(data)
  const dedupeHash = computeDedupeHash(parsed.email || null, parsed.mobilePhone || null)
  const mobilePhoneDigits = normalizePhoneDigits(parsed.mobilePhone)
  const corporatePhoneDigits = normalizePhoneDigits(parsed.corporatePhone)
```

And add the two fields to the `db.contact.create({ data: { ... } })` object, right after `corporatePhone`:

```ts
        mobilePhone:    parsed.mobilePhone    || null,
        corporatePhone: parsed.corporatePhone || null,
        mobilePhoneDigits,
        corporatePhoneDigits,
```

- [ ] **Step 2: Update `updateContact` in the same file**

`updateContact` merges the incoming phone value with the existing stored one before hashing (so a partial update doesn't null out the hash) — do the same for the digit fields, reusing the same merged value:

```ts
  const parsed = ContactSchema.parse(data)
  const existing = await db.contact.findUnique({ where: { id }, select: { email: true, mobilePhone: true, corporatePhone: true } })
  const emailForHash = parsed.email !== undefined ? parsed.email : existing?.email
  const phoneForHash = parsed.mobilePhone !== undefined ? parsed.mobilePhone : existing?.mobilePhone
  const dedupeHash = computeDedupeHash(emailForHash || null, phoneForHash || null)
  const corporatePhoneForUpdate = parsed.corporatePhone !== undefined ? parsed.corporatePhone : existing?.corporatePhone
  const mobilePhoneDigits = normalizePhoneDigits(phoneForHash)
  const corporatePhoneDigits = normalizePhoneDigits(corporatePhoneForUpdate)
```

(Note: `existing`'s `select` needs `corporatePhone: true` added — it currently only selects `email` and `mobilePhone`.)

And in the `db.contact.update({ data: { ... } })` object, right after `corporatePhone`:

```ts
        mobilePhone:    parsed.mobilePhone    || null,
        corporatePhone: parsed.corporatePhone || null,
        mobilePhoneDigits,
        corporatePhoneDigits,
```

- [ ] **Step 3: Update `POST` in `src/app/api/contacts/route.ts`**

Add the import:

```ts
import { normalizePhoneDigits } from '@/lib/utils/phone'
```

Right after the existing `dedupeHash` line in `POST`:

```ts
  const dedupeHash = computeDedupeHash(result.data.email ?? null, result.data.mobilePhone ?? null)
  const mobilePhoneDigits = normalizePhoneDigits(result.data.mobilePhone ?? null)
  const corporatePhoneDigits = normalizePhoneDigits(result.data.corporatePhone ?? null)
  const contact = await withTenant(tenantId, () =>
    db.contact.create({ data: { ...result.data, tenantId, dedupeHash, mobilePhoneDigits, corporatePhoneDigits } })
  )
```

- [ ] **Step 4: Update `PATCH` in `src/app/api/contacts/[id]/route.ts`**

Add the import:

```ts
import { normalizePhoneDigits } from '@/lib/utils/phone'
```

The existing handler already fetches `existing` with `select: { email: true, mobilePhone: true }` and merges `phoneForHash` — extend that same merge pattern for `corporatePhone` and compute the digit fields:

```ts
  const existing = await withTenant(tenantId, () =>
    db.contact.findUnique({ where: { id }, select: { email: true, mobilePhone: true, corporatePhone: true } })
  )
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const emailForHash = parsed.email !== undefined ? (parsed.email || null) : (existing?.email ?? null)
  const phoneForHash = parsed.mobilePhone !== undefined ? (parsed.mobilePhone || null) : (existing?.mobilePhone ?? null)
  const dedupeHash = computeDedupeHash(emailForHash, phoneForHash)
  const corporatePhoneForHash = parsed.corporatePhone !== undefined ? (parsed.corporatePhone || null) : (existing?.corporatePhone ?? null)
  const mobilePhoneDigits = normalizePhoneDigits(phoneForHash)
  const corporatePhoneDigits = normalizePhoneDigits(corporatePhoneForHash)
```

And add the two fields to the `db.contact.update({ data: { ... } })` object, alongside the existing `dedupeHash`:

```ts
      data: {
        ...parsed,
        status: parsed.status,
        mobilePhone: parsed.mobilePhone ?? undefined,
        corporatePhone: parsed.corporatePhone ?? undefined,
        mobilePhoneDigits,
        corporatePhoneDigits,
        industry: parsed.industry ?? undefined,
```

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 6: Manually verify**

Run: `npm run dev`, sign in, create a contact through the Contacts page UI with a formatted mobile phone (e.g. `+1 (555) 987-6543`), then check via `npx prisma studio` that the new row's `mobilePhoneDigits` is `5559876543`. Edit the same contact's corporate phone only (leave mobile untouched) and confirm `mobilePhoneDigits` is unchanged and `corporatePhoneDigits` now reflects the new value.

- [ ] **Step 7: Commit**

```bash
git add src/app/\(dashboard\)/contacts/actions.ts src/app/api/contacts/route.ts src/app/api/contacts/\[id\]/route.ts
git commit -m "Populate phone-digit columns on contact create/update"
```

---

### Task 5: Populate digit fields on CSV import

**Files:**
- Modify: `src/lib/csv/types.ts:49-70` (`MappedRow`)
- Modify: `src/lib/csv/parse.ts:26-52` (`toMappedRow`)
- Modify: `src/app/(dashboard)/imports/actions.ts:111-136` (overwrite branch of `importContacts`)
- Test: `src/lib/csv/__tests__/parse.test.ts` (existing file — extend it)

**Interfaces:**
- Consumes: `normalizePhoneDigits` from `src/lib/utils/phone.ts` (Task 1).
- Produces: `MappedRow.mobilePhoneDigits: string | null` and `MappedRow.corporatePhoneDigits: string | null`, flowing through `db.contact.createMany` in `importContacts` (the "brand new" and "restore" paths already spread the full `MappedRow` object, so no change is needed there — only the explicit-field overwrite branch needs the two new fields added).

- [ ] **Step 1: Read the existing test file to match its style**

Run: `cat src/lib/csv/__tests__/parse.test.ts` (or open it) to see how `toMappedRow` is currently tested, so the new assertions match the existing style exactly.

- [ ] **Step 2: Add a failing test for `toMappedRow`**

Add to `src/lib/csv/__tests__/parse.test.ts` (inside the existing `describe('toMappedRow', ...)` block, or a new one matching the file's structure):

```ts
it('computes mobilePhoneDigits and corporatePhoneDigits', () => {
  const row = toMappedRow({
    firstName: 'John', lastName: 'Smith',
    mobilePhone: '+1 (555) 123-4567',
    corporatePhone: '555-987-6543',
  })
  expect(row.mobilePhoneDigits).toBe('5551234567')
  expect(row.corporatePhoneDigits).toBe('5559876543')
})

it('sets mobilePhoneDigits/corporatePhoneDigits to null when phone fields are absent', () => {
  const row = toMappedRow({ firstName: 'John', lastName: 'Smith' })
  expect(row.mobilePhoneDigits).toBeNull()
  expect(row.corporatePhoneDigits).toBeNull()
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/lib/csv/__tests__/parse.test.ts`
Expected: FAIL — `row.mobilePhoneDigits` is `undefined`, not `'5551234567'`.

- [ ] **Step 4: Add the fields to `MappedRow`**

In `src/lib/csv/types.ts`, add to `MappedRow` right after `corporatePhone`:

```ts
export type MappedRow = {
  firstName: string
  lastName: string
  email: string | null
  mobilePhone: string | null
  corporatePhone: string | null
  mobilePhoneDigits: string | null
  corporatePhoneDigits: string | null
  companyName: string | null
  ...
```

- [ ] **Step 5: Compute the fields in `toMappedRow`**

In `src/lib/csv/parse.ts`, add the import — this file uses relative imports for its sibling `lib` modules (e.g. `import { computeDedupeHash } from './dedup'`), so match that convention:

```ts
import { normalizePhoneDigits } from '../utils/phone'
```

In `toMappedRow`, after `mobilePhone` is derived:

```ts
export function toMappedRow(mapped: Partial<Record<ContactField, string>>): MappedRow {
  const email = mapped.email?.trim() || null
  const mobilePhone = mapped.mobilePhone?.trim() || null
  const corporatePhone = mapped.corporatePhone?.trim() || null
  const rawEmployeeCount = mapped.employeeCount?.trim()
  const employeeCount = rawEmployeeCount ? (parseInt(rawEmployeeCount, 10) || null) : null
  return {
    firstName:      mapped.firstName?.trim()      ?? '',
    lastName:       mapped.lastName?.trim()       ?? '',
    email,
    mobilePhone,
    corporatePhone,
    mobilePhoneDigits:    normalizePhoneDigits(mobilePhone),
    corporatePhoneDigits: normalizePhoneDigits(corporatePhone),
    companyName:    mapped.companyName?.trim()    || null,
    ...
```

(Replace the previous inline `corporatePhone: mapped.corporatePhone?.trim() || null,` line with the new `corporatePhone` variable reference, since it's now computed above to be reused by `normalizePhoneDigits`.)

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run src/lib/csv/__tests__/parse.test.ts`
Expected: PASS (all existing tests plus the 2 new ones)

- [ ] **Step 7: Update the overwrite branch in `importContacts`**

In `src/app/(dashboard)/imports/actions.ts`, the `toOverwrite` loop (currently lines 111-135) lists fields explicitly rather than spreading `dup.incoming` — add the two new fields:

```ts
      for (const dup of toOverwrite) {
        await tx.contact.update({
          where: { id: dup.existing.id },
          data: {
            firstName:      dup.incoming.firstName,
            lastName:       dup.incoming.lastName,
            email:          dup.incoming.email,
            mobilePhone:    dup.incoming.mobilePhone,
            corporatePhone: dup.incoming.corporatePhone,
            mobilePhoneDigits:    dup.incoming.mobilePhoneDigits,
            corporatePhoneDigits: dup.incoming.corporatePhoneDigits,
            companyName:    dup.incoming.companyName,
```

- [ ] **Step 8: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors (the `brandNew`/`toRestore` paths in `importContacts` already spread the full `MappedRow`, including the new fields, so they need no code change — only a type-check pass to confirm).

- [ ] **Step 9: Commit**

```bash
git add src/lib/csv/types.ts src/lib/csv/parse.ts src/lib/csv/__tests__/parse.test.ts src/app/\(dashboard\)/imports/actions.ts
git commit -m "Populate phone-digit columns on CSV contact import"
```

---

### Task 6: `GET /api/contacts/lookup` endpoint

**Files:**
- Create: `src/app/api/contacts/lookup/route.ts`

**Interfaces:**
- Consumes: `buildContactLookupWhere` (Task 3), `hasPermission`/`getClerkMeta` from `src/lib/auth.ts`, `db`/`withTenant` from `src/lib/db.ts`.
- Produces: `GET /api/contacts/lookup?q=<string>` → `{ data: LookupResult[] }` where `LookupResult = { id, firstName, lastName, mobilePhone: string | null, corporatePhone: string | null, companyName: string | null, status: ContactStatus, campaign: { name: string } }`. Consumed by `HeaderSearch` (Task 11).

- [ ] **Step 1: Write the route**

```ts
// src/app/api/contacts/lookup/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db, withTenant } from '@/lib/db'
import { hasPermission, getClerkMeta } from '@/lib/auth'
import { buildContactLookupWhere } from '@/lib/contact-lookup'

export async function GET(request: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { role, tenantId } = await getClerkMeta()
  if (!hasPermission(role, 'contacts:read') || !tenantId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const q = request.nextUrl.searchParams.get('q') ?? ''
  const where = buildContactLookupWhere(tenantId, q)

  const contacts = await withTenant(tenantId, () =>
    db.contact.findMany({
      where,
      take: 8,
      orderBy: { createdAt: 'desc' },
      select: {
        id:             true,
        firstName:      true,
        lastName:       true,
        mobilePhone:    true,
        corporatePhone: true,
        companyName:    true,
        status:         true,
        campaign:       { select: { name: true } },
      },
    })
  )

  return NextResponse.json({ data: contacts })
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Manually verify**

Run: `npm run dev`, sign in, and in the browser console (or via `curl` with a valid session cookie) hit `/api/contacts/lookup?q=555` or a real contact's phone/name from your dev data — confirm the response is `{ "data": [...] }` with matches, and that `/api/contacts/lookup?q=` (empty) returns `{ "data": [] }`.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/contacts/lookup/route.ts
git commit -m "Add GET /api/contacts/lookup endpoint for header contact search"
```

---

### Task 7: `GET /api/users` endpoint

**Files:**
- Create: `src/app/api/users/route.ts`

**Interfaces:**
- Produces: `GET /api/users` → `{ data: { id: string; name: string }[] }` (admin/manager/sdr users, tenant-scoped, non-deleted). Consumed by `ContactLookupDrawer` (Task 10) to populate the account-owner dropdown when editing a contact inline.

- [ ] **Step 1: Write the route**

This mirrors the `db.user.findMany` call already made server-side in `src/app/(dashboard)/contacts/page.tsx:73-80`, exposed as a small client-fetchable endpoint gated the same way (`contacts:read`) since it exists solely to populate the account-owner picker for contact editing.

```ts
// src/app/api/users/route.ts
import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db, withTenant } from '@/lib/db'
import { hasPermission, getClerkMeta } from '@/lib/auth'

export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { role, tenantId } = await getClerkMeta()
  if (!hasPermission(role, 'contacts:read') || !tenantId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const users = await withTenant(tenantId, () =>
    db.user.findMany({
      where:   { deletedAt: null, role: { in: ['admin', 'manager', 'sdr'] as never[] } },
      select:  { id: true, name: true },
      orderBy: { name: 'asc' },
    })
  )

  return NextResponse.json({ data: users })
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Manually verify**

Run: `npm run dev`, sign in, hit `/api/users` in the browser — confirm `{ "data": [...] }` listing your tenant's admin/manager/sdr users only (not other tenants' users, not `client`-role users).

- [ ] **Step 4: Commit**

```bash
git add src/app/api/users/route.ts
git commit -m "Add GET /api/users endpoint for account-owner selection"
```

---

### Task 8: `SlideDrawer` — optional `hideHeader` prop

**Files:**
- Modify: `src/components/shared/SlideDrawer.tsx`

**Interfaces:**
- Produces: `SlideDrawer` accepts a new optional prop `hideHeader?: boolean` (default `false`). When `true`, the drawer's own title-bar row (title text + close button) is not rendered, so the drawer's `children` can supply their own header. `title` is still required and still used for the `aria-label` on the dialog container. All existing call sites are unaffected (prop defaults to `false`, preserving current behavior exactly).
- Consumed by: `ContactLookupDrawer` (Task 10), which renders `ContactExpandPanel`'s own header (name, Edit button, close button) instead of stacking a second one.

- [ ] **Step 1: Add the prop and conditional rendering**

In `src/components/shared/SlideDrawer.tsx`, update the props interface:

```ts
interface SlideDrawerProps {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  width?: 'md' | 'lg'
  hideHeader?: boolean
}
```

Update the function signature and header block:

```tsx
export function SlideDrawer({
  open,
  onClose,
  title,
  children,
  width = 'md',
  hideHeader = false,
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
      <div
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          'fixed top-0 right-0 z-50 h-full flex flex-col will-change-transform animate-slide-in-right',
          'border-l border-[var(--panel-border)] bg-[var(--card-bg-solid)]',
          width === 'md' ? 'w-[480px]' : 'w-[640px]'
        )}
      >
        {!hideHeader && (
          <div className="flex-shrink-0 flex items-center justify-between px-6 h-16 border-b border-[var(--panel-border)]">
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">{title}</h2>
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-xl flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--panel-border-hover)] transition-colors duration-200"
              aria-label="Close drawer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
        {children}
      </div>
    </>
  )
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Manually verify no regression**

Run: `npm run dev`, open any existing drawer that uses `SlideDrawer` without passing `hideHeader` (e.g. a task drawer under Schedule, or the disposition drawer in the dialer) — confirm its header still renders exactly as before.

- [ ] **Step 4: Commit**

```bash
git add src/components/shared/SlideDrawer.tsx
git commit -m "Add optional hideHeader prop to SlideDrawer"
```

---

### Task 9: `ContactExpandPanel` — optional `embedded` prop

**Files:**
- Modify: `src/components/dialer/ContactExpandPanel.tsx`

**Interfaces:**
- Produces: `ContactExpandPanel` accepts a new optional prop `embedded?: boolean` (default `false`). When `true`, the outer wrapper (in both edit mode and view mode) uses plain padding instead of the `bg-[var(--card-bg)] border-t border-[var(--panel-border)] rounded-b-2xl` styling designed for sitting beneath a queue row in the dialer — since inside a standalone drawer there is no card above it for that border/rounding to relate to. All existing dialer call sites are unaffected (prop defaults to `false`).
- Consumed by: `ContactLookupDrawer` (Task 10), which renders `<ContactExpandPanel embedded ... />` inside a `SlideDrawer`.

- [ ] **Step 1: Add the prop**

In `src/components/dialer/ContactExpandPanel.tsx`, update the props interface:

```ts
interface ContactExpandPanelProps {
  contact: ContactWithCampaign
  users: { id: string; name: string }[]
  onClose: () => void
  onSaved: (updated: ContactWithCampaign) => void
  embedded?: boolean
}
```

Update the function signature:

```ts
export function ContactExpandPanel({ contact, users, onClose, onSaved, embedded = false }: ContactExpandPanelProps) {
```

- [ ] **Step 2: Use a conditional wrapper class in both render branches**

Add near the top of the component body (after the existing hooks/state):

```ts
  const wrapperClass = embedded
    ? 'p-6'
    : 'bg-[var(--card-bg)] border-t border-[var(--panel-border)] rounded-b-2xl px-6 py-4'
```

Replace the edit-mode wrapper (currently `<div className="bg-[var(--card-bg)] border-t border-[var(--panel-border)] rounded-b-2xl px-6 py-4">` at the top of the `if (isEditing)` block) with:

```tsx
    return (
      <div className={wrapperClass}>
```

Replace the view-mode wrapper (currently the same class string at the final `return`) with:

```tsx
  return (
    <div className={wrapperClass}>
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Manually verify no regression**

Run: `npm run dev`, go to the dialer (`/calling`), expand a contact row that uses `ContactExpandPanel` (rendered without `embedded`) — confirm it still looks exactly as before (card background, top border, rounded bottom corners).

- [ ] **Step 5: Commit**

```bash
git add src/components/dialer/ContactExpandPanel.tsx
git commit -m "Add optional embedded prop to ContactExpandPanel for reuse outside the dialer"
```

---

### Task 10: `ContactLookupDrawer` component

**Files:**
- Create: `src/components/contacts/ContactLookupDrawer.tsx`
- Test: `src/components/contacts/__tests__/ContactLookupDrawer.test.tsx`

**Interfaces:**
- Consumes: `SlideDrawer` with `hideHeader` (Task 8), `ContactExpandPanel` with `embedded` (Task 9), the existing `GET /api/contacts/[id]` route (`src/app/api/contacts/[id]/route.ts`, unchanged), `GET /api/users` (Task 7).
- Produces: `ContactLookupDrawer({ contactId: string | null; onClose: () => void })`. Consumed by `HeaderSearch` (Task 11).

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/contacts/__tests__/ContactLookupDrawer.test.tsx
import { render, screen, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ContactLookupDrawer } from '../ContactLookupDrawer'

const contact = {
  id: 'c1', firstName: 'Jane', lastName: 'Doe', email: null,
  mobilePhone: '5551234567', corporatePhone: null, companyName: 'Acme',
  jobTitle: null, industry: null, employeeCount: null, address: null,
  city: null, state: null, zip: null, country: null, companyAddress: null,
  companyCity: null, website: null, linkedinUrl: null, status: 'prospect',
  dncReason: null, dialAttempts: 0, notInterestedUntil: null,
  accountOwnerId: null, campaignId: 'camp1', tenantId: 't1',
  dedupeHash: 'h1', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  deletedAt: null, mobilePhoneDigits: '5551234567', corporatePhoneDigits: null,
  campaign: { id: 'camp1', name: 'Q1 Outbound' }, accountOwner: null,
}

describe('ContactLookupDrawer', () => {
  beforeEach(() => {
    global.fetch = vi.fn((url: string) => {
      if (url.startsWith('/api/contacts/')) {
        return Promise.resolve({ ok: true, json: async () => ({ data: contact }) }) as any
      }
      if (url.startsWith('/api/users')) {
        return Promise.resolve({ ok: true, json: async () => ({ data: [] }) }) as any
      }
      return Promise.reject(new Error(`unexpected fetch: ${url}`))
    }) as any
  })

  it('renders nothing when contactId is null', () => {
    const { container } = render(<ContactLookupDrawer contactId={null} onClose={vi.fn()} />)
    expect(container.textContent).toBe('')
  })

  it('fetches the contact and users, then shows the contact name', async () => {
    render(<ContactLookupDrawer contactId="c1" onClose={vi.fn()} />)
    await waitFor(() => expect(screen.getByText('Jane Doe')).toBeInTheDocument())
    expect(global.fetch).toHaveBeenCalledWith('/api/contacts/c1')
    expect(global.fetch).toHaveBeenCalledWith('/api/users')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/contacts/__tests__/ContactLookupDrawer.test.tsx`
Expected: FAIL — `Cannot find module '../ContactLookupDrawer'`.

- [ ] **Step 3: Write the component**

```tsx
// src/components/contacts/ContactLookupDrawer.tsx
'use client'

import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { SlideDrawer } from '@/components/shared/SlideDrawer'
import { ContactExpandPanel } from '@/components/dialer/ContactExpandPanel'
import type { ContactWithCampaign } from '@/types/models'

interface ContactLookupDrawerProps {
  contactId: string | null
  onClose: () => void
}

export function ContactLookupDrawer({ contactId, onClose }: ContactLookupDrawerProps) {
  const [contact, setContact] = useState<ContactWithCampaign | null>(null)
  const [users, setUsers] = useState<{ id: string; name: string }[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (!contactId) {
      setContact(null)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(false)
    Promise.all([
      fetch(`/api/contacts/${contactId}`).then((r) => r.json()),
      fetch('/api/users').then((r) => r.json()),
    ])
      .then(([contactRes, usersRes]) => {
        if (cancelled) return
        if (!contactRes.data) {
          setError(true)
          return
        }
        setContact(contactRes.data)
        setUsers(usersRes.data ?? [])
      })
      .catch(() => { if (!cancelled) setError(true) })
      .finally(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
  }, [contactId])

  const open = contactId !== null
  const title = contact ? `${contact.firstName} ${contact.lastName}` : 'Contact details'

  return (
    <SlideDrawer open={open} onClose={onClose} title={title} hideHeader width="md">
      {loading && (
        <div className="p-6 flex items-center justify-between">
          <span className="text-sm text-[var(--text-muted)]">Loading…</span>
          <button onClick={onClose} aria-label="Close" className="text-[var(--text-muted)] hover:text-[var(--text-primary)]">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
      {!loading && error && (
        <div className="p-6 flex items-center justify-between">
          <span className="text-sm text-red-400">Couldn&apos;t load this contact.</span>
          <button onClick={onClose} aria-label="Close" className="text-[var(--text-muted)] hover:text-[var(--text-primary)]">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
      {!loading && !error && contact && (
        <ContactExpandPanel
          contact={contact}
          users={users}
          embedded
          onClose={onClose}
          onSaved={(updated) => setContact(updated)}
        />
      )}
    </SlideDrawer>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/contacts/__tests__/ContactLookupDrawer.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/components/contacts/ContactLookupDrawer.tsx src/components/contacts/__tests__/ContactLookupDrawer.test.tsx
git commit -m "Add ContactLookupDrawer read-only/edit contact view"
```

---

### Task 11: `HeaderSearch` component, wired into `Header`

**Files:**
- Create: `src/components/layout/HeaderSearch.tsx`
- Test: `src/components/layout/__tests__/HeaderSearch.test.tsx`
- Modify: `src/components/layout/Header.tsx`

**Interfaces:**
- Consumes: `GET /api/contacts/lookup` (Task 6), `ContactLookupDrawer` (Task 10).
- Produces: `HeaderSearch` (no props — self-contained), mounted once inside `Header`.

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/layout/__tests__/HeaderSearch.test.tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { HeaderSearch } from '../HeaderSearch'

const results = [
  {
    id: 'c1', firstName: 'Jane', lastName: 'Doe',
    mobilePhone: '5551234567', corporatePhone: null,
    companyName: 'Acme', status: 'prospect', campaign: { name: 'Q1 Outbound' },
  },
]

describe('HeaderSearch', () => {
  beforeEach(() => {
    global.fetch = vi.fn((url: string) => {
      if (url.startsWith('/api/contacts/lookup')) {
        return Promise.resolve({ ok: true, json: async () => ({ data: results }) }) as any
      }
      return Promise.resolve({ ok: true, json: async () => ({ data: [] }) }) as any
    }) as any
  })

  it('does not search for a 1-character query', async () => {
    render(<HeaderSearch />)
    fireEvent.change(screen.getByPlaceholderText(/search by name, phone, or company/i), { target: { value: 'j' } })
    await new Promise((r) => setTimeout(r, 350))
    expect(global.fetch).not.toHaveBeenCalledWith(expect.stringContaining('/api/contacts/lookup'))
  })

  it('debounces and shows results for a query of 2+ characters', async () => {
    render(<HeaderSearch />)
    fireEvent.change(screen.getByPlaceholderText(/search by name, phone, or company/i), { target: { value: '555123' } })
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/contacts/lookup?q=555123'), { timeout: 1000 })
    await waitFor(() => expect(screen.getByText('Jane Doe')).toBeInTheDocument())
  })

  it('shows "No contacts found" when the lookup returns no matches', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: [] }) }) as any
    render(<HeaderSearch />)
    fireEvent.change(screen.getByPlaceholderText(/search by name, phone, or company/i), { target: { value: 'zzzzz' } })
    await waitFor(() => expect(screen.getByText('No contacts found')).toBeInTheDocument(), { timeout: 1000 })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/layout/__tests__/HeaderSearch.test.tsx`
Expected: FAIL — `Cannot find module '../HeaderSearch'`.

- [ ] **Step 3: Write the component**

```tsx
// src/components/layout/HeaderSearch.tsx
'use client'

import { useEffect, useRef, useState } from 'react'
import { Search } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { ContactLookupDrawer } from '@/components/contacts/ContactLookupDrawer'

type LookupResult = {
  id: string
  firstName: string
  lastName: string
  mobilePhone: string | null
  corporatePhone: string | null
  companyName: string | null
  status: string
  campaign: { name: string }
}

const STATUS_LABELS: Record<string, string> = {
  prospect:       'Prospect',
  lead:           'Lead',
  dnc:            'DNC',
  future:         'Future',
  call_back:      'Call Back',
  meeting_booked: 'Meeting Booked',
}

const STATUS_STYLES: Record<string, string> = {
  prospect:       'bg-[var(--lf-accent)]/10 text-[var(--lf-accent)]',
  lead:           'bg-emerald-500/10 text-emerald-400',
  dnc:            'bg-red-500/10 text-red-400',
  future:         'bg-gray-500/10 text-[var(--text-secondary)]',
  call_back:      'bg-[var(--lf-accent)]/10 text-amber-400',
  meeting_booked: 'bg-purple-500/10 text-purple-400',
}

export function HeaderSearch() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<LookupResult[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    const trimmed = query.trim()
    clearTimeout(debounceRef.current)
    if (trimmed.length < 2) {
      setResults([])
      setOpen(false)
      return
    }
    debounceRef.current = setTimeout(() => {
      setLoading(true)
      fetch(`/api/contacts/lookup?q=${encodeURIComponent(trimmed)}`)
        .then((r) => r.json())
        .then((json) => {
          setResults(json.data ?? [])
          setOpen(true)
        })
        .finally(() => setLoading(false))
    }, 300)
    return () => clearTimeout(debounceRef.current)
  }, [query])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-secondary)]" />
        <Input
          placeholder="Search by name, phone, or company"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => { if (results.length > 0) setOpen(true) }}
          className="pl-9 w-72 bg-[var(--panel-border)] border-[var(--panel-border)] text-sm"
        />
      </div>

      {open && (
        <div className="absolute top-full mt-2 w-80 glass-panel rounded-2xl border border-[var(--panel-border)] shadow-xl z-20 overflow-hidden">
          {loading ? (
            <div className="px-4 py-3 text-sm text-[var(--text-muted)]">Searching…</div>
          ) : results.length === 0 ? (
            <div className="px-4 py-3 text-sm text-[var(--text-muted)]">No contacts found</div>
          ) : (
            <ul className="max-h-80 overflow-y-auto custom-scrollbar">
              {results.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedContactId(r.id)
                      setOpen(false)
                    }}
                    className="w-full text-left px-4 py-2.5 hover:bg-[var(--panel-border-hover)] transition-colors border-b border-[var(--panel-border)] last:border-b-0"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-[var(--text-primary)] truncate">
                        {r.firstName} {r.lastName}
                      </span>
                      <Badge className={cn('text-[10px] h-5 px-2', STATUS_STYLES[r.status] ?? 'bg-gray-500/10 text-[var(--text-secondary)]')}>
                        {STATUS_LABELS[r.status] ?? r.status}
                      </Badge>
                    </div>
                    <p className="text-xs text-[var(--text-muted)] mt-0.5 truncate">
                      {[r.mobilePhone ?? r.corporatePhone, r.companyName].filter(Boolean).join(' · ') || '—'}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <ContactLookupDrawer contactId={selectedContactId} onClose={() => setSelectedContactId(null)} />
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/layout/__tests__/HeaderSearch.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 5: Wire `HeaderSearch` into `Header`**

In `src/components/layout/Header.tsx`, add the import:

```tsx
import { HeaderSearch } from '@/components/layout/HeaderSearch'
```

And insert `<HeaderSearch />` as the first child of the existing right-hand controls group:

```tsx
      <div className="flex items-center gap-4">
        <HeaderSearch />
        <button
          type="button"
          className="flex items-center gap-2 px-4 py-2 rounded-full border border-[var(--panel-border)] text-sm text-[var(--text-secondary)] hover:border-[var(--panel-border-hover)] transition-colors duration-200 bg-[var(--bg-dark)]"
        >
```

- [ ] **Step 6: Run the full test suite**

Run: `npm run test:run`
Expected: all tests PASS, including every test added in this plan.

- [ ] **Step 7: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 8: Manual end-to-end verification**

Run: `npm run dev`, sign in as an SDR/manager/admin. On any dashboard page (not just Contacts), confirm the search box appears in the header. Type a known contact's phone number in a *different format* than how it's stored (e.g. stored as `(555) 123-4567`, typed as `+15551234567`) — confirm it still matches. Click the result — confirm the read-only drawer slides in showing the contact's details without navigating away from the current page. Click "Edit" inside the drawer, change a field, save — confirm the drawer updates in place. Close the drawer and confirm the underlying page is unchanged. Type a query with no matches — confirm "No contacts found". Click outside the dropdown — confirm it closes. Press Escape while the drawer is open — confirm it closes.

- [ ] **Step 9: Commit**

```bash
git add src/components/layout/HeaderSearch.tsx src/components/layout/__tests__/HeaderSearch.test.tsx src/components/layout/Header.tsx
git commit -m "Add header contact search with phone-number lookup"
```

---

## Spec Coverage Check

- Digit-normalized phone matching → Tasks 1, 2, 3, 6
- Searchable from anywhere in the app (header, not just Contacts page) → Tasks 8-11 (`Header` is shared across all 6 dashboard pages that render it)
- Name/email/company search preserved in the same box → Task 3 (`buildContactLookupWhere` text `OR` clauses)
- Click result → read-only view, no navigation away → Tasks 8, 9, 10
- "Edit full record" escape hatch → Task 10 (`ContactExpandPanel`'s built-in Edit toggle, reused via `embedded`)
- All 4 contact write sites keep digit columns in sync → Tasks 4 (contacts CRUD, actions.ts + 2 API routes) and 5 (CSV import)
- Exact-match (not partial) phone search, index-backed → Task 3, documented in Global Constraints
