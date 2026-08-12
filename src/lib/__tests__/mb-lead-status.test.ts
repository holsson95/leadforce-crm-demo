import { describe, it, expect } from 'vitest'
import { MBLeadStatus } from '@prisma/client'
import { classifyMBLeadStatus } from '../mb-lead-status'

describe('classifyMBLeadStatus', () => {
  const now = new Date('2026-05-04T12:00:00Z')
  const recentContact = new Date('2026-04-20T00:00:00Z')  // 14 days ago
  const oldContact    = new Date('2026-03-01T00:00:00Z')  // 64 days ago

  it('returns first_conversation when no prior conversations', () => {
    expect(classifyMBLeadStatus(0, recentContact, now)).toBe(MBLeadStatus.first_conversation)
  })

  it('returns nurtured_lead when contact is older than 30 days and prior convs exist', () => {
    expect(classifyMBLeadStatus(2, oldContact, now)).toBe(MBLeadStatus.nurtured_lead)
  })

  it('returns follow_up when prior convs exist and contact is recent', () => {
    expect(classifyMBLeadStatus(1, recentContact, now)).toBe(MBLeadStatus.follow_up)
  })

  it('returns first_conversation even when contact is old, if no prior convs', () => {
    expect(classifyMBLeadStatus(0, oldContact, now)).toBe(MBLeadStatus.first_conversation)
  })

  it('returns nurtured_lead at exactly 30 days boundary (just over)', () => {
    const thirtyOneDaysAgo = new Date(now.getTime() - 31 * 24 * 60 * 60 * 1000)
    expect(classifyMBLeadStatus(1, thirtyOneDaysAgo, now)).toBe(MBLeadStatus.nurtured_lead)
  })

  it('returns follow_up at exactly 30 days boundary (just under)', () => {
    const twentyNineDaysAgo = new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000)
    expect(classifyMBLeadStatus(1, twentyNineDaysAgo, now)).toBe(MBLeadStatus.follow_up)
  })
})
