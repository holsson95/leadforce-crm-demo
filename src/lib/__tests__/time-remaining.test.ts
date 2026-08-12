import { describe, it, expect } from 'vitest'
import { timeRemaining } from '../utils/time-remaining'

describe('timeRemaining', () => {
  it('returns "Expired" when window has passed', () => {
    const deletedAt = new Date(Date.now() - 80 * 60 * 60 * 1000).toISOString()
    expect(timeRemaining(deletedAt)).toBe('Expired')
  })

  it('shows hours only when less than 24h remain', () => {
    const now = new Date('2026-05-06T12:00:00Z')
    const deletedAt = new Date('2026-05-04T02:00:00Z').toISOString() // 58h ago → 14h left
    expect(timeRemaining(deletedAt, now)).toBe('14h remaining')
  })

  it('shows days and hours when more than 24h remain', () => {
    const now = new Date('2026-05-06T12:00:00Z')
    const deletedAt = new Date('2026-05-06T00:00:00Z').toISOString() // 12h ago → 60h left = 2d 12h
    expect(timeRemaining(deletedAt, now)).toBe('2d 12h remaining')
  })

  it('returns "Expired" at exactly 72h boundary', () => {
    const now = new Date('2026-05-06T12:00:00Z')
    const deletedAt = new Date('2026-05-03T12:00:00Z').toISOString() // exactly 72h ago
    expect(timeRemaining(deletedAt, now)).toBe('Expired')
  })
})
