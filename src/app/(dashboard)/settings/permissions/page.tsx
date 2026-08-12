import { redirect } from 'next/navigation'
import { db, withTenant } from '@/lib/db'
import { getCurrentUserRole, getCurrentTenantId } from '@/lib/auth'
import { PermissionsPanel } from '@/components/settings/PermissionsPanel'

export default async function PermissionsSettingsPage() {
  const tenantId = await getCurrentTenantId()
  if (!tenantId) redirect('/sign-in')

  const role = await getCurrentUserRole()
  if (role !== 'admin') redirect('/settings/account')

  const [rawMembers, rawOverrides] = await Promise.all([
    withTenant(tenantId, () =>
      db.user.findMany({
        where:   { role: { in: ['manager', 'sdr'] } },
        select:  { id: true, name: true, email: true, role: true },
        orderBy: [{ role: 'asc' }, { name: 'asc' }],
      })
    ),
    db.permissionOverride.findMany({
      where:  { tenantId, permission: 'pipeline:write' },
      select: { id: true, subjectType: true, subjectId: true, permission: true, granted: true },
    }),
  ])

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-[var(--text-primary)]">Permissions</h2>
        <p className="text-sm text-[var(--text-secondary)] mt-0.5">
          Control which roles and team members can edit pipeline stages.
        </p>
      </div>
      <PermissionsPanel
        members={rawMembers as { id: string; name: string; email: string; role: 'manager' | 'sdr' }[]}
        overrides={rawOverrides}
      />
    </div>
  )
}
