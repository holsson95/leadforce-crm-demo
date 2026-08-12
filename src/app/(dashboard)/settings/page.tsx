import { redirect } from 'next/navigation'
import { getCurrentUserRole } from '@/lib/auth'

export default async function SettingsPage() {
  const role = await getCurrentUserRole()
  if (role === 'admin') redirect('/settings/company')
  if (role === 'manager') redirect('/settings/team')
  redirect('/settings/account')
}
