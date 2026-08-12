import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { db, withTenant } from '@/lib/db'
import { hasPermission, getClerkMeta } from '@/lib/auth'
import { routeOutcome, CONVERSATION_TAGGED_OUTCOMES, DEFAULT_DIALER_THRESHOLDS, notesRequiredFor } from '@/lib/outcome-router'
import type { DialerThresholds } from '@/lib/outcome-router'
import { CallOutcome } from '@prisma/client'
import { classifyMBLeadStatus } from '@/lib/mb-lead-status'

const OUTCOME_ENUM = [
  'no_answer', 'voicemail', 'not_interested', 'not_relevant_contact',
  'disqualified', 'lead', 'call_back_later', 'meeting_booked', 'call_back_attempted',
  'connected', 'left_voicemail', 'bad_time_to_speak', 'in_a_meeting', 'on_holiday',
  'hung_up', 'does_not_take_cold_calls', 'ai_assistant', 'line_engaged', 'wrong_number',
  'mobile_switched_off', 'foreign_dial_tone', 'not_available', 'other',
] as const

const BodySchema = z.object({
  manual:       z.boolean().optional().default(false),
  callRecordId: z.string().min(1).optional(),
  campaignId:   z.string().min(1).optional(),
  outcome:      z.enum(OUTCOME_ENUM),
  notes:        z.string().optional(),
  contactId:    z.string().min(1),
  stageId:      z.string().min(1).optional(),
  addToQueue:   z.boolean().optional().default(false),
  clientId:     z.string().min(1).optional(),
})

export async function POST(req: NextRequest) {
  try {
    const { userId: clerkId } = await auth()
    if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { role, tenantId } = await getClerkMeta()
    if (!hasPermission(role, 'calls:write') || !tenantId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await req.json()
    const parsed = BodySchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid body', details: parsed.error.flatten() }, { status: 400 })
    }
    const { manual, callRecordId, campaignId, outcome, notes, contactId, stageId, addToQueue, clientId } = parsed.data

    if (!manual && !callRecordId) {
      return NextResponse.json({ error: 'callRecordId required' }, { status: 400 })
    }
    if (manual && !campaignId) {
      return NextResponse.json({ error: 'campaignId required for manual outcomes' }, { status: 400 })
    }
    if (notesRequiredFor(outcome as CallOutcome) && !(notes ?? '').trim()) {
      return NextResponse.json({ error: 'Notes are required for this outcome' }, { status: 400 })
    }

    const typedOutcome       = outcome as CallOutcome
    const conversationTagged = CONVERSATION_TAGGED_OUTCOMES.has(typedOutcome)
    const isMeetingBooked    = typedOutcome === 'meeting_booked'

    const tenantSettingsRow = await db.tenantSettings.findUnique({
      where:  { tenantId },
      select: {
        dialUnresponsiveLimit:     true,
        dialFutureReentryDays:     true,
        dialFutureReattempts:      true,
        notInterestedCooldownDays: true,
      },
    })
    const thresholds: DialerThresholds = tenantSettingsRow ?? DEFAULT_DIALER_THRESHOLDS

    const dbUser = await withTenant(tenantId, () =>
      db.user.findFirst({ where: { clerkId }, select: { id: true, name: true } })
    )
    if (!dbUser) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    const record = await withTenant(tenantId, () =>
      db.$transaction(async (tx) => {
        let mbLeadStatus = null

        if (isMeetingBooked) {
          // count runs before create/update so current record is correctly excluded from prior conv count
          const [contact, priorConvCount] = await Promise.all([
            tx.contact.findUniqueOrThrow({ where: { id: contactId }, select: { createdAt: true } }),
            // count is not covered by tenant middleware — explicit tenantId required
            tx.callRecord.count({ where: { contactId, conversationTagged: true, tenantId } }),
          ])
          mbLeadStatus = classifyMBLeadStatus(priorConvCount, contact.createdAt)
        }

        if (manual) {
          const created = await tx.callRecord.create({
            data: {
              tenantId,
              campaignId:          campaignId!,
              contactId,
              userId:              dbUser.id,
              outcome:             typedOutcome,
              notes:               notes ?? null,
              durationSecs:        0,
              conversationTagged,
              ...(mbLeadStatus !== null ? { mbLeadStatus } : {}),
            },
            select: { id: true, createdAt: true },
          })
          await routeOutcome(contactId, typedOutcome, tx, thresholds)
          return created
        } else {
          const updated = await tx.callRecord.update({
            where: { id: callRecordId! },
            data:  { outcome: typedOutcome, notes: notes ?? null, conversationTagged, ...(mbLeadStatus !== null ? { mbLeadStatus } : {}) },
            select: { id: true, campaignId: true, createdAt: true },
          })
          await routeOutcome(contactId, typedOutcome, tx, thresholds)
          return updated
        }
      })
    )

    // Pipeline action — outside main transaction so outcome is committed first
    if (stageId && clientId) {
      const contact = await withTenant(tenantId, () =>
        db.contact.findUnique({
          where:  { id: contactId },
          select: { firstName: true, lastName: true, companyName: true },
        })
      )
      if (contact) {
        const resolvedCampaignId = manual ? campaignId! : (record as unknown as { campaignId: string }).campaignId
        const title = contact.companyName
          ? `${contact.firstName} ${contact.lastName} — ${contact.companyName}`
          : `${contact.firstName} ${contact.lastName}`

        await withTenant(tenantId, () =>
          db.pipelineDeal.upsert({
            where:  { contactId_campaignId: { contactId, campaignId: resolvedCampaignId } },
            create: {
              tenantId,
              clientId,
              stageId,
              contactId,
              campaignId: resolvedCampaignId,
              title,
              notes:  notes ?? null,
              source: 'manual',
            },
            update: { stageId, notes: notes ?? null },
          })
        )
      }
    } else if (addToQueue && clientId) {
      const resolvedCampaignId = manual ? campaignId! : (record as unknown as { campaignId: string }).campaignId

      await withTenant(tenantId, () =>
        db.pendingPipelineDeal.upsert({
          where:  { contactId_campaignId: { contactId, campaignId: resolvedCampaignId } },
          create: {
            tenantId,
            clientId,
            contactId,
            campaignId: resolvedCampaignId,
            outcome:    typedOutcome,
          },
          update: { outcome: typedOutcome, clientId },
        })
      )
    }

    return NextResponse.json({
      data: {
        success: true,
        callRecord: {
          id:         record.id,
          outcome:    typedOutcome,
          notes:      notes ?? null,
          createdAt:  record.createdAt.toISOString(),
          callerName: dbUser.name,
        },
      },
    })
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
