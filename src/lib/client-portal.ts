import { db, withTenant } from '@/lib/db'
import { getCurrentClerkUser } from '@/lib/auth'
import type { Prisma } from '@prisma/client'

// Intentionally called outside withTenant — we look up by clerkId which is unique
// across all tenants. The result gives us tenantId for subsequent scoped queries.
export async function getCurrentClientRecord() {
  const user = await getCurrentClerkUser()
  if (!user) return null
  return db.client.findUnique({ where: { clerkId: user.id } })
}

// Resolves a dot-notation key against portalPermissions JSON.
// Returns true when the key is absent — restrictions must be explicitly set to false.
export function getClientPermission(permissions: Prisma.JsonValue, key: string): boolean {
  const parts = key.split('.')
  let current: unknown = permissions
  for (const part of parts) {
    if (typeof current !== 'object' || current === null) return true
    current = (current as Record<string, unknown>)[part]
  }
  if (current === undefined || current === null) return true
  return Boolean(current)
}

export async function getPortalSummary(clientId: string, tenantId: string) {
  return withTenant(tenantId, async () => {
    const [activeCampaigns, meetingsBooked, openDeals] = await Promise.all([
      db.campaign.count({ where: { clientId, status: 'active' } }),
      db.callRecord.count({ where: { campaign: { clientId }, outcome: 'meeting_booked' } }),
      db.pipelineDeal.findMany({
        where:  { clientId, closedAt: null },
        select: { id: true, value: true },
      }),
    ])
    const openDealCount = openDeals.length
    const openDealValue = openDeals.reduce((sum, d) => sum + (d.value ? Number(d.value) : 0), 0)
    return { activeCampaigns, meetingsBooked, openDealCount, openDealValue }
  })
}

export async function getPortalDealsGrouped(clientId: string, tenantId: string) {
  return withTenant(tenantId, async () => {
    const [stages, rawDeals] = await Promise.all([
      db.pipelineStage.findMany({
        where:   { clientId },
        select:  { id: true, name: true, color: true, position: true },
        orderBy: { position: 'asc' },
      }),
      db.pipelineDeal.findMany({
        where:   { clientId, closedAt: null },
        select:  {
          id:      true,
          title:   true,
          value:   true,
          stageId: true,
          contact: { select: { firstName: true, lastName: true, companyName: true } },
        },
        orderBy: { createdAt: 'desc' },
        take:    20,
      }),
    ])
    // Convert Prisma Decimal to string so PortalDealsList receives string | null
    const deals = rawDeals.map((d) => ({ ...d, value: d.value != null ? d.value.toString() : null }))
    return { stages, deals }
  })
}

export async function getPortalPipelineData(clientId: string, tenantId: string) {
  return withTenant(tenantId, async () => {
    const [rawStages, rawDeals] = await Promise.all([
      db.pipelineStage.findMany({
        where:   { clientId },
        select:  { id: true, name: true, color: true, position: true },
        orderBy: { position: 'asc' },
      }),
      db.pipelineDeal.findMany({
        where:  { clientId, closedAt: null },
        select: {
          id:        true,
          stageId:   true,
          clientId:  true,
          contactId: true,
          title:     true,
          value:     true,
          notes:     true,
          source:    true,
          createdAt: true,
          contact:   { select: { firstName: true, lastName: true, companyName: true } },
          campaign:  { select: { name: true } },
        },
      }),
    ])
    return { rawStages, rawDeals }
  })
}
