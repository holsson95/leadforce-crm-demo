import { redirect } from 'next/navigation'
import { db, withTenant } from '@/lib/db'
import { getCurrentUserRole, getCurrentTenantId } from '@/lib/auth'
import { PortalPermissionsPanel } from '@/components/settings/PortalPermissionsPanel'

export default async function PortalSettingsPage() {
  const tenantId = await getCurrentTenantId()
  if (!tenantId) redirect('/sign-in')

  const role = await getCurrentUserRole()
  if (role !== 'admin' && role !== 'manager') redirect('/settings/account')

  const clients = await withTenant(tenantId, () =>
    db.client.findMany({
      where:   { deletedAt: null },
      select:  {
        id:               true,
        name:             true,
        contactName:      true,
        email:            true,
        clerkId:          true,
        portalPermissions: true,
      },
      orderBy: { name: 'asc' },
    })
  )

  const clientRows = clients.map(c => ({
    id:                c.id,
    name:              c.name,
    contactName:       c.contactName,
    email:             c.email,
    clerkId:           c.clerkId,
    portalPermissions: (c.portalPermissions ?? {}) as {
      viewPipeline?: boolean
      movePipeline?: boolean
      viewReports?:  boolean
    },
  }))

  return (
    <PortalPermissionsPanel
      clients={clientRows}
      isAdmin={role === 'admin'}
    />
  )
}
