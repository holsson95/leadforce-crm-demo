'use client'

import { useEffect, useRef, useState } from 'react'
import { Building2, ExternalLink, Sparkles } from 'lucide-react'
import type { ContactSummary } from '@/types/models'

type SummaryStatus = 'idle' | 'loading' | 'generating' | 'ready' | 'failed' | 'unavailable'

interface ProfileCompanyCardProps {
  contact: ContactSummary
}

// AI summaries are formatted as "Label: answer" lines (see src/lib/ai/gemini.ts).
// Older cached summaries are a free-form paragraph — those don't match and fall back to plain text.
function parseSummaryBullets(summary: string | null): { label: string; answer: string }[] | null {
  if (!summary) return null
  const lines = summary.split('\n').map((l) => l.trim()).filter(Boolean)
  if (!lines.length) return null

  const bullets: { label: string; answer: string }[] = []
  for (const line of lines) {
    const match = /^(.+?):\s*(.+)$/.exec(line)
    if (!match) return null
    bullets.push({ label: match[1], answer: match[2] })
  }
  return bullets
}

export function ProfileCompanyCard({ contact }: ProfileCompanyCardProps) {
  const [status,  setStatus]  = useState<SummaryStatus>('idle')
  const [summary, setSummary] = useState<string | null>(null)
  const pollRef               = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (!contact.website) { setStatus('unavailable'); return }
    setStatus('loading')
    setSummary(null)

    let attempts = 0
    const MAX_POLLS = 20

    const fetchSummary = async () => {
      try {
        const res  = await fetch(`/api/contacts/${contact.id}/company-summary`)
        const { data } = await res.json() as { data: { status: string; summary?: string | null } }

        if (data.status === 'ready') {
          setSummary(data.summary ?? null)
          setStatus('ready')
          if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
          return
        }
        if (data.status === 'failed' || data.status === 'unavailable') {
          setStatus(data.status as SummaryStatus)
          if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
          return
        }
        // 'pending' | 'generating' — keep polling
        setStatus('generating')
        attempts++
        if (attempts >= MAX_POLLS) {
          setStatus('failed')
          if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
        }
      } catch {
        setStatus('failed')
        if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
      }
    }

    void fetchSummary()
    // Poll every 3 s while generating
    pollRef.current = setInterval(() => {
      if (status === 'ready' || status === 'failed' || status === 'unavailable') return
      void fetchSummary()
    }, 3000)

    return () => {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
    }
  // Re-run when contact changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contact.id])

  if (!contact.companyName) return null

  const summaryBullets = parseSummaryBullets(summary)

  const websiteHref = contact.website
    ? (contact.website.startsWith('http') ? contact.website : `https://${contact.website}`)
    : null

  return (
    <div
      className="rounded-xl"
      style={{ background: 'var(--card-bg-solid)', border: '0.5px solid var(--panel-border-hover)', padding: '16px 18px' }}
    >
      {/* Header row */}
      <div className="flex items-center gap-2.5">
        {/* Icon square */}
        <div
          className="flex items-center justify-center flex-shrink-0"
          style={{ width: 20, height: 20, background: 'var(--panel-border-hover)', borderRadius: 6 }}
        >
          <Building2 style={{ width: 14, height: 14, color: 'var(--lf-accent)' }} />
        </div>

        {/* Company name */}
        <span
          className="truncate"
          style={{ fontSize: 15, fontWeight: 500, color: 'var(--text-primary)', lineHeight: 1.3 }}
        >
          {contact.companyName}
        </span>

        {/* Employee count */}
        {contact.employeeCount != null && (
          <span
            className="flex-1 text-right"
            style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}
          >
            {contact.employeeCount.toLocaleString()} emp
          </span>
        )}

        {/* Website link */}
        {websiteHref && (
          <a
            href={websiteHref}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-shrink-0 flex items-center hover:opacity-70 transition-opacity"
            aria-label="Open company website"
          >
            <ExternalLink style={{ width: 12, height: 12, color: 'var(--lf-accent)' }} />
          </a>
        )}
      </div>

      {/* Divider */}
      <div style={{ borderTop: '0.5px solid var(--panel-border-hover)', marginTop: 12, marginBottom: 12 }} />

      {/* AI Summary section */}
      <div>
        {/* Label row */}
        <div className="flex items-center gap-1 mb-2">
          <Sparkles style={{ width: 10, height: 10, color: 'var(--text-muted)' }} />
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>AI summary</span>
        </div>

        {/* Loading / generating shimmer */}
        {(status === 'idle' || status === 'loading' || status === 'generating') && (
          <div className="flex flex-col gap-1.5">
            <div
              className="animate-pulse rounded"
              style={{ height: 12, width: '100%', background: 'rgba(255,255,255,0.04)' }}
            />
            <div
              className="animate-pulse rounded"
              style={{ height: 12, width: '100%', background: 'rgba(255,255,255,0.04)' }}
            />
            <div
              className="animate-pulse rounded"
              style={{ height: 8, width: '60%', background: 'rgba(255,255,255,0.04)' }}
            />
          </div>
        )}

        {/* Ready — show summary as labeled bullets, falling back to a plain paragraph */}
        {status === 'ready' && summary && summaryBullets && (
          <ul className="flex flex-col gap-1.5" style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, paddingLeft: 14 }}>
            {summaryBullets.map(({ label, answer }, i) => (
              <li key={i} style={{ listStyleType: 'disc' }}>
                <span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{label}:</span> {answer}
              </li>
            ))}
          </ul>
        )}
        {status === 'ready' && summary && !summaryBullets && (
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{summary}</p>
        )}

        {/* Ready but no summary text (edge case) */}
        {status === 'ready' && !summary && (
          <p style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>Summary unavailable</p>
        )}

        {/* Failed / unavailable */}
        {(status === 'failed' || status === 'unavailable') && (
          <p style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>Summary unavailable</p>
        )}
      </div>
    </div>
  )
}
