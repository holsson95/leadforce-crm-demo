import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { db, withTenant } from '@/lib/db'
import { hasPermission, getClerkMeta } from '@/lib/auth'
import { computeDedupeHash } from '@/lib/csv/dedup'
import { normalizePhoneDigits } from '@/lib/utils/phone'

const UpdateContactSchema = z.object({
  firstName:      z.string().min(1).optional(),
  lastName:       z.string().min(1).optional(),
  email:          z.string().email().nullable().optional(),
  mobilePhone:    z.string().nullable().optional(),
  corporatePhone: z.string().nullable().optional(),
  companyName:    z.string().nullable().optional(),
  jobTitle:       z.string().nullable().optional(),
  industry:       z.string().nullable().optional(),
  employeeCount:  z.union([z.string(), z.number()]).nullable().optional(),
  address:        z.string().nullable().optional(),
  city:           z.string().nullable().optional(),
  state:          z.string().nullable().optional(),
  zip:            z.string().nullable().optional(),
  country:        z.string().nullable().optional(),
  companyAddress: z.string().nullable().optional(),
  companyCity:    z.string().nullable().optional(),
  website:        z.string().url().nullable().optional(),
  linkedinUrl:    z.string().url().nullable().optional(),
  status:         z.enum(['prospect', 'lead', 'dnc', 'future', 'call_back', 'meeting_booked']).optional(),
  dncReason:      z.string().nullable().optional(),
  accountOwnerId: z.string().nullable().optional(),
})

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { role, tenantId } = await getClerkMeta()
  if (!hasPermission(role, 'contacts:read') || !tenantId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const contact = await withTenant(tenantId, () =>
    db.contact.findUnique({
      where: { id, deletedAt: null },
      include: {
        campaign: { select: { id: true, name: true } },
        accountOwner: { select: { id: true, name: true } },
      },
    })
  )

  if (!contact) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ data: contact })
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { role, tenantId } = await getClerkMeta()
  if (!hasPermission(role, 'contacts:write') || !tenantId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const body = await request.json()
  const result = UpdateContactSchema.safeParse(body)
  if (!result.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: result.error.flatten() },
      { status: 400 }
    )
  }

  const parsed = result.data

  // Fetch existing contact so we can merge email/mobilePhone when only one field changes.
  // Without this, the dedupeHash would use null for the unchanged field instead of
  // the stored value, producing an incorrect hash.
  const existing = await withTenant(tenantId, () =>
    db.contact.findUnique({ where: { id }, select: { email: true, mobilePhone: true, corporatePhone: true } })
  )
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const emailForHash = parsed.email !== undefined ? (parsed.email || null) : (existing?.email ?? null)
  const phoneForHash = parsed.mobilePhone !== undefined ? (parsed.mobilePhone || null) : (existing?.mobilePhone ?? null)
  const dedupeHash = computeDedupeHash(emailForHash, phoneForHash)
  const corporatePhoneForHash = parsed.corporatePhone !== undefined ? (parsed.corporatePhone || null) : (existing?.corporatePhone ?? null)
  const mobilePhoneDigits = normalizePhoneDigits(phoneForHash)
  const corporatePhoneDigits = normalizePhoneDigits(corporatePhoneForHash)

  const contact = await withTenant(tenantId, () =>
    db.contact.update({
      where: { id },
      data: {
        ...parsed,
        status: parsed.status,
        mobilePhone: parsed.mobilePhone ?? undefined,
        corporatePhone: parsed.corporatePhone ?? undefined,
        mobilePhoneDigits,
        corporatePhoneDigits,
        industry: parsed.industry ?? undefined,
        employeeCount: parsed.employeeCount ? Number(parsed.employeeCount) : undefined,
        country: parsed.country ?? undefined,
        companyAddress: parsed.companyAddress ?? undefined,
        companyCity: parsed.companyCity ?? undefined,
        accountOwnerId: parsed.accountOwnerId ?? undefined,
        dedupeHash,
      },
      include: {
        campaign: { select: { id: true, name: true } },
        accountOwner: { select: { id: true, name: true } },
      },
    })
  )

  return NextResponse.json({ data: contact })
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { role, tenantId } = await getClerkMeta()
  if (!hasPermission(role, 'contacts:write') || !tenantId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params

  // Guard against P2025 Prisma error (record not found) which would otherwise
  // surface as a 500. Also prevents acting on IDs belonging to other tenants.
  const existing = await withTenant(tenantId, () =>
    db.contact.findUnique({ where: { id }, select: { id: true } })
  )
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await withTenant(tenantId, () =>
    db.contact.update({ where: { id }, data: { deletedAt: new Date() } })
  )

  return NextResponse.json({ data: { success: true } })
}
