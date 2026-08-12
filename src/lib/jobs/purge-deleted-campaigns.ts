import { db } from '@/lib/db'

export async function purgeDeletedCampaigns(): Promise<number> {
  const cutoff = new Date(Date.now() - 72 * 60 * 60 * 1000)

  const expired = await db.campaign.findMany({
    where: { deletedAt: { not: null, lt: cutoff } },
    select: { id: true },
  })

  if (expired.length === 0) return 0

  const ids = expired.map(c => c.id)

  await db.$transaction(async (tx) => {
    await tx.scriptVersion.deleteMany({ where: { script: { campaignId: { in: ids } } } })
    await tx.contactNote.deleteMany({ where: { contact: { campaignId: { in: ids } } } })
    await tx.task.deleteMany({ where: { campaignId: { in: ids } } })
    await tx.pipelineDeal.deleteMany({ where: { campaignId: { in: ids } } })
    await tx.callRecord.deleteMany({ where: { campaignId: { in: ids } } })
    await tx.session.deleteMany({ where: { campaignId: { in: ids } } })
    await tx.script.deleteMany({ where: { campaignId: { in: ids } } })
    await tx.campaignSDR.deleteMany({ where: { campaignId: { in: ids } } })
    await tx.contact.deleteMany({ where: { campaignId: { in: ids } } })
    await tx.campaign.deleteMany({ where: { id: { in: ids } } })
  })

  return ids.length
}
