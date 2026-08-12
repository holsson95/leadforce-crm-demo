import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { db, withTenant } from '@/lib/db'
import { hasPermission, getClerkMeta } from '@/lib/auth'
import { getTelephonyService } from '@/lib/telephony'

const BodySchema = z.object({
  contactId:   z.string().min(1),
  campaignId:  z.string().min(1),
  phoneNumber: z.string().optional(),
})

export async function POST(req: NextRequest) {
  try {
    const { userId: clerkId } = await auth()
    if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { role, tenantId } = await getClerkMeta()
    if (!hasPermission(role, 'calls:write') || !tenantId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await req.json()
    const parsed = BodySchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid body', details: parsed.error.flatten() }, { status: 400 })
    }
    const { contactId, campaignId, phoneNumber } = parsed.data

    const dbUser = await withTenant(tenantId, () =>
      db.user.findFirst({ where: { clerkId }, select: { id: true } })
    )
    if (!dbUser) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    const contact = await withTenant(tenantId, () =>
      db.contact.findUnique({ where: { id: contactId }, select: { mobilePhone: true } })
    )
    if (!contact) return NextResponse.json({ error: 'Contact not found' }, { status: 404 })

    const dialTo = phoneNumber ?? contact.mobilePhone ?? ''

    try {
      const telephony = getTelephonyService()
      await telephony.makeCall({ from: 'system', to: dialTo, campaignId })
    } catch {
      // continue — record the call regardless
    }

    const callRecord = await withTenant(tenantId, () =>
      db.callRecord.create({
        data:   { tenantId, campaignId, contactId, userId: dbUser.id },
        select: { id: true },
      })
    )

    return NextResponse.json({ data: { callRecordId: callRecord.id } })
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
