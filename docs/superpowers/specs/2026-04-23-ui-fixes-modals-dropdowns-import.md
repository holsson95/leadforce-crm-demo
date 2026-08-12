# UI Fixes — Form Modals, Dropdown Positioning, Import Integration

**Date:** 2026-04-23
**Status:** Approved

---

## Problem Summary

Three UX issues identified in Phase 1–3 that need correcting before Phase 4 begins:

1. Campaign and contact create/edit forms open in a side drawer that clips content at the viewport height — a centered modal better accommodates variable-length forms.
2. `SelectContent` dropdowns inside drawers overlap their trigger instead of rendering below it, making options hard to select.
3. The CSV import wizard lives on its own `/imports` sidebar route; it belongs on the contacts page where users will naturally look for it.

---

## Section 1 — FormModal Shared Component

### What

Create `src/components/shared/FormModal.tsx` — a reusable centered modal wrapper built on Shadcn `Dialog`.

### Interface

```typescript
interface FormModalProps {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  width?: 'md' | 'lg'  // md = max-w-lg, lg = max-w-2xl
}
```

### Behaviour

- Renders a `Dialog` with `DialogContent` styled to match the app's dark glass theme (`bg-card-solid border-white/10 rounded-3xl`).
- The `DialogContent` body is split into two regions:
  - **Scrollable body** — `flex-1 overflow-y-auto max-h-[70vh] custom-scrollbar p-6` — holds form fields.
  - **Pinned footer** — `border-t border-white/5 p-6 flex gap-3` — holds submit and cancel buttons, never scrolls out of view.
- `DialogHeader` renders the `title` with the same `text-sm font-semibold text-white` treatment as `SlideDrawer`.
- Escape key and backdrop click close the modal (Radix default behaviour, no custom handler needed).
- `SlideDrawer` is **not removed** — it remains for contextual panels like the dialer and script sidebar.

### Component Rename

| Old | New | Notes |
|-----|-----|-------|
| `CampaignDrawer` | `CampaignModal` | File: `src/components/campaigns/CampaignModal.tsx` |
| `ContactDrawer` | `ContactModal` | File: `src/components/contacts/ContactModal.tsx` |

All call sites (`CampaignsTable`, `ContactsTable`) update their imports and component names accordingly.

---

## Section 2 — Dropdown Positioning and Empty States

### Problem

`SelectContent` renders in a Radix portal at document root but position calculations are thrown off when triggered inside a fixed-positioned overlay (`SlideDrawer` / `Dialog`). The content appears overlapping the trigger rather than anchored below it.

### Fix

Add `position="popper" sideOffset={4}` to every `SelectContent` in:
- `CampaignModal` — Client select, Status select
- `ContactModal` — Campaign select, List select
- `ImportWizard` — Campaign select
- `SDRSelector` (if it uses a Select internally — check and apply if so)

### Empty States

When the list passed to a select is empty, render a disabled `SelectItem` with `text-gray-500 cursor-default` styling:

```tsx
{clients.length === 0 && (
  <SelectItem value="__empty__" disabled className="text-gray-500">
    No clients found
  </SelectItem>
)}
```

Apply to:
- Client select in `CampaignModal` → "No clients found"
- Campaign select in `ContactModal` → "No campaigns found"
- Campaign select in `ImportWizard` → "No campaigns found"

---

## Section 3 — Import Integrated into Contacts Page

### Sidebar Change

Remove the `/imports` nav item from `src/components/layout/Sidebar.tsx`. The `Upload` icon import can be removed if unused elsewhere.

### Redirect

Update `src/app/(dashboard)/imports/page.tsx` to `redirect('/contacts')` so bookmarked links don't 404. The actions file (`imports/actions.ts`) is unchanged.

### Contacts Page — Import Button

`ContactsTable` (the client component that manages drawer state) gains an **Import** button in its header action row, beside the existing "New Contact" button:

```tsx
<Button variant="outline" onClick={() => setImportOpen(true)} className="...">
  <Upload className="w-4 h-4 mr-2" />
  Import
</Button>
```

State: `const [importOpen, setImportOpen] = useState(false)`

### Import Modal

The `ImportWizard` is wrapped in a `Dialog` (not `FormModal` — the wizard manages its own internal layout and step progression):

```tsx
<Dialog open={importOpen} onOpenChange={setImportOpen}>
  <DialogContent className="max-w-2xl bg-card-solid border-white/10 rounded-3xl p-0">
    <DialogHeader className="px-6 pt-6 pb-0">
      <DialogTitle className="text-sm font-semibold text-white">Import Contacts</DialogTitle>
    </DialogHeader>
    <div className="p-6">
      <ImportWizard campaigns={campaigns} onComplete={() => { setImportOpen(false); router.refresh() }} />
    </div>
  </DialogContent>
</Dialog>
```

`ImportWizard` gains an optional `onComplete?: () => void` prop. When the wizard reaches the "Done" step and the user clicks "Go to Contacts", it calls `onComplete()` instead of `router.push(...)` — so in the modal context it closes and refreshes in place. When accessed standalone (if ever), `onComplete` is undefined and the old push behaviour is the fallback.

The `campaigns` list needed by `ImportWizard` is already fetched server-side in `ContactsPage` and passed down to `ContactsTable` — no additional data fetching required.

---

## Files Changed

| File | Change |
|------|--------|
| `src/components/shared/FormModal.tsx` | New — shared modal wrapper |
| `src/components/campaigns/CampaignModal.tsx` | New — renamed from CampaignDrawer, uses FormModal |
| `src/components/campaigns/CampaignDrawer.tsx` | Delete |
| `src/components/contacts/ContactModal.tsx` | New — renamed from ContactDrawer, uses FormModal |
| `src/components/contacts/ContactDrawer.tsx` | Delete |
| `src/components/campaigns/CampaignsTable.tsx` | Update import + component name |
| `src/components/contacts/ContactsTable.tsx` | Update import + component name, add Import button + modal |
| `src/components/imports/ImportWizard.tsx` | Add optional `onComplete` prop, apply dropdown fix |
| `src/components/layout/Sidebar.tsx` | Remove `/imports` nav entry |
| `src/app/(dashboard)/imports/page.tsx` | Replace with redirect to `/contacts` |

---

## Out of Scope

- `ClientDrawer` — not mentioned; leave as-is.
- `SDRSelector` — check for Select usage and apply dropdown fix only if it uses `SelectContent`.
- No new API routes, schema changes, or data model changes.
