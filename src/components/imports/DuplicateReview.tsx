'use client'

import type { DuplicateRow, MappedRow } from '@/lib/csv/types'

interface DuplicateReviewProps {
  duplicates: DuplicateRow[]
  dnc: MappedRow[]
  onChange: (duplicates: DuplicateRow[]) => void
}

export function DuplicateReview({ duplicates, dnc, onChange }: DuplicateReviewProps) {
  const updateResolution = (hash: string, resolution: 'skip' | 'overwrite') => {
    onChange(duplicates.map((d) =>
      d.incoming.dedupeHash === hash ? { ...d, resolution } : d
    ))
  }

  return (
    <div className="space-y-6">
      {duplicates.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-3">
            Duplicates
            <span className="ml-2 font-mono text-[10px] bg-[var(--lf-accent)]/10 text-amber-400 px-2 py-0.5 rounded-full">
              {duplicates.length}
            </span>
          </h3>
          <div className="space-y-2">
            {duplicates.map((dup) => (
              <div key={dup.incoming.dedupeHash} className="glass-panel rounded-2xl p-4 space-y-3">
                <div className="grid grid-cols-2 gap-4 text-xs">
                  <div>
                    <p className="text-[var(--text-muted)] mb-1 uppercase tracking-wider font-semibold text-[10px]">Existing</p>
                    <p className="text-[var(--text-primary)]">{dup.existing.firstName} {dup.existing.lastName}</p>
                    <p className="text-[var(--text-secondary)]">{dup.existing.email ?? '—'}</p>
                    <p className="text-[var(--text-secondary)]">{dup.existing.companyName ?? '—'}</p>
                    <p className="text-[10px] font-mono text-[var(--text-muted)] mt-1">{dup.existing.status}</p>
                  </div>
                  <div>
                    <p className="text-[var(--text-muted)] mb-1 uppercase tracking-wider font-semibold text-[10px]">Incoming</p>
                    <p className="text-[var(--text-primary)]">{dup.incoming.firstName} {dup.incoming.lastName}</p>
                    <p className="text-[var(--text-secondary)]">{dup.incoming.email ?? '—'}</p>
                    <p className="text-[var(--text-secondary)]">{dup.incoming.companyName ?? '—'}</p>
                  </div>
                </div>
                <div className="flex gap-4 border-t border-[var(--panel-border)] pt-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name={`dup-${dup.incoming.dedupeHash}`}
                      value="skip"
                      checked={dup.resolution === 'skip'}
                      onChange={() => updateResolution(dup.incoming.dedupeHash, 'skip')}
                      className="accent-gray-400"
                    />
                    <span className="text-xs text-[var(--text-secondary)]">Skip</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name={`dup-${dup.incoming.dedupeHash}`}
                      value="overwrite"
                      checked={dup.resolution === 'overwrite'}
                      onChange={() => updateResolution(dup.incoming.dedupeHash, 'overwrite')}
                      className="accent-[var(--lf-accent)]"
                    />
                    <span className="text-xs text-[var(--text-secondary)]">Overwrite with incoming</span>
                  </label>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {dnc.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-3">
            DNC — Always Skipped
            <span className="ml-2 font-mono text-[10px] bg-red-500/10 text-red-400 px-2 py-0.5 rounded-full">
              {dnc.length}
            </span>
          </h3>
          <div className="space-y-1">
            {dnc.map((row) => (
              <div key={row.dedupeHash}
                className="flex items-center gap-4 px-4 py-2.5 rounded-xl bg-red-500/5 border border-red-500/10">
                <span className="text-sm text-[var(--text-secondary)]">{row.firstName} {row.lastName}</span>
                <span className="text-sm text-[var(--text-muted)]">{row.email ?? row.mobilePhone ?? '—'}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
