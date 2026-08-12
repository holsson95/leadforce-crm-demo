'use client'

import { useEffect, useRef, useState } from 'react'
import { MapPin, Clock, Copy, Check, ChevronDown, ArrowLeft } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useDialerStore } from '@/stores/dialer-store'
import { getCityTimezone, formatLocalTime } from '@/lib/timezone'
import type { ContactSummary } from '@/types/models'
import type { CallOutcome } from '@prisma/client'
import { ProfileCompanyCard } from './ProfileCompanyCard'
import { ProfileActionBar } from './ProfileActionBar'
import { DispositionForm } from './DispositionForm'
import type { PipelineAction } from './DispositionForm'
import { OUTCOME_LABEL, OUTCOME_COLOR, TEXT_CLASS } from './outcome-colors'
import { resolvePhoneNumber } from '@/lib/dialer-phone-view'

type NoteEntry = {
  id:         string
  type:       'call' | 'note'
  callerName: string
  createdAt:  string
  outcome:    string | null
  content:    string
}
type DraftDisposition = {
  contact:  ContactSummary
  outcome:  CallOutcome
  notes:    string
  pipeline?: PipelineAction
}

interface ProfileViewCardProps {
  contact:       ContactSummary
  totalContacts: number
  campaignId:    string | null
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try { await navigator.clipboard.writeText(value) } catch { /* ignore */ }
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <button onClick={handleCopy} className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors flex-shrink-0">
      {copied
        ? <Check className="w-3 h-3 text-emerald-400" />
        : <Copy className="w-3 h-3" />
      }
    </button>
  )
}

function ContactInfoCard({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div
      className="flex flex-col gap-1 rounded-[10px] px-[14px] py-3"
      style={{ background: 'var(--card-bg-solid)', border: '0.5px solid var(--panel-border-hover)' }}
    >
      <p className="text-[11px] text-[var(--text-muted)]">{label}</p>
      <div className="flex items-center justify-between gap-2">
        <p className={cn('text-[14px] text-[var(--text-primary)] truncate', mono && 'font-mono')}>{value}</p>
        <CopyButton value={value} />
      </div>
    </div>
  )
}

export function ProfileViewCard({ contact, totalContacts, campaignId }: ProfileViewCardProps) {
  const { setCallingView, advanceProfile, logManualOutcome, calledToday, phoneNumberView } = useDialerStore()

  const [localTime,     setLocalTime]     = useState<string | null>(null)
  const [noteEntries,   setNoteEntries]   = useState<NoteEntry[] | null>(null)
  const [activityOpen,  setActivityOpen]  = useState(false)

  // Outcome chosen from the action bar's search dropdown, awaiting notes/pipeline before it's staged
  const [pendingOutcome, setPendingOutcome] = useState<CallOutcome | null>(null)
  // The staged (unsaved) disposition — keeps the same contact on screen until Next flushes it
  const [draftDisposition, setDraftDisposition] = useState<DraftDisposition | null>(null)

  const displayContact = draftDisposition?.contact ?? contact

  // Per-contact notes cache: keyed by contact id
  const notesCacheRef = useRef<Record<string, NoteEntry[]>>({})
  const intervalRef   = useRef<ReturnType<typeof setInterval> | null>(null)

  const fullName    = `${displayContact.firstName} ${displayContact.lastName}`
  const linkedinHref = displayContact.linkedinUrl
    ? (displayContact.linkedinUrl.startsWith('http') ? displayContact.linkedinUrl : `https://${displayContact.linkedinUrl}`)
    : null
  const locationLabel = [displayContact.city, displayContact.country].filter(Boolean).join(', ')
  const phoneValue = resolvePhoneNumber(displayContact, phoneNumberView)
  const phoneLabel = phoneNumberView === 'corporate' ? 'Corporate' : 'Mobile'

  // Live local time — recompute when contact.city / country changes
  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current)
    setLocalTime(null)

    if (!displayContact.city) return
    const tz = getCityTimezone(displayContact.city, displayContact.country)
    if (!tz) return

    const tick = () => setLocalTime(formatLocalTime(tz))
    tick()
    intervalRef.current = setInterval(tick, 60_000)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [displayContact.city, displayContact.country])

  // Reset per-contact state when the displayed contact changes
  useEffect(() => {
    setActivityOpen(false)

    // Check cache first
    const cached = notesCacheRef.current[displayContact.id]
    if (cached) {
      setNoteEntries(cached)
      return
    }

    // Fetch fresh
    setNoteEntries(null)
    fetch(`/api/contacts/${displayContact.id}/notes`)
      .then((r) => r.json())
      .then(({ data }) => {
        const entries: NoteEntry[] = data ?? []
        notesCacheRef.current[displayContact.id] = entries
        setNoteEntries(entries)
      })
      .catch(() => {
        setNoteEntries([])
      })
  }, [displayContact.id])

  const callCount = noteEntries?.filter((e) => e.type === 'call').length ?? 0

  const handleDispositionSubmit = async (outcome: CallOutcome, notes: string, pipeline?: PipelineAction) => {
    setPendingOutcome(null)
    setDraftDisposition({ contact: displayContact, outcome, notes, pipeline })
  }

  const handleEditDraft = () => {
    if (!draftDisposition) return
    setPendingOutcome(draftDisposition.outcome)
  }

  const handleDeleteDraft = () => {
    setDraftDisposition(null)
  }

  const handleNext = async () => {
    const hadDraftDisposition = draftDisposition !== null

    if (draftDisposition) {
      await logManualOutcome(
        draftDisposition.contact.id,
        draftDisposition.outcome,
        draftDisposition.notes,
        draftDisposition.pipeline
      )
      setDraftDisposition(null)

      // logManualOutcome doesn't replenish the local queue the way logOutcome does for
      // list view — top it up here so the profile view doesn't run out of loaded contacts.
      const { queue, currentContact, totalContacts: liveTotal, loadQueue } = useDialerStore.getState()
      const loadedCount = (currentContact ? 1 : 0) + queue.length
      if (loadedCount < 5 && loadedCount < liveTotal) {
        await loadQueue(loadedCount)
      }
    }

    if (!hadDraftDisposition) {
      // The store only shifts the queue as a side effect of logManualOutcome above —
      // if there was no draft disposition to flush, nothing has advanced yet.
      advanceProfile()
    }
  }

  const handleBackToQueue = () => {
    if (draftDisposition) {
      if (!confirm('Discard unsaved outcome for this contact?')) return
    }
    setDraftDisposition(null)
    setCallingView('list')
  }

  return (
    <div className="max-w-[720px] mx-auto w-full px-6 py-6 overflow-y-auto flex flex-col gap-4">

      {/* Top row: back | counter | location */}
      <div className="flex items-start justify-between gap-4">
        <button
          onClick={handleBackToQueue}
          className="flex items-center gap-1 text-[12px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors flex-shrink-0"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Queue
        </button>

        <p className="text-[12px] text-[var(--text-secondary)] flex-shrink-0 pt-0.5">
          Contact {calledToday.length + 1} of {totalContacts + calledToday.length}
        </p>

        {locationLabel ? (
          <div className="flex flex-col items-end gap-1">
            <div
              className="flex items-center gap-1 px-2.5 py-1 rounded-full"
              style={{ background: 'var(--card-bg-solid)', border: '0.5px solid var(--panel-border-hover)' }}
            >
              <MapPin className="w-[10px] h-[10px] text-[var(--lf-accent)] flex-shrink-0" />
              <span className="text-[11px] text-[var(--text-secondary)]">{locationLabel}</span>
            </div>
            {localTime && (
              <div className="flex items-center gap-1">
                <Clock className="w-[10px] h-[10px] text-[var(--text-muted)]" />
                <span className="text-[11px] text-[var(--text-muted)]">{localTime} local</span>
              </div>
            )}
          </div>
        ) : (
          <div className="w-20" />
        )}
      </div>

      {/* Name block */}
      <div className="flex flex-col items-center gap-1 mt-4">
        <div className="flex items-center gap-2">
          <p className="text-[26px] font-semibold text-[var(--text-primary)] leading-tight">
            {fullName}
          </p>
          {linkedinHref && (
            <a
              href={linkedinHref}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center w-6 h-6 rounded-full flex-shrink-0 hover:opacity-80 transition-opacity"
              style={{ background: 'var(--card-bg-solid)', border: '0.5px solid var(--panel-border-hover)' }}
              title="LinkedIn"
            >
              <svg className="w-3.5 h-3.5 text-[var(--lf-accent)]" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.32 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.79M6.88 8.56a1.68 1.68 0 0 0 1.68-1.68c0-.93-.75-1.69-1.68-1.69a1.69 1.69 0 0 0-1.69 1.69c0 .93.76 1.68 1.69 1.68m1.39 9.94v-8.37H5.5v8.37h2.77z"/>
              </svg>
            </a>
          )}
        </div>
        {displayContact.jobTitle && (
          <p className="text-[14px] text-[var(--text-secondary)]">{displayContact.jobTitle}</p>
        )}
      </div>

      {/* Contact info cards */}
      {(phoneValue || displayContact.email) && (
        <div className="grid grid-cols-2 gap-3">
          {phoneValue && (
            <ContactInfoCard label={phoneLabel} value={phoneValue} mono />
          )}
          {displayContact.email && (
            <ContactInfoCard label="Email" value={displayContact.email} />
          )}
        </div>
      )}

      {/* Company card */}
      <ProfileCompanyCard contact={displayContact} />

      {/* Activity section */}
      <div>
        <button
          onClick={() => setActivityOpen((v) => !v)}
          className="w-full flex items-center justify-between rounded-[10px] px-[14px] py-[10px] transition-colors hover:bg-white/[0.02]"
          style={{ background: 'var(--card-bg-solid)', border: '0.5px solid var(--panel-border-hover)' }}
        >
          <span className="text-[12px] text-[var(--text-secondary)]">
            Activity — {callCount} prior attempt{callCount !== 1 ? 's' : ''}
          </span>
          <ChevronDown
            className={cn('w-3.5 h-3.5 text-[var(--text-muted)] transition-transform duration-150', activityOpen && 'rotate-180')}
          />
        </button>

        {activityOpen && (
          <div
            className="mt-1 rounded-[10px] overflow-hidden"
            style={{ border: '0.5px solid var(--panel-border-hover)' }}
          >
            {!noteEntries ? (
              <div className="px-4 py-6 text-center text-[12px] text-[var(--text-muted)]">Loading…</div>
            ) : noteEntries.length === 0 ? (
              <div className="px-4 py-6 text-center text-[12px] text-[var(--text-muted)]">No activity yet</div>
            ) : (
              <ul style={{ background: 'var(--card-bg-solid)' }}>
                {noteEntries.map((entry, i) => {
                  const date = new Date(entry.createdAt).toLocaleString('en-GB', {
                    day: '2-digit', month: 'short', year: '2-digit',
                    hour: '2-digit', minute: '2-digit',
                  })
                  const outcomeKey = entry.outcome as keyof typeof OUTCOME_LABEL | null
                  return (
                    <li
                      key={entry.id}
                      className={cn('px-4 py-3', i < noteEntries.length - 1 && 'border-b')}
                      style={{ borderColor: 'var(--panel-border-hover)' }}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[12px] font-semibold text-[var(--text-primary)]">{entry.callerName}</span>
                            {outcomeKey && OUTCOME_LABEL[outcomeKey] && (
                              <span className={cn(
                                'text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-[var(--panel-border)]',
                                TEXT_CLASS[OUTCOME_COLOR[outcomeKey]],
                              )}>
                                {OUTCOME_LABEL[outcomeKey]}
                              </span>
                            )}
                            {entry.type === 'note' && (
                              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-[var(--panel-border)] text-[var(--text-muted)]">
                                Note
                              </span>
                            )}
                          </div>
                          {entry.content && (
                            <p className="text-[13px] text-[var(--text-secondary)] mt-1">{entry.content}</p>
                          )}
                        </div>
                        <span className="text-[10px] text-[var(--text-muted)] flex-shrink-0 mt-0.5">{date}</span>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        )}
      </div>

      {/* Action bar / disposition form */}
      {pendingOutcome ? (
        <DispositionForm
          campaignId={campaignId}
          initialOutcome={pendingOutcome}
          lockOutcome
          initialNotes={draftDisposition?.notes}
          initialPipeline={draftDisposition?.pipeline}
          onChangeOutcome={() => { setPendingOutcome(null); setDraftDisposition(null) }}
          onCancel={() => setPendingOutcome(null)}
          onSubmit={handleDispositionSubmit}
          loading={false}
        />
      ) : (
        <ProfileActionBar
          key={displayContact.id}
          contact={displayContact}
          onNext={handleNext}
          confirmed={draftDisposition ? { outcome: draftDisposition.outcome, notes: draftDisposition.notes } : null}
          onOutcomeChosen={setPendingOutcome}
          onEditDraft={handleEditDraft}
          onDeleteDraft={handleDeleteDraft}
        />
      )}
    </div>
  )
}
