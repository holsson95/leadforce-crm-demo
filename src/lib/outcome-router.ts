import { db } from '@/lib/db'
import { CallOutcome } from '@prisma/client'

type TxClient = Parameters<Parameters<typeof db.$transaction>[0]>[0]

export type DialerThresholds = {
  dialUnresponsiveLimit:     number
  dialFutureReentryDays:     number
  dialFutureReattempts:      number
  notInterestedCooldownDays: number
}

export const DEFAULT_DIALER_THRESHOLDS: DialerThresholds = {
  dialUnresponsiveLimit:     8,
  dialFutureReentryDays:     90,
  dialFutureReattempts:      3,
  notInterestedCooldownDays: 7,
}

// Outcomes that indicate meaningful engagement and are eligible to be added to the pipeline
export const PIPELINE_ELIGIBLE_OUTCOMES = new Set<CallOutcome>([
  CallOutcome.connected,
  CallOutcome.lead,
  CallOutcome.call_back_later,
  CallOutcome.meeting_booked,
])

// Outcomes in PIPELINE_ELIGIBLE_OUTCOMES require non-empty notes before they can be logged
export function notesRequiredFor(outcome: CallOutcome): boolean {
  return PIPELINE_ELIGIBLE_OUTCOMES.has(outcome)
}

// Includes both 5 original conversation-tagged outcomes (not_relevant_contact, disqualified, lead, call_back_later, meeting_booked) + 6 additional outcomes where a human answered (connected, bad_time_to_speak, in_a_meeting, on_holiday, does_not_take_cold_calls, hung_up)
export const CONVERSATION_TAGGED_OUTCOMES = new Set<CallOutcome>([
  CallOutcome.not_relevant_contact,
  CallOutcome.disqualified,
  CallOutcome.lead,
  CallOutcome.call_back_later,
  CallOutcome.meeting_booked,
  CallOutcome.connected,
  CallOutcome.bad_time_to_speak,
  CallOutcome.in_a_meeting,
  CallOutcome.on_holiday,
  CallOutcome.does_not_take_cold_calls,
  CallOutcome.hung_up,
])

async function incrementDialAttempts(
  contactId: string,
  currentAttempts: number,
  limit: number,
  tx: TxClient
) {
  const newCount = currentAttempts + 1
  await tx.contact.update({
    where: { id: contactId },
    data: {
      dialAttempts: newCount,
      ...(newCount >= limit ? { status: 'future' } : {}),
    },
  })
}

export async function routeOutcome(
  contactId: string,
  outcome: CallOutcome,
  tx: TxClient,
  thresholds: DialerThresholds = DEFAULT_DIALER_THRESHOLDS
): Promise<void> {
  const contact = await tx.contact.findUnique({
    where:  { id: contactId },
    select: { dialAttempts: true, companyName: true, tenantId: true },
  })
  if (!contact) return

  switch (outcome) {
    case CallOutcome.no_answer:
    case CallOutcome.voicemail:
    case CallOutcome.left_voicemail:
    case CallOutcome.ai_assistant:
    case CallOutcome.line_engaged:
    case CallOutcome.mobile_switched_off:
    case CallOutcome.foreign_dial_tone:
    case CallOutcome.not_available:
    case CallOutcome.other: {
      await incrementDialAttempts(contactId, contact.dialAttempts, thresholds.dialUnresponsiveLimit, tx)
      break
    }

    case CallOutcome.not_interested: {
      const notInterestedUntil = new Date(Date.now() + thresholds.notInterestedCooldownDays * 24 * 60 * 60 * 1000)
      await tx.contact.update({
        where: { id: contactId },
        data:  { notInterestedUntil },
      })
      break
    }

    case CallOutcome.bad_time_to_speak:
    case CallOutcome.in_a_meeting:
    case CallOutcome.on_holiday:
    case CallOutcome.call_back_later: {
      await tx.contact.update({
        where: { id: contactId },
        data:  { status: 'call_back' },
      })
      break
    }

    case CallOutcome.not_relevant_contact: {
      await tx.contact.update({
        where: { id: contactId },
        data:  { status: 'dnc', dncReason: 'Not relevant contact' },
      })
      break
    }

    case CallOutcome.lead:
    case CallOutcome.call_back_attempted: {
      await tx.contact.update({
        where: { id: contactId },
        data:  { status: 'lead' },
      })
      break
    }

    case CallOutcome.does_not_take_cold_calls: {
      await tx.contact.update({
        where: { id: contactId },
        data:  { status: 'dnc', dncReason: 'Does not take cold calls' },
      })
      break
    }

    case CallOutcome.wrong_number: {
      await tx.contact.update({
        where: { id: contactId },
        data:  { status: 'dnc', dncReason: 'Wrong number' },
      })
      break
    }

    case CallOutcome.disqualified: {
      await tx.contact.update({
        where: { id: contactId },
        data:  { status: 'dnc', dncReason: 'Disqualified' },
      })
      if (contact.companyName) {
        await tx.contact.updateMany({
          where: {
            tenantId:    contact.tenantId,
            companyName: { equals: contact.companyName, mode: 'insensitive' },
            id:          { not: contactId },
            status:      { not: 'dnc' },
            deletedAt:   null,
          },
          data: { status: 'dnc', dncReason: 'Disqualified — company-wide' },
        })
      }
      break
    }

    case CallOutcome.meeting_booked: {
      await tx.contact.update({
        where: { id: contactId },
        data:  { status: 'meeting_booked' },
      })
      if (contact.companyName) {
        await tx.contact.updateMany({
          where: {
            tenantId:    contact.tenantId,
            companyName: { equals: contact.companyName, mode: 'insensitive' },
            id:          { not: contactId },
            status:      { not: 'dnc' },
            deletedAt:   null,
          },
          data: { status: 'dnc', dncReason: 'Irrelevant — meeting secured' },
        })
      }
      break
    }

    case CallOutcome.connected:
      break

    case CallOutcome.hung_up: {
      const priorDisconnects = await tx.callRecord.count({
        where: { contactId, outcome: CallOutcome.hung_up, tenantId: contact.tenantId },
      })
      if (priorDisconnects >= 1) {
        await tx.contact.update({
          where: { id: contactId },
          data:  { status: 'dnc', dncReason: 'Disconnected twice' },
        })
      }
      break
    }
  }
}
