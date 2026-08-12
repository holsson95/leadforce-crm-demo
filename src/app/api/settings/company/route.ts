import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { getClerkMeta } from '@/lib/auth'

const IANA_REGEX = /^[A-Za-z][A-Za-z0-9_+\-]*(?:\/[A-Za-z0-9_+\-]+)+$/

const PatchSchema = z.object({
  name:     z.string().min(1).optional(),
  timezone: z.string().regex(IANA_REGEX, 'Must be a valid IANA timezone').optional(),
})

export async function GET() {
  try {
    const { userId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { role, tenantId } = await getClerkMeta()
    if (role !== 'admin' || !tenantId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const [tenant, settings] = await Promise.all([
      db.tenant.findUnique({ where: { id: tenantId }, select: { name: true } }),
      db.tenantSettings.upsert({ where: { tenantId }, create: { tenantId }, update: {} }),
    ])

    return NextResponse.json({ data: { name: tenant?.name ?? '', timezone: settings.timezone, logoUrl: settings.logoUrl } })
  } catch (e) {
    if (process.env.NODE_ENV !== 'production') console.error('[settings/company GET]', e)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { userId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { role, tenantId } = await getClerkMeta()
    if (role !== 'admin' || !tenantId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body   = await req.json()
    const parsed = PatchSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid body', details: parsed.error.flatten() }, { status: 400 })
    }

    const { name, timezone } = parsed.data

    await db.$transaction(async (tx) => {
      if (name) {
        await tx.tenant.update({ where: { id: tenantId }, data: { name } })
      }
      await tx.tenantSettings.upsert({
        where:  { tenantId },
        create: { tenantId, ...(timezone && { timezone }) },
        update: { ...(timezone && { timezone }) },
      })
    })

    return NextResponse.json({ data: { success: true } })
  } catch (e) {
    if (process.env.NODE_ENV !== 'production') console.error('[settings/company PATCH]', e)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
