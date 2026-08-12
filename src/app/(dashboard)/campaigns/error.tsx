'use client'

import { AlertCircle, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default function CampaignsError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="glass-panel border border-red-500/20 rounded-3xl p-10 max-w-sm w-full flex flex-col items-center gap-4 text-center">
        <div className="w-12 h-12 rounded-2xl bg-red-500/10 flex items-center justify-center">
          <AlertCircle className="w-6 h-6 text-red-400" />
        </div>
        <div className="space-y-1">
          <p className="text-sm font-semibold text-[var(--text-primary)]">Failed to load campaigns</p>
          <p className="text-xs text-[var(--text-secondary)]">
            {error.digest ? `Error ${error.digest} — ` : ''}
            Something went wrong. Try refreshing, or contact support if this keeps happening.
          </p>
        </div>
        <Button
          onClick={reset}
          size="sm"
          className="bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/20 rounded-xl"
        >
          <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
          Try again
        </Button>
      </div>
    </div>
  )
}
