import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useDialerStore } from '../dialer-store'
import type { ContactSummary } from '@/types/models'

const c1: ContactSummary = {
  id: 'c1', firstName: 'John', lastName: 'Doe', mobilePhone: null,
  corporatePhone: null, companyName: 'Acme', status: 'prospect',
  jobTitle: 'VP', employeeCount: null, linkedinUrl: null, website: null,
  email: null, country: null, city: null, callHistory: [],
}
const c2: ContactSummary = {
  id: 'c2', firstName: 'Jane', lastName: 'Smith', mobilePhone: null,
  corporatePhone: null, companyName: 'Beta', status: 'prospect',
  jobTitle: 'CEO', employeeCount: null, linkedinUrl: null, website: null,
  email: null, country: null, city: null, callHistory: [],
}

describe('useDialerStore — patchContact', () => {
  beforeEach(() => {
    useDialerStore.setState({
      currentContact: c1,
      queue: [c2],
      calledToday: [],
    })
  })

  it('patches currentContact by id', () => {
    useDialerStore.getState().patchContact('c1', { firstName: 'Johnny', companyName: 'NewCo' })
    const { currentContact } = useDialerStore.getState()
    expect(currentContact?.firstName).toBe('Johnny')
    expect(currentContact?.companyName).toBe('NewCo')
    expect(currentContact?.lastName).toBe('Doe')
  })

  it('patches a contact in queue by id', () => {
    useDialerStore.getState().patchContact('c2', { jobTitle: 'CTO' })
    const { queue } = useDialerStore.getState()
    expect(queue[0].jobTitle).toBe('CTO')
    expect(queue[0].firstName).toBe('Jane')
  })

  it('patches a contact in calledToday by id', () => {
    useDialerStore.setState({ calledToday: [c2] })
    useDialerStore.getState().patchContact('c2', { status: 'lead' })
    const { calledToday } = useDialerStore.getState()
    expect(calledToday[0].status).toBe('lead')
  })

  it('does not modify contacts with a different id', () => {
    useDialerStore.getState().patchContact('c1', { firstName: 'Johnny' })
    const { queue } = useDialerStore.getState()
    expect(queue[0].firstName).toBe('Jane')
  })

  it('is a no-op when the id does not exist in any list', () => {
    useDialerStore.getState().patchContact('nonexistent', { firstName: 'Ghost' })
    const { currentContact, queue } = useDialerStore.getState()
    expect(currentContact?.firstName).toBe('John')
    expect(queue[0].firstName).toBe('Jane')
  })
})

describe('useDialerStore — queueFilters', () => {
  beforeEach(() => {
    useDialerStore.setState({
      campaignId:     'camp1',
      queueFilters:   {},
      pendingFilters: {},
      queue:          [],
      totalContacts:  0,
    })
  })

  it('updatePendingFilters merges into pendingFilters without touching queueFilters', () => {
    useDialerStore.getState().updatePendingFilters({ jobTitle: 'CEO' })
    const { pendingFilters, queueFilters } = useDialerStore.getState()
    expect(pendingFilters.jobTitle).toBe('CEO')
    expect(queueFilters.jobTitle).toBeUndefined()
  })

  it('updatePendingFilters removes keys set to undefined', () => {
    useDialerStore.setState({ pendingFilters: { jobTitle: 'CEO', phonePrefix: '+1' } })
    useDialerStore.getState().updatePendingFilters({ jobTitle: undefined })
    expect(useDialerStore.getState().pendingFilters.jobTitle).toBeUndefined()
    expect(useDialerStore.getState().pendingFilters.phonePrefix).toBe('+1')
  })

  it('discardPendingFilters resets pendingFilters to queueFilters', () => {
    useDialerStore.setState({
      queueFilters:   { phonePrefix: '+1' },
      pendingFilters: { phonePrefix: '+44', jobTitle: 'VP' },
    })
    useDialerStore.getState().discardPendingFilters()
    const { pendingFilters, queueFilters } = useDialerStore.getState()
    expect(pendingFilters.phonePrefix).toBe('+1')
    expect(pendingFilters.jobTitle).toBeUndefined()
    expect(queueFilters.phonePrefix).toBe('+1')
  })

  it('setCampaign resets both queueFilters and pendingFilters', () => {
    useDialerStore.setState({
      queueFilters:   { phonePrefix: '+1' },
      pendingFilters: { phonePrefix: '+1' },
    })
    useDialerStore.getState().setCampaign('new-id', [], 0)
    const { queueFilters, pendingFilters } = useDialerStore.getState()
    expect(queueFilters).toEqual({})
    expect(pendingFilters).toEqual({})
  })

  it('removeFilter clears specified keys from queueFilters and syncs pendingFilters', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [], total: 0 }),
    })
    useDialerStore.setState({
      queueFilters:   { phonePrefix: '+1', jobTitle: 'CEO' },
      pendingFilters: { phonePrefix: '+1', jobTitle: 'CEO' },
    })
    await useDialerStore.getState().removeFilter(['phonePrefix'])
    const { queueFilters, pendingFilters } = useDialerStore.getState()
    expect(queueFilters.phonePrefix).toBeUndefined()
    expect(queueFilters.jobTitle).toBe('CEO')
    expect(pendingFilters.phonePrefix).toBeUndefined()
    expect(pendingFilters.jobTitle).toBe('CEO')
  })

  it('applyFilters commits pendingFilters to queueFilters and reloads queue', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: [], total: 0 }) })
    useDialerStore.setState({ pendingFilters: { jobTitle: 'VP' }, queueFilters: {} })
    await useDialerStore.getState().applyFilters()
    expect(useDialerStore.getState().queueFilters.jobTitle).toBe('VP')
    expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('jobTitle=VP'))
  })

  it('clearFilters resets both filter objects and reloads queue', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: [], total: 0 }) })
    useDialerStore.setState({ queueFilters: { jobTitle: 'CEO' }, pendingFilters: { jobTitle: 'CEO' } })
    await useDialerStore.getState().clearFilters()
    expect(useDialerStore.getState().queueFilters).toEqual({})
    expect(useDialerStore.getState().pendingFilters).toEqual({})
  })
})

describe('useDialerStore — phoneNumberView', () => {
  it('defaults to mobile', () => {
    expect(useDialerStore.getState().phoneNumberView).toBe('mobile')
  })

  it('setPhoneNumberView switches to corporate and back', () => {
    useDialerStore.getState().setPhoneNumberView('corporate')
    expect(useDialerStore.getState().phoneNumberView).toBe('corporate')

    useDialerStore.getState().setPhoneNumberView('mobile')
    expect(useDialerStore.getState().phoneNumberView).toBe('mobile')
  })
})
