import { describe, it, expect } from 'vitest'
import { PIPELINE_ELIGIBLE_OUTCOMES } from '../outcome-router'

describe('PIPELINE_ELIGIBLE_OUTCOMES', () => {
  it('includes connected, lead, call_back_later, meeting_booked', () => {
    expect(PIPELINE_ELIGIBLE_OUTCOMES.has('connected')).toBe(true)
    expect(PIPELINE_ELIGIBLE_OUTCOMES.has('lead')).toBe(true)
    expect(PIPELINE_ELIGIBLE_OUTCOMES.has('call_back_later')).toBe(true)
    expect(PIPELINE_ELIGIBLE_OUTCOMES.has('meeting_booked')).toBe(true)
  })

  it('does not include no_answer, voicemail, disqualified', () => {
    expect(PIPELINE_ELIGIBLE_OUTCOMES.has('no_answer')).toBe(false)
    expect(PIPELINE_ELIGIBLE_OUTCOMES.has('voicemail')).toBe(false)
    expect(PIPELINE_ELIGIBLE_OUTCOMES.has('disqualified')).toBe(false)
  })
})
