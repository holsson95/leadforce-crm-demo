import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ProfileViewCard } from '../ProfileViewCard'
import { useDialerStore } from '@/stores/dialer-store'
import type { ContactSummary } from '@/types/models'

const contact: ContactSummary = {
  id: 'c1', firstName: 'John', lastName: 'Doe', mobilePhone: '555-1000',
  corporatePhone: null, companyName: 'Acme', status: 'prospect',
  jobTitle: 'VP', employeeCount: null, linkedinUrl: null, website: null,
  email: null, country: null, city: null, callHistory: [],
}

function mockFetch() {
  return vi.fn((url: string, init?: RequestInit) => {
    if (url.includes('/notes')) {
      if (init?.method === 'POST') {
        return Promise.resolve({ ok: true, json: async () => ({ data: { id: 'n1' } }) })
      }
      return Promise.resolve({ ok: true, json: async () => ({ data: [] }) })
    }
    if (url.includes('/api/dialer/log-outcome')) {
      return Promise.resolve({
        ok:   true,
        json: async () => ({
          data: {
            callRecord: {
              id: 'r1', outcome: 'meeting_booked', notes: 'Booked demo for Friday',
              createdAt: new Date().toISOString(), callerName: 'Rep',
            },
          },
        }),
      })
    }
    return Promise.resolve({ ok: true, json: async () => ({ data: {} }) })
  }) as unknown as typeof fetch
}

describe('ProfileViewCard — draft disposition flow', () => {
  beforeEach(() => {
    global.fetch = mockFetch()
    useDialerStore.setState({
      campaignId:     'camp1',
      currentContact: contact,
      queue:          [],
      calledToday:    [],
      totalContacts:  1,
      advanceProfile: vi.fn(async () => {}),
    })
  })

  it('opens the disposition form instead of logging immediately when an outcome is picked', () => {
    render(<ProfileViewCard contact={contact} totalContacts={1} campaignId="camp1" />)

    fireEvent.click(screen.getByTitle('Log a call outcome'))
    fireEvent.click(screen.getByText('Meeting Booked'))

    expect(screen.getByRole('button', { name: 'Log Outcome' })).toBeDisabled()
    expect(screen.getByText('Notes required for this outcome.')).toBeInTheDocument()
  })

  it('shows a confirmation for the same contact without saving when Log Outcome is submitted', async () => {
    render(<ProfileViewCard contact={contact} totalContacts={1} campaignId="camp1" />)

    fireEvent.click(screen.getByTitle('Log a call outcome'))
    fireEvent.click(screen.getByText('Meeting Booked'))
    fireEvent.change(screen.getByPlaceholderText('Notes required for this outcome…'), {
      target: { value: 'Booked demo for Friday' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Log Outcome' }))

    expect(screen.getByText(/Logged: Meeting Booked/)).toBeInTheDocument()
    expect(screen.getByText('John Doe')).toBeInTheDocument()
    expect(global.fetch).not.toHaveBeenCalledWith('/api/dialer/log-outcome', expect.anything())
  })

  it('saves the draft and does not call advanceProfile when Next is clicked', async () => {
    render(<ProfileViewCard contact={contact} totalContacts={1} campaignId="camp1" />)

    fireEvent.click(screen.getByTitle('Log a call outcome'))
    fireEvent.click(screen.getByText('Meeting Booked'))
    fireEvent.change(screen.getByPlaceholderText('Notes required for this outcome…'), {
      target: { value: 'Booked demo for Friday' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Log Outcome' }))
    fireEvent.click(screen.getByText('Next'))

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/dialer/log-outcome',
        expect.objectContaining({ body: expect.stringContaining('"outcome":"meeting_booked"') })
      )
    )
    expect(useDialerStore.getState().advanceProfile).not.toHaveBeenCalled()
  })

  it('calls advanceProfile when Next is clicked without a prior disposition', () => {
    render(<ProfileViewCard contact={contact} totalContacts={1} campaignId="camp1" />)

    fireEvent.click(screen.getByText('Next'))

    expect(useDialerStore.getState().advanceProfile).toHaveBeenCalledTimes(1)
  })

  it('advances the "Contact X of Y" counter when No Answer is clicked', async () => {
    render(<ProfileViewCard contact={contact} totalContacts={1} campaignId="camp1" />)

    expect(screen.getByText('Contact 1 of 1')).toBeInTheDocument()

    fireEvent.click(screen.getByTitle('Mark as No Answer — no outcome required'))

    await waitFor(() => expect(useDialerStore.getState().calledToday).toHaveLength(1))
    expect(screen.getByText('Contact 2 of 2')).toBeInTheDocument()
  })

  it('advances the "Contact X of Y" counter when a staged disposition is flushed via Next', async () => {
    render(<ProfileViewCard contact={contact} totalContacts={1} campaignId="camp1" />)

    expect(screen.getByText('Contact 1 of 1')).toBeInTheDocument()

    fireEvent.click(screen.getByTitle('Log a call outcome'))
    fireEvent.click(screen.getByText('Meeting Booked'))
    fireEvent.change(screen.getByPlaceholderText('Notes required for this outcome…'), {
      target: { value: 'Booked demo for Friday' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Log Outcome' }))
    fireEvent.click(screen.getByText('Next'))

    await waitFor(() => expect(useDialerStore.getState().calledToday).toHaveLength(1))
    expect(screen.getByText('Contact 2 of 2')).toBeInTheDocument()
  })

  it('Cancel in the disposition form returns to the icon row without logging', () => {
    render(<ProfileViewCard contact={contact} totalContacts={1} campaignId="camp1" />)

    fireEvent.click(screen.getByTitle('Log a call outcome'))
    fireEvent.click(screen.getByText('Meeting Booked'))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(screen.getByTitle('Log a call outcome')).toBeInTheDocument()
    expect(global.fetch).not.toHaveBeenCalledWith('/api/dialer/log-outcome', expect.anything())
  })

  it('Edit reopens the disposition form pre-filled with the draft notes', async () => {
    render(<ProfileViewCard contact={contact} totalContacts={1} campaignId="camp1" />)

    fireEvent.click(screen.getByTitle('Log a call outcome'))
    fireEvent.click(screen.getByText('Meeting Booked'))
    fireEvent.change(screen.getByPlaceholderText('Notes required for this outcome…'), {
      target: { value: 'Booked demo for Friday' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Log Outcome' }))

    fireEvent.click(screen.getByRole('button', { name: 'Edit outcome' }))

    expect(screen.getByDisplayValue('Booked demo for Friday')).toBeInTheDocument()
  })

  it('Delete discards the draft disposition without saving it', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<ProfileViewCard contact={contact} totalContacts={1} campaignId="camp1" />)

    fireEvent.click(screen.getByTitle('Log a call outcome'))
    fireEvent.click(screen.getByText('Meeting Booked'))
    fireEvent.change(screen.getByPlaceholderText('Notes required for this outcome…'), {
      target: { value: 'Booked demo for Friday' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Log Outcome' }))

    fireEvent.click(screen.getByRole('button', { name: 'Delete outcome' }))

    expect(screen.getByTitle('Log a call outcome')).toBeInTheDocument()
    expect(global.fetch).not.toHaveBeenCalledWith('/api/dialer/log-outcome', expect.anything())
    confirmSpy.mockRestore()
  })

  it('Change lets the SDR pick a genuinely different outcome after editing a draft', async () => {
    render(<ProfileViewCard contact={contact} totalContacts={1} campaignId="camp1" />)

    // Log Meeting Booked as the initial draft
    fireEvent.click(screen.getByTitle('Log a call outcome'))
    fireEvent.click(screen.getByText('Meeting Booked'))
    fireEvent.change(screen.getByPlaceholderText('Notes required for this outcome…'), {
      target: { value: 'Booked demo for Friday' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Log Outcome' }))
    expect(screen.getByText(/Logged: Meeting Booked/)).toBeInTheDocument()

    // Edit the draft, then click Change — this should land on the unconfirmed icon row,
    // not bounce straight back to the confirmation chip.
    fireEvent.click(screen.getByRole('button', { name: 'Edit outcome' }))
    fireEvent.click(screen.getByText('Change'))

    expect(screen.queryByText(/Logged: Meeting Booked/)).not.toBeInTheDocument()
    expect(screen.getByTitle('Log a call outcome')).toBeInTheDocument()

    // Pick a genuinely different outcome and confirm the new pick is what's staged
    fireEvent.click(screen.getByTitle('Log a call outcome'))
    fireEvent.click(screen.getByText('Lead'))
    fireEvent.change(screen.getByPlaceholderText('Notes required for this outcome…'), {
      target: { value: 'Interested, following up next week' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Log Outcome' }))

    expect(screen.getByText(/Logged: Lead/)).toBeInTheDocument()
    expect(screen.queryByText(/Logged: Meeting Booked/)).not.toBeInTheDocument()
  })

  it('confirms before discarding an unsaved draft when leaving via the Queue back-link', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const { setCallingView } = useDialerStore.getState()
    useDialerStore.setState({ setCallingView: vi.fn(setCallingView) })

    render(<ProfileViewCard contact={contact} totalContacts={1} campaignId="camp1" />)

    fireEvent.click(screen.getByTitle('Log a call outcome'))
    fireEvent.click(screen.getByText('Meeting Booked'))
    fireEvent.change(screen.getByPlaceholderText('Notes required for this outcome…'), {
      target: { value: 'Booked demo for Friday' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Log Outcome' }))

    fireEvent.click(screen.getByText('Queue'))

    expect(confirmSpy).toHaveBeenCalledWith('Discard unsaved outcome for this contact?')
    expect(useDialerStore.getState().setCallingView).not.toHaveBeenCalled()
    expect(screen.getByText(/Logged: Meeting Booked/)).toBeInTheDocument()
    confirmSpy.mockRestore()
  })
})

describe('ProfileViewCard — phone number view', () => {
  beforeEach(() => {
    global.fetch = mockFetch()
  })

  afterEach(() => {
    useDialerStore.setState({ phoneNumberView: 'mobile' })
  })

  it('shows the mobile number by default', () => {
    const c = { ...contact, mobilePhone: '555-1000', corporatePhone: '555-2000' }
    useDialerStore.setState({
      campaignId: 'camp1', currentContact: c, queue: [], calledToday: [],
      totalContacts: 1, advanceProfile: vi.fn(async () => {}),
    })

    render(<ProfileViewCard contact={c} totalContacts={1} campaignId="camp1" />)

    expect(screen.getByText('Mobile')).toBeInTheDocument()
    expect(screen.getByText('555-1000')).toBeInTheDocument()
    expect(screen.queryByText('555-2000')).not.toBeInTheDocument()
  })

  it('shows the corporate number when phoneNumberView is corporate', () => {
    const c = { ...contact, mobilePhone: '555-1000', corporatePhone: '555-2000' }
    useDialerStore.setState({
      campaignId: 'camp1', currentContact: c, queue: [], calledToday: [],
      totalContacts: 1, advanceProfile: vi.fn(async () => {}), phoneNumberView: 'corporate',
    })

    render(<ProfileViewCard contact={c} totalContacts={1} campaignId="camp1" />)

    expect(screen.getByText('Corporate')).toBeInTheDocument()
    expect(screen.getByText('555-2000')).toBeInTheDocument()
    expect(screen.queryByText('555-1000')).not.toBeInTheDocument()
  })

  it('omits the phone tile when the contact has no number of the selected type', () => {
    const c = { ...contact, mobilePhone: '555-1000', corporatePhone: null, email: null }
    useDialerStore.setState({
      campaignId: 'camp1', currentContact: c, queue: [], calledToday: [],
      totalContacts: 1, advanceProfile: vi.fn(async () => {}), phoneNumberView: 'corporate',
    })

    render(<ProfileViewCard contact={c} totalContacts={1} campaignId="camp1" />)

    expect(screen.queryByText('Corporate')).not.toBeInTheDocument()
  })
})
