import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { Prisma, ContactStatus } from '@prisma/client'
import { db, withTenant } from '@/lib/db'
import { hasPermission, getClerkMeta } from '@/lib/auth'
import { computeDedupeHash } from '@/lib/csv/dedup'
import { normalizePhoneDigits } from '@/lib/utils/phone'

const CreateContactSchema = z.object({
  campaignId:      z.string().min(1),
  firstName:       z.string().min(1),
  lastName:        z.string().min(1),
  email:           z.string().email().optional(),
  mobilePhone:     z.string().optional(),
  corporatePhone:  z.string().optional(),
  companyName:     z.string().optional(),
  jobTitle:        z.string().optional(),
  industry:        z.string().optional(),
  employeeCount:   z.number().int().positive().optional(),
  country:         z.string().optional(),
  companyAddress:  z.string().optional(),
  companyCity:     z.string().optional(),
  address:         z.string().optional(),
  city:            z.string().optional(),
  state:           z.string().optional(),
  zip:             z.string().optional(),
  website:         z.string().url().optional(),
  linkedinUrl:     z.string().url().optional(),
  status:          z.nativeEnum(ContactStatus).default('prospect'),
  dncReason:       z.string().optional(),
  accountOwnerId:  z.string().optional(),
})

export async function GET(request: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { role, tenantId } = await getClerkMeta()
  if (!hasPermission(role, 'contacts:read') || !tenantId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const sp = request.nextUrl.searchParams
  const page          = Math.max(1, parseInt(sp.get('page') ?? '1'))
  const pageSize      = Math.min(100, Math.max(1, parseInt(sp.get('pageSize') ?? '25')))
  const skip          = (page - 1) * pageSize
  const campaignId    = sp.get('campaignId') ?? undefined
  const status        = sp.get('status') ?? undefined
  const search        = sp.get('search') ?? undefined
  const industry      = sp.get('industry') ?? undefined
  const country       = sp.get('country') ?? undefined
  const accountOwnerId = sp.get('accountOwnerId') ?? undefined

  const where: Prisma.ContactWhereInput = {
    tenantId,
    deletedAt: null,
    ...(campaignId && { campaignId }),
    ...(status && { status: status as ContactStatus }),
    ...(industry && { industry }),
    ...(country && { country }),
    ...(accountOwnerId && { accountOwnerId }),
    ...(search && {
      OR: [
        { firstName:   { contains: search, mode: 'insensitive' } },
        { lastName:    { contains: search, mode: 'insensitive' } },
        { email:       { contains: search, mode: 'insensitive' } },
        { companyName: { contains: search, mode: 'insensitive' } },
      ],
    }),
  }

  const [contacts, total] = await withTenant(tenantId, () =>
    Promise.all([
      db.contact.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        include: {
          campaign:     { select: { id: true, name: true } },
          accountOwner: { select: { id: true, name: true } },
        },
      }),
      db.contact.count({ where }),
    ])
  )

  return NextResponse.json({ data: contacts, total, page, pageSize })
}

export async function POST(request: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { role, tenantId } = await getClerkMeta()
  if (!hasPermission(role, 'contacts:write') || !tenantId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json()
  const result = CreateContactSchema.safeParse(body)
  if (!result.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: result.error.flatten() },
      { status: 400 }
    )
  }

  const dedupeHash = computeDedupeHash(result.data.email ?? null, result.data.mobilePhone ?? null)
  const mobilePhoneDigits = normalizePhoneDigits(result.data.mobilePhone ?? null)
  const corporatePhoneDigits = normalizePhoneDigits(result.data.corporatePhone ?? null)
  const contact = await withTenant(tenantId, () =>
    db.contact.create({ data: { ...result.data, tenantId, dedupeHash, mobilePhoneDigits, corporatePhoneDigits } })
  )

  return NextResponse.json({ data: contact }, { status: 201 })
}

export async function DELETE(request: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { role, tenantId } = await getClerkMeta()
  if (!hasPermission(role, 'contacts:write') || !tenantId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json()
  const parsed = z.object({ ids: z.array(z.string()).min(1) }).safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', details: parsed.error }, { status: 400 })
  }

  const result = await withTenant(tenantId, () =>
    db.contact.updateMany({
      where: { id: { in: parsed.data.ids }, tenantId, deletedAt: null },
      data:  { deletedAt: new Date() },
    })
  )

  return NextResponse.json({ data: { deleted: result.count } })
}
