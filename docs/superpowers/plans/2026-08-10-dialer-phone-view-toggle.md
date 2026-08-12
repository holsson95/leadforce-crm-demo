# Dialer Phone View Toggle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the SDR switch the dialer between showing/dialing a contact's mobile phone and corporate phone, via one shared Mobile/Corporate toggle that affects both the calling list (`QueuePanel`) and the profile view (`ProfileViewCard`).

**Architecture:** A pure helper (`resolvePhoneNumber`) picks the right field off a contact given a view mode. A new `phoneNumberView` field on the existing `dialer-store` Zustand store holds the current mode (session-only, not persisted). `QueuePanel` gets a new segmented pill (mirroring its existing List/Profile pill) that calls the store setter; `QueuePanel` and `ProfileViewCard` both read the store field through the shared helper to decide what to display and what to dial.

**Tech Stack:** Next.js/React/TypeScript, Zustand (`zustand/middleware` persist), Vitest + Testing Library.

## Global Constraints

- Toggle is global/view-level (affects every row and the profile view at once), not per-contact — spec section "Out of scope".
- The toggle controls both what's *displayed* and what's *dialed* — no silent fallback to the other number when the selected type is missing.
- `phoneNumberView` must NOT be added to the dialer-store `persist` middleware's `partialize` list — it resets to `'mobile'` on every fresh page load.
- When a contact has no value for the selected type: list row shows `—` and its call action is disabled; profile view omits the phone tile entirely. No fallback to the other number in either case.
- No changes to `CallControls`, `ContactExpandPanel`, `ContactModal`, `ContactsTable`, `HeaderSearch`, or the `Contact` Prisma model.

---

### Task 1: `resolvePhoneNumber` helper

**Files:**
- Create: `src/lib/dialer-phone-view.ts`
- Test: `src/lib/__tests__/dialer-phone-view.test.ts`

**Interfaces:**
- Produces: `type PhoneNumberView = 'mobile' | 'corporate'`; `function resolvePhoneNumber(contact: { mobilePhone: string | null; corporatePhone: string | null }, view: PhoneNumberView): string | null`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/__tests__/dialer-phone-view.test.ts
import { describe, it, expect } from 'vitest'
import { resolvePhoneNumber } from '../dialer-phone-view'

const contact = { mobilePhone: '555-1000', corporatePhone: '555-2000' }

describe('resolvePhoneNumber', () => {
  it('returns the mobile number when view is mobile', () => {
    expect(resolvePhoneNumber(contact, 'mobile')).toBe('555-1000')
  })

  it('returns the corporate number when view is corporate', () => {
    expect(resolvePhoneNumber(contact, 'corporate')).toBe('555-2000')
  })

  it('returns null when the mobile number is not on file', () => {
    expect(resolvePhoneNumber({ mobilePhone: null, corporatePhone: '555-2000' }, 'mobile')).toBeNull()
  })

  it('returns null when the corporate number is not on file', () => {
    expect(resolvePhoneNumber({ mobilePhone: '555-1000', corporatePhone: null }, 'corporate')).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/dialer-phone-view.test.ts`
Expected: FAIL — `Cannot find module '../dialer-phone-view'` (file doesn't exist yet).

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/dialer-phone-view.ts
export type PhoneNumberView = 'mobile' | 'corporate'

export function resolvePhoneNumber(
  contact: { mobilePhone: string | null; corporatePhone: string | null },
  view: PhoneNumberView,
): string | null {
  return view === 'corporate' ? contact.corporatePhone : contact.mobilePhone
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/__tests__/dialer-phone-view.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/dialer-phone-view.ts src/lib/__tests__/dialer-phone-view.test.ts
git commit -m "Add resolvePhoneNumber helper for dialer mobile/corporate view"
```

---

### Task 2: `phoneNumberView` state in `dialer-store`

**Files:**
- Modify: `src/stores/dialer-store.ts:1-57` (imports, `DialerState` interface), `:70-90` (initial state), `:371-377` (actions)
- Test: `src/stores/__tests__/dialer-store.test.ts`

**Interfaces:**
- Consumes: `PhoneNumberView` from `src/lib/dialer-phone-view.ts` (Task 1).
- Produces: `useDialerStore().phoneNumberView: PhoneNumberView` (default `'mobile'`); `useDialerStore().setPhoneNumberView(view: PhoneNumberView): void`.

- [ ] **Step 1: Write the failing test**

Append to `src/stores/__tests__/dialer-store.test.ts`:

```ts
describe('useDialerStore — phoneNumberView', () => {
  it('defaults to mobile', () => {
    expect(useDialerStore.getState().phoneNumberView).toBe('mobile')
  })

  it('setPhoneNumberView switches to corporate and back', () => {
    useDialerStore.getState().setPhoneNumberView('corporate')
    expect(useDialerStore.getState().phoneNumberView).toBe('corporate')

    useDialerStore.getState().setPhoneNumberView('mobile')
    expect(useDialerStore.getState().phoneNumberView).toBe('mobile')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/stores/__tests__/dialer-store.test.ts`
Expected: FAIL — `phoneNumberView` is `undefined`, `setPhoneNumberView is not a function`.

- [ ] **Step 3: Write minimal implementation**

In `src/stores/dialer-store.ts`, add the import (after the existing `PipelineAction` import, line 8):

```ts
import type { PhoneNumberView } from '@/lib/dialer-phone-view'
```

In the `DialerState` interface, add the field after `profileIndex: number` (line 32):

```ts
  callingView:        'list' | 'profile'
  profileIndex:       number
  phoneNumberView:    PhoneNumberView
```

And the action after `setProfileIndex(index: number): void` (line 55):

```ts
  setCallingView(view: 'list' | 'profile'): void
  setProfileIndex(index: number): void
  setPhoneNumberView(view: PhoneNumberView): void
  advanceProfile(): Promise<void>
```

In the store body, add the initial value after `profileIndex: 0,` (line 88):

```ts
      callingView:        'list',
      profileIndex:       0,
      phoneNumberView:    'mobile',
```

And the setter next to `setProfileIndex` (after line 377):

```ts
      setProfileIndex(index) {
        set({ profileIndex: index })
      },

      setPhoneNumberView(view) {
        set({ phoneNumberView: view })
      },
```

Do **not** add `phoneNumberView` to the `partialize` block (around line 391) — leaving it out is what keeps it session-only. Confirm the block still reads exactly:

```ts
      partialize: (state) => ({
        calledToday:     state.calledToday,
        calledTodayDate: state.calledTodayDate,
        callingView:     state.callingView,
      }),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/stores/__tests__/dialer-store.test.ts`
Expected: PASS (all tests in the file, including the 2 new ones)

- [ ] **Step 5: Commit**

```bash
git add src/stores/dialer-store.ts src/stores/__tests__/dialer-store.test.ts
git commit -m "Add phoneNumberView state to dialer-store"
```

---

### Task 3: Wire the toggle into `QueuePanel` (calling list)

**Files:**
- Modify: `src/components/dialer/QueuePanel.tsx`

**Interfaces:**
- Consumes: `resolvePhoneNumber`, `PhoneNumberView` (Task 1); `useDialerStore().phoneNumberView` / `.setPhoneNumberView` (Task 2).
- Produces: no new exports — internal UI wiring only.

**Note on testing:** `QueuePanel` has no existing test file (it pulls in `@dnd-kit` sortable contexts and Base UI tooltips with no jsdom polyfills set up in this repo, so adding first-time render coverage here is its own yak-shave, out of scope for this feature). Coverage for the actual logic (which number is resolved, null-handling) already lives in Task 1's unit tests and Task 4's `ProfileViewCard` integration tests, which exercise the same store field and helper through a component that *does* have a working render harness. This task is verified by the existing test suite staying green plus the manual QA pass in Task 5.

- [ ] **Step 1: Rename `MobilePhoneCell` to `PhoneCell` and add the missing-number fallback**

Replace (lines 120-160):

```tsx
function MobilePhoneCell({ phone }: { phone: string | null }) {
  const [copied, setCopied] = useState(false)
  if (!phone) return <div />
```

with:

```tsx
function PhoneCell({ phone }: { phone: string | null }) {
  const [copied, setCopied] = useState(false)
  if (!phone) {
    return (
      <div className="flex items-center">
        <span className="text-[15px]" style={{ color: 'var(--text-muted)' }}>—</span>
      </div>
    )
  }
```

(the rest of the function body — `handleCopy` through the closing `}` — is unchanged)

- [ ] **Step 2: Import the helper and type**

Add to the imports at the top of the file (after the `ContactSummary, ContactWithCampaign, CallHistoryRecord` import, line 22):

```ts
import { resolvePhoneNumber, type PhoneNumberView } from '@/lib/dialer-phone-view'
```

- [ ] **Step 3: Update the `GRID` comment for accuracy**

Replace (line 33):

```ts
// drag | name+subtext | company+emp | attempts | notes | quick-log | mobile | call | profile-jump
```

with:

```ts
// drag | name+subtext | company+emp | attempts | notes | quick-log | phone | call | profile-jump
```

- [ ] **Step 4: Update `ContactRow` to resolve the phone via the toggle**

Replace (line 202):

```tsx
  const { callStatus, selectContact, startCall } = useDialerStore()
```

with:

```tsx
  const { callStatus, selectContact, startCall, phoneNumberView } = useDialerStore()
```

Replace (lines 217-228):

```tsx
  const handleCallClick = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (callStatus !== 'idle') return
    if (!isActive) {
      selectContact(contact)
    } else {
      await startCall(contact.mobilePhone ?? undefined)
    }
  }

  const subtextParts = [contact.jobTitle, contact.companyName].filter(Boolean)
  const subtext = subtextParts.join(', ')
```

with:

```tsx
  const resolvedPhone = resolvePhoneNumber(contact, phoneNumberView)

  const handleCallClick = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (callStatus !== 'idle') return
    if (!isActive) {
      selectContact(contact)
    } else {
      await startCall(resolvedPhone ?? undefined)
    }
  }

  const subtextParts = [contact.jobTitle, contact.companyName].filter(Boolean)
  const subtext = subtextParts.join(', ')
```

Replace (line 319):

```tsx
        <MobilePhoneCell phone={contact.mobilePhone} />
```

with:

```tsx
        <PhoneCell phone={resolvedPhone} />
```

Replace the call button (lines 321-334):

```tsx
        <button
          onClick={handleCallClick}
          disabled={callStatus !== 'idle'}
          className={cn(
            'w-6 h-6 flex items-center justify-center rounded-lg flex-shrink-0 transition-colors',
            isActive
              ? 'bg-[var(--lf-accent)]/10 text-[var(--lf-accent)] hover:bg-[var(--lf-accent)]/20'
              : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--panel-border-hover)]',
            callStatus !== 'idle' && 'opacity-30 cursor-not-allowed',
          )}
          title={isActive ? 'Start call' : 'Select contact'}
        >
          <Phone className="w-3 h-3" />
        </button>
```

with:

```tsx
        <button
          onClick={handleCallClick}
          disabled={callStatus !== 'idle' || (isActive && !resolvedPhone)}
          className={cn(
            'w-6 h-6 flex items-center justify-center rounded-lg flex-shrink-0 transition-colors',
            isActive
              ? 'bg-[var(--lf-accent)]/10 text-[var(--lf-accent)] hover:bg-[var(--lf-accent)]/20'
              : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--panel-border-hover)]',
            (callStatus !== 'idle' || (isActive && !resolvedPhone)) && 'opacity-30 cursor-not-allowed',
          )}
          title={
            !isActive
              ? 'Select contact'
              : resolvedPhone
                ? 'Start call'
                : `No ${phoneNumberView} number on file`
          }
        >
          <Phone className="w-3 h-3" />
        </button>
```

- [ ] **Step 5: Update `CalledTodayRow` the same way**

Replace (lines 361-369):

```tsx
function CalledTodayRow({ contact }: { contact: ContactSummary }) {
  const { callStatus, selectContact, startCall } = useDialerStore()

  const handleCallClick = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (callStatus !== 'idle') return
    selectContact(contact)
    await startCall(contact.mobilePhone ?? undefined)
  }
```

with:

```tsx
function CalledTodayRow({ contact }: { contact: ContactSummary }) {
  const { callStatus, selectContact, startCall, phoneNumberView } = useDialerStore()
  const resolvedPhone = resolvePhoneNumber(contact, phoneNumberView)

  const handleCallClick = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (callStatus !== 'idle') return
    selectContact(contact)
    await startCall(resolvedPhone ?? undefined)
  }
```

Replace (line 393):

```tsx
      <MobilePhoneCell phone={contact.mobilePhone} />
```

with:

```tsx
      <PhoneCell phone={resolvedPhone} />
```

Replace the call button (lines 395-404):

```tsx
      <button
        onClick={handleCallClick}
        disabled={callStatus !== 'idle'}
        className={cn(
          'w-6 h-6 flex items-center justify-center rounded-lg flex-shrink-0 transition-colors text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--panel-border-hover)]',
          callStatus !== 'idle' && 'opacity-30 cursor-not-allowed',
        )}
      >
        <Phone className="w-3 h-3" />
      </button>
```

with:

```tsx
      <button
        onClick={handleCallClick}
        disabled={callStatus !== 'idle' || !resolvedPhone}
        className={cn(
          'w-6 h-6 flex items-center justify-center rounded-lg flex-shrink-0 transition-colors text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--panel-border-hover)]',
          (callStatus !== 'idle' || !resolvedPhone) && 'opacity-30 cursor-not-allowed',
        )}
        title={resolvedPhone ? 'Call again' : `No ${phoneNumberView} number on file`}
      >
        <Phone className="w-3 h-3" />
      </button>
```

- [ ] **Step 6: Add the Mobile/Corporate pill to the header**

Add `phoneNumberView` and `setPhoneNumberView` to the top-level `QueuePanel` destructure. Replace (lines 411-416):

```tsx
  const {
    campaignId, currentContact, queue, calledToday, totalContacts,
    queueFilters, callingView, profileIndex,
    setCampaign, startSession, loadQueue, reorderQueue, syncQueue,
    resetCalledTodayIfStale, setCallingView, setProfileIndex,
  } = useDialerStore()
```

with:

```tsx
  const {
    campaignId, currentContact, queue, calledToday, totalContacts,
    queueFilters, callingView, profileIndex, phoneNumberView,
    setCampaign, startSession, loadQueue, reorderQueue, syncQueue,
    resetCalledTodayIfStale, setCallingView, setProfileIndex, setPhoneNumberView,
  } = useDialerStore()
```

Add the new pill immediately after the closing `</div>` of the existing List/Profile pill block, still inside the `{campaignId && (...)}` wrapper it currently sits in. Replace (lines 608-612):

```tsx
                ))}
              </div>
            )}

            {/* Filters button */}
```

with:

```tsx
                ))}
              </div>
            )}

            {allContacts.length > 0 && (
              <div
                className="flex items-center p-[3px] rounded-[20px]"
                style={{ background: 'var(--card-bg-solid)', border: '0.5px solid var(--panel-border-hover)' }}
              >
                {(['mobile', 'corporate'] as const).map((v) => (
                  <button
                    key={v}
                    onClick={() => setPhoneNumberView(v)}
                    className={cn(
                      'flex items-center justify-center gap-1.5 px-3 h-[26px] rounded-[18px] transition-colors text-[11px] font-medium',
                      phoneNumberView === v
                        ? 'bg-[var(--lf-accent)] text-[#211a0c] font-semibold'
                        : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]',
                    )}
                  >
                    {v === 'mobile' ? 'Mobile' : 'Corporate'}
                  </button>
                ))}
              </div>
            )}

            {/* Filters button */}
```

- [ ] **Step 7: Run the full test suite to check for regressions**

Run: `npx vitest run`
Expected: PASS — no test imports `MobilePhoneCell` by name (it isn't exported), so the rename doesn't break anything; all prior counts unchanged plus Task 1/2's new tests.

- [ ] **Step 8: Commit**

```bash
git add src/components/dialer/QueuePanel.tsx
git commit -m "Add mobile/corporate phone toggle to the dialer calling list"
```

---

### Task 4: Wire the toggle into `ProfileViewCard` (profile view)

**Files:**
- Modify: `src/components/dialer/ProfileViewCard.tsx`
- Test: `src/components/dialer/__tests__/ProfileViewCard.test.tsx`

**Interfaces:**
- Consumes: `resolvePhoneNumber`, `PhoneNumberView` (Task 1); `useDialerStore().phoneNumberView` (Task 2). The toggle control itself lives only in `QueuePanel` (Task 3) — `ProfileViewCard` just reads the shared store field, since the header housing the pill stays mounted for both `callingView` states.
- Produces: no new exports — internal UI wiring only.

- [ ] **Step 1: Write the failing tests**

Add `afterEach` to the vitest import at the top of `src/components/dialer/__tests__/ProfileViewCard.test.tsx` (line 2):

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
```

Append this describe block at the end of the file:

```ts
describe('ProfileViewCard — phone number view', () => {
  beforeEach(() => {
    global.fetch = mockFetch()
  })

  afterEach(() => {
    useDialerStore.setState({ phoneNumberView: 'mobile' })
  })

  it('shows the mobile number by default', () => {
    const c = { ...contact, mobilePhone: '555-1000', corporatePhone: '555-2000' }
    useDialerStore.setState({
      campaignId: 'camp1', currentContact: c, queue: [], calledToday: [],
      totalContacts: 1, advanceProfile: vi.fn(async () => {}),
    })

    render(<ProfileViewCard contact={c} totalContacts={1} campaignId="camp1" />)

    expect(screen.getByText('Mobile')).toBeInTheDocument()
    expect(screen.getByText('555-1000')).toBeInTheDocument()
    expect(screen.queryByText('555-2000')).not.toBeInTheDocument()
  })

  it('shows the corporate number when phoneNumberView is corporate', () => {
    const c = { ...contact, mobilePhone: '555-1000', corporatePhone: '555-2000' }
    useDialerStore.setState({
      campaignId: 'camp1', currentContact: c, queue: [], calledToday: [],
      totalContacts: 1, advanceProfile: vi.fn(async () => {}), phoneNumberView: 'corporate',
    })

    render(<ProfileViewCard contact={c} totalContacts={1} campaignId="camp1" />)

    expect(screen.getByText('Corporate')).toBeInTheDocument()
    expect(screen.getByText('555-2000')).toBeInTheDocument()
    expect(screen.queryByText('555-1000')).not.toBeInTheDocument()
  })

  it('omits the phone tile when the contact has no number of the selected type', () => {
    const c = { ...contact, mobilePhone: '555-1000', corporatePhone: null, email: null }
    useDialerStore.setState({
      campaignId: 'camp1', currentContact: c, queue: [], calledToday: [],
      totalContacts: 1, advanceProfile: vi.fn(async () => {}), phoneNumberView: 'corporate',
    })

    render(<ProfileViewCard contact={c} totalContacts={1} campaignId="camp1" />)

    expect(screen.queryByText('Corporate')).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/dialer/__tests__/ProfileViewCard.test.tsx`
Expected: FAIL on all 3 new tests — the card still always renders "Mobile" bound to `mobilePhone`, ignoring `phoneNumberView`.

- [ ] **Step 3: Write minimal implementation**

Add the import to `src/components/dialer/ProfileViewCard.tsx` (after the `OUTCOME_LABEL...` import, line 14):

```ts
import { resolvePhoneNumber } from '@/lib/dialer-phone-view'
```

Add `phoneNumberView` to the store destructure. Replace (line 72):

```tsx
  const { setCallingView, advanceProfile, logManualOutcome, calledToday } = useDialerStore()
```

with:

```tsx
  const { setCallingView, advanceProfile, logManualOutcome, calledToday, phoneNumberView } = useDialerStore()
```

Add the resolved value/label next to `locationLabel` (line 93):

```tsx
  const locationLabel = [displayContact.city, displayContact.country].filter(Boolean).join(', ')
  const phoneValue = resolvePhoneNumber(displayContact, phoneNumberView)
  const phoneLabel = phoneNumberView === 'corporate' ? 'Corporate' : 'Mobile'
```

Replace the contact info cards block (lines 252-261):

```tsx
      {/* Contact info cards */}
      {(displayContact.mobilePhone || displayContact.email) && (
        <div className="grid grid-cols-2 gap-3">
          {displayContact.mobilePhone && (
            <ContactInfoCard label="Mobile" value={displayContact.mobilePhone} mono />
          )}
          {displayContact.email && (
            <ContactInfoCard label="Email" value={displayContact.email} />
          )}
        </div>
      )}
```

with:

```tsx
      {/* Contact info cards */}
      {(phoneValue || displayContact.email) && (
        <div className="grid grid-cols-2 gap-3">
          {phoneValue && (
            <ContactInfoCard label={phoneLabel} value={phoneValue} mono />
          )}
          {displayContact.email && (
            <ContactInfoCard label="Email" value={displayContact.email} />
          )}
        </div>
      )}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/components/dialer/__tests__/ProfileViewCard.test.tsx`
Expected: PASS — all tests in the file, including the 3 new ones.

- [ ] **Step 5: Commit**

```bash
git add src/components/dialer/ProfileViewCard.tsx src/components/dialer/__tests__/ProfileViewCard.test.tsx
git commit -m "Show mobile/corporate phone toggle state in the dialer profile view"
```

---

### Task 5: Manual verification in the browser

**Files:** none (verification only)

Per CLAUDE.md's frontend guidance, UI changes must be checked in a running browser before being called complete — automated tests here don't cover the actual `QueuePanel` render (see Task 3's note), so this step is load-bearing, not optional polish.

- [ ] **Step 1: Start the dev server**

Run: `npm run dev` (or the project's existing dev script)

- [ ] **Step 2: Open the dialer, load a campaign with contacts that have both phone types set**

Navigate to `/calling`, pick a campaign with at least one contact that has both `mobilePhone` and `corporatePhone` populated, and at least one contact with only `mobilePhone` set (use `ContactExpandPanel`'s edit form to set these on a couple of test contacts if needed).

- [ ] **Step 3: Verify the calling list**

- Confirm the new Mobile/Corporate pill appears next to the List/Profile pill.
- Click "Corporate": every row's phone cell switches to the corporate number; a contact missing a corporate number shows `—` and its call button becomes disabled with a "No corporate number on file" tooltip on hover.
- Click "Mobile": rows switch back.
- Select a contact, click the call button while "Corporate" is active, and confirm (via network tab or the `start-call` request body) that the corporate number was sent, not the mobile one.

- [ ] **Step 4: Verify the profile view**

- Switch to "Profile" view (List/Profile pill) with "Corporate" still selected — confirm the info tile reads "Corporate" and shows the corporate number, and disappears entirely (rather than showing blank) for a contact with no corporate number.
- Reload the page — confirm the toggle resets to "Mobile" (not persisted).

- [ ] **Step 5: Report results**

Note in the PR/commit description (or to the user directly) that manual verification was performed, listing what was checked from steps 3-4.
