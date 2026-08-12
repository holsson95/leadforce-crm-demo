import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { getClerkMeta } from '@/lib/auth'

const PatchSchema = z.object({
  dialUnresponsiveLimit:     z.number().int().min(1).max(50).optional(),
  dialFutureReentryDays:     z.number().int().min(30).max(730).optional(),
  dialFutureReattempts:      z.number().int().min(1).max(20).optional(),
  notInterestedCooldownDays: z.number().int().min(1).max(365).optional(),
})

export async function GET() {
  try {
    const { userId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { role, tenantId } = await getClerkMeta()
    if (role !== 'admin' || !tenantId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const settings = await db.tenantSettings.findUnique({ where: { tenantId } })

    return NextResponse.json({
      data: {
        dialUnresponsiveLimit:     settings?.dialUnresponsiveLimit     ?? 8,
        dialFutureReentryDays:     settings?.dialFutureReentryDays     ?? 90,
        dialFutureReattempts:      settings?.dialFutureReattempts      ?? 3,
        notInterestedCooldownDays: settings?.notInterestedCooldownDays ?? 7,
      },
    })
  } catch (e) {
    if (process.env.NODE_ENV !== 'production') console.error('[settings/dialer GET]', e)
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

    await db.tenantSettings.upsert({
      where:  { tenantId },
      create: { tenantId, ...parsed.data },
      update: parsed.data,
    })

    return NextResponse.json({ data: { success: true } })
  } catch (e) {
    if (process.env.NODE_ENV !== 'production') console.error('[settings/dialer PATCH]', e)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
