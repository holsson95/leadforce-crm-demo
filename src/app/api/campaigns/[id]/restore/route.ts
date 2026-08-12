import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db, withTenant } from '@/lib/db'
import { hasPermission, getClerkMeta } from '@/lib/auth'

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { role, tenantId } = await getClerkMeta()
  if (!hasPermission(role, 'campaigns:write') || !tenantId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const cutoff = new Date(Date.now() - 72 * 60 * 60 * 1000)

  const result = await withTenant(tenantId, () =>
    db.campaign.updateMany({
      where: { id, deletedAt: { not: null, gt: cutoff } },
      data: { deletedAt: null },
    })
  )

  if (result.count === 0) {
    return NextResponse.json(
      { error: 'Not found, not deleted, or restore window has expired' },
      { status: 409 }
    )
  }

  return NextResponse.json({ data: { success: true } })
}
