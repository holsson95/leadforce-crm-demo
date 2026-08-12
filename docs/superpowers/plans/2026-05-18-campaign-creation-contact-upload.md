# Campaign Creation — Inline Contact Upload Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the campaign creation modal into a 4-step wizard that optionally lets users upload a CSV of contacts immediately after the campaign is saved.

**Architecture:** The existing `CampaignModal` gains wizard state (`step`, `campaignId`, `importPreview`, `importResult`) and orchestrates four sequential step components. Step 1 is the existing form (with a relabelled button for new campaigns). Steps 2–4 are new components colocated in `src/components/campaigns/`. All server actions (`createCampaign`, `parseImportPreview`, `importContacts`) are called from `CampaignModal`; step components are pure UI. Editing an existing campaign is unchanged.

**Tech Stack:** Next.js 14 App Router, React, TypeScript, react-hook-form, Zod, PapaParse, Prisma, Vitest, @testing-library/react

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `src/lib/csv/guess-field.ts` | Exported `guessField` pure function |
| Create | `src/lib/csv/__tests__/guess-field.test.ts` | Unit tests for guessField |
| Create | `src/components/campaigns/WizardStepIndicator.tsx` | Step dots + labels UI |
| Create | `src/components/campaigns/CampaignWizardStep2.tsx` | Upload & Map step |
| Create | `src/components/campaigns/CampaignWizardStep3.tsx` | DNC review step |
| Create | `src/components/campaigns/CampaignWizardStep4.tsx` | Done / result screen |
| Modify | `src/app/(dashboard)/campaigns/actions.ts` | `createCampaign` returns `{ id: string }` |
| Modify | `src/components/campaigns/CampaignModal.tsx` | 4-step wizard orchestration |
| Modify | `src/components/imports/ImportWizard.tsx` | Import `guessField` from shared lib |

---

## Task 1: Extract `guessField` to a shared utility

`guessField` is currently a private function in `ImportWizard.tsx`. It will also be needed by `CampaignWizardStep2`. Extract it to `src/lib/csv/guess-field.ts`.

**Files:**
- Create: `src/lib/csv/guess-field.ts`
- Create: `src/lib/csv/__tests__/guess-field.test.ts`
- Modify: `src/components/imports/ImportWizard.tsx`

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/csv/__tests__/guess-field.test.ts
import { describe, it, expect } from 'vitest'
import { guessField } from '../guess-field'

describe('guessField', () => {
  it('maps common email headers', () => {
    expect(guessField('Email')).toBe('email')
    expect(guessField('Work Email')).toBe('email')
    expect(guessField('EMAIL_ADDRESS')).toBe('email')
  })

  it('maps mobile phone headers', () => {
    expect(guessField('Mobile')).toBe('mobilePhone')
    expect(guessField('Cell Phone')).toBe('mobilePhone')
    expect(guessField('Phone')).toBe('mobilePhone')
    expect(guessField('Tel')).toBe('mobilePhone')
  })

  it('maps corporate phone headers before generic phone', () => {
    expect(guessField('Corporate Phone')).toBe('corporatePhone')
    expect(guessField('Direct Line')).toBe('corporatePhone')
    expect(guessField('Office Number')).toBe('corporatePhone')
  })

  it('maps name headers', () => {
    expect(guessField('First Name')).toBe('firstName')
    expect(guessField('first')).toBe('firstName')
    expect(guessField('Last Name')).toBe('lastName')
    expect(guessField('last')).toBe('lastName')
  })

  it('maps company headers', () => {
    expect(guessField('Company')).toBe('companyName')
    expect(guessField('Organization')).toBe('companyName')
    expect(guessField('Org')).toBe('companyName')
  })

  it('maps company city before generic city', () => {
    expect(guessField('Company City')).toBe('companyCity')
    expect(guessField('City')).toBe('city')
  })

  it('returns null for unmapped headers', () => {
    expect(guessField('Notes')).toBeNull()
    expect(guessField('Custom Field')).toBeNull()
    expect(guessField('Revenue')).toBeNull()
  })
})
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
npx vitest run src/lib/csv/__tests__/guess-field.test.ts
```

Expected: FAIL — `Cannot find module '../guess-field'`

- [ ] **Step 3: Create the `guess-field.ts` module**

```typescript
// src/lib/csv/guess-field.ts
import type { ContactField } from './types'

export function guessField(header: string): ContactField | null {
  const h = header.toLowerCase().replace(/[^a-z]/g, '')
  if (h.includes('firstname') || h === 'first')                                                        return 'firstName'
  if (h.includes('lastname')  || h === 'last')                                                         return 'lastName'
  if (h.includes('email'))                                                                              return 'email'
  if (h.includes('corporate') || h.includes('direct') || h.includes('office'))                        return 'corporatePhone'
  if (h.includes('mobile') || h.includes('cell'))                                                      return 'mobilePhone'
  if (h.includes('phone') || h.includes('tel'))                                                        return 'mobilePhone'
  if (h.includes('employees') || h.includes('headcount') || h.includes('empcount') || h.includes('numemployees')) return 'employeeCount'
  if (h.includes('industry') || h.includes('sector') || h.includes('vertical'))                       return 'industry'
  if (h.includes('companycity') || h.includes('officecity'))                                           return 'companyCity'
  if (h.includes('companyaddress') || h.includes('officeaddress') || h.includes('hqaddress'))          return 'companyAddress'
  if (h.includes('company') || h.includes('organization') || h.includes('org'))                       return 'companyName'
  if (h.includes('title') || h.includes('jobtitle') || h.includes('position') || h.includes('role'))  return 'jobTitle'
  if (h.includes('address') || h.includes('street'))                                                   return 'address'
  if (h.includes('city'))                                                                               return 'city'
  if (h.includes('state') || h.includes('province') || h.includes('region'))                          return 'state'
  if (h.includes('zip') || h.includes('postal'))                                                       return 'zip'
  if (h.includes('country') || h.includes('nation'))                                                   return 'country'
  if (h.includes('linkedin'))                                                                           return 'linkedinUrl'
  if (h.includes('website') || h.includes('domain') || h.includes('url'))                             return 'website'
  return null
}
```

- [ ] **Step 4: Run the test to confirm it passes**

```bash
npx vitest run src/lib/csv/__tests__/guess-field.test.ts
```

Expected: all tests PASS

- [ ] **Step 5: Update `ImportWizard.tsx` to use the shared function**

Replace the inline `guessField` function definition in `src/components/imports/ImportWizard.tsx`:

Remove lines 27–49 (the `function guessField` definition) and add this import at the top:

```typescript
import { guessField } from '@/lib/csv/guess-field'
```

- [ ] **Step 6: Run all tests to confirm nothing broke**

```bash
npx vitest run
```

Expected: all tests PASS

- [ ] **Step 7: Commit**

```bash
git add src/lib/csv/guess-field.ts src/lib/csv/__tests__/guess-field.test.ts src/components/imports/ImportWizard.tsx
git commit -m "Extract guessField to shared lib and add unit tests"
```

---

## Task 2: Update `createCampaign` to return the new campaign ID

The wizard needs the campaign ID after step 1 so it can pass it to the import functions in later steps.

**Files:**
- Modify: `src/app/(dashboard)/campaigns/actions.ts`

- [ ] **Step 1: Update `createCampaign` to return `{ id: string }`**

Replace the `createCampaign` function in `src/app/(dashboard)/campaigns/actions.ts` with:

```typescript
export async function createCampaign(data: CampaignFormData): Promise<{ id: string }> {
  await requirePermission('campaigns:write')
  const tenantId = await getCurrentTenantId()
  if (!tenantId) throw new Error('No tenant context')

  const parsed = CampaignSchema.parse(data)

  const campaign = await withTenant(tenantId, async () => {
    const c = await db.campaign.create({
      data: {
        tenantId,
        name: parsed.name,
        clientId: parsed.clientId,
        status: parsed.status,
        dailyTargetCalls: parsed.dailyTargetCalls ?? null,
      },
    })

    if (parsed.sdrIds.length > 0) {
      await db.campaignSDR.createMany({
        data: parsed.sdrIds.map((userId) => ({ campaignId: c.id, userId })),
        skipDuplicates: true,
      })
    }

    return c
  })

  revalidatePath('/campaigns')
  return { id: campaign.id }
}
```

- [ ] **Step 2: Run all tests to confirm nothing broke**

```bash
npx vitest run
```

Expected: all tests PASS

- [ ] **Step 3: Commit**

```bash
git add src/app/\(dashboard\)/campaigns/actions.ts
git commit -m "Return new campaign ID from createCampaign action"
```

---

## Task 3: Create `WizardStepIndicator` component

A row of numbered dots with labels showing Campaign → Upload → DNC → Done. Done steps show a checkmark in emerald; the active step is cyan; pending steps are gray.

**Files:**
- Create: `src/components/campaigns/WizardStepIndicator.tsx`

- [ ] **Step 1: Create the component**

```typescript
// src/components/campaigns/WizardStepIndicator.tsx
import { cn } from '@/lib/utils'

export type WizardStep = 'campaign' | 'upload' | 'dnc' | 'done'

const STEPS: { key: WizardStep; label: string }[] = [
  { key: 'campaign', label: 'Campaign' },
  { key: 'upload',   label: 'Upload' },
  { key: 'dnc',      label: 'DNC' },
  { key: 'done',     label: 'Done' },
]

const ORDER: WizardStep[] = ['campaign', 'upload', 'dnc', 'done']

interface WizardStepIndicatorProps {
  current: WizardStep
}

export function WizardStepIndicator({ current }: WizardStepIndicatorProps) {
  const currentIndex = ORDER.indexOf(current)

  return (
    <div className="flex items-center gap-1.5">
      {STEPS.map(({ key, label }, i) => {
        const isDone   = i < currentIndex
        const isActive = i === currentIndex

        return (
          <div key={key} className="flex items-center gap-1.5">
            <div className={cn(
              'w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-semibold',
              isDone   ? 'bg-emerald-500/20 text-emerald-400' :
              isActive ? 'bg-accent/20 text-[#00d4ff]' :
                         'bg-white/5 text-gray-500'
            )}>
              {isDone ? '✓' : i + 1}
            </div>
            <span className={cn(
              'text-xs',
              isDone   ? 'text-emerald-400' :
              isActive ? 'text-[#00d4ff]' :
                         'text-gray-500'
            )}>
              {label}
            </span>
            {i < STEPS.length - 1 && (
              <span className="text-gray-600 text-xs mx-0.5">→</span>
            )}
          </div>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/campaigns/WizardStepIndicator.tsx
git commit -m "Add WizardStepIndicator component"
```

---

## Task 4: Create `CampaignWizardStep2` (Upload & Map)

This component handles file selection, CSV parsing (client-side via PapaParse), and column mapping. It also calls `parseImportPreview` against the server. When the preview is ready it calls `onPreviewReady(preview)` and lets `CampaignModal` decide the next step. `onSkip` closes the modal (the campaign is already saved).

**Files:**
- Create: `src/components/campaigns/CampaignWizardStep2.tsx`

- [ ] **Step 1: Create the component**

```typescript
// src/components/campaigns/CampaignWizardStep2.tsx
'use client'

import { useState, useRef } from 'react'
import { Upload, ArrowRight } from 'lucide-react'
import Papa from 'papaparse'
import { Button } from '@/components/ui/button'
import { ColumnMapper } from '@/components/imports/ColumnMapper'
import { guessField } from '@/lib/csv/guess-field'
import { parseImportPreview } from '@/app/(dashboard)/imports/actions'
import type { ColumnMapping, RawRow, ImportPreviewResult } from '@/lib/csv/types'

interface CampaignWizardStep2Props {
  campaignId: string
  onPreviewReady: (preview: ImportPreviewResult) => Promise<void>
  onSkip: () => void
}

export function CampaignWizardStep2({ campaignId, onPreviewReady, onSkip }: CampaignWizardStep2Props) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [fileName, setFileName] = useState('')
  const [rawRows, setRawRows]   = useState<RawRow[]>([])
  const [headers, setHeaders]   = useState<string[]>([])
  const [mappings, setMappings] = useState<ColumnMapping[]>([])
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState<string | null>(null)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 10 * 1024 * 1024) { setError('File exceeds 10 MB limit.'); return }
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
      error: () => setError('Could not parse CSV. Check the file format and try again.'),
    })
  }

  const handlePreview = async () => {
    if (!rawRows.length) { setError('Please upload a CSV file'); return }
    const emailMapped = mappings.some((m) => m.contactField === 'email')
    const phoneMapped = mappings.some(
      (m) => m.contactField === 'mobilePhone' || m.contactField === 'corporatePhone'
    )
    if (!emailMapped && !phoneMapped) {
      setError('Map at least one of: Email, Mobile Phone, or Corporate Phone')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const preview = await parseImportPreview(rawRows, mappings, campaignId)
      await onPreviewReady(preview)  // stays loading during the no-DNC import path
    } catch {
      setError('Failed to process file. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <div className="overflow-y-auto max-h-[60vh] p-6 space-y-5 custom-scrollbar">
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
      </div>

      <div className="flex-shrink-0 border-t border-white/5 p-6 flex gap-3">
        <Button
          type="button"
          onClick={handlePreview}
          disabled={loading || !rawRows.length}
          className="flex-1 bg-gradient-to-r from-[#00d4ff] to-cyan-600 text-black font-semibold rounded-xl hover:opacity-90"
        >
          {loading ? 'Processing…' : 'Preview Import'}
          {!loading && <ArrowRight className="w-4 h-4 ml-2" />}
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={onSkip}
          className="text-gray-500 hover:text-gray-300 rounded-xl px-4"
        >
          Skip for now
        </Button>
      </div>
    </>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/campaigns/CampaignWizardStep2.tsx
git commit -m "Add CampaignWizardStep2: upload and column mapping"
```

---

## Task 5: Create `CampaignWizardStep3` (DNC Review)

Shows all DNC-flagged contacts as a toggleable list. Default state: all excluded. User can flip individual contacts to included. The import button label updates live. Calls `onImport(includedRows)` which `CampaignModal` handles asynchronously — the component tracks its own `importing` state.

> **Note:** The spec described a "DNC reason tag" per row (e.g. "Disqualified", "Opt-out"). This is not implemented here — `parseImportPreview` returns `MappedRow[]` (incoming data only), not the existing contact record or its DNC reason. Showing reasons would require a separate DB query. Omitted for now: name + company is sufficient to identify the contact.

**Files:**
- Create: `src/components/campaigns/CampaignWizardStep3.tsx`

- [ ] **Step 1: Write a failing test for the toggle count logic**

```typescript
// src/components/campaigns/__tests__/CampaignWizardStep3.test.tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { CampaignWizardStep3 } from '../CampaignWizardStep3'
import type { MappedRow } from '@/lib/csv/types'

function makeRow(overrides: Partial<MappedRow> & { dedupeHash: string }): MappedRow {
  return {
    firstName: 'John', lastName: 'Doe', email: null, mobilePhone: null,
    corporatePhone: null, companyName: null, jobTitle: null, industry: null,
    employeeCount: null, address: null, city: null, state: null, zip: null,
    country: null, companyAddress: null, companyCity: null,
    website: null, linkedinUrl: null,
    ...overrides,
  }
}

const clean: MappedRow[] = [makeRow({ dedupeHash: 'c1' }), makeRow({ dedupeHash: 'c2' })]
const dnc: MappedRow[]   = [
  makeRow({ dedupeHash: 'd1', firstName: 'Alice', companyName: 'Acme' }),
  makeRow({ dedupeHash: 'd2', firstName: 'Bob',   companyName: 'Corp' }),
]

describe('CampaignWizardStep3', () => {
  it('shows all DNC contacts with excluded state by default', () => {
    render(<CampaignWizardStep3 cleanRows={clean} dncRows={dnc} onImport={vi.fn()} />)
    expect(screen.getByText('Alice')).toBeInTheDocument()
    expect(screen.getByText('Bob')).toBeInTheDocument()
    expect(screen.getByText(/Import 2 Contacts/)).toBeInTheDocument()
  })

  it('includes a toggled contact in the import count', () => {
    render(<CampaignWizardStep3 cleanRows={clean} dncRows={dnc} onImport={vi.fn()} />)
    fireEvent.click(screen.getByText('Alice').closest('button')!)
    expect(screen.getByText(/Import 3 Contacts/)).toBeInTheDocument()
  })

  it('calls onImport with only the included DNC rows', async () => {
    const onImport = vi.fn().mockResolvedValue(undefined)
    render(<CampaignWizardStep3 cleanRows={clean} dncRows={dnc} onImport={onImport} />)
    fireEvent.click(screen.getByText('Alice').closest('button')!)
    fireEvent.click(screen.getByRole('button', { name: /Import/ }))
    expect(onImport).toHaveBeenCalledWith([dnc[0]])
  })

  it('"Exclude all DNC" calls onImport with empty array', async () => {
    const onImport = vi.fn().mockResolvedValue(undefined)
    render(<CampaignWizardStep3 cleanRows={clean} dncRows={dnc} onImport={onImport} />)
    fireEvent.click(screen.getByText('Alice').closest('button')!)
    fireEvent.click(screen.getByRole('button', { name: /Exclude all DNC/i }))
    expect(onImport).toHaveBeenCalledWith([])
  })
})
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
npx vitest run src/components/campaigns/__tests__/CampaignWizardStep3.test.tsx
```

Expected: FAIL — `Cannot find module '../CampaignWizardStep3'`

- [ ] **Step 3: Create the component**

```typescript
// src/components/campaigns/CampaignWizardStep3.tsx
'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import type { MappedRow } from '@/lib/csv/types'

interface CampaignWizardStep3Props {
  cleanRows: MappedRow[]
  dncRows: MappedRow[]
  onImport: (includedDncRows: MappedRow[]) => Promise<void>
}

export function CampaignWizardStep3({ cleanRows, dncRows, onImport }: CampaignWizardStep3Props) {
  const [includedHashes, setIncludedHashes] = useState<Set<string>>(new Set())
  const [importing, setImporting] = useState(false)

  const toggle = (hash: string) => {
    setIncludedHashes((prev) => {
      const next = new Set(prev)
      if (next.has(hash)) next.delete(hash); else next.add(hash)
      return next
    })
  }

  const includedDncRows = dncRows.filter((r) => includedHashes.has(r.dedupeHash))
  const totalToImport = cleanRows.length + includedDncRows.length

  const handleImport = async (rows: MappedRow[]) => {
    setImporting(true)
    await onImport(rows)
  }

  return (
    <>
      <div className="overflow-y-auto max-h-[50vh] p-6 space-y-4 custom-scrollbar">
        <div className="flex items-start gap-3 p-3 bg-red-500/5 border border-red-500/15 rounded-xl">
          <span className="text-red-400 mt-0.5">⚠</span>
          <div>
            <p className="text-sm font-medium text-red-300">
              {dncRows.length} DNC contact{dncRows.length !== 1 ? 's' : ''} found
            </p>
            <p className="text-xs text-gray-500 mt-0.5">Toggle to include or exclude each one</p>
          </div>
        </div>

        <div className="space-y-2">
          {dncRows.map((row) => {
            const included = includedHashes.has(row.dedupeHash)
            const name = [row.firstName, row.lastName].filter(Boolean).join(' ') || '—'
            return (
              <button
                key={row.dedupeHash}
                type="button"
                onClick={() => toggle(row.dedupeHash)}
                className={cn(
                  'w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-colors',
                  included
                    ? 'bg-accent/5 border-[#00d4ff]/20'
                    : 'bg-white/[0.02] border-white/5 hover:bg-white/[0.04]'
                )}
              >
                <div className={cn(
                  'w-4 h-4 rounded-full border-2 flex-shrink-0 transition-colors',
                  included ? 'border-[#00d4ff] bg-[#00d4ff]' : 'border-white/20'
                )} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white truncate">{name}</p>
                  {row.companyName && (
                    <p className="text-xs text-gray-500 truncate">{row.companyName}</p>
                  )}
                </div>
              </button>
            )
          })}
        </div>

        <p className="text-xs text-center text-gray-500">
          {cleanRows.length} clean + {includedDncRows.length} included → {totalToImport} total to import
        </p>
      </div>

      <div className="flex-shrink-0 border-t border-white/5 p-6 flex gap-3">
        <Button
          type="button"
          onClick={() => handleImport(includedDncRows)}
          disabled={importing}
          className="flex-1 bg-gradient-to-r from-[#00d4ff] to-cyan-600 text-black font-semibold rounded-xl hover:opacity-90"
        >
          {importing ? 'Importing…' : `Import ${totalToImport} Contact${totalToImport !== 1 ? 's' : ''}`}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => handleImport([])}
          disabled={importing}
          className="bg-white/5 border-white/10 text-gray-300 hover:bg-white/10 rounded-xl"
        >
          Exclude all DNC
        </Button>
      </div>
    </>
  )
}
```

- [ ] **Step 4: Run the test to confirm it passes**

```bash
npx vitest run src/components/campaigns/__tests__/CampaignWizardStep3.test.tsx
```

Expected: all tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/campaigns/CampaignWizardStep3.tsx src/components/campaigns/__tests__/CampaignWizardStep3.test.tsx
git commit -m "Add CampaignWizardStep3: DNC review with toggles"
```

---

## Task 6: Create `CampaignWizardStep4` (Done screen)

Shows the campaign name and import result counts. "Go to Contacts" navigates to `/contacts?campaignId=<id>`. "Close" calls `onClose`.

**Files:**
- Create: `src/components/campaigns/CampaignWizardStep4.tsx`

- [ ] **Step 1: Create the component**

```typescript
// src/components/campaigns/CampaignWizardStep4.tsx
'use client'

import { CheckCircle } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'

interface CampaignWizardStep4Props {
  campaignId: string
  campaignName: string
  result: { created: number; dncBlocked: number; skipped: number }
  onClose: () => void
}

export function CampaignWizardStep4({ campaignId, campaignName, result, onClose }: CampaignWizardStep4Props) {
  const router = useRouter()

  const goToContacts = () => {
    onClose()
    router.push(`/contacts?campaignId=${campaignId}`)
  }

  return (
    <>
      <div className="flex flex-col items-center p-10 space-y-6">
        <CheckCircle className="w-14 h-14 text-emerald-400" />
        <div className="text-center">
          <h3 className="text-base font-semibold text-white mb-1">Campaign ready</h3>
          <p className="text-sm text-gray-500">{campaignName}</p>
        </div>
        <div className="w-full bg-white/[0.03] rounded-2xl divide-y divide-white/5">
          <div className="flex justify-between items-center px-5 py-3">
            <span className="text-sm text-gray-400">Contacts imported</span>
            <span className="font-mono font-semibold text-emerald-400">{result.created}</span>
          </div>
          <div className="flex justify-between items-center px-5 py-3">
            <span className="text-sm text-gray-400">DNC excluded</span>
            <span className="font-mono font-semibold text-red-400">{result.dncBlocked}</span>
          </div>
          <div className="flex justify-between items-center px-5 py-3">
            <span className="text-sm text-gray-400">Invalid rows skipped</span>
            <span className="font-mono font-semibold text-gray-500">{result.skipped}</span>
          </div>
        </div>
      </div>

      <div className="flex-shrink-0 border-t border-white/5 p-6 flex gap-3">
        <Button
          type="button"
          onClick={goToContacts}
          className="flex-1 bg-gradient-to-r from-[#00d4ff] to-cyan-600 text-black font-semibold rounded-xl hover:opacity-90"
        >
          Go to Contacts
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={onClose}
          className="bg-white/5 border-white/10 text-gray-300 hover:bg-white/10 rounded-xl"
        >
          Close
        </Button>
      </div>
    </>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/campaigns/CampaignWizardStep4.tsx
git commit -m "Add CampaignWizardStep4: import result screen"
```

---

## Task 7: Refactor `CampaignModal` into the 4-step wizard

Replace the single-step form with a wizard that shows `WizardStepIndicator` (new campaigns only) and routes through steps 1–4. The edit flow (`campaign` prop non-null) is unchanged.

**Files:**
- Modify: `src/components/campaigns/CampaignModal.tsx`

- [ ] **Step 1: Replace `CampaignModal.tsx` with the wizard version**

```typescript
// src/components/campaigns/CampaignModal.tsx
'use client'

import { useEffect, useState } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { FormModal } from '@/components/shared/FormModal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { SDRSelector } from './SDRSelector'
import { WizardStepIndicator } from './WizardStepIndicator'
import { CampaignWizardStep2 } from './CampaignWizardStep2'
import { CampaignWizardStep3 } from './CampaignWizardStep3'
import { CampaignWizardStep4 } from './CampaignWizardStep4'
import { createCampaign, updateCampaign } from '@/app/(dashboard)/campaigns/actions'
import { importContacts } from '@/app/(dashboard)/imports/actions'
import { CampaignSchema } from '@/app/(dashboard)/campaigns/schemas'
import type { CampaignFormData } from '@/app/(dashboard)/campaigns/schemas'
import type { CampaignWithDetails, UserSummary } from '@/types/models'
import type { Client } from '@prisma/client'
import type { ImportPreviewResult, MappedRow } from '@/lib/csv/types'
import type { WizardStep } from './WizardStepIndicator'

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
  const [step, setStep]               = useState<WizardStep>('campaign')
  const [campaignId, setCampaignId]   = useState<string | null>(null)
  const [campaignName, setCampaignName] = useState('')
  const [importPreview, setImportPreview] = useState<ImportPreviewResult | null>(null)
  const [importResult, setImportResult]   = useState<{ created: number; dncBlocked: number; skipped: number } | null>(null)

  const {
    register, handleSubmit, reset, control, setError,
    formState: { errors, isSubmitting },
  } = useForm<CampaignFormData>({ resolver: zodResolver(CampaignSchema) as never })

  useEffect(() => {
    if (open) {
      setStep('campaign')
      setCampaignId(null)
      setCampaignName('')
      setImportPreview(null)
      setImportResult(null)
    }
  }, [open])

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
    try {
      if (campaign) {
        await updateCampaign(campaign.id, data)
        onClose()
      } else {
        const { id } = await createCampaign(data)
        setCampaignId(id)
        setCampaignName(data.name)
        setStep('upload')
      }
    } catch {
      setError('root', { message: 'Something went wrong. Please try again.' })
    }
  }

  const handlePreviewReady = async (preview: ImportPreviewResult) => {
    if (preview.dnc.length === 0) {
      const res = await importContacts(preview.clean, [], campaignId!)
      setImportResult({ created: res.created, dncBlocked: 0, skipped: res.skipped })
      setStep('done')
    } else {
      setImportPreview(preview)
      setStep('dnc')
    }
  }

  const handleDncImport = async (includedDncRows: MappedRow[]) => {
    const allRows = [...importPreview!.clean, ...includedDncRows]
    const res = await importContacts(allRows, [], campaignId!)
    const dncBlocked = importPreview!.dnc.length - includedDncRows.length
    setImportResult({ created: res.created, dncBlocked, skipped: res.skipped })
    setStep('done')
  }

  const isNew = !campaign

  return (
    <FormModal open={open} onClose={onClose} title={campaign ? 'Edit Campaign' : 'New Campaign'}>
      {isNew && (
        <div className="flex-shrink-0 px-6 py-3 border-b border-white/5">
          <WizardStepIndicator current={step} />
        </div>
      )}

      {step === 'campaign' && (
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
                      <SelectValue>
                        {(v: string | null) => v ? (clients.find(c => c.id === v)?.name ?? v) : 'Select a client…'}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent className="rounded-xl border-white/10 bg-card-solid" alignItemWithTrigger={false}>
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
                      <SelectValue>
                        {(v: string | null) => v ? (STATUS_LABELS[v] ?? v) : ''}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent className="rounded-xl border-white/10 bg-card-solid" alignItemWithTrigger={false}>
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

          {errors.root && (
            <p className="px-6 pb-2 text-sm text-red-400">{errors.root.message}</p>
          )}
          <div className="flex-shrink-0 border-t border-white/5 p-6 flex gap-3">
            <Button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 bg-gradient-to-r from-[#00d4ff] to-cyan-600 text-black font-semibold rounded-xl hover:opacity-90"
            >
              {isSubmitting ? 'Saving…' : campaign ? 'Save Changes' : 'Create & Continue →'}
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
      )}

      {step === 'upload' && campaignId && (
        <CampaignWizardStep2
          campaignId={campaignId}
          onPreviewReady={handlePreviewReady}
          onSkip={onClose}
        />
      )}

      {step === 'dnc' && importPreview && (
        <CampaignWizardStep3
          cleanRows={importPreview.clean}
          dncRows={importPreview.dnc}
          onImport={handleDncImport}
        />
      )}

      {step === 'done' && importResult && campaignId && (
        <CampaignWizardStep4
          campaignId={campaignId}
          campaignName={campaignName}
          result={importResult}
          onClose={onClose}
        />
      )}
    </FormModal>
  )
}
```

- [ ] **Step 2: Run all tests**

```bash
npx vitest run
```

Expected: all tests PASS

- [ ] **Step 3: Start the dev server and verify the wizard manually**

```bash
npm run dev
```

Open `http://localhost:3000/campaigns` and:
1. Click "New Campaign" — confirm the step indicator appears showing Step 1 active
2. Fill in the form and click "Create & Continue →" — confirm step advances to Upload (Step 2)
3. Upload a CSV and click "Preview Import" — confirm it advances to DNC (Step 3) or Done (Step 4) depending on DNC hits
4. On Step 3, toggle some contacts and confirm the import count updates live
5. Complete the import and confirm the Done screen shows correct counts
6. Click "Go to Contacts" — confirm navigation to contacts page filtered by campaign
7. Open "Edit Campaign" on an existing campaign — confirm the single-step form still works unchanged, no step indicator shown

- [ ] **Step 4: Commit**

```bash
git add src/components/campaigns/CampaignModal.tsx
git commit -m "Refactor CampaignModal into 4-step wizard with optional contact upload"
```
