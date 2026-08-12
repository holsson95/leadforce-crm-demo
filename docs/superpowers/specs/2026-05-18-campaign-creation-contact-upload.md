# Campaign Creation — Inline Contact Upload

**Date:** 2026-05-18
**Status:** Approved

## Summary

Extend the campaign creation modal into a 4-step wizard that optionally allows uploading contacts immediately after the campaign is created. The existing two-step flow (create campaign → go to imports page) remains valid; this adds a faster path for users who have a CSV ready at campaign creation time.

---

## User Flow

### Step 1 — Campaign Details (unchanged)
The existing `CampaignModal` form fields (name, client, status, daily target calls, assign SDRs) with one change: the submit button reads **"Create & Continue →"** instead of "Create Campaign". Clicking it saves the campaign via `createCampaign()`, receives the new campaign ID from the server action, and advances to step 2. Cancel closes the modal without saving.

### Step 2 — Upload & Map
The file drop zone and `ColumnMapper` from the existing `ImportWizard`, but with the campaign selector removed (campaign is already known). The user can:
- Drop or browse for a CSV (max 10 MB)
- Review and adjust auto-detected column mappings
- Click **"Preview Import →"** to run `parseImportPreview()` and advance (to step 3 if DNC contacts exist, or directly to the import + step 4 if none)
- Click **"Skip for now"** to close the modal — the campaign is already saved

### Step 3 — DNC Review (conditional)
Only shown when `parseImportPreview()` returns one or more DNC-flagged contacts. No duplicate review is performed — this is a new campaign with zero existing contacts, so duplicates cannot exist yet.

- Header: warning banner showing count of DNC contacts found
- List: each DNC contact shows name, company, and the DNC reason tag
- Each row has a toggle (default: **excluded**) — user can flip individual contacts to **included**
- Footer actions:
  - **"Import N Contacts →"** — count updates live as toggles change (clean rows + included DNC rows)
  - **"Exclude all DNC"** — quick-exclude all, then import only clean rows
- Clicking either import button calls `importContacts()` with the clean rows plus any user-included DNC contacts, then advances to step 4

### Step 4 — Done
Success screen showing:
- Campaign name confirmation
- Counts: contacts imported (green), DNC excluded (red), invalid rows skipped (gray)
- **"Go to Contacts"** — navigates to `/contacts?campaignId=<id>`
- **"Close"** — closes modal, stays on campaigns page

---

## Architecture

### CampaignModal changes
`CampaignModal` becomes a multi-step wizard. It manages:
- `step: 'campaign' | 'upload' | 'dnc' | 'done'`
- `campaignId: string | null` — set after step 1 saves
- `importState` — raw rows, headers, mappings, preview result, final result

The step indicator (dots + labels) lives in the modal header, above the scrollable body. All 4 dots are always visible.

### Component boundaries
- `CampaignWizardStep1` — the existing form fields, extracted from `CampaignModal`; receives `onCreated(campaignId)` callback
- `CampaignWizardStep2` — file drop zone + `ColumnMapper` (reused from `ImportWizard`); no campaign selector
- `CampaignWizardStep3` — DNC-only review list with per-row toggles; receives `dncRows` and `cleanRows`, calls `onImport(included)`
- `CampaignWizardStep4` — result summary

All step components are colocated in `src/components/campaigns/`.

### Server actions
No new server actions needed. The wizard reuses:
- `createCampaign(data)` from `src/app/(dashboard)/campaigns/actions.ts` — must return the created campaign's `id` (update if it currently returns `void`)
- `parseImportPreview(rawRows, mappings, campaignId)` from `src/app/(dashboard)/imports/actions.ts`
- `importContacts(clean, duplicates, campaignId)` — duplicates array passed as empty `[]` (no duplicate review for new campaigns)

### Edit mode
The wizard (steps 2–4) only applies to **new campaign creation**. Editing an existing campaign keeps the current single-step modal unchanged. The step indicator and "Create & Continue" button are hidden when `campaign` prop is non-null.

---

## Behavior Details

- **Step indicator:** always shows all 4 dots; completed steps show a green checkmark; active step is cyan; pending steps are gray
- **DNC step skip:** if `parseImportPreview()` returns zero DNC contacts, step 3 is skipped and the import runs immediately, advancing directly to step 4
- **"Skip for now" on step 2:** closes the modal; the campaign is already saved; no import runs
- **Modal height:** the scrollable body area (`max-h-[70vh]`) is retained; the DNC list uses its own internal scroll when the list is long
- **Error handling:** errors on any step are shown inline below the content, same pattern as today

---

## Out of Scope
- Duplicate detection (no existing contacts in a new campaign)
- Editing existing campaigns via this wizard
- Bulk DNC override without per-row review
