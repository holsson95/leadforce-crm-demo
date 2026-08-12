'use client'

import { Checkbox } from '@/components/ui/checkbox'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import type { UserSummary } from '@/types/models'

interface SDRSelectorProps {
  sdrs: UserSummary[]
  selectedIds: string[]
  onChange: (ids: string[]) => void
}

export function SDRSelector({ sdrs, selectedIds, onChange }: SDRSelectorProps) {
  const toggle = (id: string) => {
    onChange(
      selectedIds.includes(id)
        ? selectedIds.filter((s) => s !== id)
        : [...selectedIds, id]
    )
  }

  if (sdrs.length === 0) {
    return <p className="text-xs text-[var(--text-muted)] py-4 text-center">No SDRs in this tenant yet</p>
  }

  return (
    <div className="space-y-1 max-h-48 overflow-y-auto custom-scrollbar">
      {sdrs.map((sdr) => {
        const checked = selectedIds.includes(sdr.id)
        return (
          <label
            key={sdr.id}
            className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-[var(--panel-border-hover)] cursor-pointer border border-transparent hover:border-[var(--panel-border)] transition-colors duration-200"
          >
            <Checkbox
              checked={checked}
              onCheckedChange={() => toggle(sdr.id)}
              className="border-[var(--panel-border-hover)] data-[state=checked]:border-[var(--lf-accent)] data-[state=checked]:bg-[var(--lf-accent)]/20"
            />
            <Avatar className="w-7 h-7 rounded-lg flex-shrink-0">
              <AvatarFallback className="text-xs rounded-lg bg-[var(--panel-border)] text-[var(--text-secondary)]">
                {sdr.name.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="text-sm text-[var(--text-secondary)] truncate">{sdr.name}</p>
              <p className="text-[10px] text-[var(--text-muted)] truncate">{sdr.email}</p>
            </div>
          </label>
        )
      })}
    </div>
  )
}
