'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { CallOutcome } from '@prisma/client'
import { OUTCOME_COLOR, OUTCOME_LABEL, DOT_CLASS } from './outcome-colors'
import { PIPELINE_ELIGIBLE_OUTCOMES, notesRequiredFor } from '@/lib/outcome-router'
import { cn } from '@/lib/utils'

const OUTCOME_OPTIONS: CallOutcome[] = [
  CallOutcome.connected,
  CallOutcome.not_interested,
  CallOutcome.lead,
  CallOutcome.meeting_booked,
  CallOutcome.left_voicemail,
  CallOutcome.bad_time_to_speak,
  CallOutcome.in_a_meeting,
  CallOutcome.call_back_later,
  CallOutcome.on_holiday,
  CallOutcome.hung_up,
  CallOutcome.does_not_take_cold_calls,
  CallOutcome.not_relevant_contact,
  CallOutcome.ai_assistant,
  CallOutcome.voicemail,
  CallOutcome.no_answer,
  CallOutcome.line_engaged,
  CallOutcome.wrong_number,
  CallOutcome.mobile_switched_off,
  CallOutcome.foreign_dial_tone,
  CallOutcome.not_available,
  CallOutcome.other,
]

type PipelineStage = { id: string; name: string; color: string }

export interface PipelineAction {
  stageId:    string | null   // null = queue for later
  addToQueue: boolean
  clientId:   string
}

interface DispositionFormProps {
  campaignId:       string | null
  onSubmit:         (outcome: CallOutcome, notes: string, pipeline?: PipelineAction) => Promise<void>
  loading:          boolean
  initialOutcome?:  CallOutcome
  lockOutcome?:     boolean
  onChangeOutcome?: () => void
  onCancel?:        () => void
  initialNotes?:    string
  initialPipeline?: PipelineAction
}

const QUEUE_FOR_LATER = '__queue__'

export function DispositionForm({
  campaignId,
  onSubmit,
  loading,
  initialOutcome,
  lockOutcome,
  onChangeOutcome,
  onCancel,
  initialNotes,
  initialPipeline,
}: DispositionFormProps) {
  const [outcome,        setOutcome]        = useState<CallOutcome | ''>(initialOutcome ?? '')
  const [notes,          setNotes]          = useState(initialNotes ?? '')
  const [addToPipeline,  setAddToPipeline]  = useState(initialPipeline != null)
  const [selectedStage,  setSelectedStage]  = useState(
    initialPipeline == null
      ? ''
      : initialPipeline.addToQueue
        ? QUEUE_FOR_LATER
        : (initialPipeline.stageId ?? '')
  )
  const [stages,         setStages]         = useState<PipelineStage[]>([])
  const [clientId,       setClientId]       = useState<string | null>(initialPipeline?.clientId ?? null)
  const [stagesLoading,  setStagesLoading]  = useState(false)
  const [stagesError,    setStagesError]    = useState(false)

  const showPipelineSection = campaignId !== null && outcome !== '' && PIPELINE_ELIGIBLE_OUTCOMES.has(outcome as CallOutcome)
  const notesRequired       = outcome !== '' && notesRequiredFor(outcome as CallOutcome)

  useEffect(() => {
    if (!showPipelineSection) {
      setAddToPipeline(false)
      setSelectedStage('')
    }
  }, [showPipelineSection])

  useEffect(() => {
    if (!addToPipeline || !campaignId) return
    setStagesLoading(true)
    setStagesError(false)
    fetch(`/api/dialer/pipeline-stages?campaignId=${campaignId}`)
      .then((r) => r.json())
      .then(({ data }) => {
        setStages(data.stages ?? [])
        setClientId(data.clientId ?? null)
      })
      .catch(() => setStagesError(true))
      .finally(() => setStagesLoading(false))
  }, [addToPipeline, campaignId])

  const handleSubmit = async () => {
    if (!outcome) return
    if (notesRequired && !notes.trim()) return

    let pipelineAction: PipelineAction | undefined
    if (addToPipeline && clientId && selectedStage) {
      if (selectedStage === QUEUE_FOR_LATER) {
        pipelineAction = { stageId: null, addToQueue: true, clientId }
      } else {
        pipelineAction = { stageId: selectedStage, addToQueue: false, clientId }
      }
    }

    await onSubmit(outcome as CallOutcome, notes, pipelineAction)
    setOutcome('')
    setNotes('')
    setAddToPipeline(false)
    setSelectedStage('')
  }

  const submitDisabled =
    !outcome ||
    loading ||
    (notesRequired && !notes.trim()) ||
    (addToPipeline && !selectedStage) ||
    (addToPipeline && stagesLoading)

  return (
    <div className="space-y-4 w-full animate-in slide-in-from-bottom-4 duration-300">
      {/* Outcome select or locked pill */}
      {lockOutcome ? (
        <div className="space-y-1.5">
          <Label className="text-xs text-[var(--text-secondary)]">Outcome</Label>
          <div className="flex items-center justify-between bg-[var(--panel-border)] border border-[var(--panel-border)] rounded-xl px-3 py-2.5">
            <span className="flex items-center gap-2 text-sm text-[var(--text-primary)]">
              {outcome !== '' && (
                <>
                  <span className={cn('w-2 h-2 rounded-full flex-shrink-0', DOT_CLASS[OUTCOME_COLOR[outcome as CallOutcome]])} />
                  {OUTCOME_LABEL[outcome as CallOutcome]}
                </>
              )}
            </span>
            {onChangeOutcome && (
              <button
                type="button"
                onClick={onChangeOutcome}
                className="text-xs text-[var(--lf-accent)] hover:underline"
              >
                Change
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-1.5">
          <Label className="text-xs text-[var(--text-secondary)]">Outcome *</Label>
          <Select
            value={outcome}
            onValueChange={(v) => {
              setOutcome((v ?? '') as CallOutcome | '')
              setAddToPipeline(false)
              setSelectedStage('')
            }}
          >
            <SelectTrigger className="bg-[var(--panel-border)] border-[var(--panel-border)] text-[var(--text-primary)] rounded-xl">
              <SelectValue>
                {(v: string | null) => {
                  if (!v) return <span className="text-[var(--text-muted)]">Select outcome…</span>
                  const color = OUTCOME_COLOR[v as CallOutcome]
                  return (
                    <span className="flex items-center gap-2">
                      <span className={cn('w-2 h-2 rounded-full flex-shrink-0', DOT_CLASS[color])} />
                      {OUTCOME_LABEL[v as CallOutcome]}
                    </span>
                  )
                }}
              </SelectValue>
            </SelectTrigger>
            <SelectContent className="rounded-xl border-[var(--panel-border)] bg-[var(--card-bg)] max-h-72 overflow-y-auto">
              {OUTCOME_OPTIONS.map((value) => {
                const color = OUTCOME_COLOR[value]
                return (
                  <SelectItem
                    key={value}
                    value={value}
                    className="text-[var(--text-secondary)] focus:bg-[var(--panel-border-hover)] focus:text-[var(--text-primary)] rounded-lg"
                  >
                    <span className="flex items-center gap-2">
                      <span className={cn('w-2 h-2 rounded-full flex-shrink-0', DOT_CLASS[color])} />
                      {OUTCOME_LABEL[value]}
                    </span>
                  </SelectItem>
                )
              })}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Notes */}
      <div className="space-y-1.5">
        <Label className="text-xs text-[var(--text-secondary)]">
          Notes {notesRequired && <span className="text-red-400">*</span>}
        </Label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder={notesRequiredFor(outcome as CallOutcome) ? 'Notes required for this outcome…' : 'Optional notes…'}
          rows={3}
          className="w-full bg-[var(--panel-border)] border border-[var(--panel-border)] rounded-xl px-3 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] resize-none focus:outline-none focus:border-[var(--lf-accent)]/50 focus:ring-1 focus:ring-[var(--lf-accent)]/10"
        />
        {notesRequired && !notes.trim() && (
          <p className="text-[11px] text-red-400">Notes required for this outcome.</p>
        )}
      </div>

      {/* Add to pipeline section */}
      {showPipelineSection && (
        <div className="border border-[var(--panel-border)] rounded-xl p-3 space-y-3 bg-white/[0.02]">
          <div className="flex items-center justify-between">
            <Label className="text-xs text-[var(--text-secondary)] cursor-pointer" htmlFor="pipeline-toggle">
              Add to pipeline
            </Label>
            <button
              id="pipeline-toggle"
              type="button"
              role="switch"
              aria-checked={addToPipeline}
              onClick={() => {
                setAddToPipeline((v) => !v)
                setSelectedStage('')
              }}
              className={cn(
                'relative w-9 h-5 rounded-full flex-shrink-0',
                addToPipeline ? 'bg-[var(--lf-accent)]' : 'bg-[var(--panel-border)]'
              )}
            >
              <span
                className={cn(
                  'absolute top-0.5 left-0 w-4 h-4 bg-white rounded-full shadow',
                  addToPipeline ? 'translate-x-[18px]' : 'translate-x-0.5'
                )}
              />
            </button>
          </div>

          {addToPipeline && (
            <div className="space-y-1.5">
              {stagesLoading ? (
                <div className="h-9 bg-[var(--panel-border)] rounded-xl animate-pulse" />
              ) : stagesError ? (
                <div className="flex items-center justify-between">
                  <p className="text-xs text-red-400">Failed to load stages</p>
                  <button
                    type="button"
                    onClick={() => {
                      setAddToPipeline(false)
                      setTimeout(() => setAddToPipeline(true), 0)
                    }}
                    className="text-xs text-[var(--lf-accent)] hover:underline"
                  >
                    Retry
                  </button>
                </div>
              ) : (
                <Select value={selectedStage} onValueChange={(v) => setSelectedStage(v ?? '')}>
                  <SelectTrigger className="bg-[var(--panel-border)] border-[var(--panel-border)] text-[var(--text-primary)] rounded-xl">
                    <SelectValue>
                      {(v: string | null) => {
                        if (!v) return <span className="text-[var(--text-muted)]">Select stage…</span>
                        if (v === QUEUE_FOR_LATER) return <span className="text-[var(--text-secondary)]">Queue for later</span>
                        const stage = stages.find((s) => s.id === v)
                        return <span className="text-[var(--text-secondary)]">{stage?.name ?? v}</span>
                      }}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent className="rounded-xl border-[var(--panel-border)] bg-[var(--card-bg)]">
                    <SelectItem
                      value={QUEUE_FOR_LATER}
                      className="text-[var(--text-secondary)] focus:bg-[var(--panel-border-hover)] focus:text-[var(--text-primary)] rounded-lg italic"
                    >
                      Queue for later
                    </SelectItem>
                    {stages.map((s) => (
                      <SelectItem
                        key={s.id}
                        value={s.id}
                        className="text-[var(--text-secondary)] focus:bg-[var(--panel-border-hover)] focus:text-[var(--text-primary)] rounded-lg"
                      >
                        <span className="flex items-center gap-2">
                          <span
                            className="w-2 h-2 rounded-full flex-shrink-0"
                            style={{ backgroundColor: s.color }}
                          />
                          {s.name}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}
        </div>
      )}

      <div className="flex gap-2">
        {onCancel && (
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            className="flex-1 rounded-xl"
          >
            Cancel
          </Button>
        )}
        <Button
          type="button"
          onClick={handleSubmit}
          disabled={submitDisabled}
          className={cn(
            'bg-gradient-to-r from-[var(--lf-accent)] to-amber-600 text-black font-semibold rounded-xl hover:opacity-90 disabled:opacity-50',
            onCancel ? 'flex-1' : 'w-full'
          )}
        >
          {loading ? 'Logging…' : 'Log Outcome'}
        </Button>
      </div>
    </div>
  )
}
