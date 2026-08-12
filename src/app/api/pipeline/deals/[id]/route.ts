import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { db, withTenant } from '@/lib/db'
import { hasPermission, getClerkMeta } from '@/lib/auth'

const PatchSchema = z.object({
  stageId: z.string().min(1).optional(),
  notes:   z.string().nullable().optional(),
  value:   z.number().nonnegative().nullable().optional(),
})

export async function PATCH(
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
    const parsed = PatchSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid body', details: parsed.error.flatten() }, { status: 400 })
    }

    // Client-role users may only update their own client's deals
    let scopedClientId: string | undefined
    if (role === 'client') {
      const clientRecord = await db.client.findUnique({ where: { clerkId: userId }, select: { id: true } })
      if (!clientRecord) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      scopedClientId = clientRecord.id
    }

    const deal = await withTenant(tenantId, () =>
      db.pipelineDeal.update({
        where: { id, ...(scopedClientId !== undefined && { clientId: scopedClientId }) },
        data: {
          ...(parsed.data.stageId !== undefined && { stageId: parsed.data.stageId }),
          ...(parsed.data.notes !== undefined    && { notes: parsed.data.notes }),
          ...(parsed.data.value !== undefined    && { value: parsed.data.value }),
        },
        select: { id: true, stageId: true },
      })
    )

    return NextResponse.json({ data: deal })
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
