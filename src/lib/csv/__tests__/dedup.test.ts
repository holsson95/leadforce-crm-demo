import { describe, it, expect } from 'vitest'
import { computeDedupeHash, normalizeField } from '../dedup'

describe('normalizeField', () => {
  it('lowercases and trims', () => {
    expect(normalizeField('  JOHN@EXAMPLE.COM  ')).toBe('john@example.com')
  })
  it('removes internal whitespace', () => {
    expect(normalizeField('+1 555 000 0000')).toBe('+15550000000')
  })
  it('handles null', () => {
    expect(normalizeField(null)).toBe('')
  })
  it('handles undefined', () => {
    expect(normalizeField(undefined)).toBe('')
  })
})

describe('computeDedupeHash', () => {
  it('returns same hash for same email+phone regardless of case/spaces', () => {
    const a = computeDedupeHash('john@example.com', '5550001234')
    const b = computeDedupeHash('JOHN@EXAMPLE.COM', ' 555 000 1234 ')
    expect(a).toBe(b)
  })
  it('returns same hash when only email differs by case', () => {
    const a = computeDedupeHash('john@test.com', null)
    const b = computeDedupeHash('JOHN@TEST.COM', null)
    expect(a).toBe(b)
  })
  it('returns different hashes for different contacts', () => {
    const a = computeDedupeHash('john@test.com', null)
    const b = computeDedupeHash('jane@test.com', null)
    expect(a).not.toBe(b)
  })
  it('returns a UUID (36 chars) when both email and phone are null', () => {
    const hash = computeDedupeHash(null, null)
    expect(hash).toMatch(/^[0-9a-f-]{36}$/)
  })
  it('returns different UUIDs for two contacts with no email/phone', () => {
    const a = computeDedupeHash(null, null)
    const b = computeDedupeHash(null, null)
    expect(a).not.toBe(b)
  })
  it('returns a 64-char hex string for contacts with email or phone', () => {
    const hash = computeDedupeHash('test@test.com', null)
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
  })
})
