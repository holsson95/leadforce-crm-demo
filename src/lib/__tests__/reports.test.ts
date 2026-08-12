import { describe, it, expect } from 'vitest'
import {
  getWeekBounds,
  getPriorWeekBounds,
  getMonthBounds,
  getPriorMonthBounds,
  computeCompositeScore,
  computeHealthScore,
  healthScoreLabel,
  computeTrendPct,
  computeMostImprovedId,
} from '../reports'

describe('getWeekBounds', () => {
  it('returns Monday 00:00 as start for a Wednesday', () => {
    const wed = new Date('2026-05-06T15:00:00Z')  // Wednesday
    const { start } = getWeekBounds(wed)
    expect(start.toISOString().startsWith('2026-05-04')).toBe(true)  // Monday
    expect(start.getUTCHours()).toBe(0)
  })

  it('returns Monday 00:00 as start when today is Monday', () => {
    const mon = new Date('2026-05-04T09:00:00Z')
    const { start } = getWeekBounds(mon)
    expect(start.toISOString().startsWith('2026-05-04')).toBe(true)
    expect(start.getUTCHours()).toBe(0)
  })

  it('returns Monday 00:00 as start when today is Sunday', () => {
    const sun = new Date('2026-05-10T23:00:00Z')  // Sunday
    const { start } = getWeekBounds(sun)
    expect(start.toISOString().startsWith('2026-05-04')).toBe(true)  // prior Monday
  })
})

describe('getPriorWeekBounds', () => {
  it('returns the Monday 7 days prior as start', () => {
    const wed = new Date('2026-05-06T15:00:00Z')
    const { start } = getPriorWeekBounds(wed)
    expect(start.toISOString().startsWith('2026-04-27')).toBe(true)  // prior Monday
  })
})

describe('getMonthBounds', () => {
  it('returns the 1st of the current month as start', () => {
    const mid = new Date('2026-05-14T10:00:00Z')
    const { start } = getMonthBounds(mid)
    expect(start.getUTCDate()).toBe(1)
    expect(start.getUTCMonth()).toBe(4)  // May
    expect(start.getUTCHours()).toBe(0)
  })
})

describe('getPriorMonthBounds', () => {
  it('returns April bounds when current month is May', () => {
    const mid = new Date('2026-05-14T10:00:00Z')
    const { start, end } = getPriorMonthBounds(mid)
    expect(start.getUTCMonth()).toBe(3)  // April
    expect(start.getUTCDate()).toBe(1)
    expect(end.getUTCMonth()).toBe(3)    // still April
  })
})

describe('computeCompositeScore', () => {
  it('weights calls 0.3, convs 0.4, mbs 0.3', () => {
    expect(computeCompositeScore(10, 5, 2)).toBeCloseTo(10 * 0.3 + 5 * 0.4 + 2 * 0.3)
  })

  it('returns 0 for all-zero input', () => {
    expect(computeCompositeScore(0, 0, 0)).toBe(0)
  })
})

describe('computeHealthScore', () => {
  it('weights activity 0.6 and conversion 0.4, scales to 100', () => {
    expect(computeHealthScore(1.0, 1.0)).toBe(100)
    expect(computeHealthScore(0.5, 0.5)).toBe(50)
    expect(computeHealthScore(1.0, 0.0)).toBe(60)
    expect(computeHealthScore(0.0, 1.0)).toBe(40)
  })

  it('caps at 100 when activity rate exceeds 1', () => {
    expect(computeHealthScore(1.5, 1.0)).toBe(100)
  })
})

describe('healthScoreLabel', () => {
  it('returns green for score >= 70', () => {
    expect(healthScoreLabel(70)).toBe('green')
    expect(healthScoreLabel(100)).toBe('green')
  })

  it('returns yellow for 40–69', () => {
    expect(healthScoreLabel(40)).toBe('yellow')
    expect(healthScoreLabel(69)).toBe('yellow')
  })

  it('returns red for score < 40', () => {
    expect(healthScoreLabel(39)).toBe('red')
    expect(healthScoreLabel(0)).toBe('red')
  })
})

describe('computeTrendPct', () => {
  it('returns percentage change', () => {
    expect(computeTrendPct(110, 100)).toBe(10)
    expect(computeTrendPct(90, 100)).toBe(-10)
  })

  it('returns 100 when prior is 0 and current is positive', () => {
    expect(computeTrendPct(5, 0)).toBe(100)
  })

  it('returns 0 when both are zero', () => {
    expect(computeTrendPct(0, 0)).toBe(0)
  })
})

describe('computeMostImprovedId', () => {
  it('returns the user with the highest improvement percentage', () => {
    const sdrs = [
      { userId: 'a', currentRaw: 20, priorRaw: 10, hasBothPeriods: true },  // +100%
      { userId: 'b', currentRaw: 30, priorRaw: 20, hasBothPeriods: true },  // +50%
    ]
    expect(computeMostImprovedId(sdrs)).toBe('a')
  })

  it('returns null when no sdr improved', () => {
    const sdrs = [
      { userId: 'a', currentRaw: 10, priorRaw: 20, hasBothPeriods: true },  // declined
    ]
    expect(computeMostImprovedId(sdrs)).toBeNull()
  })

  it('returns null when no sdr has data in both periods', () => {
    const sdrs = [
      { userId: 'a', currentRaw: 20, priorRaw: 10, hasBothPeriods: false },
    ]
    expect(computeMostImprovedId(sdrs)).toBeNull()
  })

  it('returns null when priorRaw is 0 (division by zero guard)', () => {
    const sdrs = [
      { userId: 'a', currentRaw: 20, priorRaw: 0, hasBothPeriods: true },
    ]
    expect(computeMostImprovedId(sdrs)).toBeNull()
  })
})
