import { db } from '@/lib/db'

type TxClient = Parameters<Parameters<typeof db.$transaction>[0]>[0]

interface AutoCreateDealParams {
  contactId:  string
  campaignId: string
  tenantId:   string
}

export async function autoCreateDeal(
  { contactId, campaignId, tenantId }: AutoCreateDealParams,
  tx: TxClient
): Promise<void> {
  const [campaign, contact] = await Promise.all([
    tx.campaign.findUnique({
      where:  { id: campaignId },
      select: { clientId: true },
    }),
    tx.contact.findUnique({
      where:  { id: contactId },
      select: { firstName: true, lastName: true, companyName: true },
    }),
  ])

  if (!campaign || !contact) return

  const firstStage = await tx.pipelineStage.findFirst({
    where:   { clientId: campaign.clientId },
    orderBy: { position: 'asc' },
    select:  { id: true },
  })

  if (!firstStage) return

  const title = contact.companyName
    ? `${contact.firstName} ${contact.lastName} — ${contact.companyName}`
    : `${contact.firstName} ${contact.lastName}`

  await tx.pipelineDeal.upsert({
    where:  { contactId_campaignId: { contactId, campaignId } },
    create: {
      tenantId,
      clientId:   campaign.clientId,
      stageId:    firstStage.id,
      contactId,
      campaignId,
      title,
      source: 'auto',
    },
    update: { stageId: firstStage.id },
  })
}
