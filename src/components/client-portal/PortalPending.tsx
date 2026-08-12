'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'

export function PortalPending() {
  const router = useRouter()

  useEffect(() => {
    const timer = setInterval(() => router.refresh(), 5000)
    return () => clearInterval(timer)
  }, [router])

  return (
    <div className="min-h-screen bg-[var(--bg-dark)] flex items-center justify-center">
      <div className="glass-panel rounded-3xl p-12 flex flex-col items-center gap-4 text-center max-w-sm">
        <Loader2 className="w-8 h-8 text-[var(--lf-accent)] animate-spin" />
        <div>
          <p className="text-[var(--text-primary)] font-semibold">Setting up your portal…</p>
          <p className="text-xs text-[var(--text-muted)] mt-1">This only takes a moment.</p>
        </div>
      </div>
    </div>
  )
}
