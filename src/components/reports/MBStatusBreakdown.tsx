import { Target } from 'lucide-react'
import type { MBBreakdownData } from '@/types/models'

const CATEGORY_LABELS = {
  first_conversation: 'First Conversation',
  follow_up:          'Follow-Up',
  nurtured_lead:      'Nurtured Lead',
} as const

const CATEGORY_BADGE = {
  first_conversation: 'bg-[var(--accent-muted)] text-[var(--lf-accent)]',
  follow_up:          'bg-[var(--lf-accent)]/10 text-amber-400',
  nurtured_lead:      'bg-emerald-500/10 text-emerald-400',
} as const

export function MBStatusBreakdown({ data }: { data: MBBreakdownData }) {
  const { summary, rows } = data

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="glass-panel rounded-2xl p-4">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-2">Total MBs</p>
          <p className="font-mono text-2xl font-semibold text-[var(--text-primary)]">{summary.total}</p>
        </div>
        <div className="glass-panel rounded-2xl p-4">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-2">First Conv.</p>
          <p className="font-mono text-2xl font-semibold text-[var(--lf-accent)]">{summary.firstConversation}</p>
        </div>
        <div className="glass-panel rounded-2xl p-4">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-2">Follow-Up</p>
          <p className="font-mono text-2xl font-semibold text-amber-400">{summary.followUp}</p>
        </div>
        <div className="glass-panel rounded-2xl p-4">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-2">Nurtured Lead</p>
          <p className="font-mono text-2xl font-semibold text-emerald-400">{summary.nurturedLead}</p>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="glass-panel rounded-2xl p-10 flex flex-col items-center gap-3 text-center">
          <Target className="w-8 h-8 text-[var(--text-muted)]" />
          <p className="text-sm text-[var(--text-secondary)]">No meeting bookings in this period</p>
        </div>
      ) : (
        <div className="glass-panel rounded-2xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[var(--panel-border)]">
                <th className="text-left px-5 py-3 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">Contact</th>
                <th className="text-left px-5 py-3 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">SDR</th>
                <th className="text-left px-5 py-3 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">Campaign</th>
                <th className="text-left px-5 py-3 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">Date</th>
                <th className="text-left px-5 py-3 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">Category</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--panel-border)]">
              {rows.map((row) => (
                <tr key={row.callRecordId} className="hover:bg-[var(--panel-border-hover)] transition-colors">
                  <td className="px-5 py-3.5">
                    <p className="text-sm text-[var(--text-primary)]">{row.contactFirstName} {row.contactLastName}</p>
                    {row.companyName && <p className="text-xs text-[var(--text-muted)] mt-0.5">{row.companyName}</p>}
                  </td>
                  <td className="px-5 py-3.5 text-sm text-[var(--text-secondary)]">{row.sdrName}</td>
                  <td className="px-5 py-3.5 text-sm text-[var(--text-secondary)]">{row.campaignName}</td>
                  <td className="px-5 py-3.5 text-sm text-[var(--text-secondary)] font-mono">
                    {new Date(row.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
                  </td>
                  <td className="px-5 py-3.5">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${CATEGORY_BADGE[row.mbLeadStatus]}`}>
                      {CATEGORY_LABELS[row.mbLeadStatus]}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
