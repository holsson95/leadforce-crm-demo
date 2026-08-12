import { redirect } from 'next/navigation'
import { Header } from '@/components/layout/Header'
import { SettingsNav } from '@/components/settings/SettingsNav'
import { getCurrentUserRole, getCurrentTenantId } from '@/lib/auth'
import type { UserRole } from '@/lib/auth'
import type { ReactNode } from 'react'

const ROLE_SECTIONS: Record<UserRole, string[]> = {
  admin:   ['/settings/company', '/settings/dialer', '/settings/team', '/settings/portal', '/settings/pipeline', '/settings/permissions', '/settings/account'],
  manager: ['/settings/team', '/settings/portal', '/settings/pipeline', '/settings/account'],
  sdr:     ['/settings/account', '/settings/pipeline'],
  client:  [],
}

export default async function SettingsLayout({ children }: { children: ReactNode }) {
  const tenantId = await getCurrentTenantId()
  if (!tenantId) redirect('/sign-in')

  const role = await getCurrentUserRole()
  if (!role || role === 'client') redirect('/')

  const allowedSections = ROLE_SECTIONS[role as UserRole] ?? ['/settings/account']

  return (
    <>
      <Header title="Settings" subtitle="Manage your workspace configuration" />
      <div className="p-8 flex gap-8">
        <SettingsNav allowedSections={allowedSections} />
        <div className="flex-1 min-w-0">{children}</div>
      </div>
    </>
  )
}
