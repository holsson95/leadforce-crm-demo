import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db, withTenant } from '@/lib/db'
import { hasPermission, getClerkMeta } from '@/lib/auth'

export async function GET(req: NextRequest) {
  try {
    const { userId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { role, tenantId } = await getClerkMeta()
    if (!hasPermission(role, 'pipeline:read') || !tenantId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const clientId = req.nextUrl.searchParams.get('clientId')
    if (!clientId) {
      return NextResponse.json({ error: 'clientId required' }, { status: 400 })
    }

    const deals = await withTenant(tenantId, () =>
      db.pipelineDeal.findMany({
        where: { clientId },
        include: {
          contact: { select: { firstName: true, lastName: true, companyName: true } },
          campaign: { select: { name: true } },
        },
        orderBy: { createdAt: 'asc' },
      })
    )

    const serialized = deals.map((d) => ({
      id: d.id,
      stageId: d.stageId,
      clientId: d.clientId,
      title: d.title,
      value: d.value !== null ? d.value.toString() : null,
      notes: d.notes,
      source: d.source,
      createdAt: d.createdAt.toISOString(),
      contact: d.contact,
      campaign: d.campaign,
    }))

    return NextResponse.json({ data: serialized })
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
