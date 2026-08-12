'use client'

import { CheckCircle } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'

interface CampaignWizardStep4Props {
  campaignId: string
  campaignName: string
  result: { created: number; dncBlocked: number; skipped: number }
  onClose: () => void
}

export function CampaignWizardStep4({ campaignId, campaignName, result, onClose }: CampaignWizardStep4Props) {
  const router = useRouter()

  const goToContacts = () => {
    onClose()
    router.push(`/contacts?campaignId=${campaignId}`)
  }

  return (
    <>
      <div className="flex flex-col items-center p-10 space-y-6">
        <CheckCircle className="w-14 h-14 text-emerald-400" />
        <div className="text-center">
          <h3 className="text-base font-semibold text-[var(--text-primary)] mb-1">Campaign ready</h3>
          <p className="text-sm text-[var(--text-muted)]">{campaignName}</p>
        </div>
        <div className="w-full bg-[var(--panel-border)] rounded-2xl divide-y divide-[var(--panel-border)]">
          <div className="flex justify-between items-center px-5 py-3">
            <span className="text-sm text-[var(--text-secondary)]">Contacts imported</span>
            <span className="font-mono font-semibold text-emerald-400">{result.created}</span>
          </div>
          <div className="flex justify-between items-center px-5 py-3">
            <span className="text-sm text-[var(--text-secondary)]">DNC excluded</span>
            <span className="font-mono font-semibold text-red-400">{result.dncBlocked}</span>
          </div>
          <div className="flex justify-between items-center px-5 py-3">
            <span className="text-sm text-[var(--text-secondary)]">Invalid rows skipped</span>
            <span className="font-mono font-semibold text-[var(--text-muted)]">{result.skipped}</span>
          </div>
        </div>
      </div>

      <div className="flex-shrink-0 border-t border-[var(--panel-border)] p-6 flex gap-3">
        <Button
          type="button"
          onClick={goToContacts}
          className="flex-1 bg-gradient-to-r from-[var(--lf-accent)] to-amber-600 text-black font-semibold rounded-xl hover:opacity-90"
        >
          Go to Contacts
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={onClose}
          className="bg-[var(--panel-border)] border-[var(--panel-border)] text-[var(--text-secondary)] hover:bg-[var(--panel-border-hover)] rounded-xl"
        >
          Close
        </Button>
      </div>
    </>
  )
}
