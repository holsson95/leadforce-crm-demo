import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { db, withTenant } from '@/lib/db'
import { hasPermission, getClerkMeta } from '@/lib/auth'

const BodySchema = z.object({ stageId: z.string().min(1) })

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { role, tenantId } = await getClerkMeta()
    if (!hasPermission(role, 'pipeline:write') || !tenantId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params
    const body = await req.json()
    const parsed = BodySchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
    }

    const pending = await withTenant(tenantId, () =>
      db.pendingPipelineDeal.findUnique({
        where: { id },
        select: { id: true, tenantId: true, clientId: true, contactId: true, campaignId: true },
      })
    )

    if (!pending) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const contact = await withTenant(tenantId, () =>
      db.contact.findUnique({
        where: { id: pending.contactId },
        select: { firstName: true, lastName: true, companyName: true },
      })
    )

    if (!contact) {
      return NextResponse.json({ error: 'Contact not found' }, { status: 404 })
    }

    const title = contact.companyName
      ? `${contact.firstName} ${contact.lastName} — ${contact.companyName}`
      : `${contact.firstName} ${contact.lastName}`

    await withTenant(tenantId, () =>
      db.$transaction([
        db.pipelineDeal.upsert({
          where: { contactId_campaignId: { contactId: pending.contactId, campaignId: pending.campaignId } },
          create: {
            tenantId: pending.tenantId,
            clientId: pending.clientId,
            stageId: parsed.data.stageId,
            contactId: pending.contactId,
            campaignId: pending.campaignId,
            title,
            source: 'manual',
          },
          update: { stageId: parsed.data.stageId },
        }),
        db.pendingPipelineDeal.delete({ where: { id } }),
      ])
    )

    return NextResponse.json({ data: { success: true } })
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
