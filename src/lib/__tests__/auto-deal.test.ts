import { describe, it, expect, vi, beforeEach } from 'vitest'
import { autoCreateDeal } from '../auto-deal'

const mockCampaignFindUnique = vi.fn()
const mockContactFindUnique  = vi.fn()
const mockStageFindFirst     = vi.fn()
const mockDealUpsert         = vi.fn()

const mockTx = {
  campaign:      { findUnique: mockCampaignFindUnique },
  contact:       { findUnique: mockContactFindUnique },
  pipelineStage: { findFirst: mockStageFindFirst },
  pipelineDeal:  { upsert: mockDealUpsert },
} as any

const campaign = { clientId: 'client1' }
const contact  = { firstName: 'John', lastName: 'Smith', companyName: 'Acme Corp' }
const stage    = { id: 'stage1' }

describe('autoCreateDeal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCampaignFindUnique.mockResolvedValue(campaign)
    mockContactFindUnique.mockResolvedValue(contact)
    mockStageFindFirst.mockResolvedValue(stage)
  })

  it('upserts a deal in the first stage', async () => {
    await autoCreateDeal({ contactId: 'c1', campaignId: 'camp1', tenantId: 't1' }, mockTx)
    expect(mockDealUpsert).toHaveBeenCalledWith({
      where:  { contactId_campaignId: { contactId: 'c1', campaignId: 'camp1' } },
      create: {
        tenantId:   't1',
        clientId:   'client1',
        stageId:    'stage1',
        contactId:  'c1',
        campaignId: 'camp1',
        title:      'John Smith — Acme Corp',
        source:     'auto',
      },
      update: { stageId: 'stage1' },
    })
  })

  it('skips when no stages exist for the client', async () => {
    mockStageFindFirst.mockResolvedValue(null)
    await autoCreateDeal({ contactId: 'c1', campaignId: 'camp1', tenantId: 't1' }, mockTx)
    expect(mockDealUpsert).not.toHaveBeenCalled()
  })

  it('generates title without company when companyName is null', async () => {
    mockContactFindUnique.mockResolvedValue({ firstName: 'Jane', lastName: 'Doe', companyName: null })
    await autoCreateDeal({ contactId: 'c1', campaignId: 'camp1', tenantId: 't1' }, mockTx)
    const args = mockDealUpsert.mock.calls[0][0]
    expect(args.create.title).toBe('Jane Doe')
  })

  it('skips when campaign is not found', async () => {
    mockCampaignFindUnique.mockResolvedValue(null)
    await autoCreateDeal({ contactId: 'c1', campaignId: 'camp1', tenantId: 't1' }, mockTx)
    expect(mockDealUpsert).not.toHaveBeenCalled()
  })

  it('skips when contact is not found', async () => {
    mockContactFindUnique.mockResolvedValue(null)
    await autoCreateDeal({ contactId: 'c1', campaignId: 'camp1', tenantId: 't1' }, mockTx)
    expect(mockDealUpsert).not.toHaveBeenCalled()
  })
})
