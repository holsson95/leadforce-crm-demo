# Mobile/Corporate Phone View Toggle — Design

## Problem

The calling list (`QueuePanel`) and the profile view (`ProfileViewCard`) only ever display a contact's `mobilePhone`. `corporatePhone` already exists on the `Contact` model and is editable in `ContactExpandPanel`, but there is nowhere to *see* it while working the queue or a single profile — the SDR has to expand the row's edit panel to check it. Sometimes the SDR wants to look up or dial the corporate number instead of mobile.

## Goals

- Let the SDR switch what's displayed — and what's dialed — between mobile and corporate numbers, from the calling list and the profile view.
- One shared control, one shared state: switching in either view affects both, since `QueuePanel`'s existing List/Profile pill already toggles between these two same screens.
- No layout disruption: this replaces which number is shown, it does not add a second number alongside the first.

## Out of scope

- Per-contact toggles (each row switchable independently) — a global, view-level toggle was chosen instead: simpler, and consistent with the existing List/Profile pill pattern in the same header.
- Persisting the preference across page loads/sessions — it resets to Mobile every time the calling page loads fresh.
- Changes to `ContactExpandPanel`, `ContactModal`, `ContactsTable`, or `HeaderSearch` — those already show/edit both numbers or are out of this feature's surface.
- Changes to the `Contact` data model — `mobilePhone`/`corporatePhone` already exist.

## State

**`src/stores/dialer-store.ts`**:
- New field: `phoneNumberView: 'mobile' | 'corporate'` (default `'mobile'`).
- New action: `setPhoneNumberView(view: 'mobile' | 'corporate'): void`.
- **Not** added to the `persist` middleware's `partialize` list (currently `calledToday`, `calledTodayDate`, `callingView`) — this keeps it session-only by omission, matching the decision to reset to Mobile on every fresh load.

## QueuePanel (calling list)

- Add a second segmented pill toggle in the header, immediately next to the existing List/Profile pill (`src/components/dialer/QueuePanel.tsx` ~line 587), reusing the same markup/classes (rounded pill container, `bg-[var(--lf-accent)]` active state, 26px height). Labels: "Mobile" / "Corporate". Visible under the same condition as the List/Profile pill (`campaignId && allContacts.length > 0`).
- `MobilePhoneCell` is renamed `PhoneCell` and takes the value already resolved by the caller: `phoneNumberView === 'corporate' ? contact.corporatePhone : contact.mobilePhone`. Internals (click-to-copy, copied checkmark) are unchanged.
- If the resolved value is null (contact has no number of the selected type), render a muted `—` in place of the phone cell rather than an empty cell, so it's legible as "not on file" rather than a rendering gap.
- `handleCallClick` (both the row-level and the "already active" branches) resolves the same way and passes that value into `startCall(...)` instead of always using `contact.mobilePhone`.
- When the resolved value is null for the active contact, the call button is disabled (same disabled styling already used for `callStatus !== 'idle'`) with a `title` of "No corporate number on file" (or "No mobile number on file").

## ProfileViewCard (profile view)

- Same pill toggle is reused from the shared header area — it does not need its own copy, since `phoneNumberView` lives in the shared store and the pill is already visible whenever a campaign is active, regardless of whether `callingView` is `list` or `profile`.
- The existing "Mobile" `ContactInfoCard` in the 2-column info grid (`Mobile` + `Email`) changes its label and value based on `phoneNumberView`: label becomes "Corporate", value becomes `displayContact.corporatePhone`. It stays a single tile — this is a swap, not an addition — and the grid's existing `(displayContact.mobilePhone || displayContact.email)` guard is generalized to check whichever field is currently selected.
- If the selected type is null for the current contact, the tile is omitted the same way it already is today when `mobilePhone` is null (existing conditional rendering), rather than showing an empty/broken card.

## CallControls (active call banner)

No changes required. It already renders whatever number was passed into `startCall(phoneNumber)` — once `QueuePanel`/`ProfileViewCard` pass the toggle-resolved number upstream, the active-call banner reflects the real dialed number with no new logic.

## Fallback rule

If a contact lacks a value for the currently-selected phone type, do **not** silently fall back to the other number for either display or dialing. Show `—` (list) / omit the tile (profile), and disable that contact's call action. Falling back silently would undermine the point of the toggle controlling what's actually dialed — the SDR could believe they're calling a corporate line and actually reach a personal mobile, or vice versa.

## Testing

- `dialer-store`: `setPhoneNumberView` updates state; not present in persisted storage after a simulated reload.
- `QueuePanel`: toggling switches the displayed number and the number passed to `startCall`; `—` and disabled call button render when the selected type is null for a contact.
- `ProfileViewCard`: toggling swaps the info tile's label/value; tile is omitted (not blank) when the selected type is null.

## Assumptions

- The Mobile/Corporate pill is shared UI state, not a prop threaded separately into each component — both `QueuePanel` and `ProfileViewCard` read `phoneNumberView` directly from `useDialerStore`.
- "Corporate phone" here always means `Contact.corporatePhone` — no distinction between direct-dial and switchboard numbers is modeled; that's a data-entry concern outside this feature.
