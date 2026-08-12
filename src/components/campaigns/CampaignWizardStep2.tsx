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
  error?: string | null
}

export function CampaignWizardStep2({ campaignId, onPreviewReady, onSkip, error: externalError }: CampaignWizardStep2Props) {
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
    setHeaders([])
    setRawRows([])
    setMappings([])
    setError(null)
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
    if (rawRows.length === 0) {
      setError('No data rows found in this file.')
      return
    }
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
      if (preview.clean.length === 0 && preview.dnc.length === 0) {
        setError(`No valid contacts found. ${preview.invalidRowCount} row(s) were invalid or could not be mapped.`)
        return
      }
      await onPreviewReady(preview)
    } catch {
      setError('Failed to process file. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <div className="overflow-y-auto max-h-[70vh] p-6 space-y-5 custom-scrollbar">
        <div
          onClick={() => fileInputRef.current?.click()}
          className="border-2 border-dashed border-[var(--panel-border)] rounded-2xl p-10 flex flex-col items-center justify-center cursor-pointer hover:border-[var(--panel-border-hover)] hover:bg-white/[0.02] transition-colors"
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
        {externalError && <p className="text-sm text-red-400">{externalError}</p>}
      </div>

      <div className="flex-shrink-0 border-t border-[var(--panel-border)] p-6 flex gap-3">
        <Button
          type="button"
          onClick={handlePreview}
          disabled={loading || !rawRows.length}
          className="flex-1 bg-gradient-to-r from-[var(--lf-accent)] to-amber-600 text-black font-semibold rounded-xl hover:opacity-90"
        >
          {loading ? 'Processing…' : 'Preview Import'}
          {!loading && <ArrowRight className="w-4 h-4 ml-2" />}
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={onSkip}
          className="text-[var(--text-muted)] hover:text-[var(--text-secondary)] rounded-xl px-4"
        >
          Skip for now
        </Button>
      </div>
    </>
  )
}
