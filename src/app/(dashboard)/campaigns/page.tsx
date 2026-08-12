import { redirect } from 'next/navigation'
import { Header } from '@/components/layout/Header'
import { PageShell } from '@/components/layout/PageShell'
import { CampaignsTable } from '@/components/campaigns/CampaignsTable'
import { ArchivedSection } from '@/components/campaigns/ArchivedSection'
import { RecentlyDeletedSection } from '@/components/campaigns/RecentlyDeletedSection'
import { db, withTenant } from '@/lib/db'
import { getCurrentTenantId, getCurrentUserRole, hasPermission } from '@/lib/auth'
import type { ArchivedCampaign, RecentlyDeletedCampaign } from '@/types/models'

async function getPageData(tenantId: string, role: string) {
  const cutoff = new Date(Date.now() - 72 * 60 * 60 * 1000)

  return withTenant(tenantId, async () => {
    const [campaigns, archivedRaw, recentlyDeletedRaw, clients, sdrs] = await Promise.all([
      db.campaign.findMany({
        where: { archivedAt: null, deletedAt: null },
        orderBy: { createdAt: 'desc' },
        include: {
          client: { select: { id: true, name: true } },
          sdrs: { include: { user: { select: { id: true, name: true, email: true } } } },
        },
      }),
      db.campaign.findMany({
        where: { archivedAt: { not: null }, deletedAt: null },
        orderBy: { archivedAt: 'desc' },
        select: { id: true, name: true, archivedAt: true, client: { select: { name: true } } },
      }),
      db.campaign.findMany({
        where: { deletedAt: { gt: cutoff } },
        orderBy: { deletedAt: 'desc' },
        select: { id: true, name: true, deletedAt: true, client: { select: { name: true } } },
      }),
      hasPermission(role, 'clients:read')
        ? db.client.findMany({
            where: { deletedAt: null },
            select: { id: true, name: true },
            orderBy: { name: 'asc' },
          })
        : Promise.resolve([]),
      hasPermission(role, 'sdrs:manage')
        ? db.user.findMany({
            where: { role: { in: ['sdr', 'manager', 'admin'] }, tenantId },
            select: { id: true, name: true, email: true, role: true },
            orderBy: { name: 'asc' },
          })
        : Promise.resolve([]),
    ])

    const archived: ArchivedCampaign[] = archivedRaw.map(c => ({
      id: c.id,
      name: c.name,
      clientName: c.client.name,
      archivedAt: c.archivedAt!.toISOString(),
    }))

    const recentlyDeleted: RecentlyDeletedCampaign[] = recentlyDeletedRaw.map(c => ({
      id: c.id,
      name: c.name,
      clientName: c.client.name,
      deletedAt: c.deletedAt!.toISOString(),
    }))

    return { campaigns, archived, recentlyDeleted, clients, sdrs }
  })
}

export default async function CampaignsPage() {
  const tenantId = await getCurrentTenantId()
  if (!tenantId) redirect('/sign-in')

  const role = await getCurrentUserRole()
  if (!role || !hasPermission(role, 'campaigns:read')) redirect('/')

  const canManage = hasPermission(role, 'campaigns:write')
  const { campaigns, archived, recentlyDeleted, clients, sdrs } = await getPageData(tenantId, role)

  return (
    <>
      <Header title="Campaigns" subtitle="Manage outreach campaigns and SDR assignments" />
      <PageShell>
        <div className="space-y-4">
          <CampaignsTable
            campaigns={campaigns}
            clients={clients}
            sdrs={sdrs}
            canManage={canManage}
          />
          {canManage && <ArchivedSection campaigns={archived} />}
          {canManage && <RecentlyDeletedSection campaigns={recentlyDeleted} />}
        </div>
      </PageShell>
    </>
  )
}
