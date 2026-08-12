import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db, withTenant } from '@/lib/db'
import { hasPermission, getClerkMeta } from '@/lib/auth'

const HEADERS = [
  'First Name', 'Last Name', 'Email', 'Mobile Phone', 'Corporate Phone',
  'Job Title', 'Company Name', 'Industry', '# Employees',
  'Address', 'City', 'State', 'ZIP', 'Country',
  'Company Address', 'Company City', 'Website', 'LinkedIn URL',
  'Status', 'Campaign', 'Account Owner', 'Created At',
]

const escape = (v: string) => `"${String(v).replace(/"/g, '""')}"`

export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { role, tenantId } = await getClerkMeta()
  if (!hasPermission(role, 'contacts:read') || !tenantId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const contacts = await withTenant(tenantId, () =>
    db.contact.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: 'desc' },
      include: {
        campaign: { select: { name: true } },
        accountOwner: { select: { name: true } },
      },
    })
  )

  const rows = contacts.map((c) =>
    [
      c.firstName, c.lastName, c.email ?? '', c.mobilePhone ?? '', c.corporatePhone ?? '',
      c.jobTitle ?? '', c.companyName ?? '', c.industry ?? '', c.employeeCount?.toString() ?? '',
      c.address ?? '', c.city ?? '', c.state ?? '', c.zip ?? '', c.country ?? '',
      c.companyAddress ?? '', c.companyCity ?? '',
      c.website ?? '', c.linkedinUrl ?? '',
      c.status, c.campaign.name, c.accountOwner?.name ?? '',
      c.createdAt.toISOString(),
    ].map(escape).join(',')
  )

  const csv = [HEADERS.join(','), ...rows].join('\n')
  const date = new Date().toISOString().slice(0, 10)

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="contacts-${date}.csv"`,
    },
  })
}
