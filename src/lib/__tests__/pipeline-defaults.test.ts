import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/db')

import { seedDefaultStages, DEFAULT_STAGES } from '../pipeline-defaults'
import * as dbModule from '@/lib/db'

const mockDb = vi.mocked(dbModule.db)

describe('DEFAULT_STAGES', () => {
  it('has 6 stages', () => {
    expect(DEFAULT_STAGES).toHaveLength(6)
  })

  it('has sequential positions starting at 0', () => {
    DEFAULT_STAGES.forEach((s, i) => expect(s.position).toBe(i))
  })

  it('every stage has a non-empty name', () => {
    DEFAULT_STAGES.forEach(s => expect(s.name.length).toBeGreaterThan(0))
  })

  it('every stage has a valid hex color', () => {
    DEFAULT_STAGES.forEach(s => expect(s.color).toMatch(/^#[0-9a-f]{6}$/i))
  })
})

describe('seedDefaultStages', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockDb.pipelineStage.createMany = vi.fn()
  })

  it('calls db.pipelineStage.createMany with tenantId and clientId on each stage', async () => {
    await seedDefaultStages('tenant1', 'client1')
    expect(mockDb.pipelineStage.createMany).toHaveBeenCalledWith({
      data: DEFAULT_STAGES.map(s => ({
        ...s,
        tenantId: 'tenant1',
        clientId: 'client1',
      })),
    })
  })

  it('calls createMany exactly once', async () => {
    await seedDefaultStages('t', 'c')
    expect(mockDb.pipelineStage.createMany).toHaveBeenCalledTimes(1)
  })
})
