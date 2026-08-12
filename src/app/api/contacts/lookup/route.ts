import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db, withTenant } from '@/lib/db'
import { hasPermission, getClerkMeta } from '@/lib/auth'
import { buildContactLookupWhere } from '@/lib/contact-lookup'

export async function GET(request: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { role, tenantId } = await getClerkMeta()
  if (!hasPermission(role, 'contacts:read') || !tenantId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const q = request.nextUrl.searchParams.get('q') ?? ''
  const where = buildContactLookupWhere(tenantId, q)

  const contacts = await withTenant(tenantId, () =>
    db.contact.findMany({
      where,
      take: 8,
      orderBy: { createdAt: 'desc' },
      select: {
        id:             true,
        firstName:      true,
        lastName:       true,
        mobilePhone:    true,
        corporatePhone: true,
        companyName:    true,
        status:         true,
        campaign:       { select: { name: true } },
      },
    })
  )

  return NextResponse.json({ data: contacts })
}
