# Header Contact Lookup by Phone Number — Design

## Problem

When a call comes in, the SDR sees a raw phone number (from JustCall, a personal phone, etc.) and currently has no fast way to find out who it belongs to. The Contacts page search bar only matches `firstName`, `lastName`, `email`, and `companyName` — phone numbers are displayed in the table but are not searchable at all. There is also no global search available outside the Contacts page, so even once phone search exists there, the SDR would have to navigate away from whatever they're doing (e.g. the dialer) to use it.

Note: this is a *manual* lookup feature. It does not depend on, and does not implement, automatic inbound caller-ID matching (JustCall webhook integration is still deferred per `CLAUDE.md`). The SDR pastes or types the number themselves.

## Goals

- Search by phone number (and, incidentally, name/email/company) from anywhere in the app, not just the Contacts page.
- Match numbers that were typed/stored with different formatting (`+1 (555) 123-4567` vs `555-123-4567` vs `15551234567`) — digit-normalized matching.
- Fast: this is a "glance and confirm" action, not a full record edit.

## Out of scope

- Automatic inbound-call popups / caller-ID matching (requires the still-deferred JustCall webhook integration).
- Changing the existing Contacts page search/filter bar.
- Changing `dedupeHash` / dedup logic.

## Data model

Phone fields (`mobilePhone`, `corporatePhone`) are freeform strings with no enforced format, so matching on stripped digits requires comparing against precomputed values rather than the raw stored string (Prisma's `contains` can't apply a transform to the stored column). This mirrors the existing `dedupeHash` pattern, which is already a derived field recomputed at every contact write site.

**Schema change** (`prisma/schema.prisma`, `Contact` model):

```prisma
mobilePhoneDigits    String?
corporatePhoneDigits String?
...
@@index([tenantId, mobilePhoneDigits])
@@index([tenantId, corporatePhoneDigits])
```

**New utility** — `src/lib/utils/phone.ts`:

```ts
export function normalizePhoneDigits(value: string | null | undefined): string | null
```

Strips all non-digit characters. If the result is 11 digits and starts with `1` (US country code), drops the leading `1`. Returns `null` for empty input. `+1 (555) 123-4567`, `555-123-4567`, and `15551234567` all normalize to `5551234567`.

**Backfill migration**: a one-time SQL step using `regexp_replace` to populate `mobilePhoneDigits` / `corporatePhoneDigits` for existing rows. Raw SQL is acceptable here since it's a one-off migration step, not ongoing application code.

**Write sites** (compute the two digit fields alongside `dedupeHash`, same as today):
- `src/app/(dashboard)/contacts/actions.ts` — `createContact`, `updateContact`
- `src/app/api/contacts/route.ts` — `POST`
- `src/app/api/contacts/[id]/route.ts` — `PATCH`
- `src/app/(dashboard)/imports/actions.ts` — CSV import commit

## Backend: lookup endpoint

**New route**: `GET /api/contacts/lookup?q=<query>`

- Auth via Clerk (`auth()`), tenant + `contacts:read` permission check — same pattern as `GET /api/contacts`.
- If `normalizePhoneDigits(q)` yields a non-empty digit string, match `mobilePhoneDigits: { equals: digits } OR corporatePhoneDigits: { equals: digits }`. Exact match, not substring: both the query and the stored values go through the same normalization, so a caller's full number should match exactly, and an equality check is what the new B-tree index actually accelerates (a substring `contains` would ignore the index and force a sequential scan).
- Independently, always also match the existing text fields (`firstName`, `lastName`, `email`, `companyName`) via `contains`/`insensitive`, so a name/company query still works.
- `tenantId`, `deletedAt: null` always applied (consistent with `GET /api/contacts`).
- `take: 8`, ordered by `createdAt desc`.
- Minimal `select`: `id, firstName, lastName, mobilePhone, corporatePhone, companyName, status, campaign: { select: { name: true } }`.
- Response: `{ data: [...] }` (existing API response convention).

This is a separate endpoint from `GET /api/contacts` rather than an extension of it, because the two have different shapes and purposes: `/api/contacts` is the paginated table-list endpoint (heavier includes, pagination metadata); `/lookup` is a small, fast, top-N typeahead result set.

## Frontend

### `HeaderSearch` (new client component, `src/components/layout/HeaderSearch.tsx`)

- Mounted inside `Header.tsx` (a single shared component already used by every dashboard page — no per-page changes needed).
- Always-visible text input in the header, debounced 300ms (same debounce pattern as `ContactFilters`).
- Placeholder: "Search by name, phone, or company".
- Fetches `/api/contacts/lookup?q=` on input change (min 2 characters).
- Renders a glass-panel dropdown below the input listing up to 8 matches: name, phone (whichever field matched, or both), company, status badge.
- Empty state: "No contacts found" row.
- Closes on outside click / Escape.

### Result click → read-only detail drawer

Clicking a result opens a **new read-only drawer** built on the existing shared `SlideDrawer` component (`src/components/shared/SlideDrawer.tsx` — the same drawer primitive used elsewhere per the style guide's slide-in drawer convention), rather than the existing `ContactModal`.

Reasoning: `ContactModal` is a full edit form and requires the campaigns list and users list as props to populate its dropdowns. Fetching those just to glance at "who called" is unnecessary weight for the common case. The new drawer shows read-only fields already returned in full by a `GET /api/contacts/[id]` call: name, both phone numbers, email, company, job title, status, campaign name, account owner name.

The drawer includes an "Edit full record" button. Clicking it fetches campaigns/users (existing pattern, same calls the Contacts page already makes) and opens the existing `ContactModal` pre-filled — so editing still goes through the one existing edit form, unchanged.

### Component summary

| Component | Responsibility |
|---|---|
| `HeaderSearch` | input + debounce + fetch + dropdown results |
| `ContactLookupDrawer` (new) | read-only detail view via `SlideDrawer`, "Edit full record" trigger |
| `ContactModal` (existing, unchanged) | full edit form, opened on demand from the drawer |

## Testing

- Unit tests for `normalizePhoneDigits` (`src/lib/utils/__tests__/phone.test.ts`): various formats, empty/null input, leading-1 stripping, non-US-length numbers left as-is.
- Unit/integration test for `/api/contacts/lookup`: matches by digits regardless of stored formatting, matches by name/company, respects tenant isolation (a contact in another tenant never appears), respects `contacts:read` permission.
- Confirm all 4 write sites populate the digit fields correctly (extend existing tests for `createContact`/`updateContact`/CSV import where they exist).

## Assumptions

- "Phone-like" query detection: any query that normalizes to a non-empty digit string is treated as a possible phone match, run *in addition to* (not instead of) the text search — so a query like "5551234" still also loosely matches text fields, though in practice only the digit match will hit for a pure number.
- Phone matching is exact (on normalized digits), not partial — the SDR has the full number that called, not a fragment. Searching a partial number (e.g. last 4 digits) is not supported; only name/email/company search supports partial/substring matching.
- The read-only drawer does not include a "go to full Contacts page" link — "Edit full record" is the only escape hatch, since that's the only case where more space/fields are needed.
- No keyboard shortcut (e.g. `/` or `⌘K`) to focus the search box — out of scope unless requested later.
