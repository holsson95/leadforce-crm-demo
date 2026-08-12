import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db, withTenant } from '@/lib/db'
import { getClerkMeta } from '@/lib/auth'

export async function GET() {
  try {
    const { userId: clerkId } = await auth()
    if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { role, tenantId } = await getClerkMeta()
    if ((role !== 'admin' && role !== 'manager') || !tenantId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const members = await withTenant(tenantId, () =>
      db.user.findMany({
        where: {
          deletedAt: null,
          role: { in: ['admin', 'manager', 'sdr'] },
        },
        select: {
          id:        true,
          name:      true,
          email:     true,
          role:      true,
          managerId: true,
          sdrPermissions: {
            select: {
              canManageCampaigns: true,
              canAccessDashboard: true,
              canWritePipeline:   true,
            },
            take: 1,
          },
        },
        orderBy: [{ role: 'asc' }, { name: 'asc' }],
      })
    )

    const normalized = members.map(m => ({
      id:            m.id,
      name:          m.name,
      email:         m.email,
      role:          m.role,
      managerId:     m.managerId,
      sdrPermission: m.sdrPermissions[0] ?? null,
    }))

    return NextResponse.json({ data: normalized })
  } catch (e) {
    if (process.env.NODE_ENV !== 'production') console.error('[settings/delegation GET]', e)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
