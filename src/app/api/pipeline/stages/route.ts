import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { db, withTenant } from '@/lib/db'
import { hasPermission, getClerkMeta, resolvePermission } from '@/lib/auth'

export async function GET(req: NextRequest) {
  try {
    const { userId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { role, tenantId } = await getClerkMeta()
    if (!hasPermission(role, 'pipeline:read') || !tenantId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const clientId = req.nextUrl.searchParams.get('clientId')
    if (!clientId) {
      return NextResponse.json({ error: 'clientId required' }, { status: 400 })
    }

    const stages = await withTenant(tenantId, () =>
      db.pipelineStage.findMany({
        where: { clientId },
        orderBy: { position: 'asc' },
        select: { id: true, name: true, color: true, position: true },
      })
    )

    return NextResponse.json({ data: stages })
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

const CreateStageSchema = z.object({
  clientId: z.string().min(1),
  name:     z.string().min(1).max(80),
  color:    z.string().regex(/^#[0-9a-f]{6}$/i),
})

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { role, tenantId } = await getClerkMeta()
    if (!tenantId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const canWrite = await resolvePermission(userId, tenantId, role, 'pipeline:write')
    const granted  = canWrite !== null ? canWrite : (role === 'admin' || role === 'manager')
    if (!granted) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const body   = await req.json()
    const parsed = CreateStageSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid body', details: parsed.error.flatten() }, { status: 400 })
    }

    const { clientId, name, color } = parsed.data

    const client = await withTenant(tenantId, () =>
      db.client.findFirst({ where: { id: clientId }, select: { id: true } })
    )
    if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 404 })

    const count = await withTenant(tenantId, () =>
      db.pipelineStage.count({ where: { clientId } })
    )

    const stage = await withTenant(tenantId, () =>
      db.pipelineStage.create({
        data:   { tenantId, clientId, name, color, position: count },
        select: { id: true, name: true, color: true, position: true },
      })
    )

    return NextResponse.json({ data: stage }, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
