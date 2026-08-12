import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { db, withTenant } from '@/lib/db'
import { getClerkMeta } from '@/lib/auth'

const BodySchema = z.object({
  sessionId: z.string().min(1),
})

export async function POST(request: Request) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { tenantId } = await getClerkMeta()
  if (!tenantId) return NextResponse.json({ error: 'No tenant' }, { status: 401 })

  const body = await request.json()
  const parsed = BodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  const dbUser = await withTenant(tenantId, () =>
    db.user.findFirst({ where: { clerkId: userId }, select: { id: true } })
  )
  if (!dbUser) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  await withTenant(tenantId, () =>
    db.session.update({
      where: { id: parsed.data.sessionId, userId: dbUser.id },
      data:  { endedAt: new Date() },
    })
  )

  return NextResponse.json({ data: { success: true } })
}
