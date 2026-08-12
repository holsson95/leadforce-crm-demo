import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { db, withTenant } from '@/lib/db'
import { hasPermission, getClerkMeta } from '@/lib/auth'

const PatchTaskSchema = z.object({
  title:       z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  color:       z.string().min(1).optional(),
  dueDate:     z.string().datetime().nullable().optional(),
  status:      z.enum(['pending', 'in_progress', 'completed']).optional(),
  contactId:   z.string().nullable().optional(),
  campaignId:  z.string().nullable().optional(),
  assigneeId:  z.string().optional(),
})

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { role, tenantId } = await getClerkMeta()
    if (!hasPermission(role, 'tasks:write') || !tenantId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params
    const body   = await req.json()
    const parsed = PatchTaskSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid body', details: parsed.error.flatten() }, { status: 400 })
    }

    const { dueDate, ...rest } = parsed.data
    const task = await withTenant(tenantId, () =>
      db.task.update({
        where: { id },
        data: {
          ...rest,
          ...(dueDate !== undefined && { dueDate: dueDate ? new Date(dueDate) : null }),
        },
        select: { id: true, status: true },
      })
    )

    return NextResponse.json({ data: task })
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { role, tenantId } = await getClerkMeta()
    if (!hasPermission(role, 'tasks:write') || !tenantId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params
    await withTenant(tenantId, () =>
      db.task.update({
        where: { id },
        data:  { deletedAt: new Date() },
      })
    )

    return NextResponse.json({ data: { success: true } })
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
