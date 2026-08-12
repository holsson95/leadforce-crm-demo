import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { db, withTenant } from '@/lib/db'
import { hasPermission, getClerkMeta } from '@/lib/auth'

const BodySchema = z.object({
  campaignId: z.string().min(1),
})

export async function POST(request: Request) {
  const { userId: clerkId } = await auth()
  if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { role, tenantId } = await getClerkMeta()
  if (!hasPermission(role, 'calls:write') || !tenantId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json()
  const parsed = BodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body', details: parsed.error.flatten() }, { status: 400 })
  }
  const { campaignId } = parsed.data

  const dbUser = await withTenant(tenantId, () =>
    db.user.findFirst({ where: { clerkId }, select: { id: true } })
  )
  if (!dbUser) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const existing = await withTenant(tenantId, () =>
    db.session.findFirst({
      where: {
        userId:    dbUser.id,
        campaignId,
        endedAt:   null,
        createdAt: { gte: today },
      },
      select: { id: true, startedAt: true },
    })
  )

  if (existing) {
    return NextResponse.json({ data: { id: existing.id, startedAt: existing.startedAt, resumed: true } })
  }

  const session = await withTenant(tenantId, () =>
    db.session.create({
      data:   { tenantId, campaignId, userId: dbUser.id },
      select: { id: true, startedAt: true },
    })
  )

  return NextResponse.json({ data: { ...session, resumed: false } })
}
