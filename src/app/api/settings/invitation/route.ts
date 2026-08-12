import { NextRequest, NextResponse } from 'next/server'
import { clerkClient } from '@clerk/nextjs/server'
import { z } from 'zod'
import { getClerkMeta } from '@/lib/auth'

const InviteSchema = z.object({
  email: z.string().email(),
  role:  z.enum(['sdr', 'manager']),
})

export async function POST(req: NextRequest) {
  try {
    const { role: callerRole, tenantId } = await getClerkMeta()
    if ((callerRole !== 'admin' && callerRole !== 'manager') || !tenantId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Managers can only invite SDRs
    const body   = await req.json()
    const parsed = InviteSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid body', details: parsed.error.flatten() }, { status: 400 })
    }

    const { email, role } = parsed.data
    if (callerRole === 'manager' && role !== 'sdr') {
      return NextResponse.json({ error: 'Managers can only invite SDRs' }, { status: 403 })
    }

    const clerk = await clerkClient()
    await clerk.invitations.createInvitation({
      emailAddress: email,
      publicMetadata: { role, tenantId },
      redirectUrl: `${process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'}/sign-up`,
      ignoreExisting: true,
    })

    return NextResponse.json({ data: { success: true } })
  } catch (e) {
    if (process.env.NODE_ENV !== 'production') console.error('[settings/invitation POST]', e)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
