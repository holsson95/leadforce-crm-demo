'use client'

import { useState, useEffect, useRef } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useDialerStore } from '@/stores/dialer-store'
import type { CallOutcome } from '@prisma/client'

type DropdownState = 'idle' | 'open' | 'confirm' | 'loading'

interface OutcomeOption {
  label: string
  outcome: CallOutcome
  dotClass: string
  badge?: string
  badgeClass?: string
  requiresConfirm: boolean
}

const OUTCOMES: OutcomeOption[] = [
  { label: 'No Answer',      outcome: 'no_answer'              as CallOutcome, dotClass: 'bg-white/30',  requiresConfirm: false },
  { label: 'Voicemail',      outcome: 'voicemail'              as CallOutcome, dotClass: 'bg-amber-400', requiresConfirm: false },
  { label: 'AI Assistant',   outcome: 'ai_assistant'           as CallOutcome, dotClass: 'bg-white/30',  requiresConfirm: false },
  { label: 'Gatekeeper',     outcome: 'not_available'          as CallOutcome, dotClass: 'bg-white/30',  requiresConfirm: false },
  { label: 'Not Interested', outcome: 'not_interested'         as CallOutcome, dotClass: 'bg-blue-400',  badge: 'Requeue 1wk', badgeClass: 'bg-[var(--lf-accent)]/15 text-amber-400', requiresConfirm: false },
  { label: 'Not Relevant',   outcome: 'not_relevant_contact'   as CallOutcome, dotClass: 'bg-red-500',   badge: '→ DNC', badgeClass: 'bg-red-500/15 text-red-400', requiresConfirm: true  },
  { label: 'Disconnected',   outcome: 'hung_up'                as CallOutcome, dotClass: 'bg-red-500',   requiresConfirm: false },
  { label: 'Wrong Number',   outcome: 'wrong_number'           as CallOutcome, dotClass: 'bg-red-500',   badge: '→ DNC', badgeClass: 'bg-red-500/15 text-red-400', requiresConfirm: true  },
  { label: 'DNC',            outcome: 'does_not_take_cold_calls' as CallOutcome, dotClass: 'bg-red-500', badge: '→ DNC', badgeClass: 'bg-red-500/15 text-red-400', requiresConfirm: true  },
]

// Divider appears BEFORE the item at these indices
const DIVIDER_BEFORE = new Set([4, 6])

interface QuickLogDropdownProps {
  contactId: string
  contactName: string
  disabled: boolean
}

export function QuickLogDropdown({ contactId, contactName, disabled }: QuickLogDropdownProps) {
  const [dropState, setDropState] = useState<DropdownState>('idle')
  const [pending, setPending]     = useState<OutcomeOption | null>(null)
  const containerRef              = useRef<HTMLDivElement>(null)
  const { logManualOutcome }      = useDialerStore()

  useEffect(() => {
    if (dropState === 'idle') return
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setDropState('idle')
        setPending(null)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [dropState])

  const handleTriggerClick = () => {
    if (disabled) return
    setDropState((s) => (s === 'idle' ? 'open' : 'idle'))
    setPending(null)
  }

  const handleSelect = (opt: OutcomeOption) => {
    if (opt.requiresConfirm) {
      setPending(opt)
      setDropState('confirm')
    } else {
      void submit(opt)
    }
  }

  const submit = async (opt: OutcomeOption) => {
    setDropState('loading')
    try {
      await logManualOutcome(contactId, opt.outcome, '')
    } catch {
      setDropState('open')
      return
    }
    setDropState('idle')
    setPending(null)
  }

  const firstName = contactName.split(' ')[0]

  return (
    <div ref={containerRef} className="relative flex-shrink-0">
      <button
        onClick={handleTriggerClick}
        disabled={disabled || dropState === 'loading'}
        title={disabled ? undefined : 'Quick log outcome'}
        className={cn(
          'w-6 h-6 flex items-center justify-center rounded-lg transition-colors',
          disabled
            ? 'text-gray-700 cursor-not-allowed'
            : dropState !== 'idle'
              ? 'bg-[var(--lf-accent)]/15 text-[var(--lf-accent)] border border-[var(--lf-accent)]/30'
              : 'text-[var(--text-muted)] hover:text-[var(--lf-accent)] hover:bg-[var(--panel-border-hover)]',
        )}
      >
        <ChevronDown className="w-3 h-3" />
      </button>

      {dropState !== 'idle' && (
        <div className="absolute top-[calc(100%+4px)] right-0 z-50 w-52 rounded-xl border border-[var(--lf-accent)]/20 bg-[var(--card-bg)] shadow-2xl shadow-black/60">

          {dropState === 'loading' && (
            <div className="flex items-center justify-center py-6">
              <div className="w-4 h-4 border-2 border-[var(--lf-accent)]/30 border-t-[var(--lf-accent)] rounded-full animate-spin" />
            </div>
          )}

          {dropState === 'confirm' && pending && (
            <div className="p-3">
              <p className="text-[9px] uppercase tracking-widest text-[var(--text-muted)] mb-3">Confirm DNC</p>
              <p className="text-xs text-[var(--text-secondary)] mb-4 leading-relaxed">
                Mark <span className="text-[var(--text-primary)] font-semibold">{firstName}</span> as Do Not Call?
              </p>
              <button
                onClick={() => void submit(pending)}
                className="w-full py-1.5 rounded-lg bg-red-500/15 border border-red-500/25 text-red-400 text-xs font-semibold hover:bg-red-500/25 transition-colors mb-2"
              >
                Confirm DNC
              </button>
              <button
                onClick={() => { setDropState('open'); setPending(null) }}
                className="w-full py-1 text-[10px] text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors"
              >
                Cancel
              </button>
            </div>
          )}

          {dropState === 'open' && (
            <div className="p-1.5">
              <p className="text-[9px] uppercase tracking-widest text-[var(--text-muted)] px-2 pt-1 pb-1.5">
                Quick Log · {firstName}
              </p>
              {OUTCOMES.map((opt, i) => (
                <div key={opt.outcome}>
                  {DIVIDER_BEFORE.has(i) && (
                    <div className="my-1 mx-2 border-t border-[var(--panel-border)]" />
                  )}
                  <button
                    onClick={() => handleSelect(opt)}
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left text-xs text-[var(--text-secondary)] hover:bg-[var(--panel-border-hover)] hover:text-[var(--text-primary)] transition-colors"
                  >
                    <span className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', opt.dotClass)} />
                    <span className="flex-1">{opt.label}</span>
                    {opt.badge && (
                      <span className={cn('text-[9px] px-1.5 py-0.5 rounded font-semibold flex-shrink-0', opt.badgeClass)}>
                        {opt.badge}
                      </span>
                    )}
                  </button>
                </div>
              ))}
            </div>
          )}

        </div>
      )}
    </div>
  )
}
