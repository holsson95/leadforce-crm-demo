import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QueuePanel } from '../QueuePanel'
import { useDialerStore } from '@/stores/dialer-store'
import type { ContactSummary } from '@/types/models'

const contact: ContactSummary = {
  id: 'c1', firstName: 'John', lastName: 'Doe', mobilePhone: '555-1000',
  corporatePhone: null, companyName: 'Acme', status: 'prospect',
  jobTitle: 'VP', employeeCount: null, linkedinUrl: null, website: null,
  email: null, country: null, city: null, callHistory: [],
}

function mockFetch() {
  return vi.fn(() =>
    Promise.resolve({ ok: true, json: async () => ({ data: [], total: 1, validIds: ['c1'] }) })
  ) as unknown as typeof fetch
}

describe('QueuePanel — list view call feedback', () => {
  beforeEach(() => {
    global.fetch = mockFetch()
    useDialerStore.setState({
      campaignId:     'camp1',
      currentContact: contact,
      queue:          [],
      calledToday:    [],
      totalContacts:  1,
      callStatus:     'idle',
      callingView:    'list',
      queueFilters:   {},
      profileIndex:   0,
      phoneNumberView: 'mobile',
    })
  })

  it('shows a Start call button on the active row when idle', () => {
    render(<QueuePanel campaigns={[{ id: 'camp1', name: 'Camp' }]} users={[]} />)
    expect(screen.getByTitle('Start call')).toBeInTheDocument()
  })

  it('shows a pulsing Ringing badge and an End call button on the active row while ringing', () => {
    useDialerStore.setState({ callStatus: 'ringing' })
    render(<QueuePanel campaigns={[{ id: 'camp1', name: 'Camp' }]} users={[]} />)

    expect(screen.getByText('Ringing…')).toBeInTheDocument()
    expect(screen.getByTitle('End call')).toBeInTheDocument()
    expect(screen.queryByTitle('Start call')).not.toBeInTheDocument()
  })

  it('shows a Connected badge with a timer and an End call button while connected', () => {
    useDialerStore.setState({ callStatus: 'connected' })
    render(<QueuePanel campaigns={[{ id: 'camp1', name: 'Camp' }]} users={[]} />)

    expect(screen.getByText(/Connected/)).toBeInTheDocument()
    expect(screen.getByTitle('End call')).toBeInTheDocument()
  })

  it('calls endCall when the End call button is clicked while connected', () => {
    const endCall = vi.fn()
    useDialerStore.setState({ callStatus: 'connected', endCall })
    render(<QueuePanel campaigns={[{ id: 'camp1', name: 'Camp' }]} users={[]} />)

    fireEvent.click(screen.getByTitle('End call'))
    expect(endCall).toHaveBeenCalled()
  })
})
