'use client'

import { X } from 'lucide-react'
import { useDialerStore } from '@/stores/dialer-store'
import { filterToChips } from '@/lib/dialer-filters'

interface QueueFilterChipsProps {
  users: { id: string; name: string }[]
}

export function QueueFilterChips({ users }: QueueFilterChipsProps) {
  const { queueFilters, removeFilter, clearFilters } = useDialerStore()
  const chips = filterToChips(queueFilters)

  if (chips.length === 0) return null

  const resolvedChips = chips.map((chip) => {
    if (chip.clearKeys.includes('accountOwnerId') && queueFilters.accountOwnerId) {
      const name = users.find((u) => u.id === queueFilters.accountOwnerId)?.name
      return name ? { ...chip, label: `Owner: ${name}` } : chip
    }
    return chip
  })

  return (
    <div className="flex flex-wrap items-center gap-1.5 px-4 py-2 border-b border-[var(--panel-border)] flex-shrink-0">
      {resolvedChips.map((chip, i) => (
        <span
          key={i}
          className="inline-flex items-center gap-1 bg-[var(--lf-accent)]/10 border border-[var(--lf-accent)]/20 text-[var(--lf-accent)] rounded-lg px-2 py-0.5 text-[10px] font-medium"
        >
          {chip.label}
          <button
            onClick={() => removeFilter(chip.clearKeys)}
            className="hover:text-[var(--text-primary)] transition-colors ml-0.5"
            aria-label={`Remove filter: ${chip.label}`}
          >
            <X className="w-2.5 h-2.5" />
          </button>
        </span>
      ))}
      <button
        onClick={() => clearFilters()}
        className="text-[10px] text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors ml-1"
      >
        Clear all
      </button>
    </div>
  )
}
