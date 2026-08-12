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
import { guessField } from '@/lib/csv/guess-field'
import type {
  ColumnMapping, RawRow, ImportPreviewResult, ImportResult, DuplicateRow,
} from '@/lib/csv/types'
import type { Campaign } from '@prisma/client'

type Step = 'upload' | 'review' | 'result'

interface ImportWizardProps {
  campaigns: Pick<Campaign, 'id' | 'name'>[]
  onComplete?: () => void
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
    const phoneMapped = mappings.some((m) => m.contactField === 'mobilePhone' || m.contactField === 'corporatePhone')
    if (!emailMapped && !phoneMapped) {
      setError('Map at least one of: Email, Mobile Phone, or Corporate Phone')
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
      <div className="flex items-center gap-2 px-6 py-4 border-b border-[var(--panel-border)]">
        {STEPS.map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-mono font-semibold ${
              step === s
                ? 'bg-[var(--accent-muted)] text-[var(--lf-accent)]'
                : currentStepIndex > i
                  ? 'bg-emerald-500/20 text-emerald-400'
                  : 'bg-[var(--panel-border)] text-[var(--text-muted)]'
            }`}>
              {i + 1}
            </div>
            <span className={`text-xs font-medium ${step === s ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)]'}`}>
              {STEP_LABELS[s]}
            </span>
            {i < STEPS.length - 1 && <span className="text-[var(--text-muted)] text-xs mx-1">→</span>}
          </div>
        ))}
      </div>

      <div className="p-6">
        {/* Step 1: Upload & Map */}
        {step === 'upload' && (
          <div className="space-y-6">
            <div className="space-y-1.5">
              <Label className="text-xs text-[var(--text-secondary)]">Campaign *</Label>
              <Select value={campaignId} onValueChange={(v) => setCampaignId(v ?? '')}>
                <SelectTrigger className="bg-[var(--panel-border)] border-[var(--panel-border)] text-[var(--text-primary)] rounded-xl">
                  <SelectValue>
                    {(v: string | null) => v ? (campaigns.find(c => c.id === v)?.name ?? v) : 'Select a campaign…'}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent
                  className="rounded-xl border-[var(--panel-border)] bg-[var(--card-bg-solid)]"
                  alignItemWithTrigger={false}
                >
                  {campaigns.length === 0 ? (
                    <div className="px-2 py-1.5 text-sm text-[var(--text-muted)] select-none">No campaigns found</div>
                  ) : (
                    campaigns.map((c) => (
                      <SelectItem key={c.id} value={c.id}
                        className="text-[var(--text-secondary)] focus:bg-[var(--panel-border-hover)] focus:text-[var(--text-primary)] rounded-lg">
                        {c.name}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-[var(--panel-border)] rounded-2xl p-10 flex flex-col items-center justify-center cursor-pointer hover:border-[var(--panel-border-hover)] hover:bg-[var(--panel-border)] transition-colors"
            >
              <Upload className="w-8 h-8 text-[var(--text-muted)] mb-3" />
              {fileName ? (
                <p className="text-sm text-[var(--text-primary)] font-medium">{fileName}</p>
              ) : (
                <>
                  <p className="text-sm text-[var(--text-secondary)]">Drop a CSV here or click to browse</p>
                  <p className="text-xs text-[var(--text-muted)] mt-1">Max 10MB · .csv only</p>
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
                <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-3">
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
                className="bg-gradient-to-r from-[var(--lf-accent)] to-amber-600 text-black font-semibold rounded-xl hover:opacity-90"
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
                <p className="font-mono text-2xl font-semibold text-[var(--text-primary)]">{preview.clean.length}</p>
                <p className="text-xs text-[var(--text-muted)] mt-0.5">clean</p>
              </div>
              <div className="w-px h-10 bg-[var(--panel-border)]" />
              <div className="text-center">
                <p className="font-mono text-2xl font-semibold text-amber-400">{preview.duplicates.length}</p>
                <p className="text-xs text-[var(--text-muted)] mt-0.5">duplicates</p>
              </div>
              <div className="w-px h-10 bg-[var(--panel-border)]" />
              <div className="text-center">
                <p className="font-mono text-2xl font-semibold text-red-400">{preview.dnc.length}</p>
                <p className="text-xs text-[var(--text-muted)] mt-0.5">DNC</p>
              </div>
              <div className="w-px h-10 bg-[var(--panel-border)]" />
              <div className="text-center">
                <p className="font-mono text-2xl font-semibold text-[var(--text-muted)]">{preview.invalidRowCount}</p>
                <p className="text-xs text-[var(--text-muted)] mt-0.5">invalid</p>
              </div>
            </div>

            <DuplicateReview duplicates={duplicates} dnc={preview.dnc} onChange={setDuplicates} />

            {error && <p className="text-sm text-red-400">{error}</p>}

            <div className="flex justify-between">
              <Button
                type="button"
                variant="outline"
                onClick={() => setStep('upload')}
                className="bg-[var(--panel-border)] border-[var(--panel-border)] text-[var(--text-secondary)] hover:bg-[var(--panel-border-hover)] rounded-xl"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back
              </Button>
              <Button
                type="button"
                onClick={handleImport}
                disabled={loading}
                className="bg-gradient-to-r from-[var(--lf-accent)] to-amber-600 text-black font-semibold rounded-xl hover:opacity-90"
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
              <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-2">Import Complete</h3>
              <p className="text-sm text-[var(--text-secondary)]">
                {result.created} imported · {result.overwritten} overwritten · {result.skipped} skipped · {result.dncBlocked} DNC blocked
              </p>
            </div>
            <Button
              type="button"
              onClick={handleComplete}
              className="bg-gradient-to-r from-[var(--lf-accent)] to-amber-600 text-black font-semibold rounded-xl hover:opacity-90"
            >
              Go to Contacts
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
