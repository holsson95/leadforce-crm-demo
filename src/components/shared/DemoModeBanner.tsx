import { Info } from 'lucide-react'

// Public demo build: shown on every page (auth screens + the dashboard shell)
// so it's unmistakable this is sample data, not a real client's live system.
export function DemoModeBanner() {
  return (
    <div className="flex-shrink-0 w-full flex items-center justify-center gap-2 py-1.5 px-4 text-xs text-center bg-[var(--lf-accent)]/10 border-b border-[var(--lf-accent)]/30 text-[var(--text-secondary)]">
      <Info className="w-3.5 h-3.5 text-[var(--lf-accent)] flex-shrink-0" />
      <span>
        This is a public portfolio demo of LeadForce CRM with fictional sample data — not a real client&apos;s live system. Changes reset hourly.
      </span>
    </div>
  )
}
