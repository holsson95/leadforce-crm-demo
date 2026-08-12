import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { db, withTenant } from '@/lib/db'
import { hasPermission } from '@/lib/auth'
import { seedDefaultStages } from '@/lib/pipeline-defaults'

const CreateClientSchema = z.object({
  name: z.string().min(1),
  contactName: z.string().optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  website: z.string().url().optional(),
})

function getClerkMeta(sessionClaims: unknown) {
  const meta = (sessionClaims as Record<string, unknown>)?.publicMetadata as
    | { role?: string; tenantId?: string }
    | undefined
  return { role: meta?.role ?? '', tenantId: meta?.tenantId }
}

export async function GET(request: Request) {
  const { userId, sessionClaims } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { role, tenantId } = getClerkMeta(sessionClaims)
  if (!hasPermission(role, 'clients:read') || !tenantId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const cursor = searchParams.get('cursor')
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '25', 10), 100)

  const clients = await withTenant(tenantId, () =>
    db.client.findMany({
      where: { deletedAt: null },
      take: limit,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { campaigns: true } } },
    })
  )

  const nextCursor = clients.length === limit ? clients[clients.length - 1].id : null
  return NextResponse.json({ data: clients, nextCursor })
}

export async function POST(request: Request) {
  const { userId, sessionClaims } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { role, tenantId } = getClerkMeta(sessionClaims)
  if (!hasPermission(role, 'clients:write') || !tenantId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json()
  const result = CreateClientSchema.safeParse(body)
  if (!result.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: result.error.flatten() },
      { status: 400 }
    )
  }

  const client = await withTenant(tenantId, () =>
    db.client.create({ data: { ...result.data, tenantId } })
  )

  await seedDefaultStages(tenantId, client.id)

  return NextResponse.json({ data: client }, { status: 201 })
}
