import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { DEMO_TENANT_SLUGS, DEMO_TENANT_COOKIE } from '@/lib/demo'

async function requireDemoUser() {
  const { userId } = await auth()
  const isDemoUser = Boolean(userId) && userId === process.env.DEMO_USER_CLERK_ID
  return isDemoUser
}

// Returns the two demo tenants and which one this session is currently viewing,
// so the client-side switcher only ever renders for the flagged demo account.
export async function GET() {
  if (!(await requireDemoUser())) {
    return NextResponse.json({ data: { isDemoUser: false, tenants: [], activeTenantId: null } })
  }

  const [tenants, store] = await Promise.all([
    db.tenant.findMany({
      where:   { slug: { in: [...DEMO_TENANT_SLUGS] } },
      select:  { id: true, name: true, slug: true },
      orderBy: { slug: 'asc' },
    }),
    cookies(),
  ])

  const cookieValue = store.get(DEMO_TENANT_COOKIE)?.value
  const activeTenantId = tenants.some(t => t.id === cookieValue) ? cookieValue! : (tenants[0]?.id ?? null)

  return NextResponse.json({ data: { isDemoUser: true, tenants, activeTenantId } })
}

export async function POST(request: Request) {
  if (!(await requireDemoUser())) {
    return NextResponse.json({ error: 'Not available' }, { status: 403 })
  }

  const body = await request.json().catch(() => null) as { tenantId?: unknown } | null
  const tenantId = body?.tenantId
  if (typeof tenantId !== 'string') {
    return NextResponse.json({ error: 'tenantId required' }, { status: 400 })
  }

  const tenant = await db.tenant.findFirst({
    where:  { id: tenantId, slug: { in: [...DEMO_TENANT_SLUGS] } },
    select: { id: true },
  })
  if (!tenant) {
    return NextResponse.json({ error: 'Invalid tenant' }, { status: 400 })
  }

  const store = await cookies()
  store.set(DEMO_TENANT_COOKIE, tenant.id, {
    httpOnly: true,
    sameSite: 'lax',
    path:     '/',
    maxAge:   60 * 60 * 24 * 7,
  })

  return NextResponse.json({ data: { tenantId: tenant.id } })
}
