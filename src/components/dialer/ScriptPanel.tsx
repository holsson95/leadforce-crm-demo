import { ScrollText } from 'lucide-react'

export function ScriptPanel() {
  return (
    <div className="glass-panel rounded-3xl w-[30%] flex-shrink-0 flex flex-col items-center justify-center p-8 text-center">
      <ScrollText className="w-12 h-12 text-[var(--text-muted)] mb-4" />
      <h3 className="text-sm font-semibold text-[var(--text-secondary)] mb-2">Scripts</h3>
      <p className="text-xs text-[var(--text-muted)]">Script display coming in Phase 6</p>
    </div>
  )
}
