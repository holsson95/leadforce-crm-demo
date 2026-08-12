'use client'

import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { CONTACT_FIELDS } from '@/lib/csv/types'
import type { ColumnMapping, ContactField } from '@/lib/csv/types'

interface ColumnMapperProps {
  headers: string[]
  mappings: ColumnMapping[]
  onChange: (mappings: ColumnMapping[]) => void
}

export function ColumnMapper({ headers, mappings, onChange }: ColumnMapperProps) {
  const updateMapping = (csvHeader: string, contactField: ContactField | '') => {
    onChange(
      mappings.map((m) =>
        m.csvHeader === csvHeader
          ? { ...m, contactField: contactField || null }
          : m
      )
    )
  }

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2 px-3 pb-2 border-b border-[var(--panel-border)]">
        <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">CSV Column</span>
        <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">Maps To</span>
      </div>
      {headers.map((header) => {
        const mapping = mappings.find((m) => m.csvHeader === header)
        return (
          <div key={header} className="grid grid-cols-2 gap-2 items-center">
            <span className="text-sm text-[var(--text-secondary)] font-mono truncate px-3">{header}</span>
            <Select
              value={mapping?.contactField ?? ''}
              onValueChange={(v) => updateMapping(header, (v ?? '') as ContactField | '')}
            >
              <SelectTrigger className="bg-[var(--panel-border)] border-[var(--panel-border)] text-[var(--text-primary)] rounded-xl text-sm">
                <SelectValue placeholder="Skip column" />
              </SelectTrigger>
              <SelectContent className="rounded-xl border-[var(--panel-border)] bg-[var(--card-bg-solid)]">
                <SelectItem value=""
                  className="text-[var(--text-muted)] focus:bg-[var(--panel-border-hover)] focus:text-[var(--text-primary)] rounded-lg"
                >
                  Skip column
                </SelectItem>
                {CONTACT_FIELDS.map(({ value, label }) => (
                  <SelectItem key={value} value={value}
                    className="text-[var(--text-secondary)] focus:bg-[var(--panel-border-hover)] focus:text-[var(--text-primary)] rounded-lg">
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )
      })}
    </div>
  )
}
