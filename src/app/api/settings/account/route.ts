import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { db, withTenant } from '@/lib/db'
import { getClerkMeta } from '@/lib/auth'

const IANA_REGEX = /^[A-Za-z][A-Za-z0-9_+\-]*(?:\/[A-Za-z0-9_+\-]+)+$/

const PatchSchema = z.object({
  name:     z.string().min(1).optional(),
  timezone: z.string().regex(IANA_REGEX, 'Must be a valid IANA timezone').nullable().optional(),
})

export async function GET() {
  try {
    const { userId: clerkId } = await auth()
    if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { tenantId } = await getClerkMeta()
    if (!tenantId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const user = await withTenant(tenantId, () =>
      db.user.findFirst({
        where:  { clerkId },
        select: { id: true, name: true, email: true, timezone: true, role: true },
      })
    )
    if (!user) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    return NextResponse.json({ data: user })
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { userId: clerkId } = await auth()
    if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { tenantId } = await getClerkMeta()
    if (!tenantId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const body   = await req.json()
    const parsed = PatchSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid body', details: parsed.error.flatten() }, { status: 400 })
    }

    const updated = await withTenant(tenantId, () =>
      db.user.update({
        where:  { tenantId_clerkId: { tenantId, clerkId } },
        data:   parsed.data,
        select: { id: true, name: true, email: true, timezone: true, role: true },
      })
    ).catch(() => null)
    if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    return NextResponse.json({ data: updated })
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
