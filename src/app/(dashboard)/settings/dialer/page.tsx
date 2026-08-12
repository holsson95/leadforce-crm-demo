import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { getCurrentUserRole, getCurrentTenantId } from '@/lib/auth'
import { DialerThresholdsForm } from '@/components/settings/DialerThresholdsForm'

export default async function DialerSettingsPage() {
  const tenantId = await getCurrentTenantId()
  if (!tenantId) redirect('/sign-in')

  const role = await getCurrentUserRole()
  if (role !== 'admin') redirect('/settings/account')

  const settings = await db.tenantSettings.findUnique({ where: { tenantId } })

  return (
    <DialerThresholdsForm
      initialValues={{
        dialUnresponsiveLimit:     settings?.dialUnresponsiveLimit     ?? 8,
        dialFutureReentryDays:     settings?.dialFutureReentryDays     ?? 90,
        dialFutureReattempts:      settings?.dialFutureReattempts      ?? 3,
        notInterestedCooldownDays: settings?.notInterestedCooldownDays ?? 7,
      }}
    />
  )
}
