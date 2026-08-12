import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import { Header } from '@/components/layout/Header'
import { PageShell } from '@/components/layout/PageShell'
import { ContactsTable } from '@/components/contacts/ContactsTable'
import { ContactFilters } from '@/components/contacts/ContactFilters'
import { db, withTenant } from '@/lib/db'
import { getCurrentTenantId, getCurrentUserRole, hasPermission } from '@/lib/auth'

interface SearchParams {
  campaignId?: string
  status?: string
  search?: string
  page?: string
  pageSize?: string
  industry?: string
  country?: string
  accountOwnerId?: string
}

const ALLOWED_PAGE_SIZES = [25, 50, 100]

async function getPageData(
  tenantId: string,
  role: string,
  sp: SearchParams,
  page: number,
  pageSize: number,
) {
  return withTenant(tenantId, async () => {
    const { campaignId, status, search, industry, country, accountOwnerId } = sp

    const skip = (page - 1) * pageSize

    const where = {
      deletedAt: null,
      ...(campaignId ? { campaignId } : {}),
      ...(status ? { status: status as never } : {}),
      ...(industry ? { industry } : {}),
      ...(country ? { country } : {}),
      ...(accountOwnerId ? { accountOwnerId } : {}),
      ...(search
        ? {
            OR: [
              { firstName: { contains: search, mode: 'insensitive' as const } },
              { lastName: { contains: search, mode: 'insensitive' as const } },
              { email: { contains: search, mode: 'insensitive' as const } },
              { companyName: { contains: search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    }

    const [contacts, total, campaigns, users] = await Promise.all([
      db.contact.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        include: {
          campaign: { select: { id: true, name: true } },
          accountOwner: { select: { id: true, name: true } },
        },
      }),
      db.contact.count({ where }),
      hasPermission(role, 'campaigns:read')
        ? db.campaign.findMany({
            where: { archivedAt: null, deletedAt: null },
            select: { id: true, name: true },
            orderBy: { name: 'asc' },
          })
        : Promise.resolve([]),
      db.user.findMany({
        where: {
          deletedAt: null,
          role: { in: ['admin', 'manager', 'sdr'] as never[] },
        },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
    ])

    return { contacts, total, campaigns, users }
  })
}

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const tenantId = await getCurrentTenantId()
  if (!tenantId) redirect('/sign-in')

  const role = await getCurrentUserRole()
  if (!role || !hasPermission(role, 'contacts:read')) redirect('/')

  const sp = await searchParams

  const page = Math.max(1, parseInt(sp.page ?? '1', 10) || 1)
  const parsedPageSize = parseInt(sp.pageSize ?? '25', 10)
  const pageSize = ALLOWED_PAGE_SIZES.includes(parsedPageSize) ? parsedPageSize : 25

  const { contacts, total, campaigns, users } = await getPageData(tenantId, role, sp, page, pageSize)

  return (
    <>
      <Header title="Contacts" subtitle="Manage your campaign contacts" />
      <PageShell>
        <div className="space-y-4">
          <Suspense>
            <ContactFilters campaigns={campaigns} />
          </Suspense>
          <ContactsTable
            contacts={contacts}
            campaigns={campaigns}
            users={users}
            page={page}
            pageSize={pageSize}
            total={total}
          />
        </div>
      </PageShell>
    </>
  )
}
