'use client'

import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { SlideDrawer } from '@/components/shared/SlideDrawer'
import { ContactExpandPanel } from '@/components/dialer/ContactExpandPanel'
import type { ContactWithCampaign } from '@/types/models'

interface ContactLookupDrawerProps {
  contactId: string | null
  onClose: () => void
}

export function ContactLookupDrawer({ contactId, onClose }: ContactLookupDrawerProps) {
  const [contact, setContact] = useState<ContactWithCampaign | null>(null)
  const [users, setUsers] = useState<{ id: string; name: string }[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (!contactId) {
      setContact(null)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(false)
    Promise.all([
      fetch(`/api/contacts/${contactId}`).then((r) => r.json()),
      fetch('/api/users').then((r) => r.json()),
    ])
      .then(([contactRes, usersRes]) => {
        if (cancelled) return
        if (!contactRes.data) {
          setError(true)
          return
        }
        setContact(contactRes.data)
        setUsers(usersRes.data ?? [])
      })
      .catch(() => { if (!cancelled) setError(true) })
      .finally(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
  }, [contactId])

  const open = contactId !== null
  const title = contact ? `${contact.firstName} ${contact.lastName}` : 'Contact details'

  return (
    <SlideDrawer open={open} onClose={onClose} title={title} hideHeader width="md">
      {loading && (
        <div className="p-6 flex items-center justify-between">
          <span className="text-sm text-[var(--text-muted)]">Loading…</span>
          <button onClick={onClose} aria-label="Close" className="text-[var(--text-muted)] hover:text-[var(--text-primary)]">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
      {!loading && error && (
        <div className="p-6 flex items-center justify-between">
          <span className="text-sm text-red-400">Couldn&apos;t load this contact.</span>
          <button onClick={onClose} aria-label="Close" className="text-[var(--text-muted)] hover:text-[var(--text-primary)]">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
      {!loading && !error && contact && (
        <ContactExpandPanel
          contact={contact}
          users={users}
          embedded
          onClose={onClose}
          onSaved={(updated) => setContact(updated)}
        />
      )}
    </SlideDrawer>
  )
}
