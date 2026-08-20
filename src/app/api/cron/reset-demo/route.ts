import { NextResponse } from 'next/server'
import type { PrismaClient } from '@prisma/client'
import { db } from '@/lib/db'
import { resetAndSeedDemoTenants } from '@/lib/jobs/seed-demo-data'

// Hourly Vercel Cron (see vercel.json): re-seeds both demo tenants, undoing
// whatever a visitor edited or deleted.
//
// Vercel's native Cron Jobs always send a GET request, and automatically add
// `Authorization: Bearer $CRON_SECRET` when a CRON_SECRET env var is set —
// that's the primary path. POST + x-cron-secret is also accepted, matching
// this repo's existing purge-campaigns cron, for manual/local triggering.
function isAuthorized(request: Request): boolean {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) return false

  const bearer = request.headers.get('authorization')
  if (bearer === `Bearer ${cronSecret}`) return true

  const legacyHeader = request.headers.get('x-cron-secret')
  return legacyHeader === cronSecret
}

async function runReset() {
  try {
    // See the type comment in seed-demo-data.ts for why this cast is safe.
    await resetAndSeedDemoTenants(db as unknown as PrismaClient)
    return NextResponse.json({ data: { reset: true } })
  } catch (err) {
    console.error('[reset-demo] failed:', err)
    return NextResponse.json({ error: 'Reset failed' }, { status: 500 })
  }
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return runReset()
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return runReset()
}
