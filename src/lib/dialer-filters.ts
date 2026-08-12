import type { CallOutcome, ContactStatus } from '@prisma/client'

export type NumericOp = 'eq' | 'gt' | 'lt' | 'gte' | 'lte'

export interface QueueFilters {
  lastCallBefore?:   string        // ISO date YYYY-MM-DD
  lastCallOutcome?:  CallOutcome[]
  dialAttemptsOp?:   NumericOp
  dialAttemptsVal?:  number
  phonePrefix?:      string
  jobTitle?:         string
  companyName?:      string
  hasNotes?:         boolean
  employeeCountOp?:  NumericOp
  employeeCountVal?: number
  industry?:         string[]
  city?:             string
  state?:            string
  country?:          string
  accountOwnerId?:   string
  contactStatus?:    ContactStatus[]
}

export type FilterChip = {
  label:     string
  clearKeys: (keyof QueueFilters)[]
}

export const CALL_OUTCOMES_FOR_FILTER: { value: CallOutcome; label: string }[] = [
  // Same order as DispositionForm
  { value: 'connected',                label: 'Connected' },
  { value: 'not_interested',           label: 'Not Interested' },
  { value: 'lead',                     label: 'Lead' },
  { value: 'meeting_booked',           label: 'Meeting Booked' },
  { value: 'left_voicemail',           label: 'Left Voicemail' },
  { value: 'bad_time_to_speak',        label: 'Bad Time to Speak' },
  { value: 'in_a_meeting',             label: 'In a Meeting' },
  { value: 'call_back_later',          label: 'Call Back Later' },
  { value: 'on_holiday',               label: 'On Holiday' },
  { value: 'hung_up',                  label: 'Hung Up' },
  { value: 'does_not_take_cold_calls', label: 'Does Not Take Cold Calls' },
  { value: 'not_relevant_contact',     label: 'Not a Relevant Contact' },
  { value: 'ai_assistant',             label: 'AI Assistant' },
  { value: 'voicemail',                label: 'Voicemail' },
  { value: 'no_answer',                label: 'No Answer' },
  { value: 'line_engaged',             label: 'Line Engaged' },
  { value: 'wrong_number',             label: 'Wrong Number' },
  { value: 'mobile_switched_off',      label: 'Mobile Switched Off' },
  { value: 'foreign_dial_tone',        label: 'Foreign Dial Tone' },
  { value: 'not_available',            label: 'Not Available' },
  { value: 'other',                    label: 'Other' },
  // Auto-assigned outcomes (not in disposition form)
  { value: 'disqualified',             label: 'Disqualified' },
  { value: 'call_back_attempted',      label: 'Call Back Attempted' },
]

export const CONTACT_STATUSES_FOR_FILTER: { value: ContactStatus; label: string }[] = [
  { value: 'prospect',       label: 'Prospect' },
  { value: 'lead',           label: 'Lead' },
  { value: 'call_back',      label: 'Call Back' },
  { value: 'future',         label: 'Future' },
  { value: 'meeting_booked', label: 'Meeting Booked' },
]

const OP_LABEL: Record<NumericOp, string> = {
  eq: '=', gt: '>', lt: '<', gte: '≥', lte: '≤',
}

export function buildQueueUrl(
  campaignId: string,
  filters: QueueFilters,
  skip?: number,
): string {
  const params = new URLSearchParams({ campaignId })
  if (skip != null && skip > 0) params.set('skip', String(skip))
  if (filters.lastCallBefore) params.set('lastCallBefore', filters.lastCallBefore)
  if (filters.lastCallOutcome?.length) params.set('lastCallOutcome', filters.lastCallOutcome.join(','))
  if (filters.dialAttemptsOp && filters.dialAttemptsVal != null) {
    params.set('dialAttemptsOp', filters.dialAttemptsOp)
    params.set('dialAttemptsVal', String(filters.dialAttemptsVal))
  }
  if (filters.phonePrefix) params.set('phonePrefix', filters.phonePrefix)
  if (filters.jobTitle) params.set('jobTitle', filters.jobTitle)
  if (filters.companyName) params.set('companyName', filters.companyName)
  if (filters.hasNotes === true) params.set('hasNotes', 'true')
  if (filters.employeeCountOp && filters.employeeCountVal != null) {
    params.set('employeeCountOp', filters.employeeCountOp)
    params.set('employeeCountVal', String(filters.employeeCountVal))
  }
  if (filters.industry?.length) params.set('industry', filters.industry.join(','))
  if (filters.city) params.set('city', filters.city)
  if (filters.state) params.set('state', filters.state)
  if (filters.country) params.set('country', filters.country)
  if (filters.accountOwnerId) params.set('accountOwnerId', filters.accountOwnerId)
  if (filters.contactStatus?.length) params.set('contactStatus', filters.contactStatus.join(','))
  return `/api/dialer/queue?${params.toString()}`
}

export function activeFilterCount(filters: QueueFilters): number {
  let count = 0
  if (filters.lastCallBefore) count++
  if (filters.lastCallOutcome?.length) count++
  if (filters.dialAttemptsOp && filters.dialAttemptsVal != null) count++
  if (filters.phonePrefix) count++
  if (filters.jobTitle) count++
  if (filters.companyName) count++
  if (filters.hasNotes === true) count++
  if (filters.employeeCountOp && filters.employeeCountVal != null) count++
  if (filters.industry?.length) count++
  if (filters.city || filters.state || filters.country) count++
  if (filters.accountOwnerId) count++
  if (filters.contactStatus?.length) count++
  return count
}

export function filterToChips(filters: QueueFilters): FilterChip[] {
  const chips: FilterChip[] = []

  if (filters.lastCallBefore)
    chips.push({ label: `Last call ≤ ${filters.lastCallBefore}`, clearKeys: ['lastCallBefore'] })

  if (filters.lastCallOutcome?.length) {
    const labels = filters.lastCallOutcome
      .map(v => CALL_OUTCOMES_FOR_FILTER.find(o => o.value === v)?.label ?? v)
      .join(', ')
    chips.push({ label: `Last outcome: ${labels}`, clearKeys: ['lastCallOutcome'] })
  }

  if (filters.dialAttemptsOp && filters.dialAttemptsVal != null)
    chips.push({
      label:     `Dial attempts ${OP_LABEL[filters.dialAttemptsOp]} ${filters.dialAttemptsVal}`,
      clearKeys: ['dialAttemptsOp', 'dialAttemptsVal'],
    })

  if (filters.phonePrefix)
    chips.push({ label: `Phone: ${filters.phonePrefix}*`, clearKeys: ['phonePrefix'] })

  if (filters.jobTitle)
    chips.push({ label: `Title: ${filters.jobTitle}`, clearKeys: ['jobTitle'] })

  if (filters.companyName)
    chips.push({ label: `Company: ${filters.companyName}`, clearKeys: ['companyName'] })

  if (filters.hasNotes === true)
    chips.push({ label: 'Has notes', clearKeys: ['hasNotes'] })

  if (filters.employeeCountOp && filters.employeeCountVal != null)
    chips.push({
      label:     `Employees ${OP_LABEL[filters.employeeCountOp]} ${filters.employeeCountVal}`,
      clearKeys: ['employeeCountOp', 'employeeCountVal'],
    })

  if (filters.industry?.length)
    chips.push({ label: `Industry: ${filters.industry.join(', ')}`, clearKeys: ['industry'] })

  const locationParts = [filters.city, filters.state, filters.country].filter(Boolean)
  if (locationParts.length)
    chips.push({
      label:     `Location: ${locationParts.join(', ')}`,
      clearKeys: ['city', 'state', 'country'],
    })

  if (filters.accountOwnerId)
    // Note: QueueFilterChips component resolves this ID to the user's display name
    chips.push({ label: `Owner ID: ${filters.accountOwnerId}`, clearKeys: ['accountOwnerId'] })

  if (filters.contactStatus?.length) {
    const labels = filters.contactStatus
      .map(v => CONTACT_STATUSES_FOR_FILTER.find(s => s.value === v)?.label ?? v)
      .join(', ')
    chips.push({ label: `Status: ${labels}`, clearKeys: ['contactStatus'] })
  }

  return chips
}
