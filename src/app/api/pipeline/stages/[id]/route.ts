import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { db, withTenant } from '@/lib/db'
import { getClerkMeta, resolvePermission } from '@/lib/auth'

const UpdateStageSchema = z.object({
  name:  z.string().min(1).max(80).optional(),
  color: z.string().regex(/^#[0-9a-f]{6}$/i).optional(),
})

async function checkWriteAccess(userId: string, tenantId: string, role: string) {
  const canWrite = await resolvePermission(userId, tenantId, role, 'pipeline:write')
  return canWrite !== null ? canWrite : (role === 'admin' || role === 'manager')
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { userId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { role, tenantId } = await getClerkMeta()
    if (!tenantId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    if (!(await checkWriteAccess(userId, tenantId, role))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params
    const body   = await req.json()
    const parsed = UpdateStageSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid body', details: parsed.error.flatten() }, { status: 400 })
    }

    const stage = await withTenant(tenantId, () =>
      db.pipelineStage.update({
        where:  { id },
        data:   parsed.data,
        select: { id: true, name: true, color: true, position: true },
      })
    )

    return NextResponse.json({ data: stage })
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { userId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { role, tenantId } = await getClerkMeta()
    if (!tenantId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    if (!(await checkWriteAccess(userId, tenantId, role))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params

    const dealCount = await withTenant(tenantId, () =>
      db.pipelineDeal.count({ where: { stageId: id } })
    )
    if (dealCount > 0) {
      return NextResponse.json(
        { error: 'Stage has active deals — move or close them first' },
        { status: 409 },
      )
    }

    await withTenant(tenantId, () =>
      db.pipelineStage.delete({ where: { id } })
    )

    return NextResponse.json({ data: { success: true } })
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
