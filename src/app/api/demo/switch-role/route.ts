import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { auth } from '@clerk/nextjs/server'
import { DEMO_ROLES, DEMO_ROLE_COOKIE } from '@/lib/demo'

async function requireDemoUser() {
  const { userId } = await auth()
  return Boolean(userId) && userId === process.env.DEMO_USER_CLERK_ID
}

// Returns the roles the shared demo login can preview and which one is active,
// so the client-side switcher only ever renders for the flagged demo account.
export async function GET() {
  if (!(await requireDemoUser())) {
    return NextResponse.json({ data: { isDemoUser: false, roles: [], activeRole: null } })
  }

  const store = await cookies()
  const cookieValue = store.get(DEMO_ROLE_COOKIE)?.value
  const activeRole = (DEMO_ROLES as readonly string[]).includes(cookieValue ?? '') ? cookieValue! : DEMO_ROLES[0]

  return NextResponse.json({ data: { isDemoUser: true, roles: DEMO_ROLES, activeRole } })
}

export async function POST(request: Request) {
  if (!(await requireDemoUser())) {
    return NextResponse.json({ error: 'Not available' }, { status: 403 })
  }

  const body = await request.json().catch(() => null) as { role?: unknown } | null
  const role = body?.role
  if (typeof role !== 'string' || !(DEMO_ROLES as readonly string[]).includes(role)) {
    return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
  }

  const store = await cookies()
  store.set(DEMO_ROLE_COOKIE, role, {
    httpOnly: true,
    sameSite: 'lax',
    path:     '/',
    maxAge:   60 * 60 * 24 * 7,
  })

  return NextResponse.json({ data: { role } })
}
