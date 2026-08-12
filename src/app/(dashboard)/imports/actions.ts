'use server'

import { revalidatePath } from 'next/cache'
import { Prisma } from '@prisma/client'
import { db, withTenant } from '@/lib/db'
import { getCurrentTenantId, requirePermission } from '@/lib/auth'
import { processRows } from '@/lib/csv/parse'
import type {
  ColumnMapping, RawRow, MappedRow,
  DuplicateRow, ImportPreviewResult, ImportResult,
} from '@/lib/csv/types'

export async function parseImportPreview(
  rawRows: RawRow[],
  mappings: ColumnMapping[],
  campaignId: string
): Promise<ImportPreviewResult> {
  await requirePermission('contacts:write')
  const tenantId = await getCurrentTenantId()
  if (!tenantId) throw new Error('No tenant context')

  const { valid, invalidCount } = processRows(rawRows, mappings)
  const hashes = valid.map((r) => r.dedupeHash)

  const existingInCampaign = await withTenant(tenantId, () =>
    db.contact.findMany({
      where: { campaignId, dedupeHash: { in: hashes }, deletedAt: null },
      select: {
        id: true, firstName: true, lastName: true,
        email: true, mobilePhone: true, companyName: true,
        status: true, dedupeHash: true,
      },
    })
  )
  const existingHashMap = new Map(existingInCampaign.map((c) => [c.dedupeHash, c]))

  const dncContacts = await withTenant(tenantId, () =>
    db.contact.findMany({
      where: { status: 'dnc', dedupeHash: { in: hashes }, deletedAt: null },
      select: { dedupeHash: true, dncReason: true },
    })
  )
  const dncHashes = new Set(dncContacts.map((c) => c.dedupeHash))
  const dncReasonMap = new Map(dncContacts.map((c) => [c.dedupeHash, c.dncReason ?? undefined]))

  const clean: MappedRow[] = []
  const duplicates: DuplicateRow[] = []
  const dnc: MappedRow[] = []

  for (const row of valid) {
    if (dncHashes.has(row.dedupeHash)) {
      dnc.push({ ...row, dncReason: dncReasonMap.get(row.dedupeHash) })
    } else if (existingHashMap.has(row.dedupeHash)) {
      duplicates.push({
        incoming: row,
        existing: existingHashMap.get(row.dedupeHash)!,
        resolution: 'skip',
      })
    } else {
      clean.push(row)
    }
  }

  return { clean, duplicates, dnc, invalidRowCount: invalidCount }
}

export async function importContacts(
  cleanRows: MappedRow[],
  resolvedDuplicates: DuplicateRow[],
  campaignId: string
): Promise<ImportResult> {
  await requirePermission('contacts:write')
  const tenantId = await getCurrentTenantId()
  if (!tenantId) throw new Error('No tenant context')

  const toCreate = cleanRows.map((row) => ({ tenantId, campaignId, ...row }))
  const toOverwrite = resolvedDuplicates.filter((d) => d.resolution === 'overwrite')
  const skipped = resolvedDuplicates.filter((d) => d.resolution === 'skip').length

  const result = await withTenant(tenantId, () =>
    db.$transaction(async (tx) => {
      let created = 0
      if (toCreate.length > 0) {
        const hashes = toCreate.map((r) => r.dedupeHash)
        // Raw query bypasses the Prisma middleware that injects deletedAt: null
        // into findMany, so we can find soft-deleted contacts for restoration.
        const existingRaw = await tx.$queryRaw<{ id: string; dedupeHash: string }[]>(
          Prisma.sql`
            SELECT id, "dedupeHash" FROM "Contact"
            WHERE "tenantId" = ${tenantId}
            AND "dedupeHash" IN (${Prisma.join(hashes)})
          `
        )
        const existingById = new Map(existingRaw.map((c) => [c.dedupeHash, c.id]))

        const brandNew = toCreate.filter((r) => !existingById.has(r.dedupeHash))
        const toRestore = toCreate.filter((r) => existingById.has(r.dedupeHash))

        if (brandNew.length > 0) {
          const res = await tx.contact.createMany({ data: brandNew, skipDuplicates: true })
          created += res.count
        }
        for (const row of toRestore) {
          await tx.contact.update({
            where: { id: existingById.get(row.dedupeHash)! },
            data: { ...row, deletedAt: null },
          })
          created++
        }
      }
      for (const dup of toOverwrite) {
        await tx.contact.update({
          where: { id: dup.existing.id },
          data: {
            firstName:      dup.incoming.firstName,
            lastName:       dup.incoming.lastName,
            email:          dup.incoming.email,
            mobilePhone:    dup.incoming.mobilePhone,
            corporatePhone: dup.incoming.corporatePhone,
            mobilePhoneDigits:    dup.incoming.mobilePhoneDigits,
            corporatePhoneDigits: dup.incoming.corporatePhoneDigits,
            companyName:    dup.incoming.companyName,
            jobTitle:       dup.incoming.jobTitle,
            industry:       dup.incoming.industry,
            employeeCount:  dup.incoming.employeeCount,
            address:        dup.incoming.address,
            city:           dup.incoming.city,
            state:          dup.incoming.state,
            zip:            dup.incoming.zip,
            country:        dup.incoming.country,
            companyAddress: dup.incoming.companyAddress,
            companyCity:    dup.incoming.companyCity,
            website:        dup.incoming.website,
            linkedinUrl:    dup.incoming.linkedinUrl,
            dedupeHash:     dup.incoming.dedupeHash,
          },
        })
      }
      return created
    })
  )

  revalidatePath('/contacts')

  return {
    created: result,
    overwritten: toOverwrite.length,
    skipped,
    dncBlocked: 0,
  }
}
