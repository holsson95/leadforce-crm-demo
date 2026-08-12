import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { db, withTenant } from '@/lib/db'
import { hasPermission, getClerkMeta } from '@/lib/auth'

const PostSchema = z.object({ content: z.string().min(1) })

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId: clerkId } = await auth()
    if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { role, tenantId } = await getClerkMeta()
    if (!hasPermission(role, 'contacts:read') || !tenantId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params

    const [callRecords, standaloneNotes] = await withTenant(tenantId, () =>
      Promise.all([
        db.callRecord.findMany({
          where:   { contactId: id },
          select: {
            id:        true,
            outcome:   true,
            notes:     true,
            createdAt: true,
            user:      { select: { name: true } },
          },
          orderBy: { createdAt: 'desc' },
        }),
        db.contactNote.findMany({
          where:   { contactId: id, deletedAt: null },
          select: {
            id:        true,
            content:   true,
            createdAt: true,
            user:      { select: { name: true } },
          },
          orderBy: { createdAt: 'desc' },
        }),
      ])
    )

    const entries = [
      ...callRecords.map((r) => ({
        id:         r.id,
        type:       'call' as const,
        callerName: r.user.name,
        createdAt:  r.createdAt.toISOString(),
        outcome:    r.outcome ?? null,
        content:    r.notes ?? '',
      })),
      ...standaloneNotes.map((n) => ({
        id:         n.id,
        type:       'note' as const,
        callerName: n.user.name,
        createdAt:  n.createdAt.toISOString(),
        outcome:    null,
        content:    n.content,
      })),
    ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

    return NextResponse.json({ data: entries })
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId: clerkId } = await auth()
    if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { role, tenantId } = await getClerkMeta()
    if (!hasPermission(role, 'contacts:write') || !tenantId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params

    const contact = await withTenant(tenantId, () =>
      db.contact.findUnique({ where: { id }, select: { id: true } })
    )
    if (!contact) return NextResponse.json({ error: 'Contact not found' }, { status: 404 })

    const body = await req.json()
    const parsed = PostSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid body', details: parsed.error.flatten() }, { status: 400 })
    }

    const dbUser = await withTenant(tenantId, () =>
      db.user.findFirst({ where: { clerkId }, select: { id: true } })
    )
    if (!dbUser) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    const note = await withTenant(tenantId, () =>
      db.contactNote.create({
        data: {
          tenantId,
          contactId: id,
          userId:    dbUser.id,
          content:   parsed.data.content,
        },
        select: { id: true },
      })
    )

    return NextResponse.json({ data: { id: note.id } }, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
