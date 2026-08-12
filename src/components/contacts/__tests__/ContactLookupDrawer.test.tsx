import { render, screen, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ContactLookupDrawer } from '../ContactLookupDrawer'

const contact = {
  id: 'c1', firstName: 'Jane', lastName: 'Doe', email: null,
  mobilePhone: '5551234567', corporatePhone: null, companyName: 'Acme',
  jobTitle: null, industry: null, employeeCount: null, address: null,
  city: null, state: null, zip: null, country: null, companyAddress: null,
  companyCity: null, website: null, linkedinUrl: null, status: 'prospect',
  dncReason: null, dialAttempts: 0, notInterestedUntil: null,
  accountOwnerId: null, campaignId: 'camp1', tenantId: 't1',
  dedupeHash: 'h1', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  deletedAt: null, mobilePhoneDigits: '5551234567', corporatePhoneDigits: null,
  campaign: { id: 'camp1', name: 'Q1 Outbound' }, accountOwner: null,
}

describe('ContactLookupDrawer', () => {
  beforeEach(() => {
    global.fetch = vi.fn((url: string) => {
      if (url.startsWith('/api/contacts/')) {
        return Promise.resolve({ ok: true, json: async () => ({ data: contact }) }) as any
      }
      if (url.startsWith('/api/users')) {
        return Promise.resolve({ ok: true, json: async () => ({ data: [] }) }) as any
      }
      return Promise.reject(new Error(`unexpected fetch: ${url}`))
    }) as any
  })

  it('renders nothing when contactId is null', () => {
    const { container } = render(<ContactLookupDrawer contactId={null} onClose={vi.fn()} />)
    expect(container.textContent).toBe('')
  })

  it('fetches the contact and users, then shows the contact name', async () => {
    render(<ContactLookupDrawer contactId="c1" onClose={vi.fn()} />)
    await waitFor(() => expect(screen.getByText('Jane Doe')).toBeInTheDocument())
    expect(global.fetch).toHaveBeenCalledWith('/api/contacts/c1')
    expect(global.fetch).toHaveBeenCalledWith('/api/users')
  })
})
