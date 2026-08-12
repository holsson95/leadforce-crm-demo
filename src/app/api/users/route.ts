import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db, withTenant } from '@/lib/db'
import { hasPermission, getClerkMeta } from '@/lib/auth'

export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { role, tenantId } = await getClerkMeta()
  if (!hasPermission(role, 'contacts:read') || !tenantId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const users = await withTenant(tenantId, () =>
    db.user.findMany({
      where:   { deletedAt: null, role: { in: ['admin', 'manager', 'sdr'] as never[] } },
      select:  { id: true, name: true },
      orderBy: { name: 'asc' },
    })
  )

  return NextResponse.json({ data: users })
}
