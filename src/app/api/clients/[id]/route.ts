import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { db, withTenant } from '@/lib/db'
import { hasPermission } from '@/lib/auth'

const UpdateClientSchema = z.object({
  name: z.string().min(1).optional(),
  contactName: z.string().optional().nullable(),
  email: z.string().email().optional().nullable(),
  phone: z.string().optional().nullable(),
  website: z.string().url().optional().nullable(),
  portalPermissions: z.record(z.string(), z.boolean()).optional(),
})

function getClerkMeta(sessionClaims: unknown) {
  const meta = (sessionClaims as Record<string, unknown>)?.publicMetadata as
    | { role?: string; tenantId?: string }
    | undefined
  return { role: meta?.role ?? '', tenantId: meta?.tenantId }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId, sessionClaims } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { role, tenantId } = getClerkMeta(sessionClaims)
  if (!hasPermission(role, 'clients:write') || !tenantId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const body = await request.json()
  const result = UpdateClientSchema.safeParse(body)
  if (!result.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: result.error.flatten() },
      { status: 400 }
    )
  }

  const client = await withTenant(tenantId, () =>
    db.client.update({ where: { id }, data: result.data })
  )

  return NextResponse.json({ data: client })
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId, sessionClaims } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { role, tenantId } = getClerkMeta(sessionClaims)
  if (!hasPermission(role, 'clients:write') || !tenantId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const now = new Date()
  await withTenant(tenantId, () =>
    db.$transaction([
      db.contact.updateMany({
        where: { campaign: { clientId: id }, deletedAt: null },
        data: { deletedAt: now },
      }),
      db.campaign.updateMany({
        where: { clientId: id, deletedAt: null },
        data: { deletedAt: now },
      }),
      db.client.update({
        where: { id },
        data: { deletedAt: now },
      }),
    ])
  )

  return NextResponse.json({ data: { success: true } })
}
