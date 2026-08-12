import { redirect } from 'next/navigation'
import { db, withTenant } from '@/lib/db'
import { getCurrentTenantId, getCurrentClerkUser } from '@/lib/auth'
import { AccountForm } from '@/components/settings/AccountForm'

export default async function AccountSettingsPage() {
  const tenantId = await getCurrentTenantId()
  if (!tenantId) redirect('/sign-in')

  const clerkUser = await getCurrentClerkUser()
  if (!clerkUser) redirect('/sign-in')

  const user = await withTenant(tenantId, () =>
    db.user.findFirst({
      where:  { clerkId: clerkUser.id },
      select: { name: true, timezone: true },
    })
  )
  if (!user) redirect('/sign-in')

  const clerkProfileUrl = 'https://accounts.clerk.dev/user'

  return (
    <AccountForm
      initialName={user.name}
      initialTimezone={user.timezone}
      clerkProfileUrl={clerkProfileUrl}
    />
  )
}
