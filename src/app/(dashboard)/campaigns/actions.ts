'use server'

import { revalidatePath } from 'next/cache'
import { db, withTenant } from '@/lib/db'
import { getCurrentTenantId, requirePermission, getClerkMeta, hasPermission } from '@/lib/auth'
import { CampaignSchema, type CampaignFormData } from './schemas'

export async function createCampaign(data: CampaignFormData): Promise<{ id: string }> {
  await requirePermission('campaigns:write')
  const tenantId = await getCurrentTenantId()
  if (!tenantId) throw new Error('No tenant context')

  const parsed = CampaignSchema.parse(data)

  const campaign = await withTenant(tenantId, async () => {
    const c = await db.campaign.create({
      data: {
        tenantId,
        name: parsed.name,
        clientId: parsed.clientId,
        status: parsed.status,
        dailyTargetCalls: parsed.dailyTargetCalls ?? null,
      },
    })

    if (parsed.sdrIds.length > 0) {
      await db.campaignSDR.createMany({
        data: parsed.sdrIds.map((userId) => ({ campaignId: c.id, userId })),
        skipDuplicates: true,
      })
    }

    return c
  })

  revalidatePath('/campaigns')
  return { id: campaign.id }
}

export async function updateCampaign(id: string, data: CampaignFormData) {
  await requirePermission('campaigns:write')
  const tenantId = await getCurrentTenantId()
  if (!tenantId) throw new Error('No tenant context')

  const parsed = CampaignSchema.parse(data)

  await withTenant(tenantId, () =>
    db.$transaction(async (tx) => {
      const result = await tx.campaign.updateMany({
        where: { id, archivedAt: null, deletedAt: null },
        data: {
          name: parsed.name,
          clientId: parsed.clientId,
          status: parsed.status,
          dailyTargetCalls: parsed.dailyTargetCalls ?? null,
        },
      })
      if (result.count === 0) throw new Error('Campaign not found or cannot be edited')

      await tx.campaignSDR.deleteMany({ where: { campaignId: id } })

      if (parsed.sdrIds.length > 0) {
        await tx.campaignSDR.createMany({
          data: parsed.sdrIds.map((userId) => ({ campaignId: id, userId })),
          skipDuplicates: true,
        })
      }
    })
  )

  revalidatePath('/campaigns')
}

export async function deleteCampaign(id: string): Promise<void> {
  const { role, tenantId } = await getClerkMeta()
  if (!hasPermission(role, 'campaigns:write') || !tenantId) throw new Error('Forbidden')

  await withTenant(tenantId, () =>
    db.campaign.updateMany({
      where: { id, archivedAt: null, deletedAt: null },
      data: { deletedAt: new Date() },
    })
  )
  revalidatePath('/campaigns')
}

export async function archiveCampaign(id: string): Promise<void> {
  const { role, tenantId } = await getClerkMeta()
  if (!hasPermission(role, 'campaigns:write') || !tenantId) throw new Error('Forbidden')

  await withTenant(tenantId, () =>
    db.campaign.updateMany({
      where: { id, archivedAt: null, deletedAt: null },
      data: { archivedAt: new Date() },
    })
  )
  revalidatePath('/campaigns')
}

export async function unarchiveCampaign(id: string): Promise<void> {
  const { role, tenantId } = await getClerkMeta()
  if (!hasPermission(role, 'campaigns:write') || !tenantId) throw new Error('Forbidden')

  await withTenant(tenantId, () =>
    db.campaign.updateMany({
      where: { id, archivedAt: { not: null }, deletedAt: null },
      data: { archivedAt: null },
    })
  )
  revalidatePath('/campaigns')
}

export async function restoreCampaign(id: string): Promise<void> {
  const { role, tenantId } = await getClerkMeta()
  if (!hasPermission(role, 'campaigns:write') || !tenantId) throw new Error('Forbidden')

  const cutoff = new Date(Date.now() - 72 * 60 * 60 * 1000)
  const result = await withTenant(tenantId, () =>
    db.campaign.updateMany({
      where: { id, deletedAt: { not: null, gt: cutoff } },
      data: { deletedAt: null },
    })
  )
  if (result.count === 0) throw new Error('Not found, not deleted, or restore window has expired')
  revalidatePath('/campaigns')
}
