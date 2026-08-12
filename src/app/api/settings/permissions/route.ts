import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { getClerkMeta } from '@/lib/auth'

const UpsertSchema = z.object({
  subjectType: z.enum(['user', 'role']),
  subjectId:   z.string().min(1),
  permission:  z.string().min(1),
  granted:     z.boolean(),
})

export async function GET() {
  try {
    const { userId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { role, tenantId } = await getClerkMeta()
    if (role !== 'admin' || !tenantId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const overrides = await db.permissionOverride.findMany({
      where:   { tenantId },
      select:  { id: true, subjectType: true, subjectId: true, permission: true, granted: true },
      orderBy: [{ subjectType: 'asc' }, { subjectId: 'asc' }],
    })

    return NextResponse.json({ data: overrides })
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { userId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { role, tenantId } = await getClerkMeta()
    if (role !== 'admin' || !tenantId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body   = await req.json()
    const parsed = UpsertSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid body', details: parsed.error.flatten() }, { status: 400 })
    }

    const { subjectType, subjectId, permission, granted } = parsed.data

    if (subjectType === 'user') {
      const user = await db.user.findFirst({ where: { id: subjectId, tenantId } })
      if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const override = await db.permissionOverride.upsert({
      where: {
        tenantId_subjectType_subjectId_permission: {
          tenantId, subjectType, subjectId, permission,
        },
      },
      create: { tenantId, subjectType, subjectId, permission, granted },
      update: { granted },
      select: { id: true, subjectType: true, subjectId: true, permission: true, granted: true },
    })

    return NextResponse.json({ data: override })
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
