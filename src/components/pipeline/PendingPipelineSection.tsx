'use client'

import { useState } from 'react'
import { ChevronDown, ChevronUp, X } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import type { PendingPipelineDealRow, PipelineStageRow } from '@/types/models'

const OUTCOME_LABEL: Record<string, string> = {
  connected:       'Connected',
  lead:            'Lead',
  call_back_later: 'Call Back Later',
  meeting_booked:  'Meeting Booked',
}

const OUTCOME_COLOR: Record<string, string> = {
  connected:       'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  lead:            'bg-[var(--lf-accent)]/10 text-amber-400 border-amber-500/20',
  call_back_later: 'bg-[var(--lf-accent)]/10 text-amber-400 border-amber-500/20',
  meeting_booked:  'bg-purple-500/10 text-purple-400 border-purple-500/20',
}

interface PendingPipelineSectionProps {
  pending:  PendingPipelineDealRow[]
  stages:   PipelineStageRow[]
  canWrite: boolean
}

export function PendingPipelineSection({ pending: initialPending, stages, canWrite }: PendingPipelineSectionProps) {
  const [open,     setOpen]     = useState(true)
  const [pending,  setPending]  = useState(initialPending)
  const [placing,  setPlacing]  = useState<Record<string, boolean>>({})
  const [selected, setSelected] = useState<Record<string, string>>({})

  if (pending.length === 0) return null

  async function handlePlace(id: string) {
    const stageId = selected[id]
    if (!stageId) return
    setPlacing((p) => ({ ...p, [id]: true }))
    try {
      const res = await fetch(`/api/pipeline/pending/${id}/place`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ stageId }),
      })
      if (!res.ok) throw new Error()
      setPending((prev) => prev.filter((p) => p.id !== id))
      toast.success('Contact added to pipeline')
    } catch {
      toast.error('Failed to place contact — try again')
    } finally {
      setPlacing((p) => ({ ...p, [id]: false }))
    }
  }

  async function handleDismiss(id: string) {
    try {
      const res = await fetch(`/api/pipeline/pending/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      setPending((prev) => prev.filter((p) => p.id !== id))
      toast.success('Removed from pending queue')
    } catch {
      toast.error('Failed to remove — try again')
    }
  }

  return (
    <div className="glass-panel rounded-2xl mb-4 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-3 text-sm font-semibold text-[var(--text-primary)] hover:bg-[var(--panel-border-hover)] transition-colors"
      >
        <div className="flex items-center gap-2">
          <span>Pending Pipeline</span>
          <span className="px-1.5 py-0.5 rounded-full bg-[var(--lf-accent)]/20 text-amber-400 text-[10px] font-bold">
            {pending.length}
          </span>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-[var(--text-muted)]" /> : <ChevronDown className="w-4 h-4 text-[var(--text-muted)]" />}
      </button>

      {open && (
        <div className="border-t border-[var(--panel-border)]">
          {pending.map((p) => (
            <div
              key={p.id}
              className="flex items-center gap-4 px-5 py-3 border-b border-[var(--panel-border)] last:border-0 hover:bg-white/[0.02] transition-colors"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-[var(--text-primary)] truncate">
                  {p.contact.firstName} {p.contact.lastName}
                </p>
                <p className="text-xs text-[var(--text-muted)] truncate">
                  {p.contact.companyName ?? p.contact.jobTitle ?? '—'} · {p.campaign.name}
                </p>
              </div>

              <span className={cn(
                'flex-shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full border',
                OUTCOME_COLOR[p.outcome] ?? 'bg-gray-500/10 text-[var(--text-secondary)] border-gray-500/20'
              )}>
                {OUTCOME_LABEL[p.outcome] ?? p.outcome}
              </span>

              <span className="flex-shrink-0 text-[11px] text-[var(--text-muted)]">
                {new Date(p.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
              </span>

              {canWrite && (
                <div className="flex items-center gap-2 flex-shrink-0">
                  {stages.length === 0 ? (
                    <span className="text-xs text-[var(--text-muted)] italic">Configure stages first</span>
                  ) : (
                    <>
                      <Select
                        value={selected[p.id] ?? ''}
                        onValueChange={(v) => { if (v) setSelected((prev) => ({ ...prev, [p.id]: v })) }}
                      >
                        <SelectTrigger className="h-7 text-xs bg-[var(--panel-border)] border-[var(--panel-border)] text-[var(--text-primary)] rounded-lg w-36">
                          <SelectValue>
                            {(v: string | null) => {
                              if (!v) return <span className="text-[var(--text-muted)]">Select stage…</span>
                              return <span>{stages.find((s) => s.id === v)?.name ?? v}</span>
                            }}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent className="rounded-xl border-[var(--panel-border)] bg-[var(--card-bg)]">
                          {stages.map((s) => (
                            <SelectItem
                              key={s.id}
                              value={s.id}
                              className="text-[var(--text-secondary)] focus:bg-[var(--panel-border-hover)] focus:text-[var(--text-primary)] rounded-lg text-xs"
                            >
                              <span className="flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color }} />
                                {s.name}
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <button
                        type="button"
                        onClick={() => handlePlace(p.id)}
                        disabled={!selected[p.id] || placing[p.id]}
                        className="h-7 px-3 text-xs bg-gradient-to-r from-[var(--lf-accent)] to-amber-600 text-black font-semibold rounded-lg disabled:opacity-40 hover:opacity-90"
                      >
                        {placing[p.id] ? '…' : 'Place'}
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => handleDismiss(p.id)}
                    className="w-6 h-6 flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--panel-border-hover)] rounded-lg transition-colors"
                    title="Remove from queue"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
