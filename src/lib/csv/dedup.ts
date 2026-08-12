import { createHash, randomUUID } from 'crypto'

export function normalizeField(value: string | null | undefined): string {
  return (value ?? '').toLowerCase().replace(/\s+/g, '')
}

export function computeDedupeHash(email: string | null, mobilePhone: string | null): string {
  const normalizedEmail = normalizeField(email)
  const normalizedPhone = normalizeField(mobilePhone)

  if (!normalizedEmail && !normalizedPhone) {
    return randomUUID()
  }

  return createHash('sha256')
    .update(`${normalizedEmail}|${normalizedPhone}`)
    .digest('hex')
}
