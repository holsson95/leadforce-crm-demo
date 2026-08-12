import { describe, it, expect } from 'vitest'
import { getCityTimezone, formatLocalTime } from '../timezone'

describe('getCityTimezone', () => {
  it('resolves Sydney to Australia/Sydney', () => {
    expect(getCityTimezone('Sydney', 'AU')).toBe('Australia/Sydney')
  })

  it('resolves Melbourne to Australia/Melbourne', () => {
    expect(getCityTimezone('Melbourne', 'AU')).toBe('Australia/Melbourne')
  })

  it('resolves London to Europe/London', () => {
    expect(getCityTimezone('London', 'GB')).toBe('Europe/London')
  })

  it('returns null for unknown city', () => {
    expect(getCityTimezone('XyzNoSuchCityEver')).toBeNull()
  })

  it('uses country to disambiguate when city name is shared', () => {
    const au = getCityTimezone('Perth', 'AU')
    expect(au).toBe('Australia/Perth')
  })

  it('falls back to first result when country not provided', () => {
    const result = getCityTimezone('Sydney')
    expect(result).toBeTruthy()
  })
})

describe('formatLocalTime', () => {
  it('returns a formatted AM/PM time string', () => {
    const result = formatLocalTime('Australia/Sydney')
    expect(result).toMatch(/^\d{1,2}:\d{2}\s*(AM|PM)$/i)
  })
})
