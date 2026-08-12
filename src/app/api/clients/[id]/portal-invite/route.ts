import { NextRequest, NextResponse } from 'next/server'
import { auth, clerkClient } from '@clerk/nextjs/server'
import { db, withTenant } from '@/lib/db'
import { getClerkMeta, hasPermission } from '@/lib/auth'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { role, tenantId } = await getClerkMeta()
    if (!hasPermission(role, 'clients:write') || !tenantId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params
    const resend  = req.nextUrl.searchParams.get('resend') === 'true'

    const client = await withTenant(tenantId, () =>
      db.client.findUnique({ where: { id } })
    )

    if (!client) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (client.clerkId && !resend) return NextResponse.json({ error: 'Portal already active' }, { status: 409 })
    if (!client.email) return NextResponse.json({ error: 'Client has no email address' }, { status: 400 })

    const clerk = await clerkClient()
    await clerk.invitations.createInvitation({
      emailAddress: client.email,
      publicMetadata: { role: 'client', clientId: client.id },
      redirectUrl: `${process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'}/sign-up`,
    })

    return NextResponse.json({ data: { sent: true } })
  } catch (e) {
    if (process.env.NODE_ENV !== 'production') console.error('[clients/portal-invite]', e)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
