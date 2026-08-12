import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { db, withTenant } from '@/lib/db'
import { hasPermission, getClerkMeta } from '@/lib/auth'

const QuerySchema = z.object({
  campaignId: z.string().min(1),
})

export async function GET(request: Request) {
  try {
    const { userId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { role, tenantId } = await getClerkMeta()
    if (!hasPermission(role, 'calls:write') || !tenantId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const parsed = QuerySchema.safeParse({ campaignId: searchParams.get('campaignId') })
    if (!parsed.success) {
      return NextResponse.json({ error: 'campaignId required' }, { status: 400 })
    }
    const { campaignId } = parsed.data

    const contacts = await withTenant(tenantId, () =>
      db.contact.findMany({
        where:    { tenantId, campaignId, industry: { not: null }, deletedAt: null },
        select:   { industry: true },
        distinct: ['industry'],
      })
    )

    const industries = contacts
      .map((c) => c.industry!)
      .filter(Boolean)
      .sort()

    return NextResponse.json({ data: { industries } })
  } catch (err) {
    console.error('[queue/meta] GET error', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
