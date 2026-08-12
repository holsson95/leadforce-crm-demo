import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import type { Prisma, CallOutcome } from '@prisma/client'
import { ContactStatus } from '@prisma/client'
import { db, withTenant } from '@/lib/db'
import { hasPermission, getClerkMeta } from '@/lib/auth'
import type { ContactSummary } from '@/types/models'

const NumericOp = z.enum(['eq', 'gt', 'lt', 'gte', 'lte'])

const QuerySchema = z.object({
  campaignId:       z.string().min(1),
  skip:             z.coerce.number().int().min(0).optional().default(0),
  lastCallBefore:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  lastCallOutcome:  z.string().max(500).optional(),
  dialAttemptsOp:   NumericOp.optional(),
  dialAttemptsVal:  z.coerce.number().int().min(0).optional(),
  phonePrefix:      z.string().max(20).optional(),
  jobTitle:         z.string().max(200).optional(),
  companyName:      z.string().max(200).optional(),
  hasNotes:         z.enum(['true']).optional(),
  employeeCountOp:  NumericOp.optional(),
  employeeCountVal: z.coerce.number().int().min(0).optional(),
  industry:         z.string().max(500).optional(),
  city:             z.string().max(100).optional(),
  state:            z.string().max(100).optional(),
  country:          z.string().max(100).optional(),
  accountOwnerId:   z.string().optional(),
  contactStatus:    z.string().max(200).optional(),
})

const PRISMA_OP: Record<z.infer<typeof NumericOp>, string> = {
  eq: 'equals', gt: 'gt', lt: 'lt', gte: 'gte', lte: 'lte',
}

// dnc intentionally excluded — DNC contacts never appear in the queue
const VALID_CONTACT_STATUSES = new Set<string>(['prospect', 'lead', 'call_back', 'future', 'meeting_booked'])

const VALID_OUTCOMES = new Set([
  'no_answer', 'voicemail', 'left_voicemail', 'not_interested',
  'call_back_later', 'bad_time_to_speak', 'in_a_meeting', 'hung_up',
  'connected', 'wrong_number', 'not_relevant_contact', 'disqualified',
  'lead', 'meeting_booked', 'call_back_attempted', 'on_holiday',
  'does_not_take_cold_calls', 'ai_assistant', 'line_engaged', 'mobile_switched_off',
  'foreign_dial_tone', 'not_available', 'other',
])

export async function GET(request: Request) {
  try {
    const { userId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { role, tenantId } = await getClerkMeta()
    if (!hasPermission(role, 'calls:write') || !tenantId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const parsed = QuerySchema.safeParse(Object.fromEntries(searchParams))
    if (!parsed.success) {
      return NextResponse.json({ error: 'campaignId required' }, { status: 400 })
    }
    const {
      campaignId, skip,
      lastCallBefore, lastCallOutcome,
      dialAttemptsOp, dialAttemptsVal,
      phonePrefix, jobTitle, companyName,
      hasNotes, employeeCountOp, employeeCountVal,
      industry, city, state, country, accountOwnerId,
      contactStatus,
    } = parsed.data

    const now          = new Date()
    const startOfToday = new Date(now)
    startOfToday.setUTCHours(0, 0, 0, 0)

    const parsedContactStatuses: ContactStatus[] | undefined = contactStatus
      ? (contactStatus.split(',').filter((v) => VALID_CONTACT_STATUSES.has(v)) as ContactStatus[])
      : undefined

    const where: Prisma.ContactWhereInput = {
      tenantId,
      campaignId,
      status: parsedContactStatuses?.length
        ? { in: parsedContactStatuses }
        : { not: ContactStatus.dnc },
      OR: [
        { notInterestedUntil: null },
        { notInterestedUntil: { lte: now } },
      ],
      callRecords: {
        none: {
          campaignId,
          createdAt: { gte: startOfToday },
        },
      },
    }

    // --- Simple field filters ---
    if (dialAttemptsOp && dialAttemptsVal != null)
      where.dialAttempts = { [PRISMA_OP[dialAttemptsOp]]: dialAttemptsVal }

    if (employeeCountOp && employeeCountVal != null)
      where.employeeCount = { [PRISMA_OP[employeeCountOp]]: employeeCountVal }

    if (phonePrefix)
      where.mobilePhone = { startsWith: phonePrefix }

    if (jobTitle)
      where.jobTitle = { contains: jobTitle, mode: 'insensitive' }

    if (companyName)
      where.companyName = { contains: companyName, mode: 'insensitive' }

    if (city)
      where.city = { contains: city, mode: 'insensitive' }

    if (state)
      where.state = { contains: state, mode: 'insensitive' }

    if (country)
      where.country = { contains: country, mode: 'insensitive' }

    if (accountOwnerId)
      where.accountOwnerId = accountOwnerId

    if (industry)
      where.industry = { in: industry.split(',') }

    if (hasNotes === 'true')
      where.notes = { some: {} }

    // --- Last call filters (subquery to find most-recent record per contact) ---
    const parsedOutcomes: CallOutcome[] | undefined = lastCallOutcome
      ? (lastCallOutcome.split(',').filter((v) => VALID_OUTCOMES.has(v)) as CallOutcome[])
      : undefined

    if (lastCallBefore || parsedOutcomes?.length) {
      const allRecords = await withTenant(tenantId, () =>
        db.callRecord.findMany({
          where:   { tenantId, campaignId },
          select:  { contactId: true, outcome: true, createdAt: true },
          orderBy: { createdAt: 'desc' },
        })
      )
      const latestByContact = new Map<string, { outcome: CallOutcome | null; createdAt: Date }>()
      for (const r of allRecords) {
        if (!latestByContact.has(r.contactId)) {
          latestByContact.set(r.contactId, { outcome: r.outcome, createdAt: r.createdAt })
        }
      }
      const matchingIds = [...latestByContact.entries()]
        .filter(([, r]) => {
          if (lastCallBefore) {
            const cutoff = new Date(lastCallBefore + 'T23:59:59.999Z')
            if (r.createdAt > cutoff) return false
          }
          if (parsedOutcomes?.length && (!r.outcome || !parsedOutcomes.includes(r.outcome))) return false
          return true
        })
        .map(([id]) => id)
      where.id = { in: matchingIds }
    }

    const contacts = await withTenant(tenantId, () =>
      db.contact.findMany({
        where,
        select: {
          id:             true,
          firstName:      true,
          lastName:       true,
          mobilePhone:    true,
          corporatePhone: true,
          companyName:    true,
          status:         true,
          jobTitle:       true,
          employeeCount:  true,
          linkedinUrl:    true,
          website:        true,
          email:          true,
          country:        true,
          city:           true,
          callRecords: {
            select: {
              id:        true,
              outcome:   true,
              notes:     true,
              createdAt: true,
              user:      { select: { name: true } },
            },
            orderBy: { createdAt: 'desc' },
            take:    10,
          },
        },
        orderBy: [{ status: 'asc' }, { id: 'asc' }],
        skip,
        take: 20,
      })
    )

    const total = await withTenant(tenantId, () => db.contact.count({ where }))

    const data: ContactSummary[] = contacts.map((c) => ({
      id:             c.id,
      firstName:      c.firstName,
      lastName:       c.lastName,
      mobilePhone:    c.mobilePhone,
      corporatePhone: c.corporatePhone,
      companyName:    c.companyName,
      status:         c.status,
      jobTitle:       c.jobTitle,
      employeeCount:  c.employeeCount,
      linkedinUrl:    c.linkedinUrl,
      website:        c.website,
      email:          c.email,
      country:        c.country,
      city:           c.city,
      callHistory:    c.callRecords.map((r) => ({
        id:         r.id,
        outcome:    r.outcome,
        notes:      r.notes,
        createdAt:  r.createdAt.toISOString(),
        callerName: r.user.name,
      })),
    }))

    return NextResponse.json({ data, total })
  } catch (err) {
    console.error('[queue/route] GET error', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
