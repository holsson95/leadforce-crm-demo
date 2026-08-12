import { describe, it, expect } from 'vitest'
import { buildContactLookupWhere } from '../contact-lookup'

describe('buildContactLookupWhere', () => {
  it('matches nothing for an empty query', () => {
    const where = buildContactLookupWhere('tenant1', '')
    expect(where).toEqual({ tenantId: 'tenant1', deletedAt: null, OR: [] })
  })

  it('matches nothing for a whitespace-only query', () => {
    const where = buildContactLookupWhere('tenant1', '   ')
    expect(where).toEqual({ tenantId: 'tenant1', deletedAt: null, OR: [] })
  })

  it('builds text-only OR clauses for a name query', () => {
    const where = buildContactLookupWhere('tenant1', 'john') as { OR: unknown[] }
    expect(where.OR).toEqual([
      { firstName: { contains: 'john', mode: 'insensitive' } },
      { lastName: { contains: 'john', mode: 'insensitive' } },
      { email: { contains: 'john', mode: 'insensitive' } },
      { companyName: { contains: 'john', mode: 'insensitive' } },
    ])
  })

  it('adds exact digit-match clauses for a phone-shaped query', () => {
    const where = buildContactLookupWhere('tenant1', '+1 (555) 123-4567') as { OR: unknown[] }
    expect(where.OR).toContainEqual({ mobilePhoneDigits: { equals: '5551234567' } })
    expect(where.OR).toContainEqual({ corporatePhoneDigits: { equals: '5551234567' } })
  })

  it('always scopes to tenantId and excludes soft-deleted contacts', () => {
    const where = buildContactLookupWhere('tenant1', 'john') as { tenantId: string; deletedAt: null }
    expect(where.tenantId).toBe('tenant1')
    expect(where.deletedAt).toBeNull()
  })
})
