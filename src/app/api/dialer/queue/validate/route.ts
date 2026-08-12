import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { ContactStatus } from '@prisma/client'
import { db } from '@/lib/db'
import { hasPermission, getClerkMeta } from '@/lib/auth'

const BodySchema = z.object({
  campaignId: z.string().min(1),
  contactIds: z.array(z.string()).min(1).max(200),
})

export async function POST(request: Request) {
  try {
    const { userId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { role, tenantId } = await getClerkMeta()
    if (!hasPermission(role, 'calls:write') || !tenantId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    const parsed = BodySchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }
    const { campaignId, contactIds } = parsed.data

    const now = new Date()

    const validContacts = await db.contact.findMany({
      where: {
        id:         { in: contactIds },
        tenantId,
        campaignId,
        deletedAt:  null,
        status:     { not: ContactStatus.dnc },
        OR: [
          { notInterestedUntil: null },
          { notInterestedUntil: { lte: now } },
        ],
      },
      select: { id: true },
    })

    return NextResponse.json({ validIds: validContacts.map((c) => c.id) })
  } catch (err) {
    console.error('[queue/validate] POST error', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
