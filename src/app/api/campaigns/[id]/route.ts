import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { db, withTenant } from '@/lib/db'
import { hasPermission } from '@/lib/auth'

const UpdateCampaignSchema = z.object({
  name: z.string().min(1).optional(),
  clientId: z.string().min(1).optional(),
  status: z.enum(['draft', 'active', 'paused', 'completed']).optional(),
  dailyTargetCalls: z.number().int().positive().nullable().optional(),
})

function getClerkMeta(sessionClaims: unknown) {
  const meta = (sessionClaims as Record<string, unknown>)?.publicMetadata as
    | { role?: string; tenantId?: string }
    | undefined
  return { role: meta?.role ?? '', tenantId: meta?.tenantId }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId, sessionClaims } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { role, tenantId } = getClerkMeta(sessionClaims)
  if (!hasPermission(role, 'campaigns:write') || !tenantId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const body = await request.json()
  const result = UpdateCampaignSchema.safeParse(body)
  if (!result.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: result.error.flatten() },
      { status: 400 }
    )
  }

  const updated = await withTenant(tenantId, () =>
    db.campaign.updateMany({
      where: { id, archivedAt: null, deletedAt: null },
      data: result.data,
    })
  )

  if (updated.count === 0) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  return NextResponse.json({ data: { success: true } })
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId, sessionClaims } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { role, tenantId } = getClerkMeta(sessionClaims)
  if (!hasPermission(role, 'campaigns:write') || !tenantId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const now = new Date()
  const result = await withTenant(tenantId, () =>
    db.$transaction([
      db.contact.updateMany({
        where: { campaignId: id, deletedAt: null },
        data: { deletedAt: now },
      }),
      db.campaign.updateMany({
        where: { id, archivedAt: null, deletedAt: null },
        data: { deletedAt: now },
      }),
      db.pendingPipelineDeal.deleteMany({
        where: { campaignId: id },
      }),
    ])
  )

  if (result[1].count === 0) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  return NextResponse.json({ data: { success: true } })
}
