'use client'

import { useEffect, useState } from 'react'
import { MessageSquare, Plus, Pencil, Trash2 } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { CallOutcome } from '@prisma/client'
import { OUTCOME_LABEL, OUTCOME_COLOR, TEXT_CLASS } from './outcome-colors'
import { DispositionForm } from './DispositionForm'
import type { PipelineAction } from './DispositionForm'
import { useDialerStore } from '@/stores/dialer-store'
import { cn } from '@/lib/utils'

type ModalTab  = 'note' | 'outcome'
type NoteEntry = {
  id:         string
  type:       'call' | 'note'
  callerName: string
  createdAt:  string
  outcome:    CallOutcome | null
  content:    string
}
type PendingNote = { id: string; content: string }

interface ContactNotesModalProps {
  contactId:            string
  contactName:          string
  open:                 boolean
  onClose:              () => void
  hideOutcome?:         boolean
  onNoteSaved?:         () => void
  deferSave?:           boolean
  pendingNotes?:        PendingNote[]
  onStageNote?:         (content: string) => void
  onUpdatePendingNote?: (id: string, content: string) => void
  onDeletePendingNote?: (id: string) => void
}

export function ContactNotesModal({
  contactId,
  contactName,
  open,
  onClose,
  hideOutcome = false,
  onNoteSaved,
  deferSave = false,
  pendingNotes = [],
  onStageNote,
  onUpdatePendingNote,
  onDeletePendingNote,
}: ContactNotesModalProps) {
  const logManualOutcome = useDialerStore((s) => s.logManualOutcome)
  const campaignId       = useDialerStore((s) => s.campaignId)

  const [entries,          setEntries]          = useState<NoteEntry[]>([])
  const [loading,          setLoading]          = useState(false)
  const [fetchError,       setFetchError]       = useState(false)
  const [tab,              setTab]              = useState<ModalTab>('note')
  const [noteText,         setNoteText]         = useState('')
  const [editingPendingId, setEditingPendingId] = useState<string | null>(null)
  const [submitting,       setSubmitting]       = useState(false)
  const [saveError,        setSaveError]        = useState(false)
  const [outcomeLoading,   setOutcomeLoading]   = useState(false)

  useEffect(() => {
    if (!open) return
    setLoading(true)
    setFetchError(false)
    setTab('note')
    setNoteText('')
    setEditingPendingId(null)
    fetch(`/api/contacts/${contactId}/notes`)
      .then((r) => {
        if (!r.ok) { setFetchError(true); return null }
        return r.json()
      })
      .then((json) => { if (json) setEntries(json.data ?? []) })
      .finally(() => setLoading(false))
  }, [open, contactId])

  const handleAddNote = async () => {
    if (!noteText.trim()) return

    if (deferSave) {
      if (editingPendingId) {
        onUpdatePendingNote?.(editingPendingId, noteText.trim())
      } else {
        onStageNote?.(noteText.trim())
      }
      setNoteText('')
      setEditingPendingId(null)
      return
    }

    setSaveError(false)
    setSubmitting(true)
    try {
      const res = await fetch(`/api/contacts/${contactId}/notes`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ content: noteText.trim() }),
      })
      if (!res.ok) { setSaveError(true); return }
      const { data } = await res.json()
      const newEntry: NoteEntry = {
        id:         data.id,
        type:       'note',
        callerName: 'You',
        createdAt:  new Date().toISOString(),
        outcome:    null,
        content:    noteText.trim(),
      }
      setEntries((prev) => [newEntry, ...prev])
      setNoteText('')
      onNoteSaved?.()
    } finally {
      setSubmitting(false)
    }
  }

  const handleEditPending = (note: PendingNote) => {
    setNoteText(note.content)
    setEditingPendingId(note.id)
  }

  const handleDeletePending = (id: string) => {
    if (!confirm('Delete this note?')) return
    onDeletePendingNote?.(id)
    if (editingPendingId === id) {
      setNoteText('')
      setEditingPendingId(null)
    }
  }

  const handleLogOutcome = async (outcome: CallOutcome, notes: string, pipeline?: PipelineAction) => {
    setOutcomeLoading(true)
    try {
      await logManualOutcome(contactId, outcome, notes, pipeline)
      onClose()
    } finally {
      setOutcomeLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="bg-[var(--card-bg)] border-[var(--panel-border)] rounded-3xl max-w-lg w-full max-h-[80vh] flex flex-col gap-0 p-0 overflow-hidden">
        <DialogHeader className="p-5 pb-4 border-b border-[var(--panel-border)] flex-shrink-0">
          <DialogTitle className="text-base font-semibold text-[var(--text-primary)] flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-[var(--lf-accent)]" />
            {contactName} — Call Notes
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto min-h-0">
          {deferSave && pendingNotes.length > 0 && (
            <ul className="divide-y divide-[var(--panel-border)] border-b border-[var(--panel-border)]">
              {pendingNotes.map((note) => (
                <li key={note.id} className="px-5 py-3.5 bg-white/[0.02]">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-[var(--panel-border)] text-[var(--lf-accent)]">
                        Draft
                      </span>
                      <p className="text-sm text-[var(--text-secondary)] mt-1">{note.content}</p>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        type="button"
                        onClick={() => handleEditPending(note)}
                        aria-label="Edit note"
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--panel-border-hover)] transition-colors duration-150"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeletePending(note.id)}
                        aria-label="Delete note"
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--text-secondary)] hover:text-red-400 hover:bg-red-500/10 transition-colors duration-150"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <p className="text-sm text-[var(--text-muted)]">Loading…</p>
            </div>
          ) : fetchError ? (
            <div className="flex items-center justify-center py-12">
              <p className="text-sm text-red-400">Failed to load notes. Check your connection.</p>
            </div>
          ) : entries.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <p className="text-sm text-[var(--text-muted)]">No calls or notes yet</p>
            </div>
          ) : (
            <ul className="divide-y divide-[var(--panel-border)]">
              {entries.map((entry) => {
                const date = new Date(entry.createdAt).toLocaleString('en-GB', {
                  day: '2-digit', month: 'short', year: '2-digit',
                  hour: '2-digit', minute: '2-digit',
                })
                return (
                  <li key={entry.id} className="px-5 py-3.5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-semibold text-[var(--text-primary)]">{entry.callerName}</span>
                          {entry.outcome && (
                            <span className={cn(
                              'text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-[var(--panel-border)]',
                              TEXT_CLASS[OUTCOME_COLOR[entry.outcome]],
                            )}>
                              {OUTCOME_LABEL[entry.outcome]}
                            </span>
                          )}
                          {entry.type === 'note' && (
                            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-[var(--panel-border)] text-[var(--text-secondary)]">
                              Note
                            </span>
                          )}
                        </div>
                        {entry.content && (
                          <p className="text-sm text-[var(--text-secondary)] mt-1">{entry.content}</p>
                        )}
                        {!entry.content && entry.type === 'call' && (
                          <p className="text-sm text-[var(--text-muted)] mt-1 italic">No notes</p>
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

        <div className="border-t border-[var(--panel-border)] flex-shrink-0">
          {!hideOutcome && (
            <div className="flex gap-1 p-3 pb-0">
              <button
                onClick={() => setTab('note')}
                className={cn(
                  'flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors',
                  tab === 'note' ? 'bg-[var(--panel-border)] text-[var(--text-primary)]' : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]',
                )}
              >
                Add Note
              </button>
              <button
                onClick={() => setTab('outcome')}
                className={cn(
                  'flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors',
                  tab === 'outcome' ? 'bg-[var(--panel-border)] text-[var(--text-primary)]' : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]',
                )}
              >
                Log Outcome
              </button>
            </div>
          )}

          {(tab === 'note' || hideOutcome) ? (
            <div className="p-4 space-y-2">
              <textarea
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                placeholder="Add a note…"
                rows={2}
                className="w-full bg-[var(--panel-border)] border border-[var(--panel-border)] rounded-xl px-3 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] resize-none focus:outline-none focus:border-[var(--lf-accent)]/50 focus:ring-1 focus:ring-[var(--lf-accent)]/10"
              />
              {saveError && (
                <p className="text-xs text-red-400">Failed to save note. Try again.</p>
              )}
              <div className="flex gap-2">
                {editingPendingId && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => { setNoteText(''); setEditingPendingId(null) }}
                    className="flex-1 rounded-xl"
                  >
                    Cancel
                  </Button>
                )}
                <Button
                  onClick={handleAddNote}
                  disabled={!noteText.trim() || submitting}
                  className={cn(
                    'bg-[var(--panel-border)] border border-[var(--panel-border)] text-[var(--text-secondary)] rounded-xl hover:bg-[var(--panel-border-hover)] disabled:opacity-40',
                    editingPendingId ? 'flex-1' : 'w-full'
                  )}
                >
                  {editingPendingId ? (
                    'Update Note'
                  ) : (
                    <>
                      <Plus className="w-3.5 h-3.5 mr-1.5" />
                      {submitting ? 'Saving…' : 'Add Note'}
                    </>
                  )}
                </Button>
              </div>
            </div>
          ) : (
            <div className="p-4">
              <DispositionForm campaignId={campaignId} onSubmit={handleLogOutcome} loading={outcomeLoading} />
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
