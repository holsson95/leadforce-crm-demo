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

    const pending = await withTenant(tenantId, () =>
      db.pendingPipelineDeal.findMany({
        where: {
          clientId,
          campaign: { deletedAt: null, archivedAt: null },
        },
        select: {
          id: true,
          clientId: true,
          contactId: true,
          campaignId: true,
          outcome: true,
          createdAt: true,
          contact: { select: { firstName: true, lastName: true, companyName: true, jobTitle: true } },
          campaign: { select: { name: true } },
        },
        orderBy: { createdAt: 'asc' },
      })
    )

    const serialized = pending.map((p) => ({
      ...p,
      createdAt: p.createdAt.toISOString(),
    }))

    return NextResponse.json({ data: serialized })
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
