import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { getCurrentUserRole, getCurrentTenantId } from '@/lib/auth'
import { CompanyForm } from '@/components/settings/CompanyForm'

export default async function CompanySettingsPage() {
  const tenantId = await getCurrentTenantId()
  if (!tenantId) redirect('/sign-in')

  const role = await getCurrentUserRole()
  if (role !== 'admin') redirect('/settings/account')

  const [tenant, settings] = await Promise.all([
    db.tenant.findUnique({ where: { id: tenantId }, select: { name: true } }),
    db.tenantSettings.upsert({
      where:  { tenantId },
      create: { tenantId },
      update: {},
    }),
  ])

  return (
    <CompanyForm
      initialName={tenant?.name ?? ''}
      initialTimezone={settings?.timezone ?? 'UTC'}
    />
  )
}
