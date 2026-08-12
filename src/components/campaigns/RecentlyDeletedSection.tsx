'use client'

import { useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { restoreCampaign } from '@/app/(dashboard)/campaigns/actions'
import { timeRemaining } from '@/lib/utils/time-remaining'
import type { RecentlyDeletedCampaign } from '@/types/models'

interface Props {
  campaigns: RecentlyDeletedCampaign[]
}

export function RecentlyDeletedSection({ campaigns }: Props) {
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState<string | null>(null)

  if (campaigns.length === 0) return null

  return (
    <div className="glass-panel rounded-3xl overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-6 py-4 w-full text-left hover:bg-white/[0.02] transition-colors"
      >
        <ChevronRight
          className={`w-4 h-4 text-[var(--text-muted)] transition-transform duration-200 ${open ? 'rotate-90' : ''}`}
        />
        <span className="text-sm font-semibold text-[var(--text-secondary)]">Recently Deleted</span>
        <span className="ml-1 font-mono text-[10px] bg-[var(--panel-border)] text-[var(--text-muted)] px-2 py-0.5 rounded-full">
          {campaigns.length}
        </span>
      </button>

      {open && (
        <>
          <div className="grid grid-cols-[2fr_1.5fr_200px_120px] gap-4 px-6 py-3 border-t border-[var(--panel-border)]">
            {['Campaign', 'Client', 'Restore Window', ''].map((col) => (
              <span key={col} className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
                {col}
              </span>
            ))}
          </div>
          <div className="divide-y divide-[var(--panel-border)]">
            {campaigns.map((campaign) => (
              <div
                key={campaign.id}
                className="grid grid-cols-[2fr_1.5fr_200px_120px] gap-4 px-6 py-4 items-center"
              >
                <span className="text-sm text-[var(--text-secondary)] truncate">{campaign.name}</span>
                <span className="text-sm text-[var(--text-muted)] truncate">{campaign.clientName}</span>
                <span className="text-xs text-amber-400/80 font-mono">
                  {timeRemaining(campaign.deletedAt)}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending === campaign.id}
                  onClick={async () => {
                    setPending(campaign.id)
                    try {
                      await restoreCampaign(campaign.id)
                    } catch {
                      toast.error('Something went wrong. Please try again.')
                    } finally {
                      setPending(null)
                    }
                  }}
                  className="text-xs border-[var(--panel-border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--panel-border-hover)] rounded-lg"
                >
                  {pending === campaign.id ? 'Working…' : 'Restore'}
                </Button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
