'use server'

import { revalidatePath } from 'next/cache'
import { db, withTenant } from '@/lib/db'
import { getCurrentTenantId, requirePermission } from '@/lib/auth'
import { computeDedupeHash } from '@/lib/csv/dedup'
import { normalizePhoneDigits } from '@/lib/utils/phone'
import { ContactSchema } from './schemas'
import type { ContactFormData } from './schemas'

export async function createContact(data: ContactFormData) {
  await requirePermission('contacts:write')
  const tenantId = await getCurrentTenantId()
  if (!tenantId) throw new Error('No tenant context')

  const parsed = ContactSchema.parse(data)
  const dedupeHash = computeDedupeHash(parsed.email || null, parsed.mobilePhone || null)
  const mobilePhoneDigits = normalizePhoneDigits(parsed.mobilePhone)
  const corporatePhoneDigits = normalizePhoneDigits(parsed.corporatePhone)

  const contact = await withTenant(tenantId, () =>
    db.contact.create({
      data: {
        tenantId,
        campaignId:     parsed.campaignId,
        firstName:      parsed.firstName,
        lastName:       parsed.lastName,
        email:          parsed.email          || null,
        mobilePhone:    parsed.mobilePhone    || null,
        corporatePhone: parsed.corporatePhone || null,
        mobilePhoneDigits,
        corporatePhoneDigits,
        companyName:    parsed.companyName    || null,
        jobTitle:       parsed.jobTitle       || null,
        industry:       parsed.industry       || null,
        employeeCount:  parsed.employeeCount ? Number(parsed.employeeCount) : null,
        address:        parsed.address        || null,
        city:           parsed.city           || null,
        state:          parsed.state          || null,
        zip:            parsed.zip            || null,
        country:        parsed.country        || null,
        companyAddress: parsed.companyAddress || null,
        companyCity:    parsed.companyCity    || null,
        website:        parsed.website        || null,
        linkedinUrl:    parsed.linkedinUrl    || null,
        status:         parsed.status,
        dncReason:      parsed.dncReason      || null,
        accountOwnerId: parsed.accountOwnerId || null,
        dedupeHash,
      },
    })
  )

  revalidatePath('/contacts')
  return contact
}

export async function updateContact(id: string, data: ContactFormData) {
  await requirePermission('contacts:write')
  const tenantId = await getCurrentTenantId()
  if (!tenantId) throw new Error('No tenant context')

  const parsed = ContactSchema.parse(data)
  const existing = await withTenant(tenantId, () =>
    db.contact.findUnique({ where: { id }, select: { email: true, mobilePhone: true, corporatePhone: true } })
  )
  const emailForHash = parsed.email !== undefined ? parsed.email : existing?.email
  const phoneForHash = parsed.mobilePhone !== undefined ? parsed.mobilePhone : existing?.mobilePhone
  const dedupeHash = computeDedupeHash(emailForHash || null, phoneForHash || null)
  const corporatePhoneForUpdate = parsed.corporatePhone !== undefined ? parsed.corporatePhone : existing?.corporatePhone
  const mobilePhoneDigits = normalizePhoneDigits(phoneForHash)
  const corporatePhoneDigits = normalizePhoneDigits(corporatePhoneForUpdate)

  await withTenant(tenantId, () =>
    db.contact.update({
      where: { id },
      data: {
        campaignId:     parsed.campaignId,
        firstName:      parsed.firstName,
        lastName:       parsed.lastName,
        email:          parsed.email          || null,
        mobilePhone:    parsed.mobilePhone    || null,
        corporatePhone: parsed.corporatePhone || null,
        mobilePhoneDigits,
        corporatePhoneDigits,
        companyName:    parsed.companyName    || null,
        jobTitle:       parsed.jobTitle       || null,
        industry:       parsed.industry       || null,
        employeeCount:  parsed.employeeCount ? Number(parsed.employeeCount) : null,
        address:        parsed.address        || null,
        city:           parsed.city           || null,
        state:          parsed.state          || null,
        zip:            parsed.zip            || null,
        country:        parsed.country        || null,
        companyAddress: parsed.companyAddress || null,
        companyCity:    parsed.companyCity    || null,
        website:        parsed.website        || null,
        linkedinUrl:    parsed.linkedinUrl    || null,
        status:         parsed.status,
        dncReason:      parsed.dncReason      || null,
        accountOwnerId: parsed.accountOwnerId || null,
        dedupeHash,
      },
    })
  )

  revalidatePath('/contacts')
}

export async function deleteContact(id: string) {
  await requirePermission('contacts:write')
  const tenantId = await getCurrentTenantId()
  if (!tenantId) throw new Error('No tenant context')

  await withTenant(tenantId, () =>
    db.contact.update({
      where: { id },
      data: { deletedAt: new Date() },
    })
  )

  revalidatePath('/contacts')
}
