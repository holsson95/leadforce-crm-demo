'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useCallback, useTransition } from 'react'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Search, X } from 'lucide-react'

const STATUS_OPTIONS = [
  { value: 'prospect', label: 'Prospect' },
  { value: 'lead', label: 'Lead' },
  { value: 'dnc', label: 'DNC' },
  { value: 'future', label: 'Future' },
  { value: 'call_back', label: 'Call Back' },
  { value: 'meeting_booked', label: 'Meeting Booked' },
]

interface Props {
  campaigns: { id: string; name: string }[]
}

export function ContactFilters({ campaigns }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [, startTransition] = useTransition()

  const updateParam = useCallback(
    (key: string, value: string | null) => {
      const params = new URLSearchParams(searchParams.toString())
      params.delete('page')
      if (value) params.set(key, value)
      else params.delete(key)
      startTransition(() => router.push(`${pathname}?${params.toString()}`))
    },
    [router, pathname, searchParams]
  )

  const hasFilters = ['status', 'campaignId', 'industry', 'country', 'search']
    .some((k) => searchParams.has(k))

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-secondary)]" />
        <Input
          placeholder="Search contacts..."
          defaultValue={searchParams.get('search') ?? ''}
          onChange={(e) => {
            const val = e.target.value
            clearTimeout((window as any).__contactSearchTimer)
            ;(window as any).__contactSearchTimer = setTimeout(() => updateParam('search', val || null), 300)
          }}
          className="pl-9 w-56 bg-[var(--panel-border)] border-[var(--panel-border)] text-sm"
        />
      </div>

      <Select
        value={searchParams.get('status') ?? ''}
        onValueChange={(v) => updateParam('status', v === 'all' ? null : v)}
      >
        <SelectTrigger className="w-40 bg-[var(--panel-border)] border-[var(--panel-border)] text-sm">
          <SelectValue>{(v: string) => STATUS_OPTIONS.find((o) => o.value === v)?.label ?? 'All Statuses'}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Statuses</SelectItem>
          {STATUS_OPTIONS.map((o) => (
            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={searchParams.get('campaignId') ?? ''}
        onValueChange={(v) => updateParam('campaignId', v === 'all' ? null : v)}
      >
        <SelectTrigger className="w-44 bg-[var(--panel-border)] border-[var(--panel-border)] text-sm">
          <SelectValue>{(v: string) => campaigns.find((c) => c.id === v)?.name ?? 'All Campaigns'}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Campaigns</SelectItem>
          {campaigns.map((c) => (
            <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Input
        placeholder="Industry..."
        defaultValue={searchParams.get('industry') ?? ''}
        onChange={(e) => {
          const val = e.target.value
          clearTimeout((window as any).__industryTimer)
          ;(window as any).__industryTimer = setTimeout(() => updateParam('industry', val || null), 300)
        }}
        className="w-36 bg-[var(--panel-border)] border-[var(--panel-border)] text-sm"
      />

      <Input
        placeholder="Country..."
        defaultValue={searchParams.get('country') ?? ''}
        onChange={(e) => {
          const val = e.target.value
          clearTimeout((window as any).__countryTimer)
          ;(window as any).__countryTimer = setTimeout(() => updateParam('country', val || null), 300)
        }}
        className="w-36 bg-[var(--panel-border)] border-[var(--panel-border)] text-sm"
      />

      {hasFilters && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push(pathname)}
          className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] gap-1"
        >
          <X className="h-3 w-3" />
          Clear
        </Button>
      )}
    </div>
  )
}
