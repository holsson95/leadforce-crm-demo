import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { HeaderSearch } from '../HeaderSearch'

const results = [
  {
    id: 'c1', firstName: 'Jane', lastName: 'Doe',
    mobilePhone: '5551234567', corporatePhone: null,
    companyName: 'Acme', status: 'prospect', campaign: { name: 'Q1 Outbound' },
  },
]

describe('HeaderSearch', () => {
  beforeEach(() => {
    global.fetch = vi.fn((url: string) => {
      if (url.startsWith('/api/contacts/lookup')) {
        return Promise.resolve({ ok: true, json: async () => ({ data: results }) }) as any
      }
      return Promise.resolve({ ok: true, json: async () => ({ data: [] }) }) as any
    }) as any
  })

  it('does not search for a 1-character query', async () => {
    render(<HeaderSearch />)
    fireEvent.change(screen.getByPlaceholderText(/search by name, phone, or company/i), { target: { value: 'j' } })
    await new Promise((r) => setTimeout(r, 350))
    expect(global.fetch).not.toHaveBeenCalledWith(expect.stringContaining('/api/contacts/lookup'))
  })

  it('debounces and shows results for a query of 2+ characters', async () => {
    render(<HeaderSearch />)
    fireEvent.change(screen.getByPlaceholderText(/search by name, phone, or company/i), { target: { value: '555123' } })
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/contacts/lookup?q=555123'), { timeout: 1000 })
    await waitFor(() => expect(screen.getByText('Jane Doe')).toBeInTheDocument())
  })

  it('shows "No contacts found" when the lookup returns no matches', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: [] }) }) as any
    render(<HeaderSearch />)
    fireEvent.change(screen.getByPlaceholderText(/search by name, phone, or company/i), { target: { value: 'zzzzz' } })
    await waitFor(() => expect(screen.getByText('No contacts found')).toBeInTheDocument(), { timeout: 1000 })
  })

  it('shows an error message, not "No contacts found", when the request fails (e.g. 403)', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({ error: 'Forbidden' }),
    }) as any
    render(<HeaderSearch />)
    fireEvent.change(screen.getByPlaceholderText(/search by name, phone, or company/i), { target: { value: '403259966' } })
    await waitFor(() => expect(screen.getByText(/couldn.t search contacts/i)).toBeInTheDocument(), { timeout: 1000 })
    expect(screen.queryByText('No contacts found')).not.toBeInTheDocument()
  })

  it('shows an error message when the fetch itself fails (network error)', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('network down')) as any
    render(<HeaderSearch />)
    fireEvent.change(screen.getByPlaceholderText(/search by name, phone, or company/i), { target: { value: '403259966' } })
    await waitFor(() => expect(screen.getByText(/couldn.t search contacts/i)).toBeInTheDocument(), { timeout: 1000 })
    expect(screen.queryByText('No contacts found')).not.toBeInTheDocument()
  })
})
