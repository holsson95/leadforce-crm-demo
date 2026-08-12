'use client'

import { useState } from 'react'
import { CircleX, CircleDashed, ArrowRight, Pencil, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useDialerStore } from '@/stores/dialer-store'
import type { CallOutcome } from '@prisma/client'
import type { ContactSummary } from '@/types/models'
import { OutcomeSearchDropdown } from './OutcomeSearchDropdown'
import { OUTCOME_LABEL } from './outcome-colors'

interface ProfileActionBarProps {
  contact:            ContactSummary
  onNext:             () => void
  confirmed:          { outcome: CallOutcome; notes: string } | null
  onOutcomeChosen:    (outcome: CallOutcome) => void
  onEditDraft?:       () => void
  onDeleteDraft?:     () => void
}

interface IconButtonProps {
  icon:        React.ReactNode
  label:       string
  tooltip:     string
  onClick?:    () => void
  disabled?:   boolean
  highlighted?: 'noAnswer'
  children?:   React.ReactNode
}

function IconButton({
  icon,
  label,
  tooltip,
  onClick,
  disabled,
  highlighted,
  children,
}: IconButtonProps) {
  const circleStyle: React.CSSProperties =
    highlighted === 'noAnswer'
      ? { background: '#3a2118', border: '1.5px solid #d98a5f' }
      : { background: 'transparent', border: '1.5px solid rgba(255,255,255,0.1)' }

  const iconColor =
    disabled && !highlighted
      ? '#4a4535'
      : highlighted === 'noAnswer'
      ? '#e08a7c'
      : 'var(--text-secondary)'

  const labelColor =
    disabled && !highlighted
      ? '#4a4535'
      : highlighted
      ? iconColor
      : 'var(--text-secondary)'

  return (
    <div className="relative flex flex-col items-center gap-1">
      <button
        type="button"
        title={tooltip}
        onClick={disabled ? undefined : onClick}
        disabled={disabled}
        style={{ ...circleStyle, width: 52, height: 52, borderRadius: '50%', color: iconColor }}
        className={cn(
          'flex items-center justify-center transition-all',
          disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:brightness-110',
        )}
      >
        {icon}
      </button>

      <span className="text-[10px]" style={{ color: labelColor }}>
        {label}
      </span>

      {/* Dropdown slot (OutcomeSearchDropdown) */}
      {children}
    </div>
  )
}

export function ProfileActionBar({
  contact,
  onNext,
  confirmed,
  onOutcomeChosen,
  onEditDraft,
  onDeleteDraft,
}: ProfileActionBarProps) {
  const logManualOutcome = useDialerStore((s) => s.logManualOutcome)

  const [noAnswerSelected, setNoAnswerSelected] = useState(false)
  const [outcomeDropOpen,  setOutcomeDropOpen]  = useState(false)
  const [loading,          setLoading]          = useState(false)

  /* ── No Answer ─────────────────────────────────────────────── */
  const handleNoAnswer = async () => {
    if (loading) return

    if (noAnswerSelected) {
      // Toggle off — deselect without logging again
      setNoAnswerSelected(false)
      return
    }

    setLoading(true)
    try {
      await logManualOutcome(contact.id, 'no_answer' as CallOutcome, '')
      setNoAnswerSelected(true)
    } finally {
      setLoading(false)
    }
  }

  /* ── Outcome ────────────────────────────────────────────────── */
  const handleOutcomeSelect = (outcome: CallOutcome) => {
    setOutcomeDropOpen(false)
    onOutcomeChosen(outcome)
  }

  /* ── Delete draft ──────────────────────────────────────────── */
  const handleDeleteDraft = () => {
    if (!confirm('Discard this outcome? Nothing has been saved yet.')) return
    onDeleteDraft?.()
  }

  const outcomeDisabled = noAnswerSelected || loading

  if (confirmed) {
    return (
      <div className="flex flex-col gap-3 pt-4 border-t border-[var(--panel-border-hover)]">
        <div
          className="flex items-start justify-between gap-3"
          style={{ background: '#16281f', border: '0.5px solid #234534', borderRadius: 12, padding: '10px 12px' }}
        >
          <div className="flex flex-col gap-1 min-w-0">
            <span style={{ color: '#7dd6ab', fontSize: 11, fontWeight: 600 }}>
              Logged: {OUTCOME_LABEL[confirmed.outcome]}
            </span>
            {confirmed.notes && (
              <span style={{ color: 'var(--text-secondary)', fontSize: 11 }}>
                {confirmed.notes}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            {onEditDraft && (
              <button
                type="button"
                onClick={onEditDraft}
                aria-label="Edit outcome"
                className="w-7 h-7 rounded-lg flex items-center justify-center text-[#7dd6ab] hover:text-[var(--text-primary)] hover:bg-white/10 transition-colors duration-150"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
            )}
            {onDeleteDraft && (
              <button
                type="button"
                onClick={handleDeleteDraft}
                aria-label="Delete outcome"
                className="w-7 h-7 rounded-lg flex items-center justify-center text-[#7dd6ab] hover:text-red-400 hover:bg-red-500/10 transition-colors duration-150"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onNext}
            className="flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold transition-opacity"
            style={{ background: 'var(--lf-accent)', color: 'var(--bg-dark)' }}
          >
            Next
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3 pt-4 border-t border-[var(--panel-border-hover)]">
      {/* Status chip — shown when No Answer is selected */}
      {noAnswerSelected && (
        <div
          style={{
            background:   '#2b201a',
            border:       '0.5px solid #3d2c22',
            borderRadius: 9999,
            padding:      '6px 10px',
          }}
        >
          <span style={{ color: '#d98a5f', fontSize: 11 }}>
            Marked as No Answer — outcome not required
          </span>
        </div>
      )}

      {/* Button row */}
      <div className="flex items-center gap-3">
        {/* Left group: No Answer + Outcome */}
        <div className="flex items-end gap-4">
          {/* No Answer */}
          <IconButton
            icon={<CircleX className="w-5 h-5" />}
            label="No Answer"
            tooltip="Mark as No Answer — no outcome required"
            onClick={handleNoAnswer}
            disabled={loading}
            highlighted={noAnswerSelected ? 'noAnswer' : undefined}
          />

          {/* Outcome */}
          <IconButton
            icon={<CircleDashed className="w-5 h-5" />}
            label="Outcome"
            tooltip="Log a call outcome"
            onClick={() => {
              if (!outcomeDisabled) setOutcomeDropOpen((v) => !v)
            }}
            disabled={outcomeDisabled}
          >
            {outcomeDropOpen && (
              <OutcomeSearchDropdown
                onSelect={handleOutcomeSelect}
                onClose={() => setOutcomeDropOpen(false)}
              />
            )}
          </IconButton>
        </div>

        {/* Divider */}
        <div className="w-px h-8 mx-2" style={{ background: 'var(--panel-border-hover)' }} />

        {/* Next */}
        <button
          type="button"
          onClick={onNext}
          disabled={loading}
          className="flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold transition-opacity disabled:opacity-50"
          style={{ background: 'var(--lf-accent)', color: 'var(--bg-dark)' }}
        >
          Next
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
