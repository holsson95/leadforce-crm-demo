import { redirect } from 'next/navigation'
import { db, withTenant } from '@/lib/db'
import { getCurrentUserRole, getCurrentTenantId, getCurrentClerkUser } from '@/lib/auth'
import { TeamDelegationPanel } from '@/components/settings/TeamDelegationPanel'

type SdrPermission = {
  canManageCampaigns: boolean
  canAccessDashboard: boolean
  canWritePipeline:   boolean
}

export type MemberRow = {
  id:            string
  name:          string
  email:         string
  role:          'admin' | 'manager' | 'sdr'
  managerId:     string | null
  sdrPermission: SdrPermission | null
}

export default async function TeamSettingsPage() {
  const tenantId = await getCurrentTenantId()
  if (!tenantId) redirect('/sign-in')

  const role = await getCurrentUserRole()
  if (role !== 'admin' && role !== 'manager') redirect('/settings/account')

  const clerkUser = await getCurrentClerkUser()
  if (!clerkUser) redirect('/sign-in')

  const callerDbUser = await withTenant(tenantId, () =>
    db.user.findFirst({ where: { clerkId: clerkUser.id }, select: { id: true } })
  )
  if (!callerDbUser) redirect('/sign-in')

  const rawMembers = await withTenant(tenantId, () =>
    db.user.findMany({
      where: {
        deletedAt: null,
        role: { in: ['admin', 'manager', 'sdr'] },
      },
      select: {
        id:        true,
        name:      true,
        email:     true,
        role:      true,
        managerId: true,
        sdrPermissions: {
          select: {
            canManageCampaigns: true,
            canAccessDashboard: true,
            canWritePipeline:   true,
          },
          take: 1,
        },
      },
      orderBy: [{ role: 'asc' }, { name: 'asc' }],
    })
  )

  const members: MemberRow[] = rawMembers.map(m => ({
    id:            m.id,
    name:          m.name,
    email:         m.email,
    role:          m.role as 'admin' | 'manager' | 'sdr',
    managerId:     m.managerId,
    sdrPermission: m.sdrPermissions[0] ?? null,
  }))

  return (
    <TeamDelegationPanel
      initialMembers={members}
      viewerRole={role as 'admin' | 'manager'}
      viewerDbId={callerDbUser.id}
    />
  )
}
