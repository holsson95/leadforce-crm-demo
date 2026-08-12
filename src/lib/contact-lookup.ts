import type { Prisma } from '@prisma/client'
import { normalizePhoneDigits } from './utils/phone'

export function buildContactLookupWhere(tenantId: string, query: string): Prisma.ContactWhereInput {
  const trimmed = query.trim()
  if (!trimmed) {
    return { tenantId, deletedAt: null, OR: [] }
  }

  const digits = normalizePhoneDigits(trimmed)

  const or: Prisma.ContactWhereInput[] = [
    { firstName:   { contains: trimmed, mode: 'insensitive' } },
    { lastName:    { contains: trimmed, mode: 'insensitive' } },
    { email:       { contains: trimmed, mode: 'insensitive' } },
    { companyName: { contains: trimmed, mode: 'insensitive' } },
  ]

  if (digits) {
    or.push({ mobilePhoneDigits: { equals: digits } })
    or.push({ corporatePhoneDigits: { equals: digits } })
  }

  return { tenantId, deletedAt: null, OR: or }
}
