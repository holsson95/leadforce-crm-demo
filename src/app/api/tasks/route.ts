import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { db, withTenant } from '@/lib/db'
import { hasPermission, getClerkMeta } from '@/lib/auth'

const CreateTaskSchema = z.object({
  title:       z.string().min(1),
  description: z.string().optional(),
  color:       z.string().min(1),
  dueDate:     z.string().datetime().optional(),
  status:      z.enum(['pending', 'in_progress', 'completed']).default('pending'),
  contactId:   z.string().optional(),
  campaignId:  z.string().optional(),
  assigneeId:  z.string().optional(),
})

export async function GET(req: NextRequest) {
  try {
    const { userId: clerkId } = await auth()
    if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { role, tenantId } = await getClerkMeta()
    if (!hasPermission(role, 'tasks:read') || !tenantId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const sp         = req.nextUrl.searchParams
    const status     = sp.get('status') ?? undefined
    const contactId  = sp.get('contactId') ?? undefined
    const campaignId = sp.get('campaignId') ?? undefined
    const cursor     = sp.get('cursor') ?? undefined
    const limit      = Math.min(100, parseInt(sp.get('limit') ?? '25'))

    const dbUser = await withTenant(tenantId, () =>
      db.user.findFirst({ where: { clerkId }, select: { id: true } })
    )
    if (!dbUser) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    const isSdr = role === 'sdr'

    const tasks = await withTenant(tenantId, () =>
      db.task.findMany({
        where: {
          ...(isSdr  && { assigneeId: dbUser.id }),
          ...(status && { status: status as 'pending' | 'in_progress' | 'completed' }),
          ...(contactId  && { contactId }),
          ...(campaignId && { campaignId }),
        },
        include: {
          assignee: { select: { id: true, name: true } },
          contact:  { select: { id: true, firstName: true, lastName: true } },
          campaign: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
        take:    limit + 1,
        ...(cursor && { cursor: { id: cursor }, skip: 1 }),
      })
    )

    const hasMore  = tasks.length > limit
    const data     = hasMore ? tasks.slice(0, limit) : tasks
    const nextCursor = hasMore ? data[data.length - 1].id : null

    const serialized = data.map((t) => ({
      id:          t.id,
      title:       t.title,
      description: t.description,
      color:       t.color,
      dueDate:     t.dueDate?.toISOString() ?? null,
      status:      t.status,
      contactId:   t.contactId,
      campaignId:  t.campaignId,
      assigneeId:  t.assigneeId,
      createdAt:   t.createdAt.toISOString(),
      assignee:    t.assignee,
      contact:     t.contact,
      campaign:    t.campaign,
    }))

    return NextResponse.json({ data: serialized, nextCursor })
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const { userId: clerkId } = await auth()
    if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { role, tenantId } = await getClerkMeta()
    if (!hasPermission(role, 'tasks:write') || !tenantId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body   = await req.json()
    const parsed = CreateTaskSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid body', details: parsed.error.flatten() }, { status: 400 })
    }

    const dbUser = await withTenant(tenantId, () =>
      db.user.findFirst({ where: { clerkId }, select: { id: true } })
    )
    if (!dbUser) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    const isSdr    = role === 'sdr'
    const assigneeId = isSdr ? dbUser.id : (parsed.data.assigneeId ?? dbUser.id)

    const task = await withTenant(tenantId, () =>
      db.task.create({
        data: {
          tenantId,
          assigneeId,
          title:       parsed.data.title,
          description: parsed.data.description ?? null,
          color:       parsed.data.color,
          dueDate:     parsed.data.dueDate ? new Date(parsed.data.dueDate) : null,
          status:      parsed.data.status,
          contactId:   parsed.data.contactId ?? null,
          campaignId:  parsed.data.campaignId ?? null,
        },
        select: { id: true },
      })
    )

    return NextResponse.json({ data: task }, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
