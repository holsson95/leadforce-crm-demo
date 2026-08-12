import { describe, it, expect } from 'vitest'
import { normalizePhoneDigits } from '../utils/phone'

describe('normalizePhoneDigits', () => {
  it('strips formatting characters', () => {
    expect(normalizePhoneDigits('555-123-4567')).toBe('5551234567')
  })

  it('strips a leading US country code (+1)', () => {
    expect(normalizePhoneDigits('+1 (555) 123-4567')).toBe('5551234567')
  })

  it('strips a leading US country code with no plus sign', () => {
    expect(normalizePhoneDigits('15551234567')).toBe('5551234567')
  })

  it('leaves a 10-digit number as-is', () => {
    expect(normalizePhoneDigits('5551234567')).toBe('5551234567')
  })

  it('does not strip a leading 1 when the total is not 11 digits', () => {
    expect(normalizePhoneDigits('123')).toBe('123')
  })

  it('leaves non-US-length numbers as-is (no country-code assumption)', () => {
    expect(normalizePhoneDigits('442079460958')).toBe('442079460958')
  })

  it('returns null for null', () => {
    expect(normalizePhoneDigits(null)).toBeNull()
  })

  it('returns null for undefined', () => {
    expect(normalizePhoneDigits(undefined)).toBeNull()
  })

  it('returns null for an empty string', () => {
    expect(normalizePhoneDigits('')).toBeNull()
  })

  it('returns null for a string with no digits', () => {
    expect(normalizePhoneDigits('n/a')).toBeNull()
  })
})
