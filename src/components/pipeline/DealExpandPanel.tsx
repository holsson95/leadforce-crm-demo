'use client'

import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import type { ContactWithCampaign } from '@/types/models'

interface DealExpandPanelProps {
  contactId: string
  notes:     string | null
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-0.5">
      {children}
    </p>
  )
}

function FieldValue({ children }: { children: React.ReactNode }) {
  const empty = children === null || children === undefined || children === ''
  return (
    <p className={cn('text-xs', empty ? 'text-[var(--text-muted)]' : 'text-[var(--text-secondary)]')}>
      {empty ? '—' : children}
    </p>
  )
}

export function DealExpandPanel({ contactId, notes }: DealExpandPanelProps) {
  const [contact, setContact] = useState<ContactWithCampaign | null>(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(false)

  useEffect(() => {
    setLoading(true)
    setError(false)
    fetch(`/api/contacts/${contactId}`)
      .then((r) => {
        if (!r.ok) throw new Error()
        return r.json()
      })
      .then(({ data }) => setContact(data))
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [contactId])

  if (loading) {
    return (
      <div className="p-4 space-y-2 border-t border-[var(--panel-border)]">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-4 bg-[var(--panel-border)] rounded animate-pulse" style={{ width: `${60 + i * 10}%` }} />
        ))}
      </div>
    )
  }

  if (error || !contact) {
    return (
      <div className="p-4 border-t border-[var(--panel-border)]">
        <p className="text-xs text-red-400">Failed to load contact info</p>
      </div>
    )
  }

  return (
    <div className="p-4 border-t border-[var(--panel-border)] grid grid-cols-2 gap-x-4 gap-y-2.5">
      <div><FieldLabel>Email</FieldLabel><FieldValue>{contact.email}</FieldValue></div>
      <div><FieldLabel>Job Title</FieldLabel><FieldValue>{contact.jobTitle}</FieldValue></div>
      <div><FieldLabel>Mobile</FieldLabel><FieldValue>{contact.mobilePhone}</FieldValue></div>
      <div><FieldLabel>Office</FieldLabel><FieldValue>{contact.corporatePhone}</FieldValue></div>
      <div><FieldLabel>Industry</FieldLabel><FieldValue>{contact.industry}</FieldValue></div>
      <div><FieldLabel>Employees</FieldLabel><FieldValue>{contact.employeeCount?.toLocaleString()}</FieldValue></div>
      {contact.website && (
        <div className="col-span-2">
          <FieldLabel>Website</FieldLabel>
          <a
            href={contact.website.startsWith('http') ? contact.website : `https://${contact.website}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-[var(--lf-accent)] hover:underline truncate block"
          >
            {contact.website}
          </a>
        </div>
      )}
      {contact.linkedinUrl && (
        <div className="col-span-2">
          <FieldLabel>LinkedIn</FieldLabel>
          <a
            href={contact.linkedinUrl.startsWith('http') ? contact.linkedinUrl : `https://${contact.linkedinUrl}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-[var(--lf-accent)] hover:underline truncate block"
          >
            {contact.linkedinUrl}
          </a>
        </div>
      )}
      <div><FieldLabel>City</FieldLabel><FieldValue>{contact.city}</FieldValue></div>
      <div><FieldLabel>Country</FieldLabel><FieldValue>{contact.country}</FieldValue></div>
      {notes && (
        <div className="col-span-2 mt-1 pt-2 border-t border-[var(--panel-border)]">
          <FieldLabel>Notes</FieldLabel>
          <p className="text-xs text-[var(--text-secondary)] whitespace-pre-wrap">{notes}</p>
        </div>
      )}
    </div>
  )
}
