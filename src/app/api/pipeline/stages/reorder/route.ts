import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { db, withTenant } from '@/lib/db'
import { getClerkMeta, resolvePermission } from '@/lib/auth'

const ReorderSchema = z.object({
  clientId: z.string().min(1),
  stageIds: z.array(z.string()).min(1),
})

export async function PATCH(req: NextRequest) {
  try {
    const { userId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { role, tenantId } = await getClerkMeta()
    if (!tenantId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const canWrite = await resolvePermission(userId, tenantId, role, 'pipeline:write')
    if (!(canWrite !== null ? canWrite : (role === 'admin' || role === 'manager'))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body   = await req.json()
    const parsed = ReorderSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid body', details: parsed.error.flatten() }, { status: 400 })
    }

    const { clientId, stageIds } = parsed.data

    const existing = await withTenant(tenantId, () =>
      db.pipelineStage.findMany({
        where:  { clientId },
        select: { id: true },
      })
    )
    const existingIds = new Set(existing.map(s => s.id))
    if (!stageIds.every(id => existingIds.has(id))) {
      return NextResponse.json({ error: 'Invalid stage IDs' }, { status: 400 })
    }

    await withTenant(tenantId, () =>
      Promise.all(
        stageIds.map((id, position) =>
          db.pipelineStage.update({ where: { id }, data: { position } })
        )
      )
    )

    return NextResponse.json({ data: { success: true } })
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
