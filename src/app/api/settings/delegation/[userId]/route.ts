import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { db, withTenant } from '@/lib/db'
import { getClerkMeta } from '@/lib/auth'
import {
  canEditUserRole,
  allowedRolesToAssign,
  canEditUserPermissions,
} from '@/lib/team-permissions'
import type { UserRole } from '@/lib/team-permissions'

const PatchSchema = z.object({
  canManageCampaigns: z.boolean().optional(),
  canAccessDashboard: z.boolean().optional(),
  canWritePipeline:   z.boolean().optional(),
  role:               z.enum(['admin', 'manager', 'sdr']).optional(),
})

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const { userId: clerkId } = await auth()
    if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { role, tenantId } = await getClerkMeta()
    if ((role !== 'admin' && role !== 'manager') || !tenantId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { userId: targetUserId } = await params

    const body   = await req.json()
    const parsed = PatchSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid body', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const callerDbUser = await withTenant(tenantId, () =>
      db.user.findFirst({ where: { clerkId }, select: { id: true } })
    )
    if (!callerDbUser) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    const targetUser = await withTenant(tenantId, () =>
      db.user.findFirst({
        where:  { id: targetUserId, deletedAt: null },
        select: { id: true, role: true, managerId: true },
      })
    )
    if (!targetUser) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    const { role: newRole, ...permissionData } = parsed.data
    const hasPermissionChanges = Object.keys(permissionData).length > 0

    if (newRole !== undefined) {
      if (!canEditUserRole(role as UserRole, targetUser.role as UserRole)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
      const allowed = allowedRolesToAssign(role as UserRole)
      if (!allowed.includes(newRole)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
      await withTenant(tenantId, () =>
        db.user.update({ where: { id: targetUserId }, data: { role: newRole } })
      )
    }

    if (hasPermissionChanges) {
      const effectiveRole = (newRole ?? targetUser.role) as UserRole
      if (
        !canEditUserPermissions(
          role as UserRole,
          effectiveRole,
          targetUser.managerId,
          callerDbUser.id,
        )
      ) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
      await db.sdrPermission.upsert({
        where:  { tenantId_userId: { tenantId, userId: targetUserId } },
        create: { tenantId, userId: targetUserId, ...permissionData },
        update: permissionData,
      })
    }

    return NextResponse.json({ data: { ok: true } })
  } catch (e) {
    if (process.env.NODE_ENV !== 'production') console.error('[settings/delegation PATCH]', e)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
