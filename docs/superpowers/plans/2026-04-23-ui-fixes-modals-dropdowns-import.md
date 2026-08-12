# UI Fixes — Form Modals, Dropdown Positioning, Import Integration

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace side-drawer forms with centered modals, fix dropdown overlap by disabling Base UI's `alignItemWithTrigger` behavior, and move the CSV import wizard into the contacts page.

**Architecture:** `FormModal` is a thin wrapper around `@base-ui/react/dialog` that provides the backdrop, popup container, and header row. Forms (`CampaignModal`, `ContactModal`) manage their own scrollable body + pinned footer inside `FormModal`'s children. The import wizard is surfaced via a "Import" button in `ContactsTable`, opening in a `FormModal` with a scrollable inner div. The `/imports` sidebar entry is removed and the route redirects to `/contacts`.

**Tech Stack:** Next.js 14 App Router, React, TypeScript, `@base-ui/react/dialog`, `@base-ui/react/select`, Tailwind CSS v4, Vitest + Testing Library

---

## File Map

| Status | File | Responsibility |
|--------|------|----------------|
| **Create** | `src/components/shared/FormModal.tsx` | Reusable centered modal wrapper |
| **Create** | `src/components/shared/__tests__/FormModal.test.tsx` | Unit tests for FormModal |
| **Create** | `src/components/campaigns/CampaignModal.tsx` | Campaign create/edit form in modal |
| **Delete** | `src/components/campaigns/CampaignDrawer.tsx` | Replaced by CampaignModal |
| **Create** | `src/components/contacts/ContactModal.tsx` | Contact create/edit form in modal |
| **Delete** | `src/components/contacts/ContactDrawer.tsx` | Replaced by ContactModal |
| **Modify** | `src/components/campaigns/CampaignsTable.tsx` | Swap CampaignDrawer → CampaignModal |
| **Modify** | `src/components/contacts/ContactsTable.tsx` | Swap ContactDrawer → ContactModal, add Import button + modal |
| **Modify** | `src/components/imports/ImportWizard.tsx` | Add `onComplete` prop, fix dropdown, add empty state |
| **Modify** | `src/components/layout/Sidebar.tsx` | Remove `/imports` nav entry |
| **Modify** | `src/app/(dashboard)/imports/page.tsx` | Redirect to `/contacts` |

---

## Task 1: Create FormModal component

**Files:**
- Create: `src/components/shared/FormModal.tsx`
- Create: `src/components/shared/__tests__/FormModal.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/components/shared/__tests__/FormModal.test.tsx`:

```tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { FormModal } from '../FormModal'

describe('FormModal', () => {
  it('renders title and children when open', () => {
    render(
      <FormModal open={true} onClose={vi.fn()} title="Test Modal">
        <div>Modal content</div>
      </FormModal>
    )
    expect(screen.getByText('Test Modal')).toBeInTheDocument()
    expect(screen.getByText('Modal content')).toBeInTheDocument()
  })

  it('does not render when closed', () => {
    render(
      <FormModal open={false} onClose={vi.fn()} title="Test Modal">
        <div>Modal content</div>
      </FormModal>
    )
    expect(screen.queryByText('Test Modal')).not.toBeInTheDocument()
    expect(screen.queryByText('Modal content')).not.toBeInTheDocument()
  })

  it('calls onClose when close button is clicked', () => {
    const onClose = vi.fn()
    render(
      <FormModal open={true} onClose={onClose} title="Test Modal">
        <div>content</div>
      </FormModal>
    )
    fireEvent.click(screen.getByRole('button', { name: /close/i }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/components/shared/__tests__/FormModal.test.tsx
```

Expected: FAIL — `FormModal` does not exist yet.

- [ ] **Step 3: Create FormModal.tsx**

Create `src/components/shared/FormModal.tsx`:

```tsx
'use client'

import { Dialog } from '@base-ui/react/dialog'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ReactNode } from 'react'

interface FormModalProps {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  width?: 'md' | 'lg'
}

export function FormModal({ open, onClose, title, children, width = 'md' }: FormModalProps) {
  return (
    <Dialog.Root open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose() }}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm transition-opacity duration-200 data-starting-style:opacity-0 data-ending-style:opacity-0" />
        <Dialog.Popup
          className={cn(
            'fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2',
            'flex flex-col bg-card-solid border border-white/10 rounded-3xl shadow-2xl',
            'transition-all duration-200 data-starting-style:opacity-0 data-starting-style:scale-95 data-ending-style:opacity-0 data-ending-style:scale-95',
            width === 'md' ? 'w-full max-w-lg' : 'w-full max-w-2xl'
          )}
        >
          <div className="flex-shrink-0 flex items-center justify-between px-6 h-16 border-b border-white/5">
            <Dialog.Title className="text-sm font-semibold text-white">{title}</Dialog.Title>
            <Dialog.Close
              className="w-8 h-8 rounded-xl flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/5 transition-colors duration-200"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </Dialog.Close>
          </div>
          {children}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/components/shared/__tests__/FormModal.test.tsx
```

Expected: 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/shared/FormModal.tsx src/components/shared/__tests__/FormModal.test.tsx
git commit -m "Add FormModal shared component with unit tests"
```

---

## Task 2: Update ImportWizard — add onComplete prop, fix dropdown, add empty state

**Files:**
- Modify: `src/components/imports/ImportWizard.tsx`

The `SelectContent` dropdown overlaps its trigger because Base UI's default `alignItemWithTrigger={true}` scrolls the popup to align the selected item with the trigger position. Setting `alignItemWithTrigger={false}` makes the popup always open anchored below the trigger.

- [ ] **Step 1: Update ImportWizard.tsx**

Replace the full file content of `src/components/imports/ImportWizard.tsx`. Changes: add `onComplete?: () => void` to props, update "Go to Contacts" button, add `alignItemWithTrigger={false}` to `SelectContent`, add empty state for campaigns.

```tsx
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
  ColumnMapping, RawRow, ImportPreviewResult, ImportResult, DuplicateRow, ContactField,
} from '@/lib/csv/types'
import type { Campaign } from '@prisma/client'

type Step = 'upload' | 'review' | 'result'

interface ImportWizardProps {
  campaigns: Pick<Campaign, 'id' | 'name'>[]
  onComplete?: () => void
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

const STEPS: Step[] = ['upload', 'review', 'result']
const STEP_LABELS: Record<Step, string> = { upload: 'Upload & Map', review: 'Review', result: 'Done' }

export function ImportWizard({ campaigns, onComplete }: ImportWizardProps) {
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
  const [result, setResult]       = useState<ImportResult | null>(null)
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState<string | null>(null)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (file.size > 10 * 1024 * 1024) {
      setError('File exceeds 10 MB limit.')
      return
    }

    setFileName(file.name)
    setError(null)
    setPreview(null)
    setDuplicates([])
    setResult(null)

    Papa.parse<RawRow>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (res) => {
        const hdrs = res.meta.fields ?? []
        setHeaders(hdrs)
        setRawRows(res.data)
        setMappings(hdrs.map((h) => ({ csvHeader: h, contactField: guessField(h) })))
      },
      error: () => {
        setError('Could not parse CSV. Check the file format and try again.')
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

  const handleComplete = () => {
    if (onComplete) {
      onComplete()
    } else {
      router.push(`/contacts?campaignId=${campaignId}`)
    }
  }

  const currentStepIndex = STEPS.indexOf(step)

  return (
    <div className="glass-panel rounded-3xl overflow-hidden">
      {/* Step indicator */}
      <div className="flex items-center gap-2 px-6 py-4 border-b border-white/5">
        {STEPS.map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-mono font-semibold ${
              step === s
                ? 'bg-accent/20 text-[#00d4ff]'
                : currentStepIndex > i
                  ? 'bg-emerald-500/20 text-emerald-400'
                  : 'bg-white/5 text-gray-500'
            }`}>
              {i + 1}
            </div>
            <span className={`text-xs font-medium ${step === s ? 'text-white' : 'text-gray-500'}`}>
              {STEP_LABELS[s]}
            </span>
            {i < STEPS.length - 1 && <span className="text-gray-600 text-xs mx-1">→</span>}
          </div>
        ))}
      </div>

      <div className="p-6">
        {/* Step 1: Upload & Map */}
        {step === 'upload' && (
          <div className="space-y-6">
            <div className="space-y-1.5">
              <Label className="text-xs text-gray-400">Campaign *</Label>
              <Select value={campaignId} onValueChange={(v) => setCampaignId(v ?? '')}>
                <SelectTrigger className="bg-white/5 border-white/10 text-white rounded-xl">
                  <SelectValue placeholder="Select a campaign…" />
                </SelectTrigger>
                <SelectContent
                  className="rounded-xl border-white/10 bg-card-solid"
                  alignItemWithTrigger={false}
                >
                  {campaigns.length === 0 ? (
                    <div className="px-2 py-1.5 text-sm text-gray-500 select-none">No campaigns found</div>
                  ) : (
                    campaigns.map((c) => (
                      <SelectItem key={c.id} value={c.id}
                        className="text-gray-300 focus:bg-white/5 focus:text-white rounded-lg">
                        {c.name}
                      </SelectItem>
                    ))
                  )}
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
              <div className="w-px h-10 bg-white/10" />
              <div className="text-center">
                <p className="font-mono text-2xl font-semibold text-gray-500">{preview.invalidRowCount}</p>
                <p className="text-xs text-gray-500 mt-0.5">invalid</p>
              </div>
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
              onClick={handleComplete}
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

- [ ] **Step 2: Run type check**

```bash
npx tsc --noEmit
```

Expected: no errors in ImportWizard.tsx.

- [ ] **Step 3: Commit**

```bash
git add src/components/imports/ImportWizard.tsx
git commit -m "ImportWizard: add onComplete prop, fix dropdown positioning, add empty state"
```

---

## Task 3: Create CampaignModal

**Files:**
- Create: `src/components/campaigns/CampaignModal.tsx`
- Delete: `src/components/campaigns/CampaignDrawer.tsx`

- [ ] **Step 1: Create CampaignModal.tsx**

Create `src/components/campaigns/CampaignModal.tsx`:

```tsx
'use client'

import { useEffect } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { FormModal } from '@/components/shared/FormModal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { SDRSelector } from './SDRSelector'
import { createCampaign, updateCampaign } from '@/app/(dashboard)/campaigns/actions'
import { CampaignSchema } from '@/app/(dashboard)/campaigns/schemas'
import type { CampaignFormData } from '@/app/(dashboard)/campaigns/schemas'
import type { CampaignWithDetails, UserSummary } from '@/types/models'
import type { Client } from '@prisma/client'

interface CampaignModalProps {
  open: boolean
  onClose: () => void
  campaign: CampaignWithDetails | null
  clients: Pick<Client, 'id' | 'name'>[]
  sdrs: UserSummary[]
}

const inputClass =
  'bg-white/5 border-white/10 text-white placeholder:text-gray-600 focus:border-[#00d4ff]/50 rounded-xl'

const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  active: 'Active',
  paused: 'Paused',
  completed: 'Completed',
}

export function CampaignModal({ open, onClose, campaign, clients, sdrs }: CampaignModalProps) {
  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors, isSubmitting },
  } = useForm<CampaignFormData>({ resolver: zodResolver(CampaignSchema) as never })

  useEffect(() => {
    if (campaign) {
      reset({
        name: campaign.name,
        clientId: campaign.clientId,
        status: campaign.status,
        dailyTargetCalls: campaign.dailyTargetCalls ?? undefined,
        sdrIds: campaign.sdrs.map((s) => s.userId),
      })
    } else {
      reset({ name: '', clientId: '', status: 'draft', dailyTargetCalls: undefined, sdrIds: [] })
    }
  }, [campaign, reset, open])

  const onSubmit = async (data: CampaignFormData) => {
    if (campaign) {
      await updateCampaign(campaign.id, data)
    } else {
      await createCampaign(data)
    }
    onClose()
  }

  return (
    <FormModal open={open} onClose={onClose} title={campaign ? 'Edit Campaign' : 'New Campaign'}>
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col">
        <div className="overflow-y-auto max-h-[70vh] p-6 space-y-5 custom-scrollbar">
          <div className="space-y-1.5">
            <Label className="text-xs text-gray-400">Campaign Name *</Label>
            <Input {...register('name')} placeholder="Q1 Outreach" className={inputClass} />
            {errors.name && <p className="text-xs text-red-400">{errors.name.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-gray-400">Client *</Label>
            <Controller
              name="clientId"
              control={control}
              render={({ field }) => (
                <Select onValueChange={field.onChange} value={field.value}>
                  <SelectTrigger className={inputClass}>
                    <SelectValue placeholder="Select a client…" />
                  </SelectTrigger>
                  <SelectContent
                    className="rounded-xl border-white/10 bg-card-solid"
                    alignItemWithTrigger={false}
                  >
                    {clients.length === 0 ? (
                      <div className="px-2 py-1.5 text-sm text-gray-500 select-none">No clients found</div>
                    ) : (
                      clients.map((c) => (
                        <SelectItem key={c.id} value={c.id} className="text-gray-300 focus:bg-white/5 focus:text-white rounded-lg">
                          {c.name}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              )}
            />
            {errors.clientId && <p className="text-xs text-red-400">{errors.clientId.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-gray-400">Status</Label>
            <Controller
              name="status"
              control={control}
              render={({ field }) => (
                <Select onValueChange={field.onChange} value={field.value}>
                  <SelectTrigger className={inputClass}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent
                    className="rounded-xl border-white/10 bg-card-solid"
                    alignItemWithTrigger={false}
                  >
                    {Object.entries(STATUS_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value} className="text-gray-300 focus:bg-white/5 focus:text-white rounded-lg">
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-gray-400">Daily Target Calls</Label>
            <Input
              {...register('dailyTargetCalls', { valueAsNumber: true })}
              type="number"
              min={1}
              placeholder="e.g. 50"
              className={inputClass}
            />
          </div>

          <div className="space-y-2">
            <Label className="text-xs text-gray-400">Assign SDRs</Label>
            <Controller
              name="sdrIds"
              control={control}
              render={({ field }) => (
                <SDRSelector sdrs={sdrs} selectedIds={field.value ?? []} onChange={field.onChange} />
              )}
            />
          </div>
        </div>

        <div className="flex-shrink-0 border-t border-white/5 p-6 flex gap-3">
          <Button
            type="submit"
            disabled={isSubmitting}
            className="flex-1 bg-gradient-to-r from-[#00d4ff] to-cyan-600 text-black font-semibold rounded-xl hover:opacity-90"
          >
            {isSubmitting ? 'Saving…' : campaign ? 'Save Changes' : 'Create Campaign'}
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
    </FormModal>
  )
}
```

- [ ] **Step 2: Run type check**

```bash
npx tsc --noEmit
```

Expected: no errors in CampaignModal.tsx.

- [ ] **Step 3: Delete the old drawer file**

```bash
rm src/components/campaigns/CampaignDrawer.tsx
```

- [ ] **Step 4: Commit**

```bash
git add src/components/campaigns/CampaignModal.tsx
git rm src/components/campaigns/CampaignDrawer.tsx
git commit -m "Add CampaignModal: centered modal with dropdown fix and client empty state"
```

---

## Task 4: Update CampaignsTable to use CampaignModal

**Files:**
- Modify: `src/components/campaigns/CampaignsTable.tsx`

- [ ] **Step 1: Update import and component usage in CampaignsTable.tsx**

In `src/components/campaigns/CampaignsTable.tsx`, make these changes:

Replace line 14:
```tsx
import { CampaignDrawer } from './CampaignDrawer'
```
With:
```tsx
import { CampaignModal } from './CampaignModal'
```

Replace lines 144–151 (the `<CampaignDrawer ... />` render at the bottom):
```tsx
      <CampaignDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        campaign={selected}
        clients={clients}
        sdrs={sdrs}
      />
```
With:
```tsx
      <CampaignModal
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        campaign={selected}
        clients={clients}
        sdrs={sdrs}
      />
```

- [ ] **Step 2: Run type check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/campaigns/CampaignsTable.tsx
git commit -m "CampaignsTable: switch from CampaignDrawer to CampaignModal"
```

---

## Task 5: Create ContactModal

**Files:**
- Create: `src/components/contacts/ContactModal.tsx`
- Delete: `src/components/contacts/ContactDrawer.tsx`

- [ ] **Step 1: Create ContactModal.tsx**

Create `src/components/contacts/ContactModal.tsx`:

```tsx
'use client'

import { useEffect } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { FormModal } from '@/components/shared/FormModal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { createContact, updateContact } from '@/app/(dashboard)/contacts/actions'
import { ContactSchema } from '@/app/(dashboard)/contacts/schemas'
import type { ContactFormData } from '@/app/(dashboard)/contacts/schemas'
import type { ContactWithCampaign } from '@/types/models'
import type { Campaign } from '@prisma/client'

interface ContactModalProps {
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

export function ContactModal({ open, onClose, contact, campaigns, defaultCampaignId }: ContactModalProps) {
  const {
    register,
    handleSubmit,
    reset,
    control,
    watch,
    setError,
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
    try {
      if (contact) {
        await updateContact(contact.id, data)
      } else {
        await createContact(data)
      }
      onClose()
    } catch {
      setError('root', { message: 'Something went wrong. Please try again.' })
    }
  }

  return (
    <FormModal open={open} onClose={onClose} title={contact ? 'Edit Contact' : 'New Contact'} width="lg">
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col">
        <div className="overflow-y-auto max-h-[70vh] p-6 space-y-6 custom-scrollbar">

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
                  <SelectContent
                    className="rounded-xl border-white/10 bg-card-solid"
                    alignItemWithTrigger={false}
                  >
                    {campaigns.length === 0 ? (
                      <div className="px-2 py-1.5 text-sm text-gray-500 select-none">No campaigns found</div>
                    ) : (
                      campaigns.map((c) => (
                        <SelectItem key={c.id} value={c.id}
                          className="text-gray-300 focus:bg-white/5 focus:text-white rounded-lg">
                          {c.name}
                        </SelectItem>
                      ))
                    )}
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
                      <SelectContent
                        className="rounded-xl border-white/10 bg-card-solid"
                        alignItemWithTrigger={false}
                      >
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

        {errors.root && (
          <p className="px-6 pb-2 text-sm text-red-400">{errors.root.message}</p>
        )}
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
    </FormModal>
  )
}
```

- [ ] **Step 2: Run type check**

```bash
npx tsc --noEmit
```

Expected: no errors in ContactModal.tsx.

- [ ] **Step 3: Delete the old drawer file**

```bash
rm src/components/contacts/ContactDrawer.tsx
```

- [ ] **Step 4: Commit**

```bash
git add src/components/contacts/ContactModal.tsx
git rm src/components/contacts/ContactDrawer.tsx
git commit -m "Add ContactModal: centered modal with dropdown fix and campaign empty state"
```

---

## Task 6: Update ContactsTable — use ContactModal, add Import button and modal

**Files:**
- Modify: `src/components/contacts/ContactsTable.tsx`

- [ ] **Step 1: Replace ContactsTable.tsx**

Replace the full file content of `src/components/contacts/ContactsTable.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, MoreHorizontal, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ContactModal } from './ContactModal'
import { FormModal } from '@/components/shared/FormModal'
import { ImportWizard } from '@/components/imports/ImportWizard'
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
  const router = useRouter()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [selected, setSelected] = useState<ContactWithCampaign | null>(null)
  const [importOpen, setImportOpen] = useState(false)

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
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setImportOpen(true)}
            className="border-white/10 text-gray-400 hover:text-white hover:border-white/20 rounded-xl"
          >
            <Upload className="w-4 h-4 mr-1.5" />
            Import
          </Button>
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

      <ContactModal
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        contact={selected}
        campaigns={campaigns}
        defaultCampaignId={defaultCampaignId}
      />

      <FormModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        title="Import Contacts"
        width="lg"
      >
        <div className="overflow-y-auto max-h-[75vh] custom-scrollbar p-6">
          <ImportWizard
            campaigns={campaigns}
            onComplete={() => { setImportOpen(false); router.refresh() }}
          />
        </div>
      </FormModal>
    </div>
  )
}
```

- [ ] **Step 2: Run type check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/contacts/ContactsTable.tsx
git commit -m "ContactsTable: use ContactModal, add Import button with import wizard modal"
```

---

## Task 7: Remove imports from sidebar and redirect imports page

**Files:**
- Modify: `src/components/layout/Sidebar.tsx`
- Modify: `src/app/(dashboard)/imports/page.tsx`

- [ ] **Step 1: Remove /imports nav entry from Sidebar.tsx**

In `src/components/layout/Sidebar.tsx`, remove the imports nav item and the `Upload` icon import.

Replace the NAV_ITEMS array (lines 12–22):
```tsx
const NAV_ITEMS = [
  { href: '/',          label: 'Dashboard', icon: LayoutDashboard },
  { href: '/campaigns', label: 'Campaigns', icon: Target },
  { href: '/contacts',  label: 'Contacts',  icon: Users },
  { href: '/calling',   label: 'Calling',   icon: PhoneCall },
  { href: '/pipeline',  label: 'Pipeline',  icon: Kanban },
  { href: '/scripts',   label: 'Scripts',   icon: ScrollText },
  { href: '/schedule',  label: 'Schedule',  icon: CalendarCheck2 },
  { href: '/reports',   label: 'Reports',   icon: BarChart3 },
]
```

Replace the icon import line (line 4) to remove `Upload`:
```tsx
import {
  LayoutDashboard, Target, Users, PhoneCall, Kanban,
  ScrollText, CalendarCheck2, BarChart3, Settings, ChevronLeft,
} from 'lucide-react'
```

- [ ] **Step 2: Replace imports page with a redirect**

Replace the full content of `src/app/(dashboard)/imports/page.tsx`:

```tsx
import { redirect } from 'next/navigation'

export default function ImportsPage() {
  redirect('/contacts')
}
```

- [ ] **Step 3: Run type check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Run all tests**

```bash
npx vitest run
```

Expected: all tests pass including the FormModal tests from Task 1.

- [ ] **Step 5: Commit**

```bash
git add src/components/layout/Sidebar.tsx src/app/(dashboard)/imports/page.tsx
git commit -m "Remove imports from sidebar nav, redirect /imports to /contacts"
```

---

## Self-Review

**Spec coverage:**
- ✅ Form modals: `FormModal` created; `CampaignModal` and `ContactModal` use it (Tasks 1, 3, 4, 5)
- ✅ Dropdown overlap: `alignItemWithTrigger={false}` applied in CampaignModal, ContactModal, ImportWizard (Tasks 2, 3, 5)
- ✅ Empty states: "No clients found" / "No campaigns found" in all three select locations (Tasks 2, 3, 5)
- ✅ Import in contacts header: Import button + FormModal wrapping ImportWizard in ContactsTable (Task 6)
- ✅ `onComplete` prop on ImportWizard for in-context completion (Task 2)
- ✅ Sidebar entry removed (Task 7)
- ✅ `/imports` redirects to `/contacts` (Task 7)
- ✅ `SlideDrawer` preserved (not touched)

**Placeholder scan:** No TBDs or incomplete steps.

**Type consistency:**
- `FormModalProps.onClose: () => void` — used consistently in Tasks 3, 5, 6
- `ImportWizardProps.onComplete?: () => void` — defined in Task 2, consumed in Task 6
- `CampaignModalProps` mirrors old `CampaignDrawerProps` exactly — Task 4 call site matches
- `ContactModalProps` mirrors old `ContactDrawerProps` exactly — Task 6 call site matches
