'use client'

import { useRouter } from 'next/navigation'

interface CampaignOption {
  id: string
  name: string
  archivedAt: Date | string | null
}

interface CampaignFilterProps {
  campaigns: CampaignOption[]
  selected: string | undefined
  period: 'week' | 'month'
}

export function CampaignFilter({ campaigns, selected, period }: CampaignFilterProps) {
  const router = useRouter()

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const params = new URLSearchParams({ period })
    if (e.target.value) params.set('campaignId', e.target.value)
    router.push(`/reports?${params.toString()}`)
  }

  return (
    <select
      value={selected ?? ''}
      onChange={handleChange}
      className="bg-[var(--panel-border)] border border-[var(--panel-border)] rounded-xl px-3 py-1.5 text-sm text-[var(--text-secondary)] focus:outline-none focus:border-[var(--lf-accent)]/30 cursor-pointer"
    >
      <option value="" className="bg-[var(--card-bg)]">All campaigns</option>
      {campaigns.map((c) => (
        <option key={c.id} value={c.id} className="bg-[var(--card-bg)]">
          {c.name}{c.archivedAt ? ' (archived)' : ''}
        </option>
      ))}
    </select>
  )
}
