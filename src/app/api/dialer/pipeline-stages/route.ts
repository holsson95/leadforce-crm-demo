import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db, withTenant } from '@/lib/db'
import { hasPermission, getClerkMeta } from '@/lib/auth'

export async function GET(req: NextRequest) {
  try {
    const { userId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { role, tenantId } = await getClerkMeta()
    if (!hasPermission(role, 'calls:write') || !tenantId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const campaignId = req.nextUrl.searchParams.get('campaignId')
    if (!campaignId) {
      return NextResponse.json({ error: 'campaignId required' }, { status: 400 })
    }

    const campaign = await withTenant(tenantId, () =>
      db.campaign.findUnique({
        where:  { id: campaignId },
        select: { clientId: true },
      })
    )

    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
    }

    const stages = await withTenant(tenantId, () =>
      db.pipelineStage.findMany({
        where:   { clientId: campaign.clientId },
        select:  { id: true, name: true, color: true },
        orderBy: { position: 'asc' },
      })
    )

    return NextResponse.json({ data: { clientId: campaign.clientId, stages } })
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
