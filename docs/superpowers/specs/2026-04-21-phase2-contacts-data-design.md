# LeadForce CRM Phase 2 — Contacts & Data Design

## Goal

Add the Contact data model, CSV import with validation/dedup/DNC review, a searchable/filterable contacts page, and a contact detail drawer. AI company summary generation is deferred to a later phase when Redis/BullMQ infrastructure is in place.

## Architecture

Server Components for data fetching, Server Actions for mutations, pure TypeScript modules in `src/lib/csv/` for parsing logic. Filter state lives in URL search params so views are bookmarkable. Follows all Phase 1 patterns exactly (glass-panel UI, `withTenant`, Zod validation, cursor pagination).

## Tech Stack

Next.js 16 App Router, TypeScript, Prisma 7, Zod, react-hook-form, Tailwind CSS (Tailwind v4 tokens), Clerk v5, `papaparse` for CSV parsing, Node.js `crypto` for dedup hash.

---

## Schema Changes

### New Enum: `ContactList`

```prisma
enum ContactList {
  prospect
  lead
  dnc
  future
  call_back
  meeting_booked
}
```

### New Model: `Contact`

```prisma
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

  tenant   Tenant   @relation(fields: [tenantId], references: [id])
  campaign Campaign @relation(fields: [campaignId], references: [id])

  @@unique([tenantId, dedupeHash])
  @@index([tenantId, campaignId])
  @@index([tenantId, list])
}
```

**Dedup hash:** SHA-256 of `normalize(email) + "|" + normalize(phone)` where normalize lowercases and strips whitespace. Contacts with neither email nor phone get a random UUID as their hash (no dedup possible).

### Campaign model update

Add `contacts` relation to Campaign:
```prisma
contacts Contact[]
```

---

## File Structure

### New files
- `prisma/migrations/` — new migration for Contact model + ContactList enum
- `src/lib/csv/parse.ts` — CSV parsing, column mapping, row validation
- `src/lib/csv/dedup.ts` — deduplication hash generation and duplicate detection
- `src/lib/csv/types.ts` — shared types: `ParsedRow`, `MappedRow`, `ImportResult`, `ColumnMapping`
- `src/types/models.ts` — add `ContactWithCampaign` type (extend existing file)
- `src/types/enums.ts` — add `ContactList` TypeScript enum (extend existing file)
- `src/app/(dashboard)/contacts/page.tsx` — contacts list server component
- `src/app/(dashboard)/contacts/actions.ts` — createContact, updateContact, deleteContact, importContacts server actions
- `src/app/(dashboard)/imports/page.tsx` — CSV import wizard page (client component)
- `src/components/contacts/ContactsTable.tsx` — table with search/filter/pagination
- `src/components/contacts/ContactDrawer.tsx` — create/edit contact drawer
- `src/components/contacts/ContactFilters.tsx` — campaign + list filter dropdowns + search bar
- `src/components/imports/ImportWizard.tsx` — 3-step wizard (upload, review, result)
- `src/components/imports/ColumnMapper.tsx` — map CSV headers to Contact fields
- `src/components/imports/DuplicateReview.tsx` — table of duplicates with skip/overwrite checkboxes
- `src/app/api/contacts/route.ts` — GET (paginated list with filters) + POST (create)
- `src/app/api/contacts/[id]/route.ts` — PATCH (update) + DELETE (soft-delete)

### Modified files
- `prisma/schema.prisma` — add ContactList enum, Contact model, contacts relation on Campaign
- `src/types/models.ts` — add ContactWithCampaign
- `src/types/enums.ts` — add ContactList enum mirror
- `src/lib/auth.ts` — add `contacts:read` and `contacts:write` permissions
- `src/components/layout/Sidebar.tsx` — activate Contacts nav item (currently non-functional)

---

## CSV Import Flow

### Step 1 — Upload & Map (`/imports`)

- User selects a campaign from a dropdown (required before upload)
- Uploads a CSV file (max 10MB, `.csv` only)
- `papaparse` parses headers client-side
- `ColumnMapper` renders a row per CSV header with a `<Select>` to map to a Contact field
- Required constraint: at least one of `email` or `phone` must be mapped
- "Preview" button sends file + mapping to a Server Action for server-side parse

### Step 2 — Review

Client parses the CSV with papaparse, then sends parsed rows as JSON to Server Action `parseImportPreview(rows, mapping, campaignId)`:
1. Rows already parsed client-side (papaparse runs in browser)
2. Validate each row with Zod (skip rows missing both email and phone)
3. Compute `dedupeHash` for each valid row
4. Query DB for existing contacts in this campaign matching any hash
5. Check DNC list: contacts where `list = 'dnc'` matching email or phone across the whole tenant
6. Return three arrays: `clean[]`, `duplicates[]`, `dnc[]`

UI renders:
- Count summary at top: "312 clean · 18 duplicates · 4 DNC"
- `DuplicateReview` table: each duplicate row shows existing vs incoming data, checkbox (default: skip), radio: skip | overwrite
- DNC rows listed as read-only, always skipped
- "Import" button submits confirmed selections

### Step 3 — Result

Server Action `importContacts(cleanRows, resolvedDuplicates, campaignId)`:
1. `db.contact.createMany({ data: cleanRows, skipDuplicates: true })`
2. For overwrite duplicates: `db.contact.update()` per row
3. Return counts: created, overwritten, skipped
4. `revalidatePath('/contacts')`

Result screen shows: "247 imported · 12 overwritten · 6 skipped · 4 DNC blocked"
"Go to Contacts" button navigates to `/contacts?campaignId=xxx`

---

## Contacts Page

**URL:** `/contacts?campaignId=xxx&list=prospect&search=john&cursor=yyy`

**Server component** fetches initial page. `ContactFilters` is a client component that updates URL params on change, triggering a server re-render.

**Table columns:** Name · Company · Phone · Email · List (badge) · Campaign · actions (MoreHorizontal menu)

**List badge colors:**
- `prospect` → cyan (`bg-accent/10 text-[#00d4ff]`)
- `lead` → green (`bg-emerald-500/10 text-emerald-400`)
- `dnc` → red (`bg-red-500/10 text-red-400`)
- `future` → gray (`bg-gray-500/10 text-gray-400`)
- `call_back` → amber (`bg-amber-500/10 text-amber-400`)
- `meeting_booked` → purple (`bg-purple-500/10 text-purple-400`)

**Pagination:** cursor-based, 25 per page, same pattern as clients/campaigns API.

---

## Contact Detail Drawer

`SlideDrawer` with `width="lg"` (wider than client drawer). Used for both create and edit.

**Sections:**
1. **Personal Info** — firstName\*, lastName\*, email, phone, jobTitle
2. **Company** — companyName, website, linkedinUrl
3. **Location** — address, city, state, zip
4. **List Status** — list (Select with all ContactList values), dncReason (text input, only shown when list = 'dnc')

Zod schema exported from `actions.ts`, imported by drawer (same pattern as ClientDrawer/CampaignDrawer).

---

## Permissions

Add to `src/lib/auth.ts` ROLE_PERMISSIONS:
- `contacts:read` — admin, manager, sdr
- `contacts:write` — admin, manager, sdr

---

## API Routes

### `GET /api/contacts`
Query params: `campaignId`, `list`, `search`, `cursor`, `limit`
Filters: `where: { deletedAt: null, campaignId, list, OR: [{ firstName: { contains: search } }, { lastName: ... }, { email: ... }, { companyName: ... }] }`
Include: `campaign: { select: { id, name } }`

### `POST /api/contacts`
Body: ContactSchema (without dedupeHash — computed server-side)
Returns `{ data: contact }` with status 201

### `PATCH /api/contacts/[id]`
Partial update. Recomputes dedupeHash if email or phone changes.

### `DELETE /api/contacts/[id]`
Soft-delete: `{ deletedAt: new Date() }`

---

## Testing

- `src/lib/csv/__tests__/parse.test.ts` — row validation, column mapping, edge cases (missing email+phone, malformed data)
- `src/lib/csv/__tests__/dedup.test.ts` — hash generation, normalization, collision behavior
- `src/lib/__tests__/auth.test.ts` — extend with contacts:read/write permission tests

---

## Out of Scope (Deferred)

- AI company summary generation (requires Redis/BullMQ — Phase 3+)
- Call history on contact drawer (requires CallRecord model — Phase 3)
- Bulk actions on contacts table (select-all, bulk delete, bulk list change)
- Contact merge UI (duplicate contacts created before dedup was in place)
