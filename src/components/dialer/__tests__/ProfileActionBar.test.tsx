import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ProfileActionBar } from '../ProfileActionBar'
import { useDialerStore } from '@/stores/dialer-store'
import type { ContactSummary } from '@/types/models'
import type { CallOutcome } from '@prisma/client'

const contact: ContactSummary = {
  id: 'c1', firstName: 'John', lastName: 'Doe', mobilePhone: null,
  corporatePhone: null, companyName: 'Acme', status: 'prospect',
  jobTitle: 'VP', employeeCount: null, linkedinUrl: null, website: null,
  email: null, country: null, city: null, callHistory: [],
}

describe('ProfileActionBar', () => {
  beforeEach(() => {
    useDialerStore.setState({ campaignId: 'camp1', currentContact: contact, queue: [], calledToday: [] })
    global.fetch = vi.fn().mockResolvedValue({
      ok:   true,
      json: async () => ({
        data: {
          callRecord: {
            id: 'r1', outcome: 'no_answer', notes: null,
            createdAt: new Date().toISOString(), callerName: 'Rep',
          },
        },
      }),
    })
  })

  it('calls onOutcomeChosen instead of logging when an outcome is picked from the dropdown', () => {
    const onOutcomeChosen = vi.fn()
    render(
      <ProfileActionBar
        contact={contact}
        onNext={vi.fn()}
        confirmed={null}
        onOutcomeChosen={onOutcomeChosen}
      />
    )
    fireEvent.click(screen.getByTitle('Log a call outcome'))
    fireEvent.click(screen.getByText('Meeting Booked'))
    expect(onOutcomeChosen).toHaveBeenCalledWith('meeting_booked')
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('still logs No Answer immediately via the store', async () => {
    render(
      <ProfileActionBar
        contact={contact}
        onNext={vi.fn()}
        confirmed={null}
        onOutcomeChosen={vi.fn()}
      />
    )
    fireEvent.click(screen.getByTitle('Mark as No Answer — no outcome required'))
    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith('/api/dialer/log-outcome', expect.objectContaining({ method: 'POST' }))
    )
    expect(screen.getByText('Marked as No Answer — outcome not required')).toBeInTheDocument()
  })

  it('renders a confirmation summary and hides the icon row when confirmed is set', () => {
    render(
      <ProfileActionBar
        contact={contact}
        onNext={vi.fn()}
        confirmed={{ outcome: 'meeting_booked' as CallOutcome, notes: 'Booked for Tuesday' }}
        onOutcomeChosen={vi.fn()}
      />
    )
    expect(screen.getByText(/Logged: Meeting Booked/)).toBeInTheDocument()
    expect(screen.getByText('Booked for Tuesday')).toBeInTheDocument()
    expect(screen.queryByTitle('Log a call outcome')).not.toBeInTheDocument()
  })

  it('calls onNext when Next is clicked in the confirmed state', () => {
    const onNext = vi.fn()
    render(
      <ProfileActionBar
        contact={contact}
        onNext={onNext}
        confirmed={{ outcome: 'meeting_booked' as CallOutcome, notes: '' }}
        onOutcomeChosen={vi.fn()}
      />
    )
    fireEvent.click(screen.getByText('Next'))
    expect(onNext).toHaveBeenCalledTimes(1)
  })

  it('renders Edit and Delete buttons in the confirmed state when their handlers are provided', () => {
    const onEditDraft   = vi.fn()
    const onDeleteDraft = vi.fn()
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(
      <ProfileActionBar
        contact={contact}
        onNext={vi.fn()}
        confirmed={{ outcome: 'meeting_booked' as CallOutcome, notes: 'Booked for Tuesday' }}
        onOutcomeChosen={vi.fn()}
        onEditDraft={onEditDraft}
        onDeleteDraft={onDeleteDraft}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: 'Edit outcome' }))
    expect(onEditDraft).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: 'Delete outcome' }))
    expect(confirmSpy).toHaveBeenCalledWith('Discard this outcome? Nothing has been saved yet.')
    expect(onDeleteDraft).toHaveBeenCalledTimes(1)
    confirmSpy.mockRestore()
  })

  it('does not call onDeleteDraft when the confirmation is declined', () => {
    const onDeleteDraft = vi.fn()
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(
      <ProfileActionBar
        contact={contact}
        onNext={vi.fn()}
        confirmed={{ outcome: 'meeting_booked' as CallOutcome, notes: '' }}
        onOutcomeChosen={vi.fn()}
        onDeleteDraft={onDeleteDraft}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: 'Delete outcome' }))
    expect(onDeleteDraft).not.toHaveBeenCalled()
    confirmSpy.mockRestore()
  })

  it('does not render Edit/Delete buttons when their handlers are omitted', () => {
    render(
      <ProfileActionBar
        contact={contact}
        onNext={vi.fn()}
        confirmed={{ outcome: 'meeting_booked' as CallOutcome, notes: '' }}
        onOutcomeChosen={vi.fn()}
      />
    )
    expect(screen.queryByRole('button', { name: 'Edit outcome' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Delete outcome' })).not.toBeInTheDocument()
  })
})
