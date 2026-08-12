import { redirect } from 'next/navigation'
import { Header } from '@/components/layout/Header'
import { PageShell } from '@/components/layout/PageShell'
import { ClientsTable } from '@/components/clients/ClientsTable'
import { db, withTenant } from '@/lib/db'
import { getCurrentTenantId, requirePermission, ForbiddenError } from '@/lib/auth'

async function getClients(tenantId: string) {
  return withTenant(tenantId, () =>
    db.client.findMany({
      where:   { deletedAt: null },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: { campaigns: { where: { deletedAt: null } } },
        },
      },
    })
  )
}

export default async function ClientsPage() {
  const tenantId = await getCurrentTenantId()
  if (!tenantId) redirect('/sign-in')

  try {
    await requirePermission('clients:read')
  } catch (e) {
    if (e instanceof ForbiddenError) redirect('/')
    throw e
  }

  const clients = await getClients(tenantId)

  return (
    <>
      <Header title="Clients" subtitle="Manage your agency clients" />
      <PageShell>
        <ClientsTable clients={clients} />
      </PageShell>
    </>
  )
}
