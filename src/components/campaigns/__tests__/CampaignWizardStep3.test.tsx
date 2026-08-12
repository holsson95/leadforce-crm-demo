import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { CampaignWizardStep3 } from '../CampaignWizardStep3'
import type { MappedRow } from '@/lib/csv/types'

function makeRow(overrides: Partial<MappedRow> & { dedupeHash: string }): MappedRow {
  return {
    firstName: 'John', lastName: 'Doe', email: null, mobilePhone: null,
    corporatePhone: null, mobilePhoneDigits: null, corporatePhoneDigits: null,
    companyName: null, jobTitle: null, industry: null,
    employeeCount: null, address: null, city: null, state: null, zip: null,
    country: null, companyAddress: null, companyCity: null,
    website: null, linkedinUrl: null,
    ...overrides,
  }
}

const clean: MappedRow[] = [makeRow({ dedupeHash: 'c1' }), makeRow({ dedupeHash: 'c2' })]
const dnc: MappedRow[]   = [
  makeRow({ dedupeHash: 'd1', firstName: 'Alice', lastName: null, companyName: 'Acme', dncReason: 'User requested' }),
  makeRow({ dedupeHash: 'd2', firstName: 'Bob',   lastName: null, companyName: 'Corp' }),
]

describe('CampaignWizardStep3', () => {
  it('shows all DNC contacts with excluded state by default', () => {
    render(<CampaignWizardStep3 cleanRows={clean} dncRows={dnc} onImport={vi.fn()} />)
    expect(screen.getByText('Alice')).toBeInTheDocument()
    expect(screen.getByText('Bob')).toBeInTheDocument()
    expect(screen.getByText(/Import 2 Contacts/)).toBeInTheDocument()
  })

  it('includes a toggled contact in the import count', () => {
    render(<CampaignWizardStep3 cleanRows={clean} dncRows={dnc} onImport={vi.fn()} />)
    fireEvent.click(screen.getByText('Alice').closest('button')!)
    expect(screen.getByText(/Import 3 Contacts/)).toBeInTheDocument()
  })

  it('calls onImport with only the included DNC rows', async () => {
    const onImport = vi.fn().mockResolvedValue(undefined)
    render(<CampaignWizardStep3 cleanRows={clean} dncRows={dnc} onImport={onImport} />)
    fireEvent.click(screen.getByText('Alice').closest('button')!)
    fireEvent.click(screen.getByRole('button', { name: /Import/ }))
    expect(onImport).toHaveBeenCalledWith([dnc[0]])
  })

  it('"Exclude all DNC" calls onImport with empty array', async () => {
    const onImport = vi.fn().mockResolvedValue(undefined)
    render(<CampaignWizardStep3 cleanRows={clean} dncRows={dnc} onImport={onImport} />)
    fireEvent.click(screen.getByText('Alice').closest('button')!)
    fireEvent.click(screen.getByRole('button', { name: /Exclude all DNC/i }))
    expect(onImport).toHaveBeenCalledWith([])
  })

  it('renders the DNC reason tag when dncReason is present', () => {
    render(<CampaignWizardStep3 cleanRows={clean} dncRows={dnc} onImport={vi.fn()} />)
    expect(screen.getByText('User requested')).toBeInTheDocument()
  })

  it('shows import error when error prop is provided', () => {
    render(<CampaignWizardStep3 cleanRows={[]} dncRows={dnc} onImport={vi.fn()} error="Import failed. Please try again." />)
    expect(screen.getByText('Import failed. Please try again.')).toBeInTheDocument()
  })
})
