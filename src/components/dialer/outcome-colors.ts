import { CallOutcome } from '@prisma/client'

export type OutcomeColor = 'green' | 'yellow' | 'red'

export const OUTCOME_COLOR: Record<CallOutcome, OutcomeColor> = {
  // Green — meaningful conversation with positive/neutral result
  connected:               'green',
  not_interested:          'green',
  lead:                    'green',
  meeting_booked:          'green',
  call_back_attempted:     'green',

  // Yellow — some form of contact but no full conversation
  left_voicemail:          'yellow',
  bad_time_to_speak:       'yellow',
  in_a_meeting:            'yellow',
  call_back_later:         'yellow',
  on_holiday:              'yellow',
  hung_up:                 'yellow',
  does_not_take_cold_calls:'yellow',
  not_relevant_contact:    'yellow',
  ai_assistant:            'yellow',

  // Red — no real contact made
  voicemail:               'red',
  no_answer:               'red',
  line_engaged:            'red',
  wrong_number:            'red',
  mobile_switched_off:     'red',
  foreign_dial_tone:       'red',
  not_available:           'red',
  other:                   'red',
  disqualified:            'red',
}

export const OUTCOME_LABEL: Record<CallOutcome, string> = {
  connected:               'Connected',
  not_interested:          'Not Interested',
  lead:                    'Lead',
  meeting_booked:          'Meeting Booked',
  call_back_attempted:     'Call Back Attempted',
  left_voicemail:          'Left Voicemail',
  bad_time_to_speak:       'Bad Time to Speak',
  in_a_meeting:            'In a Meeting',
  call_back_later:         'Call Back Later',
  on_holiday:              'On Holiday',
  hung_up:                 'Hung Up',
  does_not_take_cold_calls:'Does Not Take Cold Calls',
  not_relevant_contact:    'Not a Relevant Contact',
  ai_assistant:            'AI Assistant',
  voicemail:               'Voicemail',
  no_answer:               'No Answer',
  line_engaged:            'Line Engaged',
  wrong_number:            'Wrong Number',
  mobile_switched_off:     'Mobile Switched Off',
  foreign_dial_tone:       'Foreign Dial Tone',
  not_available:           'Not Available',
  other:                   'Other',
  disqualified:            'Disqualified',
}

export const DOT_CLASS: Record<OutcomeColor, string> = {
  green:  'bg-emerald-500',
  yellow: 'bg-amber-400',
  red:    'bg-red-500',
}

export const TEXT_CLASS: Record<OutcomeColor, string> = {
  green:  'text-emerald-400',
  yellow: 'text-amber-400',
  red:    'text-red-400',
}
