'use client'

import { useEffect, useRef, useState } from 'react'
import { Search } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { ContactLookupDrawer } from '@/components/contacts/ContactLookupDrawer'

type LookupResult = {
  id: string
  firstName: string
  lastName: string
  mobilePhone: string | null
  corporatePhone: string | null
  companyName: string | null
  status: string
  campaign: { name: string }
}

const STATUS_LABELS: Record<string, string> = {
  prospect:       'Prospect',
  lead:           'Lead',
  dnc:            'DNC',
  future:         'Future',
  call_back:      'Call Back',
  meeting_booked: 'Meeting Booked',
}

const STATUS_STYLES: Record<string, string> = {
  prospect:       'bg-[var(--lf-accent)]/10 text-[var(--lf-accent)]',
  lead:           'bg-emerald-500/10 text-emerald-400',
  dnc:            'bg-red-500/10 text-red-400',
  future:         'bg-gray-500/10 text-[var(--text-secondary)]',
  call_back:      'bg-[var(--lf-accent)]/10 text-amber-400',
  meeting_booked: 'bg-purple-500/10 text-purple-400',
}

export function HeaderSearch() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<LookupResult[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    const trimmed = query.trim()
    clearTimeout(debounceRef.current)
    if (trimmed.length < 2) {
      setResults([])
      setOpen(false)
      return
    }
    let cancelled = false
    debounceRef.current = setTimeout(() => {
      setLoading(true)
      setError(false)
      fetch(`/api/contacts/lookup?q=${encodeURIComponent(trimmed)}`)
        .then((r) => {
          if (!r.ok) throw new Error(`Lookup failed: ${r.status}`)
          return r.json()
        })
        .then((json) => {
          if (cancelled) return
          setResults(json.data ?? [])
          setOpen(true)
        })
        .catch(() => {
          if (cancelled) return
          setResults([])
          setError(true)
          setOpen(true)
        })
        .finally(() => { if (!cancelled) setLoading(false) })
    }, 300)
    return () => {
      clearTimeout(debounceRef.current)
      cancelled = true
    }
  }, [query])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-secondary)]" />
        <Input
          placeholder="Search by name, phone, or company"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => { if (results.length > 0) setOpen(true) }}
          className="pl-9 w-72 bg-[var(--panel-border)] border-[var(--panel-border)] text-sm"
        />
      </div>

      {open && (
        <div className="absolute top-full mt-2 w-80 glass-panel rounded-2xl border border-[var(--panel-border)] shadow-xl z-20 overflow-hidden">
          {loading ? (
            <div className="px-4 py-3 text-sm text-[var(--text-muted)]">Searching…</div>
          ) : error ? (
            <div className="px-4 py-3 text-sm text-red-400">Couldn&apos;t search contacts. Try again.</div>
          ) : results.length === 0 ? (
            <div className="px-4 py-3 text-sm text-[var(--text-muted)]">No contacts found</div>
          ) : (
            <ul className="max-h-80 overflow-y-auto custom-scrollbar">
              {results.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedContactId(r.id)
                      setOpen(false)
                    }}
                    className="w-full text-left px-4 py-2.5 hover:bg-[var(--panel-border-hover)] transition-colors border-b border-[var(--panel-border)] last:border-b-0"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-[var(--text-primary)] truncate">
                        {r.firstName} {r.lastName}
                      </span>
                      <Badge className={cn('text-[10px] h-5 px-2', STATUS_STYLES[r.status] ?? 'bg-gray-500/10 text-[var(--text-secondary)]')}>
                        {STATUS_LABELS[r.status] ?? r.status}
                      </Badge>
                    </div>
                    <p className="text-xs text-[var(--text-muted)] mt-0.5 truncate">
                      {[r.mobilePhone ?? r.corporatePhone, r.companyName].filter(Boolean).join(' · ') || '—'}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <ContactLookupDrawer contactId={selectedContactId} onClose={() => setSelectedContactId(null)} />
    </div>
  )
}
