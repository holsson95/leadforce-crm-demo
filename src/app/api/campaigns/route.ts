import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { db, withTenant } from '@/lib/db'
import { hasPermission } from '@/lib/auth'

const CreateCampaignSchema = z.object({
  name: z.string().min(1),
  clientId: z.string().min(1),
  status: z.enum(['draft', 'active', 'paused', 'completed']).default('draft'),
  dailyTargetCalls: z.number().int().positive().optional(),
})

function getClerkMeta(sessionClaims: unknown) {
  const meta = (sessionClaims as Record<string, unknown>)?.publicMetadata as
    | { role?: string; tenantId?: string }
    | undefined
  return { role: meta?.role ?? '', tenantId: meta?.tenantId }
}

export async function GET(request: Request) {
  const { userId, sessionClaims } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { role, tenantId } = getClerkMeta(sessionClaims)
  if (!hasPermission(role, 'campaigns:read') || !tenantId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const cursor = searchParams.get('cursor')
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '25', 10), 100)
  const section = searchParams.get('section')

  const cutoff = new Date(Date.now() - 72 * 60 * 60 * 1000)
  const where =
    section === 'archived'
      ? { archivedAt: { not: null as Date | null }, deletedAt: null }
      : section === 'deleted'
      ? { deletedAt: { gt: cutoff } }
      : { archivedAt: null, deletedAt: null }

  const campaigns = await withTenant(tenantId, () =>
    db.campaign.findMany({
      where,
      take: limit,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { createdAt: 'desc' },
      include: {
        client: { select: { id: true, name: true } },
        sdrs: { include: { user: { select: { id: true, name: true, email: true } } } },
      },
    })
  )

  const nextCursor = campaigns.length === limit ? campaigns[campaigns.length - 1].id : null
  return NextResponse.json({ data: campaigns, nextCursor })
}

export async function POST(request: Request) {
  const { userId, sessionClaims } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { role, tenantId } = getClerkMeta(sessionClaims)
  if (!hasPermission(role, 'campaigns:write') || !tenantId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json()
  const result = CreateCampaignSchema.safeParse(body)
  if (!result.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: result.error.flatten() },
      { status: 400 }
    )
  }

  const campaign = await withTenant(tenantId, () =>
    db.campaign.create({ data: { ...result.data, tenantId } })
  )

  return NextResponse.json({ data: campaign }, { status: 201 })
}
