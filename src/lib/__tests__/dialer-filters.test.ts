import { describe, it, expect } from 'vitest'
import { buildQueueUrl, activeFilterCount, filterToChips } from '../dialer-filters'

describe('buildQueueUrl', () => {
  it('returns base url with just campaignId', () => {
    expect(buildQueueUrl('camp1', {})).toBe('/api/dialer/queue?campaignId=camp1')
  })

  it('includes skip when > 0', () => {
    expect(buildQueueUrl('c1', {}, 15)).toContain('skip=15')
  })

  it('does not include skip when 0 or undefined', () => {
    expect(buildQueueUrl('c1', {}, 0)).not.toContain('skip')
    expect(buildQueueUrl('c1', {})).not.toContain('skip')
  })

  it('includes lastCallBefore', () => {
    expect(buildQueueUrl('c1', { lastCallBefore: '2025-05-01' })).toContain('lastCallBefore=2025-05-01')
  })

  it('includes lastCallOutcome as comma-separated', () => {
    const url = buildQueueUrl('c1', { lastCallOutcome: ['no_answer', 'voicemail'] })
    expect(url).toContain('lastCallOutcome=no_answer%2Cvoicemail')
  })

  it('includes dialAttemptsOp and dialAttemptsVal together', () => {
    const url = buildQueueUrl('c1', { dialAttemptsOp: 'gt', dialAttemptsVal: 3 })
    expect(url).toContain('dialAttemptsOp=gt')
    expect(url).toContain('dialAttemptsVal=3')
  })

  it('omits dialAttemptsOp when val is missing', () => {
    expect(buildQueueUrl('c1', { dialAttemptsOp: 'gt' })).not.toContain('dialAttemptsOp')
  })

  it('includes phonePrefix encoded', () => {
    expect(buildQueueUrl('c1', { phonePrefix: '+1' })).toContain('phonePrefix=%2B1')
  })

  it('includes hasNotes=true only when true', () => {
    expect(buildQueueUrl('c1', { hasNotes: true })).toContain('hasNotes=true')
    expect(buildQueueUrl('c1', { hasNotes: undefined })).not.toContain('hasNotes')
  })

  it('includes industry as comma-separated', () => {
    expect(buildQueueUrl('c1', { industry: ['SaaS', 'Fintech'] })).toContain('industry=SaaS%2CFintech')
  })

  it('includes accountOwnerId', () => {
    expect(buildQueueUrl('c1', { accountOwnerId: 'u1' })).toContain('accountOwnerId=u1')
  })
})

describe('activeFilterCount', () => {
  it('returns 0 for empty filters', () => {
    expect(activeFilterCount({})).toBe(0)
  })

  it('counts independent filters separately', () => {
    expect(activeFilterCount({ lastCallBefore: '2025-01-01', phonePrefix: '+1' })).toBe(2)
  })

  it('counts dialAttempts op+val as one filter', () => {
    expect(activeFilterCount({ dialAttemptsOp: 'gt', dialAttemptsVal: 3 })).toBe(1)
  })

  it('counts employeeCount op+val as one filter', () => {
    expect(activeFilterCount({ employeeCountOp: 'lt', employeeCountVal: 500 })).toBe(1)
  })

  it('counts location (city/state/country) as one filter', () => {
    expect(activeFilterCount({ city: 'Austin', state: 'TX', country: 'US' })).toBe(1)
  })

  it('ignores dialAttemptsOp without val', () => {
    expect(activeFilterCount({ dialAttemptsOp: 'gt' })).toBe(0)
  })
})

describe('filterToChips', () => {
  it('returns empty array for empty filters', () => {
    expect(filterToChips({})).toEqual([])
  })

  it('returns a chip for lastCallBefore with correct clearKeys', () => {
    const chips = filterToChips({ lastCallBefore: '2025-05-01' })
    expect(chips).toHaveLength(1)
    expect(chips[0].label).toContain('2025-05-01')
    expect(chips[0].clearKeys).toEqual(['lastCallBefore'])
  })

  it('groups all location fields into one chip', () => {
    const chips = filterToChips({ city: 'Austin', state: 'TX' })
    expect(chips).toHaveLength(1)
    expect(chips[0].clearKeys).toContain('city')
    expect(chips[0].clearKeys).toContain('state')
    expect(chips[0].clearKeys).toContain('country')
  })

  it('returns a chip for dialAttempts with both clearKeys', () => {
    const chips = filterToChips({ dialAttemptsOp: 'gt', dialAttemptsVal: 3 })
    expect(chips[0].clearKeys).toContain('dialAttemptsOp')
    expect(chips[0].clearKeys).toContain('dialAttemptsVal')
  })

  it('returns a chip for employeeCount with both clearKeys', () => {
    const chips = filterToChips({ employeeCountOp: 'gte', employeeCountVal: 100 })
    expect(chips).toHaveLength(1)
    expect(chips[0].clearKeys).toContain('employeeCountOp')
    expect(chips[0].clearKeys).toContain('employeeCountVal')
  })
})

describe('contactStatus filter', () => {
  it('buildQueueUrl includes contactStatus as comma-separated when set', () => {
    const url = buildQueueUrl('c1', { contactStatus: ['prospect', 'lead'] })
    expect(url).toContain('contactStatus=prospect%2Clead')
  })

  it('buildQueueUrl omits contactStatus when undefined', () => {
    expect(buildQueueUrl('c1', {})).not.toContain('contactStatus')
  })

  it('buildQueueUrl omits contactStatus when empty array', () => {
    expect(buildQueueUrl('c1', { contactStatus: [] })).not.toContain('contactStatus')
  })

  it('activeFilterCount counts contactStatus as +1 when non-empty', () => {
    expect(activeFilterCount({ contactStatus: ['prospect'] })).toBe(1)
    expect(activeFilterCount({ contactStatus: ['prospect', 'lead'] })).toBe(1)
  })

  it('activeFilterCount does not count contactStatus when empty or undefined', () => {
    expect(activeFilterCount({ contactStatus: [] })).toBe(0)
    expect(activeFilterCount({})).toBe(0)
  })

  it('filterToChips returns a chip for contactStatus with correct clearKeys', () => {
    const chips = filterToChips({ contactStatus: ['lead', 'call_back'] })
    expect(chips).toHaveLength(1)
    expect(chips[0].label).toBe('Status: Lead, Call Back')
    expect(chips[0].clearKeys).toEqual(['contactStatus'])
  })

  it('filterToChips returns no chip when contactStatus is empty', () => {
    expect(filterToChips({ contactStatus: [] })).toHaveLength(0)
  })
})
