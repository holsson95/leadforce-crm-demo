import { headers } from 'next/headers'
import { Webhook } from 'svix'
import type { WebhookEvent } from '@clerk/nextjs/server'
import { clerkClient } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import type { UserRole } from '@prisma/client'

export async function POST(req: Request) {
  const WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SECRET
  if (!WEBHOOK_SECRET) {
    return new Response('CLERK_WEBHOOK_SECRET not configured', { status: 500 })
  }

  const headerPayload = await headers()
  const svixId        = headerPayload.get('svix-id')
  const svixTimestamp = headerPayload.get('svix-timestamp')
  const svixSignature = headerPayload.get('svix-signature')

  if (!svixId || !svixTimestamp || !svixSignature) {
    return new Response('Missing svix headers', { status: 400 })
  }

  const body = await req.text()

  const wh = new Webhook(WEBHOOK_SECRET)
  let evt: WebhookEvent

  try {
    evt = wh.verify(body, {
      'svix-id':        svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': svixSignature,
    }) as WebhookEvent
  } catch {
    return new Response('Invalid webhook signature', { status: 400 })
  }

  if (evt.type === 'user.updated') {
    const { id, public_metadata, email_addresses, first_name, last_name } = evt.data
    const rawPublic = public_metadata as Record<string, unknown> | undefined
    const role      = rawPublic?.role as string | undefined
    const tenantId  = rawPublic?.tenantId as string | undefined

    if (tenantId && role) {
      const email = email_addresses?.[0]?.email_address ?? ''
      const name  = [first_name, last_name].filter(Boolean).join(' ') || email
      await db.user.upsert({
        where:  { clerkId: id },
        create: { clerkId: id, tenantId, email, name, role: role as UserRole },
        update: { email, name, role: role as UserRole, tenantId },
      })
    }
    return new Response('OK', { status: 200 })
  }

  if (evt.type === 'user.created') {
    const { id, unsafe_metadata, public_metadata, email_addresses, first_name, last_name } = evt.data
    const email = email_addresses?.[0]?.email_address ?? ''
    const name  = [first_name, last_name].filter(Boolean).join(' ') || email

    // Client portal path: Clerk invitation carries publicMetadata.clientId
    const rawClientId = (public_metadata as Record<string, unknown> | undefined)?.clientId
    const clientId = typeof rawClientId === 'string' && rawClientId.length > 0 ? rawClientId : undefined
    if (clientId) {
      const clientRecord = await db.client.findUnique({ where: { id: clientId } })
      if (!clientRecord) {
        console.error(`[clerk-webhook] user.created: no Client found for clerkUserId=${id} clientId=${clientId}`)
        return new Response('Client not found', { status: 400 })
      }
      await db.$transaction([
        db.client.update({ where: { id: clientId }, data: { clerkId: id } }),
        db.user.upsert({
          where:  { clerkId: id },
          create: { clerkId: id, tenantId: clientRecord.tenantId, email, name, role: 'client' },
          update: { email, name, role: 'client' },
        }),
      ])
      const clerk = await clerkClient()
      await clerk.users.updateUser(id, {
        publicMetadata: { role: 'client', tenantId: clientRecord.tenantId },
      })
      return new Response('OK', { status: 200 })
    }

    // Internal user path (SDR, manager, admin): invitation publicMetadata carries role + tenantId
    // Fall back to unsafe_metadata for manually-created users (dev/admin use)
    const rawPublic  = public_metadata as Record<string, unknown> | undefined
    const rawUnsafe  = unsafe_metadata as Record<string, unknown> | undefined
    const role       = ((rawPublic?.role ?? rawUnsafe?.role ?? 'sdr') as string) as UserRole
    const tenantId   = ((rawPublic?.tenantId ?? rawUnsafe?.tenantId) as string | undefined) ?? null

    const clerk = await clerkClient()
    await clerk.users.updateUser(id, {
      publicMetadata: { role, tenantId },
    })

    if (tenantId) {
      await db.user.upsert({
        where:  { clerkId: id },
        create: { clerkId: id, tenantId, email, name, role },
        update: { email, name, role, tenantId },
      })
    }
  }

  return new Response('OK', { status: 200 })
}
