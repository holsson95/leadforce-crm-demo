import { describe, it, expect } from 'vitest'
import { getClientPermission } from '../client-portal'

describe('getClientPermission', () => {
  it('returns true for empty permissions (default allow-all)', () => {
    expect(getClientPermission({}, 'pipeline.write')).toBe(true)
  })

  it('returns true when the nested key is absent', () => {
    expect(getClientPermission({ pipeline: { read: true } }, 'pipeline.write')).toBe(true)
  })

  it('returns false when the nested key is explicitly false', () => {
    expect(getClientPermission({ pipeline: { write: false } }, 'pipeline.write')).toBe(false)
  })

  it('returns true when the nested key is explicitly true', () => {
    expect(getClientPermission({ pipeline: { write: true } }, 'pipeline.write')).toBe(true)
  })

  it('returns true for single-level key that is absent', () => {
    expect(getClientPermission({}, 'campaigns')).toBe(true)
  })

  it('returns false for single-level key explicitly set to false', () => {
    expect(getClientPermission({ campaigns: false }, 'campaigns')).toBe(false)
  })

  it('returns true when permissions is null', () => {
    expect(getClientPermission(null, 'pipeline.write')).toBe(true)
  })
})
