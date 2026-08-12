'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import type { MappedRow } from '@/lib/csv/types'

interface CampaignWizardStep3Props {
  cleanRows: MappedRow[]
  dncRows: MappedRow[]
  onImport: (includedDncRows: MappedRow[]) => Promise<void>
  error?: string | null
}

export function CampaignWizardStep3({ cleanRows, dncRows, onImport, error }: CampaignWizardStep3Props) {
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
            <p className="text-xs text-[var(--text-muted)] mt-0.5">Toggle to include or exclude each one</p>
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
                    ? 'bg-[var(--accent-muted)] border-[var(--lf-accent)]/20'
                    : 'bg-white/[0.02] border-[var(--panel-border)] hover:bg-white/[0.04]'
                )}
              >
                <div className={cn(
                  'w-4 h-4 rounded-full border-2 flex-shrink-0 transition-colors',
                  included ? 'border-[var(--lf-accent)] bg-[var(--lf-accent)]' : 'border-[var(--panel-border-hover)]'
                )} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-[var(--text-primary)] truncate">{name}</p>
                  <div className="flex items-center gap-2 flex-wrap">
                    {row.companyName && (
                      <p className="text-xs text-[var(--text-muted)] truncate">{row.companyName}</p>
                    )}
                    {row.dncReason && (
                      <span className="text-xs text-red-400 bg-red-500/10 px-1.5 py-0.5 rounded">
                        {row.dncReason}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            )
          })}
        </div>

        <p className="text-xs text-center text-[var(--text-muted)]">
          {cleanRows.length} clean + {includedDncRows.length} included → {totalToImport} total to import
        </p>

        {error && (
          <p className="text-sm text-red-400 mt-2">{error}</p>
        )}
      </div>

      <div className="flex-shrink-0 border-t border-[var(--panel-border)] p-6 flex gap-3">
        <Button
          type="button"
          onClick={() => handleImport(includedDncRows)}
          disabled={importing}
          className="flex-1 bg-gradient-to-r from-[var(--lf-accent)] to-amber-600 text-black font-semibold rounded-xl hover:opacity-90"
        >
          {importing ? 'Importing…' : `Import ${totalToImport} Contact${totalToImport !== 1 ? 's' : ''}`}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => handleImport([])}
          disabled={importing}
          className="bg-[var(--panel-border)] border-[var(--panel-border)] text-[var(--text-secondary)] hover:bg-[var(--panel-border-hover)] rounded-xl"
        >
          Exclude all DNC
        </Button>
      </div>
    </>
  )
}
