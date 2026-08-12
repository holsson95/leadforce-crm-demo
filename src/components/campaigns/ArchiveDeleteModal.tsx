'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { archiveCampaign, deleteCampaign } from '@/app/(dashboard)/campaigns/actions'

interface Props {
  campaignId: string
  campaignName: string
  open: boolean
  onClose: () => void
  initialChoice?: 'archive' | 'delete'
}

export function ArchiveDeleteModal({
  campaignId,
  campaignName,
  open,
  onClose,
  initialChoice = 'archive',
}: Props) {
  const [choice, setChoice] = useState<'archive' | 'delete'>(initialChoice)
  const [pending, setPending] = useState(false)

  const handleConfirm = async () => {
    setPending(true)
    try {
      if (choice === 'archive') {
        await archiveCampaign(campaignId)
      } else {
        await deleteCampaign(campaignId)
      }
      onClose()
    } catch {
      toast.error('Something went wrong. Please try again.')
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="glass-panel border-[var(--panel-border)] max-w-md">
        <DialogHeader>
          <DialogTitle className="text-[var(--text-primary)]">Remove this campaign?</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-[var(--text-secondary)] -mt-2 mb-2">{campaignName}</p>

        <div className="space-y-3">
          <label
            className={`flex gap-3 p-4 rounded-xl border cursor-pointer transition-colors ${
              choice === 'archive'
                ? 'border-[var(--panel-border-hover)] bg-[var(--accent-muted)]'
                : 'border-[var(--panel-border)] hover:border-[var(--panel-border-hover)]'
            }`}
          >
            <input
              type="radio"
              name="lifecycle-choice"
              value="archive"
              checked={choice === 'archive'}
              onChange={() => setChoice('archive')}
              className="mt-0.5 accent-[var(--lf-accent)]"
            />
            <div>
              <p className="text-sm font-semibold text-[var(--text-primary)] flex items-center gap-2">
                Archive
                <span className="text-[10px] font-normal text-emerald-400 px-1.5 py-0.5 bg-emerald-500/10 rounded-full">
                  recommended
                </span>
              </p>
              <p className="text-xs text-[var(--text-secondary)] mt-1">
                Closes the campaign. All data is kept and continues to appear in reports. You can
                unarchive at any time.
              </p>
            </div>
          </label>

          <label
            className={`flex gap-3 p-4 rounded-xl border cursor-pointer transition-colors ${
              choice === 'delete'
                ? 'border-red-500/40 bg-red-500/5'
                : 'border-[var(--panel-border)] hover:border-[var(--panel-border-hover)]'
            }`}
          >
            <input
              type="radio"
              name="lifecycle-choice"
              value="delete"
              checked={choice === 'delete'}
              onChange={() => setChoice('delete')}
              className="mt-0.5"
            />
            <div>
              <p className="text-sm font-semibold text-[var(--text-primary)]">Delete permanently</p>
              <p className="text-xs text-[var(--text-secondary)] mt-1">
                Removes all campaign data after 3 days. You have a 72-hour window to restore.
              </p>
            </div>
          </label>
        </div>

        <div className="flex gap-3 justify-end mt-2">
          <Button
            variant="ghost"
            onClick={onClose}
            disabled={pending}
            className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] rounded-xl"
          >
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={pending}
            className={
              choice === 'delete'
                ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/20 rounded-xl'
                : 'bg-gradient-to-r from-[var(--lf-accent)] to-amber-600 text-black font-semibold rounded-xl hover:opacity-90'
            }
          >
            {pending ? 'Working…' : 'Confirm'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
