import { NextResponse } from 'next/server'
import { purgeDeletedCampaigns } from '@/lib/jobs/purge-deleted-campaigns'

export async function POST(request: Request) {
  const secret = request.headers.get('x-cron-secret')
  if (!secret || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const purged = await purgeDeletedCampaigns()
    return NextResponse.json({ data: { purged } })
  } catch (err) {
    console.error('[purge-campaigns] failed:', err)
    return NextResponse.json({ error: 'Purge failed' }, { status: 500 })
  }
}
