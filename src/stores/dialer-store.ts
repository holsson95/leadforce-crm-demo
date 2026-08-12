import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { arrayMove } from '@dnd-kit/sortable'
import type { ContactSummary, CallHistoryRecord } from '@/types/models'
import type { CallOutcome } from '@prisma/client'
import { buildQueueUrl } from '@/lib/dialer-filters'
import type { QueueFilters } from '@/lib/dialer-filters'
import type { PipelineAction } from '@/components/dialer/DispositionForm'
import type { PhoneNumberView } from '@/lib/dialer-phone-view'

type DialerCallStatus = 'idle' | 'ringing' | 'connected' | 'ended'

function getTodayString(): string {
  return new Date().toLocaleDateString('en-CA') // YYYY-MM-DD in local timezone
}

interface DialerState {
  campaignId:         string | null
  queue:              ContactSummary[]
  calledToday:        ContactSummary[]
  calledTodayDate:    string | null
  totalContacts:      number
  callStatus:         DialerCallStatus
  currentContact:     ContactSummary | null
  activeCallRecordId: string | null
  callStartedAt:      number | null
  sessionId:          string | null
  sessionStartedAt:   number | null
  elapsedSeconds:     number
  queueFilters:       QueueFilters
  pendingFilters:     QueueFilters
  callingView:        'list' | 'profile'
  profileIndex:       number
  phoneNumberView:    PhoneNumberView

  setCampaign(id: string, contacts: ContactSummary[], total: number): void
  selectContact(contact: ContactSummary): void
  reorderQueue(oldIndex: number, newIndex: number): void
  loadQueue(skip?: number): Promise<void>
  startSession(campaignId: string): Promise<void>
  startCall(phoneNumber?: string): Promise<void>
  endCall(durationSecs: number): Promise<void>
  logOutcome(outcome: CallOutcome, notes: string, pipeline?: PipelineAction): Promise<void>
  logManualOutcome(contactId: string, outcome: CallOutcome, notes: string, pipeline?: PipelineAction): Promise<void>
  syncQueue(): Promise<void>
  patchContact(id: string, partial: Partial<Pick<ContactSummary, 'firstName' | 'lastName' | 'companyName' | 'jobTitle' | 'mobilePhone' | 'corporatePhone' | 'status'>>): void
  tickTimer(): void
  resetCalledTodayIfStale(): void

  updatePendingFilters(partial: Partial<QueueFilters>): void
  discardPendingFilters(): void
  applyFilters(): Promise<void>
  removeFilter(keys: (keyof QueueFilters)[]): Promise<void>
  clearFilters(): Promise<void>

  setCallingView(view: 'list' | 'profile'): void
  setProfileIndex(index: number): void
  setPhoneNumberView(view: PhoneNumberView): void
  advanceProfile(): Promise<void>
}

function prependRecord(
  contact: ContactSummary,
  record: CallHistoryRecord | undefined,
): ContactSummary {
  if (!record) return contact
  return {
    ...contact,
    callHistory: [record, ...contact.callHistory].slice(0, 10),
  }
}

export const useDialerStore = create<DialerState>()(
  persist(
    (set, get) => ({
      campaignId:         null,
      queue:              [],
      calledToday:        [],
      calledTodayDate:    null,
      totalContacts:      0,
      callStatus:         'idle',
      currentContact:     null,
      activeCallRecordId: null,
      callStartedAt:      null,
      sessionId:          null,
      sessionStartedAt:   null,
      elapsedSeconds:     0,
      queueFilters:       {},
      pendingFilters:     {},
      callingView:        'list',
      profileIndex:       0,
      phoneNumberView:    'mobile',

      setCampaign(id, contacts, total) {
        set({
          campaignId:         id,
          currentContact:     null,
          queue:              contacts,
          totalContacts:      total,
          callStatus:         'idle',
          activeCallRecordId: null,
          callStartedAt:      null,
          queueFilters:       {},
          pendingFilters:     {},
          profileIndex:       0,
        })
      },

      selectContact(contact) {
        const { currentContact, queue } = get()
        if (contact.id === currentContact?.id) return
        const newQueue = [
          ...(currentContact ? [currentContact] : []),
          ...queue.filter((c) => c.id !== contact.id),
        ]
        set({ currentContact: contact, queue: newQueue, callStatus: 'idle', activeCallRecordId: null, callStartedAt: null })
      },

      reorderQueue(oldIndex, newIndex) {
        const { currentContact, queue } = get()
        const all       = currentContact ? [currentContact, ...queue] : [...queue]
        const reordered = arrayMove(all, oldIndex, newIndex)
        set({ currentContact: reordered[0] ?? null, queue: reordered.slice(1) })
      },

      async loadQueue(skip) {
        const { campaignId, currentContact, queue, queueFilters } = get()
        if (!campaignId) return
        const url = buildQueueUrl(campaignId, queueFilters, skip)
        try {
          const res = await fetch(url)
          if (!res.ok) return
          const { data, total } = (await res.json()) as { data: ContactSummary[]; total: number }
          if (skip != null && skip > 0) {
            const existingIds = new Set(
              [currentContact?.id, ...queue.map((c) => c.id)].filter((id): id is string => id != null)
            )
            const newContacts = data.filter((c) => !existingIds.has(c.id))
            set({ queue: [...queue, ...newContacts], totalContacts: total })
          } else {
            set({ queue: data.filter((c) => c.id !== currentContact?.id), totalContacts: total })
          }
        } catch {
          // Network error or JSON parse error — leave queue unchanged
        }
      },

      async startSession(campaignId) {
        try {
          const res = await fetch('/api/dialer/session', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ campaignId }),
          })
          if (!res.ok) return
          const { data } = await res.json()
          set({ sessionId: data.id, sessionStartedAt: Date.now(), elapsedSeconds: 0 })
        } catch {
          // Network error — session timer won't start, but the dialer remains functional
        }
      },

      async startCall(phoneNumber) {
        const { currentContact, campaignId } = get()
        if (!currentContact || !campaignId) return

        set({ callStatus: 'ringing' })

        const res = await fetch('/api/dialer/start-call', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ contactId: currentContact.id, campaignId, phoneNumber }),
        })
        if (!res.ok) { set({ callStatus: 'idle' }); return }
        const { data } = await res.json()
        set({ activeCallRecordId: data.callRecordId })

        setTimeout(() => {
          if (get().callStatus === 'ringing') {
            set({ callStatus: 'connected', callStartedAt: Date.now() })
          }
        }, 1500)
      },

      async endCall(durationSecs) {
        const { activeCallRecordId } = get()
        if (!activeCallRecordId) return
        set({ callStatus: 'ended' })
        await fetch('/api/dialer/end-call', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ callRecordId: activeCallRecordId, durationSecs }),
        })
      },

      async logOutcome(outcome, notes, pipeline) {
        const { activeCallRecordId, currentContact, queue, calledToday } = get()
        if (!activeCallRecordId || !currentContact) return

        const res = await fetch('/api/dialer/log-outcome', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({
            callRecordId: activeCallRecordId,
            outcome,
            notes,
            contactId: currentContact.id,
            ...(pipeline?.addToQueue
              ? { addToQueue: true, clientId: pipeline.clientId }
              : pipeline?.stageId
                ? { stageId: pipeline.stageId, clientId: pipeline.clientId }
                : {}),
          }),
        })

        const json        = await res.json()
        const newRecord   = json.data?.callRecord as CallHistoryRecord | undefined
        const doneContact = prependRecord(currentContact, newRecord)
        const nextContact = queue[0] ?? null

        set({
          callStatus:         'idle',
          currentContact:     nextContact,
          queue:              queue.slice(1),
          activeCallRecordId: null,
          callStartedAt:      null,
          calledToday:        [...calledToday, doneContact],
          calledTodayDate:    getTodayString(),
        })

        if (queue.length < 5) get().loadQueue()
      },

      async logManualOutcome(contactId, outcome, notes, pipeline) {
        const { campaignId, queue, currentContact, calledToday } = get()
        if (!campaignId) return

        const res = await fetch('/api/dialer/log-outcome', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({
            manual: true,
            outcome,
            notes,
            contactId,
            campaignId,
            ...(pipeline?.addToQueue
              ? { addToQueue: true, clientId: pipeline.clientId }
              : pipeline?.stageId
                ? { stageId: pipeline.stageId, clientId: pipeline.clientId }
                : {}),
          }),
        })
        if (!res.ok) throw new Error('Failed to log manual outcome')

        const json      = await res.json()
        const newRecord = json.data?.callRecord as CallHistoryRecord | undefined

        const updateContact = (c: ContactSummary) => prependRecord(c, newRecord)

        if (currentContact?.id === contactId) {
          const nextContact = queue[0] ?? null
          set({
            currentContact:     nextContact,
            queue:              queue.slice(1),
            calledToday:        [...calledToday, updateContact(currentContact)],
            calledTodayDate:    getTodayString(),
            callStatus:         'idle',
            activeCallRecordId: null,
            callStartedAt:      null,
          })
        } else {
          const inQueue = queue.find((c) => c.id === contactId)
          if (inQueue) {
            set({
              queue:           queue.filter((c) => c.id !== contactId),
              calledToday:     [...calledToday, updateContact(inQueue)],
              calledTodayDate: getTodayString(),
            })
          } else {
            set({
              calledToday: calledToday.map((c) =>
                c.id === contactId ? updateContact(c) : c
              ),
            })
          }
        }
      },

      async syncQueue() {
        const { campaignId, queue, currentContact, callStatus } = get()
        if (!campaignId || callStatus !== 'idle') return

        const idsToCheck = [
          ...(currentContact ? [currentContact.id] : []),
          ...queue.map((c) => c.id),
        ]
        if (idsToCheck.length === 0) return

        const res = await fetch('/api/dialer/queue/validate', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ campaignId, contactIds: idsToCheck }),
        })
        if (!res.ok) return

        const { validIds } = (await res.json()) as { validIds: string[] }
        const validSet = new Set<string>(validIds)
        const removed  = idsToCheck.length - validIds.length
        if (removed === 0) return

        set({
          currentContact: currentContact && validSet.has(currentContact.id) ? currentContact : null,
          queue:          queue.filter((c) => validSet.has(c.id)),
          totalContacts:  Math.max(0, get().totalContacts - removed),
        })
      },

      patchContact(id, partial) {
        const { currentContact, queue, calledToday } = get()
        const patch = (c: ContactSummary): ContactSummary =>
          c.id === id ? { ...c, ...partial } : c
        set({
          currentContact: currentContact ? patch(currentContact) : null,
          queue:          queue.map(patch),
          calledToday:    calledToday.map(patch),
        })
      },

      tickTimer() {
        set((s) => ({ elapsedSeconds: s.elapsedSeconds + 1 }))
      },

      resetCalledTodayIfStale() {
        const { calledTodayDate } = get()
        const today = getTodayString()
        if (calledTodayDate !== today) {
          set({ calledToday: [], calledTodayDate: today })
        }
      },

      updatePendingFilters(partial) {
        const { pendingFilters } = get()
        const next = { ...pendingFilters, ...partial }
        for (const key of Object.keys(partial) as (keyof QueueFilters)[]) {
          if (partial[key] === undefined) delete next[key]
        }
        set({ pendingFilters: next })
      },

      discardPendingFilters() {
        set({ pendingFilters: { ...get().queueFilters } })
      },

      async applyFilters() {
        const { pendingFilters, callStatus } = get()
        set({ queueFilters: { ...pendingFilters }, profileIndex: 0 })
        if (callStatus === 'idle') await get().loadQueue()
      },

      async removeFilter(keys) {
        const { queueFilters, callStatus } = get()
        const next = { ...queueFilters }
        for (const key of keys) delete next[key]
        set({ queueFilters: next, pendingFilters: { ...next }, profileIndex: 0 })
        if (callStatus === 'idle') await get().loadQueue()
      },

      async clearFilters() {
        const { callStatus } = get()
        set({ queueFilters: {}, pendingFilters: {}, profileIndex: 0 })
        if (callStatus === 'idle') await get().loadQueue()
      },

      setCallingView(view) {
        set({ callingView: view })
      },

      setProfileIndex(index) {
        set({ profileIndex: index })
      },

      setPhoneNumberView(view) {
        set({ phoneNumberView: view })
      },

      async advanceProfile() {
        const { profileIndex, queue, currentContact, totalContacts } = get()
        const loadedCount = (currentContact ? 1 : 0) + queue.length
        const next        = profileIndex + 1
        if (next >= loadedCount && loadedCount < totalContacts) {
          await get().loadQueue(loadedCount)
        }
        set({ profileIndex: next })
      },
    }),
    {
      name: 'leadforce-dialer-called-today',
      partialize: (state) => ({
        calledToday:     state.calledToday,
        calledTodayDate: state.calledTodayDate,
        callingView:     state.callingView,
      }),
    }
  )
)
