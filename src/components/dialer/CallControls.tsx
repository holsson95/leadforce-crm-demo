'use client'

import { useEffect, useRef, useState } from 'react'
import { Phone, PhoneOff, X, Copy, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useDialerStore } from '@/stores/dialer-store'
import { DispositionForm } from './DispositionForm'
import type { PipelineAction } from './DispositionForm'
import { cn } from '@/lib/utils'
import type { CallOutcome } from '@prisma/client'

function CopyPhoneButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={(e) => {
        e.stopPropagation()
        navigator.clipboard.writeText(value)
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      }}
      className="opacity-0 group-hover/phone:opacity-100 transition-opacity text-[var(--text-muted)] hover:text-[var(--lf-accent)]"
      title="Copy number"
    >
      {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
    </button>
  )
}

function formatTime(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = totalSeconds % 60
  return [h, m, s].map((v) => String(v).padStart(2, '0')).join(':')
}

export function CallControls() {
  const {
    campaignId,
    currentContact,
    callStatus,
    elapsedSeconds,
    sessionId,
    startCall,
    endCall,
    logOutcome,
    tickTimer,
  } = useDialerStore()

  const sessionTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const callStartRef    = useRef<number | null>(null)
  const [logLoading, setLogLoading] = useState(false)

  useEffect(() => {
    if (sessionId) {
      sessionTimerRef.current = setInterval(tickTimer, 1000)
    } else {
      if (sessionTimerRef.current) clearInterval(sessionTimerRef.current)
    }
    return () => {
      if (sessionTimerRef.current) clearInterval(sessionTimerRef.current)
    }
  }, [sessionId, tickTimer])

  useEffect(() => {
    if (callStatus === 'connected') {
      callStartRef.current = Date.now()
    }
    if (callStatus === 'idle') {
      callStartRef.current = null
    }
  }, [callStatus])

  useEffect(() => {
    const endSession = () => {
      const { sessionId } = useDialerStore.getState()
      if (sessionId) {
        navigator.sendBeacon(
          '/api/dialer/session/end',
          new Blob([JSON.stringify({ sessionId })], { type: 'application/json' })
        )
      }
    }
    window.addEventListener('beforeunload', endSession)
    return () => {
      window.removeEventListener('beforeunload', endSession)
      endSession()
    }
  }, [])

  const handleEndCall = async () => {
    const durationSecs = callStartRef.current
      ? Math.floor((Date.now() - callStartRef.current) / 1000)
      : 0
    await endCall(durationSecs)
  }

  const handleLogOutcome = async (outcome: CallOutcome, notes: string, pipeline?: PipelineAction) => {
    setLogLoading(true)
    try {
      await logOutcome(outcome, notes, pipeline)
    } finally {
      setLogLoading(false)
    }
  }

  return (
    <div className="glass-panel rounded-3xl flex-1 flex flex-col overflow-hidden">
      {/* Session timer */}
      <div className="flex justify-end p-5 pb-0 flex-shrink-0">
        {sessionId && (
          <div className="text-right">
            <p className="font-mono text-lg font-semibold text-[var(--lf-accent)]">
              {formatTime(elapsedSeconds)}
            </p>
            <p className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">Session active</p>
          </div>
        )}
      </div>

      {/* Main content area */}
      {!currentContact ? (
        <div className="flex-1 flex flex-col items-center justify-center p-8">
          <Phone className="w-12 h-12 mx-auto mb-4 text-[var(--text-muted)]" />
          <p className="text-sm text-[var(--text-muted)]">Select a campaign and contact to begin</p>
        </div>
      ) : callStatus === 'ended' ? (
        /* Compact layout: slim contact badge + full disposition form */
        <div className="flex-1 flex flex-col p-5 gap-4 min-h-0 overflow-y-auto">
          <div className="flex items-center gap-3 flex-shrink-0">
            <div className="w-9 h-9 rounded-full bg-[var(--panel-border)] flex items-center justify-center text-sm font-bold text-[var(--text-primary)] flex-shrink-0">
              {currentContact.firstName[0]}{currentContact.lastName[0]}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-[var(--text-primary)] truncate">
                {currentContact.firstName} {currentContact.lastName}
              </p>
              {currentContact.companyName && (
                <p className="text-xs text-[var(--text-muted)] truncate">{currentContact.companyName}</p>
              )}
            </div>
          </div>
          <DispositionForm campaignId={campaignId} onSubmit={handleLogOutcome} loading={logLoading} />
        </div>
      ) : (
        /* Normal calling states: centered big avatar + action button */
        <div className="flex-1 flex flex-col items-center justify-center p-8 space-y-8">
          <div className="text-center space-y-2">
            <div className={cn(
              'w-20 h-20 rounded-full mx-auto flex items-center justify-center text-2xl font-bold transition-all duration-300 bg-[var(--panel-border)] text-[var(--text-primary)]',
              callStatus === 'ringing'   && 'ring-4 ring-[var(--lf-accent)]/60 ring-offset-4 ring-offset-[var(--bg-dark)] animate-pulse',
              callStatus === 'connected' && 'ring-4 ring-emerald-500/60 ring-offset-4 ring-offset-[var(--bg-dark)]',
            )}>
              {currentContact.firstName[0]}{currentContact.lastName[0]}
            </div>
            <h2 className="text-xl font-semibold text-[var(--text-primary)]">
              {currentContact.firstName} {currentContact.lastName}
            </h2>
            {currentContact.companyName && (
              <p className="text-sm text-[var(--text-secondary)]">{currentContact.companyName}</p>
            )}
            {currentContact.mobilePhone && (
              <div className="flex items-center justify-center gap-1 group/phone">
                <p className="font-mono text-sm text-[var(--text-secondary)]">{currentContact.mobilePhone}</p>
                <CopyPhoneButton value={currentContact.mobilePhone} />
              </div>
            )}
          </div>

          {callStatus === 'ringing' && (
            <p className="text-sm text-[var(--lf-accent)] animate-pulse">Ringing…</p>
          )}
          {callStatus === 'connected' && (
            <p className="text-sm text-emerald-400">● Connected</p>
          )}

          {callStatus === 'idle' && (
            <Button
              onClick={() => startCall()}
              className="w-full max-w-xs bg-gradient-to-r from-[var(--lf-accent)] to-amber-600 text-black font-semibold rounded-2xl h-14 text-base hover:opacity-90 shadow-xl shadow-[var(--lf-accent)]/20"
            >
              <Phone className="w-5 h-5 mr-2" />
              Start Call
            </Button>
          )}

          {callStatus === 'ringing' && (
            <Button
              onClick={handleEndCall}
              className="w-full max-w-xs bg-[var(--panel-border)] border border-[var(--panel-border)] text-[var(--text-secondary)] rounded-2xl h-14 text-base hover:bg-[var(--panel-border-hover)]"
            >
              <X className="w-5 h-5 mr-2" />
              Cancel
            </Button>
          )}

          {callStatus === 'connected' && (
            <Button
              onClick={handleEndCall}
              className="w-full max-w-xs bg-red-500/10 border border-red-500/20 text-red-400 rounded-2xl h-14 text-base hover:bg-red-500/20"
            >
              <PhoneOff className="w-5 h-5 mr-2" />
              End Call
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
