'use client'

import { useEffect, useRef, useState } from 'react'
import type { CallOutcome } from '@prisma/client'
import { cn } from '@/lib/utils'
import { CALL_OUTCOMES_FOR_FILTER } from '@/lib/dialer-filters'
import { OUTCOME_COLOR, DOT_CLASS } from './outcome-colors'

interface OutcomeSearchDropdownProps {
  onSelect: (outcome: CallOutcome) => void
  onClose:  () => void
}

export function OutcomeSearchDropdown({ onSelect, onClose }: OutcomeSearchDropdownProps) {
  const [search, setSearch]       = useState('')
  const [activeIdx, setActiveIdx] = useState(0)
  const containerRef              = useRef<HTMLDivElement>(null)
  const inputRef                  = useRef<HTMLInputElement>(null)

  const filtered = CALL_OUTCOMES_FOR_FILTER.filter(({ label }) =>
    label.toLowerCase().includes(search.toLowerCase())
  )

  useEffect(() => { inputRef.current?.focus() }, [])
  useEffect(() => { setActiveIdx(0) }, [search])

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return }
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActiveIdx((i) => Math.min(i + 1, filtered.length - 1))
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActiveIdx((i) => Math.max(i - 1, 0))
      }
      if (e.key === 'Enter' && filtered[activeIdx]) {
        onSelect(filtered[activeIdx].value)
      }
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [filtered, activeIdx, onSelect, onClose])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [onClose])

  return (
    <div
      ref={containerRef}
      className="absolute bottom-[calc(100%+8px)] left-1/2 -translate-x-1/2 z-50 w-64 rounded-xl border border-[var(--panel-border-hover)] bg-[var(--card-bg-solid)] shadow-2xl shadow-black/60 flex flex-col"
    >
      <div className="p-2 border-b border-[var(--panel-border-hover)]">
        <input
          ref={inputRef}
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search outcomes…"
          className="w-full bg-[var(--bg-dark)] border border-[var(--panel-border-hover)] rounded-lg px-3 py-1.5 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--lf-accent)]/40"
        />
      </div>
      <div className="overflow-y-auto max-h-56 p-1">
        {filtered.length === 0 ? (
          <p className="text-[11px] text-[var(--text-muted)] text-center py-3">No outcomes match</p>
        ) : (
          filtered.map(({ value, label }, i) => (
            <button
              key={value}
              onClick={() => onSelect(value)}
              className={cn(
                'w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left text-xs transition-colors',
                i === activeIdx
                  ? 'bg-white/8 text-[var(--text-primary)]'
                  : 'text-[var(--text-secondary)] hover:bg-[var(--panel-border-hover)] hover:text-[var(--text-primary)]',
              )}
            >
              <span className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', DOT_CLASS[OUTCOME_COLOR[value]])} />
              {label}
            </button>
          ))
        )}
      </div>
    </div>
  )
}
