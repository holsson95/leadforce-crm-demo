import { describe, it, expect, vi, beforeEach } from 'vitest'
import { resolvePermission } from '../auth'

const mockFindMany = vi.hoisted(() => vi.fn())

vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn(),
  currentUser: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
  db: {
    permissionOverride: { findMany: mockFindMany },
  },
}))

describe('resolvePermission', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns true for admin without hitting the database', async () => {
    const result = await resolvePermission('user1', 'tenant1', 'admin', 'pipeline:write')
    expect(result).toBe(true)
    expect(mockFindMany).not.toHaveBeenCalled()
  })

  it('returns the user-level override value when a user override exists', async () => {
    mockFindMany.mockResolvedValue([
      { subjectType: 'user', subjectId: 'user1', granted: true },
    ])
    const result = await resolvePermission('user1', 'tenant1', 'manager', 'pipeline:write')
    expect(result).toBe(true)
  })

  it('user-level override wins over role-level override', async () => {
    mockFindMany.mockResolvedValue([
      { subjectType: 'role', subjectId: 'sdr',   granted: true  },
      { subjectType: 'user', subjectId: 'user1', granted: false },
    ])
    const result = await resolvePermission('user1', 'tenant1', 'sdr', 'pipeline:write')
    expect(result).toBe(false)
  })

  it('returns role-level override when no user override exists', async () => {
    mockFindMany.mockResolvedValue([
      { subjectType: 'role', subjectId: 'manager', granted: false },
    ])
    const result = await resolvePermission('user1', 'tenant1', 'manager', 'pipeline:write')
    expect(result).toBe(false)
  })

  it('returns null when no overrides exist (caller uses role default)', async () => {
    mockFindMany.mockResolvedValue([])
    const result = await resolvePermission('user1', 'tenant1', 'sdr', 'pipeline:write')
    expect(result).toBeNull()
  })

  it('queries db with tenantId, permission, and both subjectId values', async () => {
    mockFindMany.mockResolvedValue([])
    await resolvePermission('user42', 'tenantX', 'manager', 'pipeline:write')
    expect(mockFindMany).toHaveBeenCalledWith({
      where: {
        tenantId:  'tenantX',
        permission: 'pipeline:write',
        subjectId:  { in: ['user42', 'manager'] },
      },
      select: { subjectType: true, subjectId: true, granted: true },
    })
  })
})
