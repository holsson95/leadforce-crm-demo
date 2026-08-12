# Queue Contact Expand Panel — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an expandable contact detail panel to each calling queue row that shows all contact fields in read mode and switches to an inline edit form.

**Architecture:** `QueuePanel` holds `expandedContactId` + `contactCache` state (single-open, cached fetch). A new `ContactExpandPanel` component renders below the row grid and handles read/edit modes. The dialer store gains a `patchContact` action to update compact row display after save.

**Tech Stack:** React, TypeScript, react-hook-form, Zod, Zustand, Prisma, Next.js API routes, dnd-kit, Shadcn/UI, Tailwind CSS

---

### Task 1: Add GET /api/contacts/[id] endpoint

**Files:**
- Modify: `src/app/api/contacts/[id]/route.ts`

- [ ] **Step 1: Add the GET handler** to the top of `src/app/api/contacts/[id]/route.ts` (above the existing `PATCH` export):

```ts
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { role, tenantId } = await getClerkMeta()
  if (!hasPermission(role, 'contacts:read') || !tenantId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const contact = await withTenant(tenantId, () =>
    db.contact.findUnique({
      where: { id, deletedAt: null },
      include: {
        campaign: { select: { id: true, name: true } },
        accountOwner: { select: { id: true, name: true } },
      },
    })
  )

  if (!contact) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ data: contact })
}
```

The existing imports (`NextResponse`, `auth`, `z`, `db`, `withTenant`, `hasPermission`, `getClerkMeta`, `computeDedupeHash`) are all already present in the file — no new imports needed.

- [ ] **Step 2: Commit**

```bash
git add src/app/api/contacts/[id]/route.ts
git commit -m "Add GET /api/contacts/:id endpoint"
```

---

### Task 2: Add patchContact action to dialer store

**Files:**
- Modify: `src/stores/dialer-store.ts`
- Create: `src/stores/__tests__/dialer-store.test.ts`

- [ ] **Step 1: Write the failing test** in a new file `src/stores/__tests__/dialer-store.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { useDialerStore } from '../dialer-store'
import type { ContactSummary } from '@/types/models'

const c1: ContactSummary = {
  id: 'c1', firstName: 'John', lastName: 'Doe', mobilePhone: null,
  corporatePhone: null, companyName: 'Acme', status: 'prospect',
  jobTitle: 'VP', employeeCount: null, callHistory: [],
}
const c2: ContactSummary = {
  id: 'c2', firstName: 'Jane', lastName: 'Smith', mobilePhone: null,
  corporatePhone: null, companyName: 'Beta', status: 'prospect',
  jobTitle: 'CEO', employeeCount: null, callHistory: [],
}

describe('useDialerStore — patchContact', () => {
  beforeEach(() => {
    useDialerStore.setState({
      currentContact: c1,
      queue: [c2],
      calledToday: [],
    })
  })

  it('patches currentContact by id', () => {
    useDialerStore.getState().patchContact('c1', { firstName: 'Johnny', companyName: 'NewCo' })
    const { currentContact } = useDialerStore.getState()
    expect(currentContact?.firstName).toBe('Johnny')
    expect(currentContact?.companyName).toBe('NewCo')
    expect(currentContact?.lastName).toBe('Doe')
  })

  it('patches a contact in queue by id', () => {
    useDialerStore.getState().patchContact('c2', { jobTitle: 'CTO' })
    const { queue } = useDialerStore.getState()
    expect(queue[0].jobTitle).toBe('CTO')
    expect(queue[0].firstName).toBe('Jane')
  })

  it('patches a contact in calledToday by id', () => {
    useDialerStore.setState({ calledToday: [c2] })
    useDialerStore.getState().patchContact('c2', { status: 'lead' })
    const { calledToday } = useDialerStore.getState()
    expect(calledToday[0].status).toBe('lead')
  })

  it('does not modify contacts with a different id', () => {
    useDialerStore.getState().patchContact('c1', { firstName: 'Johnny' })
    const { queue } = useDialerStore.getState()
    expect(queue[0].firstName).toBe('Jane')
  })

  it('is a no-op when the id does not exist in any list', () => {
    useDialerStore.getState().patchContact('nonexistent', { firstName: 'Ghost' })
    const { currentContact, queue } = useDialerStore.getState()
    expect(currentContact?.firstName).toBe('John')
    expect(queue[0].firstName).toBe('Jane')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/stores/__tests__/dialer-store.test.ts
```
Expected: FAIL — `patchContact is not a function`

- [ ] **Step 3: Add `patchContact` to the `DialerState` interface** in `src/stores/dialer-store.ts`. Add this line after `syncQueue`:

```ts
patchContact(id: string, partial: Partial<Pick<ContactSummary, 'firstName' | 'lastName' | 'companyName' | 'jobTitle' | 'mobilePhone' | 'corporatePhone' | 'status'>>): void
```

- [ ] **Step 4: Add the implementation** inside the `create<DialerState>` call, after `syncQueue`:

```ts
  patchContact(id, partial) {
    const { currentContact, queue, calledToday } = get()
    const patch = (c: ContactSummary): ContactSummary =>
      c.id === id ? { ...c, ...partial } : c
    set({
      currentContact: currentContact ? patch(currentContact) : null,
      queue:          queue.map(patch),
      calledToday:    calledToday.map(patch),
    })
  },
```

- [ ] **Step 5: Run test to verify it passes**

```bash
npx vitest run src/stores/__tests__/dialer-store.test.ts
```
Expected: 5 tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/stores/dialer-store.ts src/stores/__tests__/dialer-store.test.ts
git commit -m "Add patchContact action to dialer store"
```

---

### Task 3: Fetch users in calling page and thread through QueuePanel

**Files:**
- Modify: `src/app/(dashboard)/calling/page.tsx`
- Modify: `src/components/dialer/QueuePanel.tsx` (props only — no behaviour change yet)

- [ ] **Step 1: Update the calling page** to fetch users alongside campaigns. Replace the existing `page.tsx` contents with:

```ts
import { redirect } from 'next/navigation'
import { getCurrentTenantId } from '@/lib/auth'
import { db, withTenant } from '@/lib/db'
import { QueuePanel } from '@/components/dialer/QueuePanel'
import { CallControls } from '@/components/dialer/CallControls'
import { ScriptPanel } from '@/components/dialer/ScriptPanel'

export default async function CallingPage() {
  const tenantId = await getCurrentTenantId()
  if (!tenantId) redirect('/sign-in')

  const [campaigns, users] = await Promise.all([
    withTenant(tenantId, () =>
      db.campaign.findMany({
        where:   { status: 'active', archivedAt: null, deletedAt: null },
        select:  { id: true, name: true },
        orderBy: { name: 'asc' },
      })
    ),
    withTenant(tenantId, () =>
      db.user.findMany({
        where:   { deletedAt: null },
        select:  { id: true, name: true },
        orderBy: { name: 'asc' },
      })
    ),
  ])

  return (
    <div className="flex h-full gap-4 p-4 overflow-hidden">
      <QueuePanel campaigns={campaigns} users={users} />
      <div className="w-1/3 flex flex-col gap-4 min-w-0">
        <CallControls />
        <ScriptPanel />
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Add `users` to QueuePanelProps** in `src/components/dialer/QueuePanel.tsx`. Change:

```ts
interface QueuePanelProps {
  campaigns: { id: string; name: string }[]
}
```

to:

```ts
interface QueuePanelProps {
  campaigns: { id: string; name: string }[]
  users: { id: string; name: string }[]
}
```

And update the `QueuePanel` function signature:

```ts
export function QueuePanel({ campaigns, users }: QueuePanelProps) {
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add src/app/\(dashboard\)/calling/page.tsx src/components/dialer/QueuePanel.tsx
git commit -m "Thread users list from calling page into QueuePanel"
```

---

### Task 4: Create ContactExpandPanel component

**Files:**
- Create: `src/components/dialer/ContactExpandPanel.tsx`

- [ ] **Step 1: Create `src/components/dialer/ContactExpandPanel.tsx`** with the full component:

```tsx
'use client'

import { useState } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { X, Pencil } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { UpdateContactSchema } from '@/app/(dashboard)/contacts/schemas'
import type { ContactFormData } from '@/app/(dashboard)/contacts/schemas'
import type { ContactWithCampaign } from '@/types/models'
import { useDialerStore } from '@/stores/dialer-store'

interface ContactExpandPanelProps {
  contact: ContactWithCampaign
  users: { id: string; name: string }[]
  onClose: () => void
  onSaved: (updated: ContactWithCampaign) => void
}

const STATUS_LABELS: Record<string, string> = {
  prospect:       'Prospect',
  lead:           'Lead',
  dnc:            'DNC',
  future:         'Future',
  call_back:      'Call Back',
  meeting_booked: 'Meeting Booked',
}

const STATUS_COLORS: Record<string, string> = {
  prospect:       'bg-blue-500/10 text-blue-400 border-blue-500/20',
  lead:           'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  dnc:            'bg-red-500/10 text-red-400 border-red-500/20',
  future:         'bg-purple-500/10 text-purple-400 border-purple-500/20',
  call_back:      'bg-amber-500/10 text-amber-400 border-amber-500/20',
  meeting_booked: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
}

const inputClass =
  'bg-white/5 border-white/10 text-white placeholder:text-gray-600 focus:border-[#00d4ff]/50 focus:ring-1 focus:ring-[#00d4ff]/10 rounded-xl'

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-0.5">
      {children}
    </p>
  )
}

function FieldValue({ children }: { children: React.ReactNode }) {
  const empty = children === null || children === undefined || children === ''
  return (
    <p className={cn('text-sm', empty ? 'text-gray-600' : 'text-white')}>
      {empty ? '—' : children}
    </p>
  )
}

function SectionDivider({ label }: { label: string }) {
  return (
    <div className="col-span-2 mt-2 mb-1 pb-1.5 border-b border-white/5">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">{label}</p>
    </div>
  )
}

function buildDefaults(contact: ContactWithCampaign): Partial<ContactFormData> {
  return {
    firstName:      contact.firstName,
    lastName:       contact.lastName,
    email:          contact.email          ?? '',
    mobilePhone:    contact.mobilePhone    ?? '',
    corporatePhone: contact.corporatePhone ?? '',
    jobTitle:       contact.jobTitle       ?? '',
    companyName:    contact.companyName    ?? '',
    industry:       contact.industry       ?? '',
    employeeCount:  contact.employeeCount  ?? undefined,
    address:        contact.address        ?? '',
    city:           contact.city           ?? '',
    state:          contact.state          ?? '',
    zip:            contact.zip            ?? '',
    country:        contact.country        ?? '',
    companyAddress: contact.companyAddress ?? '',
    companyCity:    contact.companyCity    ?? '',
    website:        contact.website        ?? '',
    linkedinUrl:    contact.linkedinUrl    ?? '',
    accountOwnerId: contact.accountOwnerId ?? '',
    status:         contact.status,
    dncReason:      contact.dncReason      ?? '',
  }
}

export function ContactExpandPanel({ contact, users, onClose, onSaved }: ContactExpandPanelProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const { patchContact } = useDialerStore()

  const { register, handleSubmit, reset, control, watch, formState: { errors, isSubmitting } } =
    useForm<Partial<ContactFormData>>({
      resolver:      zodResolver(UpdateContactSchema) as never,
      defaultValues: buildDefaults(contact),
    })

  const selectedStatus = watch('status')

  const handleEdit = () => {
    reset(buildDefaults(contact))
    setSaveError(null)
    setIsEditing(true)
  }

  const handleCancel = () => {
    setIsEditing(false)
    setSaveError(null)
  }

  const onSubmit = async (data: Partial<ContactFormData>) => {
    setSaveError(null)
    const res = await fetch(`/api/contacts/${contact.id}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(data),
    })
    if (!res.ok) {
      setSaveError('Failed to save changes. Please try again.')
      return
    }
    const { data: updated } = (await res.json()) as { data: ContactWithCampaign }
    patchContact(contact.id, {
      firstName:      updated.firstName,
      lastName:       updated.lastName,
      companyName:    updated.companyName    ?? undefined,
      jobTitle:       updated.jobTitle       ?? undefined,
      mobilePhone:    updated.mobilePhone    ?? undefined,
      corporatePhone: updated.corporatePhone ?? undefined,
      status:         updated.status,
    })
    onSaved(updated)
    setIsEditing(false)
  }

  if (isEditing) {
    return (
      <div className="bg-[rgba(22,28,38,0.8)] border-t border-white/10 px-6 py-5">
        <form onSubmit={handleSubmit(onSubmit)}>
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm font-semibold text-white">Edit Contact</p>
            <button
              type="button"
              onClick={handleCancel}
              className="w-6 h-6 flex items-center justify-center rounded-lg text-gray-500 hover:text-white hover:bg-white/5 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="space-y-5">
            {/* Personal */}
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-3 pb-1.5 border-b border-white/5">Personal</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-gray-400">First Name</Label>
                  <Input {...register('firstName')} className={inputClass} />
                  {errors.firstName && <p className="text-xs text-red-400">{errors.firstName.message}</p>}
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-gray-400">Last Name</Label>
                  <Input {...register('lastName')} className={inputClass} />
                  {errors.lastName && <p className="text-xs text-red-400">{errors.lastName.message}</p>}
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-gray-400">Email</Label>
                  <Input {...register('email')} type="email" className={inputClass} />
                  {errors.email && <p className="text-xs text-red-400">{errors.email.message}</p>}
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-gray-400">Job Title</Label>
                  <Input {...register('jobTitle')} className={inputClass} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-gray-400">Mobile Phone</Label>
                  <Input {...register('mobilePhone')} className={inputClass} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-gray-400">Corporate Phone</Label>
                  <Input {...register('corporatePhone')} className={inputClass} />
                </div>
              </div>
            </div>

            {/* Company */}
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-3 pb-1.5 border-b border-white/5">Company</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5 col-span-2">
                  <Label className="text-xs text-gray-400">Company Name</Label>
                  <Input {...register('companyName')} className={inputClass} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-gray-400">Industry</Label>
                  <Input {...register('industry')} className={inputClass} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-gray-400">Employee Count</Label>
                  <Input {...register('employeeCount', { valueAsNumber: true })} type="number" min={0} className={inputClass} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-gray-400">Website</Label>
                  <Input {...register('website')} className={inputClass} />
                  {errors.website && <p className="text-xs text-red-400">{errors.website.message}</p>}
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-gray-400">LinkedIn URL</Label>
                  <Input {...register('linkedinUrl')} className={inputClass} />
                  {errors.linkedinUrl && <p className="text-xs text-red-400">{errors.linkedinUrl.message}</p>}
                </div>
              </div>
            </div>

            {/* Location */}
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-3 pb-1.5 border-b border-white/5">Location</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5 col-span-2">
                  <Label className="text-xs text-gray-400">Address</Label>
                  <Input {...register('address')} className={inputClass} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-gray-400">City</Label>
                  <Input {...register('city')} className={inputClass} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-gray-400">State</Label>
                  <Input {...register('state')} className={inputClass} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-gray-400">ZIP</Label>
                  <Input {...register('zip')} className={inputClass} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-gray-400">Country</Label>
                  <Input {...register('country')} className={inputClass} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-gray-400">Company Address</Label>
                  <Input {...register('companyAddress')} className={inputClass} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-gray-400">Company City</Label>
                  <Input {...register('companyCity')} className={inputClass} />
                </div>
              </div>
            </div>

            {/* Assignment */}
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-3 pb-1.5 border-b border-white/5">Assignment</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-gray-400">Status</Label>
                  <Controller
                    name="status"
                    control={control}
                    render={({ field }) => (
                      <Select onValueChange={field.onChange} value={field.value ?? ''}>
                        <SelectTrigger className={inputClass}>
                          <SelectValue>
                            {(v: string | null) => v ? (STATUS_LABELS[v] ?? v) : ''}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent className="rounded-xl border-white/10 bg-[#161c26]">
                          {Object.entries(STATUS_LABELS).map(([value, label]) => (
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
                <div className="space-y-1.5">
                  <Label className="text-xs text-gray-400">Account Owner</Label>
                  <Controller
                    name="accountOwnerId"
                    control={control}
                    render={({ field }) => (
                      <Select onValueChange={field.onChange} value={field.value ?? ''}>
                        <SelectTrigger className={inputClass}>
                          <SelectValue>
                            {(v: string) => users.find((u) => u.id === v)?.name ?? 'No owner'}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent className="rounded-xl border-white/10 bg-[#161c26]">
                          <SelectItem value=""
                            className="text-gray-300 focus:bg-white/5 focus:text-white rounded-lg">
                            No owner
                          </SelectItem>
                          {users.map((u) => (
                            <SelectItem key={u.id} value={u.id}
                              className="text-gray-300 focus:bg-white/5 focus:text-white rounded-lg">
                              {u.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                </div>
                {selectedStatus === 'dnc' && (
                  <div className="space-y-1.5 col-span-2">
                    <Label className="text-xs text-gray-400">DNC Reason</Label>
                    <Input {...register('dncReason')} placeholder="e.g. Requested removal" className={inputClass} />
                  </div>
                )}
                <div className="space-y-1.5">
                  <Label className="text-xs text-gray-400">Campaign</Label>
                  <p className="text-sm text-gray-400 py-2">{contact.campaign.name}</p>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-gray-400">Dial Attempts</Label>
                  <p className="text-sm text-gray-400 py-2">{contact.dialAttempts}</p>
                </div>
              </div>
            </div>
          </div>

          {saveError && <p className="mt-3 text-sm text-red-400">{saveError}</p>}

          <div className="flex gap-3 mt-5 pt-4 border-t border-white/5">
            <Button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 bg-gradient-to-r from-[#00d4ff] to-cyan-600 text-black font-semibold rounded-xl hover:opacity-90"
            >
              {isSubmitting ? 'Saving…' : 'Save Changes'}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={handleCancel}
              className="bg-white/5 border-white/10 text-gray-300 hover:bg-white/10 rounded-xl"
            >
              Cancel
            </Button>
          </div>
        </form>
      </div>
    )
  }

  return (
    <div className="bg-[rgba(22,28,38,0.8)] border-t border-white/10 px-6 py-5">
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm font-semibold text-white">
          {contact.firstName} {contact.lastName}
        </p>
        <div className="flex items-center gap-2">
          <button
            onClick={handleEdit}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-gray-400 hover:text-white hover:bg-white/5 border border-white/10 transition-colors"
          >
            <Pencil className="w-3 h-3" />
            Edit
          </button>
          <button
            onClick={onClose}
            className="w-6 h-6 flex items-center justify-center rounded-lg text-gray-500 hover:text-white hover:bg-white/5 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-6 gap-y-3">
        <SectionDivider label="Personal" />
        <div><FieldLabel>Email</FieldLabel><FieldValue>{contact.email}</FieldValue></div>
        <div><FieldLabel>Job Title</FieldLabel><FieldValue>{contact.jobTitle}</FieldValue></div>
        <div><FieldLabel>Mobile Phone</FieldLabel><FieldValue>{contact.mobilePhone}</FieldValue></div>
        <div><FieldLabel>Corporate Phone</FieldLabel><FieldValue>{contact.corporatePhone}</FieldValue></div>

        <SectionDivider label="Company" />
        <div><FieldLabel>Company Name</FieldLabel><FieldValue>{contact.companyName}</FieldValue></div>
        <div><FieldLabel>Industry</FieldLabel><FieldValue>{contact.industry}</FieldValue></div>
        <div><FieldLabel>Employee Count</FieldLabel><FieldValue>{contact.employeeCount?.toLocaleString()}</FieldValue></div>
        <div><FieldLabel>Website</FieldLabel><FieldValue>{contact.website}</FieldValue></div>
        <div className="col-span-2"><FieldLabel>LinkedIn</FieldLabel><FieldValue>{contact.linkedinUrl}</FieldValue></div>

        <SectionDivider label="Location" />
        <div><FieldLabel>Address</FieldLabel><FieldValue>{contact.address}</FieldValue></div>
        <div><FieldLabel>City</FieldLabel><FieldValue>{contact.city}</FieldValue></div>
        <div><FieldLabel>State</FieldLabel><FieldValue>{contact.state}</FieldValue></div>
        <div><FieldLabel>ZIP</FieldLabel><FieldValue>{contact.zip}</FieldValue></div>
        <div><FieldLabel>Country</FieldLabel><FieldValue>{contact.country}</FieldValue></div>
        <div><FieldLabel>Company Address</FieldLabel><FieldValue>{contact.companyAddress}</FieldValue></div>
        <div><FieldLabel>Company City</FieldLabel><FieldValue>{contact.companyCity}</FieldValue></div>

        <SectionDivider label="Assignment" />
        <div>
          <FieldLabel>Status</FieldLabel>
          <div className="mt-0.5">
            <Badge className={cn('text-[10px] h-5 px-2 border', STATUS_COLORS[contact.status] ?? 'bg-gray-500/10 text-gray-400 border-gray-500/20')}>
              {STATUS_LABELS[contact.status] ?? contact.status}
            </Badge>
          </div>
        </div>
        <div><FieldLabel>Account Owner</FieldLabel><FieldValue>{contact.accountOwner?.name}</FieldValue></div>
        {contact.dncReason && (
          <div><FieldLabel>DNC Reason</FieldLabel><FieldValue>{contact.dncReason}</FieldValue></div>
        )}
        <div><FieldLabel>Campaign</FieldLabel><FieldValue>{contact.campaign.name}</FieldValue></div>
        <div><FieldLabel>Dial Attempts</FieldLabel><FieldValue>{contact.dialAttempts}</FieldValue></div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/components/dialer/ContactExpandPanel.tsx
git commit -m "Add ContactExpandPanel with read and inline edit modes"
```

---

### Task 5: Wire ContactExpandPanel into QueuePanel

**Files:**
- Modify: `src/components/dialer/QueuePanel.tsx`

- [ ] **Step 1: Add new imports** at the top of `QueuePanel.tsx`. Add these alongside the existing imports:

```ts
import { ContactExpandPanel } from './ContactExpandPanel'
import type { ContactWithCampaign } from '@/types/models'
```

- [ ] **Step 2: Update `ContactRow` props interface** — change the function signature from:

```ts
function ContactRow({ contact, isActive }: { contact: ContactSummary; isActive: boolean }) {
```

to:

```ts
function ContactRow({
  contact,
  isActive,
  isExpanded,
  users,
  onToggle,
  cachedContact,
  onSaved,
}: {
  contact: ContactSummary
  isActive: boolean
  isExpanded: boolean
  users: { id: string; name: string }[]
  onToggle: (id: string) => void
  cachedContact: ContactWithCampaign | null
  onSaved: (updated: ContactWithCampaign) => void
}) {
```

- [ ] **Step 3: Add `ChevronDown` to the existing imports** from `lucide-react` — it is already imported in the file (used for the "Calls made today" section), so no change needed here.

- [ ] **Step 4: Restructure the `ContactRow` return** to separate the grid row from the expand panel. Replace the entire `return (...)` block in `ContactRow` with:

```tsx
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      className={cn(
        'border-b border-white/5',
        isActive && 'border-l-2 border-l-[#00d4ff]',
      )}
    >
      <div
        onClick={handleRowClick}
        className={cn(
          `group grid ${GRID} items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors`,
          isActive ? 'bg-white/5' : 'hover:bg-white/[0.02]',
        )}
      >
        <div
          {...listeners}
          onClick={(e) => e.stopPropagation()}
          className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-600 hover:text-gray-400 touch-none cursor-grab active:cursor-grabbing flex-shrink-0"
        >
          <GripVertical className="w-3 h-3" />
        </div>

        <div className="min-w-0 flex items-center gap-1">
          <button
            onClick={(e) => { e.stopPropagation(); onToggle(contact.id) }}
            className="flex-shrink-0 w-4 h-4 flex items-center justify-center text-gray-500 hover:text-[#00d4ff] transition-colors"
          >
            <ChevronDown className={cn('w-3 h-3 transition-transform duration-150', isExpanded && 'rotate-180')} />
          </button>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-white truncate leading-tight">
              {contact.firstName} {contact.lastName}
            </p>
            {contact.jobTitle && (
              <p className="text-[10px] text-gray-500 truncate leading-tight mt-0.5">{contact.jobTitle}</p>
            )}
            {contact.status === 'call_back' && (
              <Badge className="mt-1 text-[9px] h-4 px-1.5 bg-amber-500/10 text-amber-400 border-amber-500/20">
                Call Back
              </Badge>
            )}
          </div>
        </div>

        <CompanyCell contact={contact} />
        <CallHistoryDots history={contact.callHistory} />
        <NotesButton contact={contact} />
        <QuickLogDropdown
          contactId={contact.id}
          contactName={`${contact.firstName} ${contact.lastName}`}
          disabled={!isActive || callStatus !== 'idle'}
        />
        <MobilePhoneCell phone={contact.mobilePhone} />

        <button
          onClick={handleCallClick}
          disabled={callStatus !== 'idle'}
          className={cn(
            'w-6 h-6 flex items-center justify-center rounded-lg flex-shrink-0 transition-colors',
            isActive
              ? 'bg-[#00d4ff]/10 text-[#00d4ff] hover:bg-[#00d4ff]/20'
              : 'text-gray-600 hover:text-gray-300 hover:bg-white/5',
            callStatus !== 'idle' && 'opacity-30 cursor-not-allowed',
          )}
          title={isActive ? 'Start call' : 'Select contact'}
        >
          <Phone className="w-3 h-3" />
        </button>
      </div>

      {isExpanded && cachedContact && (
        <ContactExpandPanel
          contact={cachedContact}
          users={users}
          onClose={() => onToggle(contact.id)}
          onSaved={onSaved}
        />
      )}
    </div>
  )
```

- [ ] **Step 5: Add state and handlers** to the `QueuePanel` function. After the existing `useState` declarations (`calledTodayOpen`, `page`), add:

```ts
  const [expandedContactId, setExpandedContactId] = useState<string | null>(null)
  const [contactCache, setContactCache] = useState<Record<string, ContactWithCampaign>>({})

  const handleToggle = async (id: string) => {
    if (expandedContactId === id) {
      setExpandedContactId(null)
      return
    }
    if (contactCache[id]) {
      setExpandedContactId(id)
      return
    }
    const res = await fetch(`/api/contacts/${id}`)
    if (!res.ok) return
    const { data } = (await res.json()) as { data: ContactWithCampaign }
    setContactCache((prev) => ({ ...prev, [id]: data }))
    setExpandedContactId(id)
  }

  const handleSaved = (updated: ContactWithCampaign) => {
    setContactCache((prev) => ({ ...prev, [updated.id]: updated }))
  }
```

- [ ] **Step 6: Pass new props** to every `ContactRow` usage inside the `<SortableContext>` block. Change:

```tsx
              {pageContacts.map((contact) => (
                <ContactRow
                  key={contact.id}
                  contact={contact}
                  isActive={contact.id === currentContact?.id}
                />
              ))}
```

to:

```tsx
              {pageContacts.map((contact) => (
                <ContactRow
                  key={contact.id}
                  contact={contact}
                  isActive={contact.id === currentContact?.id}
                  isExpanded={contact.id === expandedContactId}
                  users={users}
                  onToggle={handleToggle}
                  cachedContact={contactCache[contact.id] ?? null}
                  onSaved={handleSaved}
                />
              ))}
```

- [ ] **Step 7: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```
Expected: no errors

- [ ] **Step 8: Run all tests**

```bash
npx vitest run
```
Expected: all existing tests pass, including the new dialer-store tests

- [ ] **Step 9: Commit**

```bash
git add src/components/dialer/QueuePanel.tsx
git commit -m "Wire ContactExpandPanel into QueuePanel with single-open toggle and cache"
```
