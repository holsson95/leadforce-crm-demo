import { redirect } from 'next/navigation'
import { getCurrentTenantId } from '@/lib/auth'
import { db, withTenant } from '@/lib/db'
import { QueuePanel } from '@/components/dialer/QueuePanel'

export default async function CallingPage({
  searchParams,
}: {
  searchParams: Promise<{ campaign?: string }>
}) {
  const tenantId = await getCurrentTenantId()
  if (!tenantId) redirect('/sign-in')

  const { campaign: defaultCampaignId } = await searchParams

  const [campaigns, users] = await Promise.all([
    withTenant(tenantId, () =>
      db.campaign.findMany({
        where:   { status: 'active', archivedAt: null, deletedAt: null },
        select:  { id: true, name: true },
        orderBy: { name: 'asc' },
      })
    ),
    withTenant(tenantId, () =>
      db.user.findMany({
        where:   { deletedAt: null },
        select:  { id: true, name: true },
        orderBy: { name: 'asc' },
      })
    ),
  ])

  return (
    <div className="flex h-full gap-4 p-4 overflow-hidden">
      <QueuePanel campaigns={campaigns} users={users} defaultCampaignId={defaultCampaignId} />
    </div>
  )
}
