import { describe, it, expect, vi, beforeEach } from 'vitest'
import { routeOutcome, CONVERSATION_TAGGED_OUTCOMES, DEFAULT_DIALER_THRESHOLDS, notesRequiredFor } from '../outcome-router'
import type { DialerThresholds } from '../outcome-router'
import { CallOutcome } from '@prisma/client'

const mockUpdate    = vi.fn()
const mockUpdateMany = vi.fn()
const mockCount      = vi.fn()
const mockFindUnique = vi.fn()

const mockTx = {
  contact: {
    findUnique: mockFindUnique,
    update:     mockUpdate,
    updateMany: mockUpdateMany,
  },
  callRecord: {
    count: mockCount,
  },
} as any

const baseContact = { dialAttempts: 0, companyName: null, tenantId: 't1' }

describe('routeOutcome', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCount.mockResolvedValue(0)
  })

  describe('no_answer', () => {
    it('increments dialAttempts', async () => {
      mockFindUnique.mockResolvedValue({ ...baseContact, dialAttempts: 2 })
      await routeOutcome('c1', CallOutcome.no_answer, mockTx, DEFAULT_DIALER_THRESHOLDS)
      expect(mockUpdate).toHaveBeenCalledWith({
        where: { id: 'c1' },
        data:  { dialAttempts: 3 },
      })
    })

    it('moves to future list when dialAttempts reaches 8', async () => {
      mockFindUnique.mockResolvedValue({ ...baseContact, dialAttempts: 7 })
      await routeOutcome('c1', CallOutcome.no_answer, mockTx, DEFAULT_DIALER_THRESHOLDS)
      expect(mockUpdate).toHaveBeenCalledWith({
        where: { id: 'c1' },
        data:  { dialAttempts: 8, status: 'future' },
      })
    })
  })

  describe('voicemail', () => {
    it('increments dialAttempts', async () => {
      mockFindUnique.mockResolvedValue({ ...baseContact, dialAttempts: 1 })
      await routeOutcome('c1', CallOutcome.voicemail, mockTx, DEFAULT_DIALER_THRESHOLDS)
      expect(mockUpdate).toHaveBeenCalledWith({
        where: { id: 'c1' },
        data:  { dialAttempts: 2 },
      })
    })

    it('moves to future list at attempt 8', async () => {
      mockFindUnique.mockResolvedValue({ ...baseContact, dialAttempts: 7 })
      await routeOutcome('c1', CallOutcome.voicemail, mockTx, DEFAULT_DIALER_THRESHOLDS)
      expect(mockUpdate).toHaveBeenCalledWith({
        where: { id: 'c1' },
        data:  { dialAttempts: 8, status: 'future' },
      })
    })
  })

  describe('not_interested', () => {
    it('sets notInterestedUntil to ~7 days from now', async () => {
      mockFindUnique.mockResolvedValue(baseContact)
      const before = Date.now()
      await routeOutcome('c1', CallOutcome.not_interested, mockTx, DEFAULT_DIALER_THRESHOLDS)
      const after = Date.now()
      const sevenDays = 7 * 24 * 60 * 60 * 1000
      const { notInterestedUntil } = mockUpdate.mock.calls[0][0].data as { notInterestedUntil: Date }
      expect(notInterestedUntil.getTime()).toBeGreaterThanOrEqual(before + sevenDays)
      expect(notInterestedUntil.getTime()).toBeLessThanOrEqual(after   + sevenDays)
    })

    it('does not change the list', async () => {
      mockFindUnique.mockResolvedValue(baseContact)
      await routeOutcome('c1', CallOutcome.not_interested, mockTx, DEFAULT_DIALER_THRESHOLDS)
      expect(mockUpdate.mock.calls[0][0].data).not.toHaveProperty('status')
    })
  })

  describe('not_relevant_contact', () => {
    it('moves contact to dnc', async () => {
      mockFindUnique.mockResolvedValue(baseContact)
      await routeOutcome('c1', CallOutcome.not_relevant_contact, mockTx, DEFAULT_DIALER_THRESHOLDS)
      expect(mockUpdate).toHaveBeenCalledWith({
        where: { id: 'c1' },
        data:  { status: 'dnc', dncReason: 'Not relevant contact' },
      })
    })
  })

  describe('lead', () => {
    it('moves contact to lead list', async () => {
      mockFindUnique.mockResolvedValue(baseContact)
      await routeOutcome('c1', CallOutcome.lead, mockTx, DEFAULT_DIALER_THRESHOLDS)
      expect(mockUpdate).toHaveBeenCalledWith({
        where: { id: 'c1' },
        data:  { status: 'lead' },
      })
    })
  })

  describe('call_back_later', () => {
    it('moves contact to call_back list', async () => {
      mockFindUnique.mockResolvedValue(baseContact)
      await routeOutcome('c1', CallOutcome.call_back_later, mockTx, DEFAULT_DIALER_THRESHOLDS)
      expect(mockUpdate).toHaveBeenCalledWith({
        where: { id: 'c1' },
        data:  { status: 'call_back' },
      })
    })
  })

  describe('call_back_attempted', () => {
    it('moves contact to lead list', async () => {
      mockFindUnique.mockResolvedValue(baseContact)
      await routeOutcome('c1', CallOutcome.call_back_attempted, mockTx, DEFAULT_DIALER_THRESHOLDS)
      expect(mockUpdate).toHaveBeenCalledWith({
        where: { id: 'c1' },
        data:  { status: 'lead' },
      })
    })
  })

  describe('disqualified', () => {
    it('moves contact to dnc', async () => {
      mockFindUnique.mockResolvedValue(baseContact)
      await routeOutcome('c1', CallOutcome.disqualified, mockTx, DEFAULT_DIALER_THRESHOLDS)
      expect(mockUpdate).toHaveBeenCalledWith({
        where: { id: 'c1' },
        data:  { status: 'dnc', dncReason: 'Disqualified' },
      })
    })

    it('applies company-wide DNC when companyName is set', async () => {
      mockFindUnique.mockResolvedValue({ ...baseContact, companyName: 'Acme Corp' })
      await routeOutcome('c1', CallOutcome.disqualified, mockTx, DEFAULT_DIALER_THRESHOLDS)
      expect(mockUpdateMany).toHaveBeenCalledWith({
        where: {
          tenantId:    't1',
          companyName: { equals: 'Acme Corp', mode: 'insensitive' },
          id:          { not: 'c1' },
          status:      { not: 'dnc' },
          deletedAt:   null,
        },
        data: { status: 'dnc', dncReason: 'Disqualified — company-wide' },
      })
    })

    it('skips company-wide DNC when companyName is null', async () => {
      mockFindUnique.mockResolvedValue({ ...baseContact, companyName: null })
      await routeOutcome('c1', CallOutcome.disqualified, mockTx, DEFAULT_DIALER_THRESHOLDS)
      expect(mockUpdateMany).not.toHaveBeenCalled()
    })
  })

  describe('meeting_booked', () => {
    it('moves contact to meeting_booked list', async () => {
      mockFindUnique.mockResolvedValue(baseContact)
      await routeOutcome('c1', CallOutcome.meeting_booked, mockTx, DEFAULT_DIALER_THRESHOLDS)
      expect(mockUpdate).toHaveBeenCalledWith({
        where: { id: 'c1' },
        data:  { status: 'meeting_booked' },
      })
    })

    it('applies company-wide DNC when companyName is set', async () => {
      mockFindUnique.mockResolvedValue({ ...baseContact, companyName: 'BigCo' })
      await routeOutcome('c1', CallOutcome.meeting_booked, mockTx, DEFAULT_DIALER_THRESHOLDS)
      expect(mockUpdateMany).toHaveBeenCalledWith({
        where: {
          tenantId:    't1',
          companyName: { equals: 'BigCo', mode: 'insensitive' },
          id:          { not: 'c1' },
          status:      { not: 'dnc' },
          deletedAt:   null,
        },
        data: { status: 'dnc', dncReason: 'Irrelevant — meeting secured' },
      })
    })

    it('skips company-wide DNC when companyName is null', async () => {
      mockFindUnique.mockResolvedValue({ ...baseContact, companyName: null })
      await routeOutcome('c1', CallOutcome.meeting_booked, mockTx, DEFAULT_DIALER_THRESHOLDS)
      expect(mockUpdateMany).not.toHaveBeenCalled()
    })
  })

  describe('connected', () => {
    it('makes no status change', async () => {
      mockFindUnique.mockResolvedValue(baseContact)
      await routeOutcome('c1', CallOutcome.connected, mockTx, DEFAULT_DIALER_THRESHOLDS)
      expect(mockUpdate).not.toHaveBeenCalled()
    })
  })

  describe('left_voicemail', () => {
    it('increments dialAttempts like voicemail', async () => {
      mockFindUnique.mockResolvedValue({ ...baseContact, dialAttempts: 3 })
      await routeOutcome('c1', CallOutcome.left_voicemail, mockTx, DEFAULT_DIALER_THRESHOLDS)
      expect(mockUpdate).toHaveBeenCalledWith({ where: { id: 'c1' }, data: { dialAttempts: 4 } })
    })

    it('moves to future at 8 attempts', async () => {
      mockFindUnique.mockResolvedValue({ ...baseContact, dialAttempts: 7 })
      await routeOutcome('c1', CallOutcome.left_voicemail, mockTx, DEFAULT_DIALER_THRESHOLDS)
      expect(mockUpdate).toHaveBeenCalledWith({ where: { id: 'c1' }, data: { dialAttempts: 8, status: 'future' } })
    })
  })

  describe('bad_time_to_speak', () => {
    it('moves contact to call_back', async () => {
      mockFindUnique.mockResolvedValue(baseContact)
      await routeOutcome('c1', CallOutcome.bad_time_to_speak, mockTx, DEFAULT_DIALER_THRESHOLDS)
      expect(mockUpdate).toHaveBeenCalledWith({ where: { id: 'c1' }, data: { status: 'call_back' } })
    })
  })

  describe('in_a_meeting', () => {
    it('moves contact to call_back', async () => {
      mockFindUnique.mockResolvedValue(baseContact)
      await routeOutcome('c1', CallOutcome.in_a_meeting, mockTx, DEFAULT_DIALER_THRESHOLDS)
      expect(mockUpdate).toHaveBeenCalledWith({ where: { id: 'c1' }, data: { status: 'call_back' } })
    })
  })

  describe('on_holiday', () => {
    it('moves contact to call_back', async () => {
      mockFindUnique.mockResolvedValue(baseContact)
      await routeOutcome('c1', CallOutcome.on_holiday, mockTx, DEFAULT_DIALER_THRESHOLDS)
      expect(mockUpdate).toHaveBeenCalledWith({ where: { id: 'c1' }, data: { status: 'call_back' } })
    })
  })

  describe('hung_up', () => {
    it('makes no status change on first disconnected call', async () => {
      mockFindUnique.mockResolvedValue(baseContact)
      mockCount.mockResolvedValue(0)
      await routeOutcome('c1', CallOutcome.hung_up, mockTx, DEFAULT_DIALER_THRESHOLDS)
      expect(mockUpdate).not.toHaveBeenCalled()
    })

    it('moves contact to dnc on second disconnected call', async () => {
      mockFindUnique.mockResolvedValue(baseContact)
      mockCount.mockResolvedValue(1)
      await routeOutcome('c1', CallOutcome.hung_up, mockTx, DEFAULT_DIALER_THRESHOLDS)
      expect(mockUpdate).toHaveBeenCalledWith({
        where: { id: 'c1' },
        data:  { status: 'dnc', dncReason: 'Disconnected twice' },
      })
    })

    it('counts prior hung_up records with correct filters', async () => {
      mockFindUnique.mockResolvedValue({ ...baseContact, tenantId: 't1' })
      mockCount.mockResolvedValue(1)
      await routeOutcome('c1', CallOutcome.hung_up, mockTx, DEFAULT_DIALER_THRESHOLDS)
      expect(mockCount).toHaveBeenCalledWith({
        where: { contactId: 'c1', outcome: CallOutcome.hung_up, tenantId: 't1' },
      })
    })
  })

  describe('does_not_take_cold_calls', () => {
    it('moves contact to dnc', async () => {
      mockFindUnique.mockResolvedValue(baseContact)
      await routeOutcome('c1', CallOutcome.does_not_take_cold_calls, mockTx, DEFAULT_DIALER_THRESHOLDS)
      expect(mockUpdate).toHaveBeenCalledWith({
        where: { id: 'c1' },
        data:  { status: 'dnc', dncReason: 'Does not take cold calls' },
      })
    })
  })

  describe('ai_assistant', () => {
    it('increments dialAttempts', async () => {
      mockFindUnique.mockResolvedValue({ ...baseContact, dialAttempts: 2 })
      await routeOutcome('c1', CallOutcome.ai_assistant, mockTx, DEFAULT_DIALER_THRESHOLDS)
      expect(mockUpdate).toHaveBeenCalledWith({ where: { id: 'c1' }, data: { dialAttempts: 3 } })
    })

    it('moves to future at 8 attempts', async () => {
      mockFindUnique.mockResolvedValue({ ...baseContact, dialAttempts: 7 })
      await routeOutcome('c1', CallOutcome.ai_assistant, mockTx, DEFAULT_DIALER_THRESHOLDS)
      expect(mockUpdate).toHaveBeenCalledWith({ where: { id: 'c1' }, data: { dialAttempts: 8, status: 'future' } })
    })
  })

  describe('line_engaged', () => {
    it('increments dialAttempts', async () => {
      mockFindUnique.mockResolvedValue({ ...baseContact, dialAttempts: 0 })
      await routeOutcome('c1', CallOutcome.line_engaged, mockTx, DEFAULT_DIALER_THRESHOLDS)
      expect(mockUpdate).toHaveBeenCalledWith({ where: { id: 'c1' }, data: { dialAttempts: 1 } })
    })

    it('moves to future at 8 attempts', async () => {
      mockFindUnique.mockResolvedValue({ ...baseContact, dialAttempts: 7 })
      await routeOutcome('c1', CallOutcome.line_engaged, mockTx, DEFAULT_DIALER_THRESHOLDS)
      expect(mockUpdate).toHaveBeenCalledWith({ where: { id: 'c1' }, data: { dialAttempts: 8, status: 'future' } })
    })
  })

  describe('wrong_number', () => {
    it('moves contact to dnc with wrong number reason', async () => {
      mockFindUnique.mockResolvedValue(baseContact)
      await routeOutcome('c1', CallOutcome.wrong_number, mockTx, DEFAULT_DIALER_THRESHOLDS)
      expect(mockUpdate).toHaveBeenCalledWith({
        where: { id: 'c1' },
        data:  { status: 'dnc', dncReason: 'Wrong number' },
      })
    })
  })

  describe('mobile_switched_off', () => {
    it('increments dialAttempts', async () => {
      mockFindUnique.mockResolvedValue({ ...baseContact, dialAttempts: 4 })
      await routeOutcome('c1', CallOutcome.mobile_switched_off, mockTx, DEFAULT_DIALER_THRESHOLDS)
      expect(mockUpdate).toHaveBeenCalledWith({ where: { id: 'c1' }, data: { dialAttempts: 5 } })
    })

    it('moves to future at 8 attempts', async () => {
      mockFindUnique.mockResolvedValue({ ...baseContact, dialAttempts: 7 })
      await routeOutcome('c1', CallOutcome.mobile_switched_off, mockTx, DEFAULT_DIALER_THRESHOLDS)
      expect(mockUpdate).toHaveBeenCalledWith({ where: { id: 'c1' }, data: { dialAttempts: 8, status: 'future' } })
    })
  })

  describe('foreign_dial_tone', () => {
    it('increments dialAttempts', async () => {
      mockFindUnique.mockResolvedValue({ ...baseContact, dialAttempts: 1 })
      await routeOutcome('c1', CallOutcome.foreign_dial_tone, mockTx, DEFAULT_DIALER_THRESHOLDS)
      expect(mockUpdate).toHaveBeenCalledWith({ where: { id: 'c1' }, data: { dialAttempts: 2 } })
    })

    it('moves to future at 8 attempts', async () => {
      mockFindUnique.mockResolvedValue({ ...baseContact, dialAttempts: 7 })
      await routeOutcome('c1', CallOutcome.foreign_dial_tone, mockTx, DEFAULT_DIALER_THRESHOLDS)
      expect(mockUpdate).toHaveBeenCalledWith({ where: { id: 'c1' }, data: { dialAttempts: 8, status: 'future' } })
    })
  })

  describe('not_available', () => {
    it('increments dialAttempts', async () => {
      mockFindUnique.mockResolvedValue({ ...baseContact, dialAttempts: 5 })
      await routeOutcome('c1', CallOutcome.not_available, mockTx, DEFAULT_DIALER_THRESHOLDS)
      expect(mockUpdate).toHaveBeenCalledWith({ where: { id: 'c1' }, data: { dialAttempts: 6 } })
    })

    it('moves to future at 8 attempts', async () => {
      mockFindUnique.mockResolvedValue({ ...baseContact, dialAttempts: 7 })
      await routeOutcome('c1', CallOutcome.not_available, mockTx, DEFAULT_DIALER_THRESHOLDS)
      expect(mockUpdate).toHaveBeenCalledWith({ where: { id: 'c1' }, data: { dialAttempts: 8, status: 'future' } })
    })
  })

  describe('other', () => {
    it('increments dialAttempts', async () => {
      mockFindUnique.mockResolvedValue({ ...baseContact, dialAttempts: 0 })
      await routeOutcome('c1', CallOutcome.other, mockTx, DEFAULT_DIALER_THRESHOLDS)
      expect(mockUpdate).toHaveBeenCalledWith({ where: { id: 'c1' }, data: { dialAttempts: 1 } })
    })

    it('moves to future at 8 attempts', async () => {
      mockFindUnique.mockResolvedValue({ ...baseContact, dialAttempts: 7 })
      await routeOutcome('c1', CallOutcome.other, mockTx, DEFAULT_DIALER_THRESHOLDS)
      expect(mockUpdate).toHaveBeenCalledWith({ where: { id: 'c1' }, data: { dialAttempts: 8, status: 'future' } })
    })
  })
})

describe('routeOutcome with custom thresholds', () => {
  beforeEach(() => vi.clearAllMocks())

  it('moves to future list at custom dialUnresponsiveLimit', async () => {
    const thresholds: DialerThresholds = { ...DEFAULT_DIALER_THRESHOLDS, dialUnresponsiveLimit: 3 }
    mockFindUnique.mockResolvedValue({ ...baseContact, dialAttempts: 2 })
    await routeOutcome('c1', CallOutcome.no_answer, mockTx, thresholds)
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data:  { dialAttempts: 3, status: 'future' },
    })
  })

  it('does not move to future at dialAttempts below custom limit', async () => {
    const thresholds: DialerThresholds = { ...DEFAULT_DIALER_THRESHOLDS, dialUnresponsiveLimit: 5 }
    mockFindUnique.mockResolvedValue({ ...baseContact, dialAttempts: 2 })
    await routeOutcome('c1', CallOutcome.no_answer, mockTx, thresholds)
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data:  { dialAttempts: 3 },
    })
  })

  it('uses custom notInterestedCooldownDays', async () => {
    const thresholds: DialerThresholds = { ...DEFAULT_DIALER_THRESHOLDS, notInterestedCooldownDays: 14 }
    mockFindUnique.mockResolvedValue(baseContact)
    const before = Date.now()
    await routeOutcome('c1', CallOutcome.not_interested, mockTx, thresholds)
    const call = mockUpdate.mock.calls[0][0]
    const diffDays = (call.data.notInterestedUntil.getTime() - before) / (1000 * 60 * 60 * 24)
    expect(diffDays).toBeGreaterThanOrEqual(13.9)
    expect(diffDays).toBeLessThanOrEqual(14.1)
  })
})

describe('notesRequiredFor', () => {
  it('returns true for pipeline-eligible outcomes', () => {
    expect(notesRequiredFor(CallOutcome.connected)).toBe(true)
    expect(notesRequiredFor(CallOutcome.lead)).toBe(true)
    expect(notesRequiredFor(CallOutcome.call_back_later)).toBe(true)
    expect(notesRequiredFor(CallOutcome.meeting_booked)).toBe(true)
  })

  it('returns false for outcomes outside the pipeline-eligible set', () => {
    expect(notesRequiredFor(CallOutcome.no_answer)).toBe(false)
    expect(notesRequiredFor(CallOutcome.not_interested)).toBe(false)
    expect(notesRequiredFor(CallOutcome.disqualified)).toBe(false)
  })
})
