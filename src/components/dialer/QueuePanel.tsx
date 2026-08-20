'use client'

import { useEffect, useRef, useState } from 'react'
import { Phone, PhoneOff, GripVertical, ChevronDown, ChevronLeft, ChevronRight, Copy, Check, Globe, Filter, List, SquareUser } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Tooltip } from '@base-ui/react/tooltip'
import { toast } from 'sonner'
import { useDialerStore } from '@/stores/dialer-store'
import { OUTCOME_LABEL } from './outcome-colors'
import { ContactNotesModal } from './ContactNotesModal'
import { QuickLogDropdown } from './QuickLogDropdown'
import { QueueFilterDrawer } from './QueueFilterDrawer'
import { QueueFilterChips } from './QueueFilterChips'
import { activeFilterCount } from '@/lib/dialer-filters'
import { ContactExpandPanel } from './ContactExpandPanel'
import { ProfileViewCard } from './ProfileViewCard'
import { HeaderSearch } from '@/components/layout/HeaderSearch'
import type { ContactSummary, ContactWithCampaign, CallHistoryRecord } from '@/types/models'
import { resolvePhoneNumber, type PhoneNumberView } from '@/lib/dialer-phone-view'
import {
  DndContext, DragEndEvent, closestCenter, PointerSensor, useSensor, useSensors,
} from '@dnd-kit/core'
import {
  SortableContext, verticalListSortingStrategy, useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

const PAGE_SIZE = 15
const MAX_ATTEMPTS = 8
// drag | name+subtext | company+emp | attempts | notes | quick-log | phone | call | profile-jump
const GRID = 'grid-cols-[12px_2fr_1.25fr_80px_48px_24px_140px_40px_40px]'


interface QueuePanelProps {
  campaigns: { id: string; name: string }[]
  users: { id: string; name: string }[]
  defaultCampaignId?: string
}

function NotesButton({ contact }: { contact: ContactSummary }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(true) }}
        className="w-6 h-6 flex items-center justify-center rounded-lg text-[var(--text-muted)] hover:text-[var(--lf-accent)] hover:bg-[var(--panel-border-hover)] transition-colors flex-shrink-0"
        title="View notes"
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
          <path d="M1 2a1 1 0 011-1h8a1 1 0 011 1v6a1 1 0 01-1 1H7.5L5 11V9H2a1 1 0 01-1-1V2z"/>
        </svg>
      </button>
      <ContactNotesModal
        contactId={contact.id}
        contactName={`${contact.firstName} ${contact.lastName}`}
        open={open}
        onClose={() => setOpen(false)}
      />
    </>
  )
}

function AttemptsCell({ history }: { history: CallHistoryRecord[] }) {
  const count = history.length
  const hasAttempts = count > 0
  const attemptsWithNotes = history.filter((r) => r.notes)

  const inner = (
    <div className="flex items-center gap-1.5 flex-shrink-0">
      <span
        className="w-1.5 h-1.5 rounded-full flex-shrink-0"
        style={{ background: hasAttempts ? '#e08a7c' : 'var(--text-muted)' }}
      />
      <span
        className="text-[12px] tabular-nums whitespace-nowrap"
        style={{ color: hasAttempts ? '#e08a7c' : 'var(--text-muted)' }}
      >
        {count} of {MAX_ATTEMPTS}
      </span>
    </div>
  )

  if (!hasAttempts) return inner

  return (
    <Tooltip.Root>
      <Tooltip.Trigger
        delay={200}
        render={<div className="cursor-default" />}
      >
        {inner}
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Positioner side="top" sideOffset={8}>
          <Tooltip.Popup className="w-52 bg-[var(--bg-dark)] border border-[var(--panel-border)] rounded-xl p-2.5 text-[10px] z-50 shadow-xl">
            {history.map((r, i) => (
              <div key={r.id} className={cn(i > 0 && 'mt-1.5 pt-1.5 border-t border-[var(--panel-border)]')}>
                <span className="block text-[var(--text-secondary)]">
                  {new Date(r.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' })}
                  {r.outcome && ` · ${OUTCOME_LABEL[r.outcome]}`}
                </span>
                {r.notes && (
                  <span className="block text-[var(--text-secondary)] mt-0.5 line-clamp-2">{r.notes}</span>
                )}
                {!r.notes && attemptsWithNotes.length === 0 && i === 0 && (
                  <span className="block text-[var(--text-muted)] mt-0.5 italic">No notes</span>
                )}
              </div>
            ))}
          </Tooltip.Popup>
        </Tooltip.Positioner>
      </Tooltip.Portal>
    </Tooltip.Root>
  )
}

function PhoneCell({ phone }: { phone: string | null }) {
  const [copied, setCopied] = useState(false)
  if (!phone) {
    return (
      <div className="flex items-center">
        <span className="text-[15px]" style={{ color: 'var(--text-muted)' }}>—</span>
      </div>
    )
  }

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      await navigator.clipboard.writeText(phone)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = phone
      ta.style.cssText = 'position:fixed;opacity:0'
      document.body.appendChild(ta)
      ta.focus()
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="flex items-center gap-1 group/phone">
      <span
        onClick={handleCopy}
        className="font-mono text-[15px] whitespace-nowrap cursor-pointer hover:text-[var(--text-primary)] transition-colors"
        style={{ color: 'var(--text-secondary)', letterSpacing: '0.02em' }}
        title="Click to copy"
      >
        {phone}
      </span>
      <span className="w-3.5 flex-shrink-0">
        {copied
          ? <Check className="w-2.5 h-2.5 text-emerald-400" />
          : <Copy className="w-2.5 h-2.5 text-[var(--text-muted)] opacity-0 group-hover/phone:opacity-100 transition-opacity" />
        }
      </span>
    </div>
  )
}

function CompanyCell({ contact }: { contact: ContactSummary }) {
  if (!contact.companyName && contact.employeeCount == null) return <div />
  return (
    <div className="overflow-hidden w-full">
      <p className="text-[12px] text-[var(--text-secondary)] truncate leading-tight">
        {contact.companyName ?? ''}
        {contact.companyName && contact.employeeCount != null && (
          <span className="text-[var(--text-muted)]"> · {contact.employeeCount.toLocaleString()} emp</span>
        )}
        {!contact.companyName && contact.employeeCount != null && (
          <span>{contact.employeeCount.toLocaleString()} emp</span>
        )}
      </p>
    </div>
  )
}

function formatDuration(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60)
  const s = totalSeconds % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

function CallStatusBadge({ status, elapsed }: { status: 'ringing' | 'connected'; elapsed: number }) {
  return (
    <span className="flex items-center gap-1 mt-0.5">
      <span
        className={cn(
          'w-1.5 h-1.5 rounded-full flex-shrink-0',
          status === 'connected' ? 'bg-emerald-400' : 'bg-[var(--lf-accent)] animate-pulse',
        )}
      />
      <span
        className="text-[11px] font-medium"
        style={{ color: status === 'connected' ? '#7dd6ab' : 'var(--lf-accent)' }}
      >
        {status === 'connected' ? `Connected · ${formatDuration(elapsed)}` : 'Ringing…'}
      </span>
    </span>
  )
}

function ContactRow({
  contact,
  isActive,
  isExpanded,
  isLoading,
  users,
  onToggle,
  cachedContact,
  onSaved,
  allContactsIndex,
  onOpenProfile,
}: {
  contact: ContactSummary
  isActive: boolean
  isExpanded: boolean
  isLoading: boolean
  users: { id: string; name: string }[]
  onToggle: (id: string) => void
  cachedContact: ContactWithCampaign | null
  onSaved: (updated: ContactWithCampaign) => void
  allContactsIndex: number
  onOpenProfile: (index: number) => void
}) {
  const { callStatus, selectContact, startCall, endCall, phoneNumberView } = useDialerStore()
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: contact.id })

  const callActiveHere = isActive && (callStatus === 'ringing' || callStatus === 'connected')

  const [callElapsed, setCallElapsed] = useState(0)
  useEffect(() => {
    if (!isActive || callStatus !== 'connected') {
      if (!isActive || callStatus === 'ringing') setCallElapsed(0)
      return
    }
    const id = setInterval(() => setCallElapsed((s) => s + 1), 1000)
    return () => clearInterval(id)
  }, [isActive, callStatus])

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    zIndex:  isDragging ? 50 : undefined,
  }

  const handleRowClick = () => {
    if (callStatus !== 'idle' || isActive) return
    selectContact(contact)
  }

  const resolvedPhone = resolvePhoneNumber(contact, phoneNumberView)

  const handleCallClick = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (callActiveHere) {
      await endCall(callElapsed)
      return
    }
    if (callStatus !== 'idle') return
    if (!isActive) {
      selectContact(contact)
    } else {
      await startCall(resolvedPhone ?? undefined)
    }
  }

  const subtextParts = [contact.jobTitle, contact.companyName].filter(Boolean)
  const subtext = subtextParts.join(', ')

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      className={cn(
        'border-b border-[var(--panel-border)]',
        isActive && 'border-l-2 border-l-[var(--lf-accent)]',
      )}
    >
      <div
        onClick={handleRowClick}
        className={cn(
          `group grid ${GRID} items-center gap-2 px-3 py-5 cursor-pointer transition-colors`,
          isActive ? 'bg-[var(--panel-border-hover)]' : 'hover:bg-white/[0.02]',
        )}
      >
        <div
          {...listeners}
          onClick={(e) => e.stopPropagation()}
          className="opacity-0 group-hover:opacity-100 transition-opacity text-[var(--text-muted)] hover:text-[var(--text-secondary)] touch-none cursor-grab active:cursor-grabbing flex-shrink-0"
        >
          <GripVertical className="w-3 h-3" />
        </div>

        <div className="min-w-0 flex items-center gap-1">
          <button
            onClick={(e) => { e.stopPropagation(); onToggle(contact.id) }}
            disabled={isLoading}
            className="flex-shrink-0 w-4 h-4 flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--lf-accent)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isLoading
              ? <div className="w-3 h-3 rounded-full border border-gray-500 border-t-[var(--lf-accent)] animate-spin" />
              : <ChevronDown className={cn('w-3 h-3 transition-transform duration-150', isExpanded && 'rotate-180')} />
            }
          </button>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <p className="text-[17px] font-semibold truncate leading-tight" style={{ color: 'var(--text-primary)' }}>
                {contact.firstName} {contact.lastName}
              </p>
              {contact.linkedinUrl && (
                <a
                  href={contact.linkedinUrl.startsWith('http') ? contact.linkedinUrl : `https://${contact.linkedinUrl}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="flex-shrink-0 text-[var(--text-muted)] hover:text-[var(--lf-accent)] transition-colors"
                  title="LinkedIn"
                >
                  <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.32 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.79M6.88 8.56a1.68 1.68 0 0 0 1.68-1.68c0-.93-.75-1.69-1.68-1.69a1.69 1.69 0 0 0-1.69 1.69c0 .93.76 1.68 1.69 1.68m1.39 9.94v-8.37H5.5v8.37h2.77z"/>
                  </svg>
                </a>
              )}
              {contact.website && (
                <a
                  href={contact.website.startsWith('http') ? contact.website : `https://${contact.website}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="flex-shrink-0 text-[var(--text-muted)] hover:text-[var(--lf-accent)] transition-colors"
                  title="Website"
                >
                  <Globe className="w-2.5 h-2.5" />
                </a>
              )}
            </div>
            {callActiveHere ? (
              <CallStatusBadge status={callStatus as 'ringing' | 'connected'} elapsed={callElapsed} />
            ) : subtext && (
              <p className="text-[13px] truncate leading-tight mt-0.5" style={{ color: 'var(--text-muted)' }}>
                {subtext}
              </p>
            )}
            {contact.status === 'call_back' && (
              <Badge className="mt-1 text-[9px] h-4 px-1.5 bg-[var(--lf-accent)]/10 text-amber-400 border-amber-500/20">
                Call Back
              </Badge>
            )}
          </div>
        </div>

        <CompanyCell contact={contact} />
        <AttemptsCell history={contact.callHistory} />
        <NotesButton contact={contact} />
        <QuickLogDropdown
          contactId={contact.id}
          contactName={`${contact.firstName} ${contact.lastName}`}
          disabled={!isActive || callStatus !== 'idle'}
        />
        <PhoneCell phone={resolvedPhone} />

        <button
          onClick={handleCallClick}
          disabled={!callActiveHere && (callStatus !== 'idle' || (isActive && !resolvedPhone))}
          className={cn(
            'w-6 h-6 flex items-center justify-center rounded-lg flex-shrink-0 transition-colors',
            callActiveHere
              ? 'bg-red-500/10 text-red-400 hover:bg-red-500/20'
              : isActive
                ? 'bg-[var(--lf-accent)]/10 text-[var(--lf-accent)] hover:bg-[var(--lf-accent)]/20'
                : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--panel-border-hover)]',
            !callActiveHere && (callStatus !== 'idle' || (isActive && !resolvedPhone)) && 'opacity-30 cursor-not-allowed',
          )}
          title={
            callActiveHere
              ? 'End call'
              : !isActive
                ? 'Select contact'
                : resolvedPhone
                  ? 'Start call'
                  : `No ${phoneNumberView} number on file`
          }
        >
          {callActiveHere ? <PhoneOff className="w-3 h-3" /> : <Phone className="w-3 h-3" />}
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onOpenProfile(allContactsIndex) }}
          className={cn(
            'w-6 h-6 flex items-center justify-center rounded-lg flex-shrink-0 transition-colors',
            isActive
              ? 'text-[var(--lf-accent)] hover:bg-[var(--lf-accent)]/10'
              : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--panel-border-hover)]',
          )}
          title="Open profile view"
        >
          <SquareUser className="w-[17px] h-[17px]" />
        </button>
      </div>

      {isExpanded && cachedContact && (
        <ContactExpandPanel
          contact={cachedContact}
          users={users}
          onClose={() => onToggle(contact.id)}
          onSaved={onSaved}
        />
      )}
    </div>
  )
}

function CalledTodayRow({ contact }: { contact: ContactSummary }) {
  const { callStatus, selectContact, startCall, phoneNumberView } = useDialerStore()
  const resolvedPhone = resolvePhoneNumber(contact, phoneNumberView)

  const handleCallClick = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (callStatus !== 'idle') return
    selectContact(contact)
    await startCall(resolvedPhone ?? undefined)
  }

  const subtextParts = [contact.jobTitle, contact.companyName].filter(Boolean)
  const subtext = subtextParts.join(', ')

  return (
    <div className={`group grid ${GRID} items-center gap-2 px-3 py-5 border-b border-[var(--panel-border)] opacity-60 hover:opacity-80 transition-opacity`}>
      <div className="w-3 flex-shrink-0" />

      <div className="min-w-0">
        <p className="text-[17px] font-semibold truncate leading-tight" style={{ color: 'var(--text-primary)' }}>
          {contact.firstName} {contact.lastName}
        </p>
        {subtext && (
          <p className="text-[13px] truncate leading-tight mt-0.5" style={{ color: 'var(--text-muted)' }}>
            {subtext}
          </p>
        )}
      </div>

      <CompanyCell contact={contact} />
      <AttemptsCell history={contact.callHistory} />
      <NotesButton contact={contact} />
      <div />
      <PhoneCell phone={resolvedPhone} />

      <button
        onClick={handleCallClick}
        disabled={callStatus !== 'idle' || !resolvedPhone}
        className={cn(
          'w-6 h-6 flex items-center justify-center rounded-lg flex-shrink-0 transition-colors text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--panel-border-hover)]',
          (callStatus !== 'idle' || !resolvedPhone) && 'opacity-30 cursor-not-allowed',
        )}
        title={resolvedPhone ? 'Call again' : `No ${phoneNumberView} number on file`}
      >
        <Phone className="w-3 h-3" />
      </button>
      <div />
    </div>
  )
}

export function QueuePanel({ campaigns, users, defaultCampaignId }: QueuePanelProps) {
  const {
    campaignId, currentContact, queue, calledToday, totalContacts,
    queueFilters, callingView, profileIndex, phoneNumberView,
    setCampaign, startSession, loadQueue, reorderQueue, syncQueue,
    resetCalledTodayIfStale, setCallingView, setProfileIndex, setPhoneNumberView,
  } = useDialerStore()

  const [calledTodayOpen, setCalledTodayOpen] = useState(false)
  const [page, setPage] = useState(1)
  const [expandedContactId, setExpandedContactId] = useState<string | null>(null)
  const [loadingContactId, setLoadingContactId] = useState<string | null>(null)
  const [contactCache, setContactCache] = useState<Record<string, ContactWithCampaign>>({})
  const [filterDrawerOpen, setFilterDrawerOpen] = useState(false)
  const [campaignSwitching, setCampaignSwitching] = useState(false)
  const autoSelectedRef = useRef(false)

  const handleToggle = async (id: string) => {
    if (loadingContactId === id) return
    if (expandedContactId === id) {
      setExpandedContactId(null)
      return
    }
    if (contactCache[id]) {
      setExpandedContactId(id)
      return
    }
    setLoadingContactId(id)
    const res = await fetch(`/api/contacts/${id}`)
    setLoadingContactId(null)
    if (!res.ok) { toast.error('Failed to load contact'); return }
    const { data } = (await res.json()) as { data: ContactWithCampaign }
    setContactCache((prev) => ({ ...prev, [id]: data }))
    setExpandedContactId(id)
  }

  const handleSaved = (updated: ContactWithCampaign) => {
    setContactCache((prev) => ({ ...prev, [updated.id]: updated }))
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  )

  const allContacts: ContactSummary[] = [
    ...(currentContact ? [currentContact] : []),
    ...queue,
  ]

  const safeProfileIndex = Math.min(profileIndex, Math.max(0, allContacts.length - 1))
  const profileContact   = allContacts[safeProfileIndex] ?? null

  const pageContacts = allContacts.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const totalPages   = Math.max(1, Math.ceil(totalContacts / PAGE_SIZE))
  const pageOffset   = (page - 1) * PAGE_SIZE

  useEffect(() => {
    if (pageContacts.length === 0 && page > 1) {
      setPage(Math.max(1, Math.ceil(allContacts.length / PAGE_SIZE)))
    }
  }, [pageContacts.length, page, allContacts.length])

  useEffect(() => {
    resetCalledTodayIfStale()
  }, [resetCalledTodayIfStale])

  useEffect(() => {
    if (!campaignId) return
    syncQueue()
    const id = setInterval(() => { syncQueue() }, 30_000)
    return () => clearInterval(id)
  }, [campaignId, syncQueue])

  useEffect(() => {
    if (!campaignId) return
    if (!campaigns.some(c => c.id === campaignId)) {
      setCampaign('', [], 0)
      setPage(1)
      setExpandedContactId(null)
      setContactCache({})
    }
  }, [campaigns, campaignId, setCampaign])

  useEffect(() => {
    setPage(1)
  }, [queueFilters])

  const handleCampaignChange = async (id: string) => {
    setPage(1)
    setExpandedContactId(null)
    setLoadingContactId(null)
    setContactCache({})
    setCampaign(id, [], 0)
    setCampaignSwitching(true)
    try {
      await loadQueue()
      await startSession(id)
    } catch {
      // Swallow unexpected errors to prevent React error boundary from triggering
    } finally {
      setCampaignSwitching(false)
    }
  }

  // Auto-select campaign from URL param if no campaign is already chosen
  useEffect(() => {
    if (autoSelectedRef.current || campaignId || !defaultCampaignId) return
    if (!campaigns.some(c => c.id === defaultCampaignId)) return
    autoSelectedRef.current = true
    handleCampaignChange(defaultCampaignId)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaigns, campaignId, defaultCampaignId])

  // Auto-select when there is exactly one campaign available
  useEffect(() => {
    if (autoSelectedRef.current || campaignId || campaigns.length !== 1) return
    autoSelectedRef.current = true
    handleCampaignChange(campaigns[0].id)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaigns.length, campaignId])

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIdx = pageContacts.findIndex((c) => c.id === active.id)
    const newIdx = pageContacts.findIndex((c) => c.id === over.id)
    if (oldIdx === -1 || newIdx === -1) return
    reorderQueue(pageOffset + oldIdx, pageOffset + newIdx)
  }

  const handleOpenProfile = (index: number) => {
    setProfileIndex(index)
    setCallingView('profile')
  }

  const handleNextPage = async () => {
    const nextPage = page + 1
    setPage(nextPage)
    if (nextPage * PAGE_SIZE > allContacts.length && allContacts.length < totalContacts) {
      await loadQueue(allContacts.length)
    }
  }

  const singleCampaign = campaigns.length === 1

  return (
    <div className="flex flex-col w-full flex-shrink-0 relative h-full gap-3">
      {/* Campaign selector + controls — visually separate from the queue table */}
      <div className="flex items-center gap-2 flex-shrink-0 px-1">
        {singleCampaign && campaignId ? (
          <p className="text-sm font-semibold text-[var(--text-primary)] flex-1 truncate">
            {campaigns[0].name}
          </p>
        ) : (
          <div className="flex-1">
            <Select value={campaignId ?? ''} onValueChange={(v) => handleCampaignChange(v ?? '')}>
              <SelectTrigger className="bg-[var(--panel-border)] border-[var(--panel-border)] text-[var(--text-primary)] rounded-xl text-sm">
                <SelectValue>
                  {(v: string | null) => v ? (campaigns.find(c => c.id === v)?.name ?? v) : 'Select a campaign…'}
                </SelectValue>
              </SelectTrigger>
              <SelectContent alignItemWithTrigger={false} className="rounded-xl border-[var(--panel-border)] bg-[var(--card-bg)]">
                {campaigns.map((c) => (
                  <SelectItem key={c.id} value={c.id}
                    className="text-[var(--text-secondary)] focus:bg-[var(--panel-border-hover)] focus:text-[var(--text-primary)] rounded-lg">
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Who's calling? — visible regardless of campaign selection or list/profile view */}
        <div className="flex-shrink-0">
          <HeaderSearch />
        </div>

        {campaignId && (
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* View toggle — only shown when contacts are loaded */}
            {allContacts.length > 0 && (
              <div
                className="flex items-center p-[3px] rounded-[20px]"
                style={{ background: 'var(--card-bg-solid)', border: '0.5px solid var(--panel-border-hover)' }}
              >
                {(['list', 'profile'] as const).map((v) => (
                  <button
                    key={v}
                    onClick={() => setCallingView(v)}
                    className={cn(
                      'flex items-center justify-center gap-1.5 px-3 h-[26px] rounded-[18px] transition-colors text-[11px] font-medium',
                      callingView === v
                        ? 'bg-[var(--lf-accent)] text-[#211a0c] font-semibold'
                        : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]',
                    )}
                  >
                    {v === 'list'
                      ? <><List className="w-3.5 h-3.5" /><span>List</span></>
                      : <><SquareUser className="w-3.5 h-3.5" /><span>Profile</span></>
                    }
                  </button>
                ))}
              </div>
            )}

            {allContacts.length > 0 && (
              <div
                className="flex items-center p-[3px] rounded-[20px]"
                style={{ background: 'var(--card-bg-solid)', border: '0.5px solid var(--panel-border-hover)' }}
              >
                {(['mobile', 'corporate'] as const).map((v) => (
                  <button
                    key={v}
                    onClick={() => setPhoneNumberView(v)}
                    className={cn(
                      'flex items-center justify-center gap-1.5 px-3 h-[26px] rounded-[18px] transition-colors text-[11px] font-medium',
                      phoneNumberView === v
                        ? 'bg-[var(--lf-accent)] text-[#211a0c] font-semibold'
                        : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]',
                    )}
                  >
                    {v === 'mobile' ? 'Mobile' : 'Corporate'}
                  </button>
                ))}
              </div>
            )}

            {/* Filters button */}
            <button
              onClick={() => setFilterDrawerOpen(true)}
              className={cn(
                'flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-medium transition-colors',
                activeFilterCount(queueFilters) > 0
                  ? 'bg-[var(--lf-accent)]/10 text-[var(--lf-accent)] border border-[var(--lf-accent)]/20'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--panel-border-hover)]',
              )}
            >
              <Filter className="w-3 h-3" />
              Filters
              {activeFilterCount(queueFilters) > 0 && (
                <span className="bg-[var(--lf-accent)] text-[#0b0e14] rounded-full w-3.5 h-3.5 flex items-center justify-center text-[9px] font-bold">
                  {activeFilterCount(queueFilters)}
                </span>
              )}
            </button>
          </div>
        )}
      </div>

      {/* Active filter chips — outside the queue table */}
      {campaignId && <QueueFilterChips users={users} />}

      {/* Queue table — glass panel */}
      <div className="glass-panel rounded-3xl flex flex-col flex-1 min-h-0 overflow-hidden">
        {/* Column headers — only shown when there are contacts in list view */}
        {campaignId && allContacts.length > 0 && callingView === 'list' && (
          <div className={cn(`grid ${GRID}`, 'items-center gap-2 px-3 py-2 border-b border-[var(--panel-border)] flex-shrink-0')}>
            <div className="w-3" />
            <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">Contact</p>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">Company</p>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">Attempts</p>
            <div />
            <div />
            <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">Mobile</p>
            <div />
            <div />
          </div>
        )}

        {/* Contact list / Profile view */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {callingView === 'profile' && profileContact ? (
            <ProfileViewCard
              contact={profileContact}
              totalContacts={totalContacts}
              campaignId={campaignId}
            />
          ) : !campaignId ? (
            <div className="flex items-center justify-center h-full">
              <p className="text-sm text-[var(--text-muted)]">Select a campaign to begin</p>
            </div>
          ) : campaignSwitching ? (
            <div className="flex items-center justify-center h-full">
              <div className="w-6 h-6 border-2 border-[var(--lf-accent)]/30 border-t-[var(--lf-accent)] rounded-full animate-spin" />
            </div>
          ) : allContacts.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <p className="text-sm text-[var(--text-muted)]">Queue empty</p>
            </div>
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={pageContacts.map((c) => c.id)} strategy={verticalListSortingStrategy}>
                {pageContacts.map((contact, i) => (
                  <ContactRow
                    key={contact.id}
                    contact={contact}
                    isActive={contact.id === currentContact?.id}
                    isExpanded={contact.id === expandedContactId}
                    isLoading={contact.id === loadingContactId}
                    users={users}
                    onToggle={handleToggle}
                    cachedContact={contactCache[contact.id] ?? null}
                    onSaved={handleSaved}
                    allContactsIndex={pageOffset + i}
                    onOpenProfile={handleOpenProfile}
                  />
                ))}
              </SortableContext>
            </DndContext>
          )}
        </div>

        {/* Pagination controls */}
        {callingView === 'list' && allContacts.length > 0 && (
          <div className="flex items-center justify-between px-4 py-2.5 border-t border-[var(--panel-border)] flex-shrink-0">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="w-7 h-7 flex items-center justify-center rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--panel-border-hover)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <span className="text-[10px] text-[var(--text-muted)]">
              Page {page} of {totalPages}
              {totalContacts > 0 && (
                <span className="ml-2 text-[var(--text-muted)]">· {totalContacts} in queue</span>
              )}
            </span>
            <button
              onClick={handleNextPage}
              disabled={page >= totalPages}
              className="w-7 h-7 flex items-center justify-center rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--panel-border-hover)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Calls made today */}
        {callingView === 'list' && calledToday.length > 0 && (
          <div className="border-t border-[var(--panel-border)] flex-shrink-0">
            <button
              onClick={() => setCalledTodayOpen((v) => !v)}
              className="w-full px-4 py-3 flex items-center justify-between text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
            >
              <span>Calls made today ({calledToday.length})</span>
              <ChevronDown className={cn('w-3.5 h-3.5 transition-transform duration-200', calledTodayOpen && 'rotate-180')} />
            </button>
            {calledTodayOpen && (
              <div className="overflow-y-auto max-h-60">
                {calledToday.map((contact) => (
                  <CalledTodayRow key={contact.id} contact={contact} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Filter drawer — scoped within QueuePanel bounds */}
      {campaignId && (
        <QueueFilterDrawer
          open={filterDrawerOpen}
          onClose={() => setFilterDrawerOpen(false)}
          campaignId={campaignId}
          users={users}
        />
      )}
    </div>
  )
}
