// src/lib/__tests__/auth.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { hasPermission, requirePermission, ForbiddenError } from '../auth'

const { mockAuth, mockCurrentUser } = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockCurrentUser: vi.fn(),
}))
vi.mock('@clerk/nextjs/server', () => ({
  auth: mockAuth,
  currentUser: mockCurrentUser,
}))

describe('hasPermission', () => {
  it('grants admin all permissions', () => {
    expect(hasPermission('admin', 'clients:read')).toBe(true)
    expect(hasPermission('admin', 'clients:write')).toBe(true)
    expect(hasPermission('admin', 'campaigns:read')).toBe(true)
    expect(hasPermission('admin', 'campaigns:write')).toBe(true)
    expect(hasPermission('admin', 'sdrs:manage')).toBe(true)
  })

  it('grants manager all permissions', () => {
    expect(hasPermission('manager', 'clients:read')).toBe(true)
    expect(hasPermission('manager', 'clients:write')).toBe(true)
    expect(hasPermission('manager', 'campaigns:read')).toBe(true)
    expect(hasPermission('manager', 'campaigns:write')).toBe(true)
    expect(hasPermission('manager', 'sdrs:manage')).toBe(true)
  })

  it('grants sdr only campaigns:read', () => {
    expect(hasPermission('sdr', 'campaigns:read')).toBe(true)
    expect(hasPermission('sdr', 'campaigns:write')).toBe(false)
    expect(hasPermission('sdr', 'clients:read')).toBe(false)
    expect(hasPermission('sdr', 'clients:write')).toBe(false)
    expect(hasPermission('sdr', 'sdrs:manage')).toBe(false)
  })

  it('grants client campaigns:read and pipeline:read and pipeline:write', () => {
    expect(hasPermission('client', 'campaigns:read')).toBe(true)
    expect(hasPermission('client', 'pipeline:read')).toBe(true)
    expect(hasPermission('client', 'pipeline:write')).toBe(true)
    expect(hasPermission('client', 'clients:read')).toBe(false)
    expect(hasPermission('client', 'contacts:read')).toBe(false)
  })

  it('grants sdr contacts:read', () => {
    expect(hasPermission('sdr', 'contacts:read')).toBe(true)
  })
  it('grants sdr contacts:write', () => {
    expect(hasPermission('sdr', 'contacts:write')).toBe(true)
  })
  it('denies client contacts:write', () => {
    expect(hasPermission('client', 'contacts:write')).toBe(false)
  })

  it('returns false for unknown role', () => {
    expect(hasPermission('unknown', 'clients:read')).toBe(false)
  })
})

describe('hasPermission with SdrPermissionOverrides', () => {
  it('returns false for sdr campaigns:write without override', () => {
    expect(hasPermission('sdr', 'campaigns:write')).toBe(false)
  })

  it('returns true for sdr campaigns:write when canManageCampaigns is true', () => {
    expect(hasPermission('sdr', 'campaigns:write', { canManageCampaigns: true })).toBe(true)
  })

  it('returns false for sdr campaigns:write when canManageCampaigns is false', () => {
    expect(hasPermission('sdr', 'campaigns:write', { canManageCampaigns: false })).toBe(false)
  })

  it('returns false for sdr pipeline:write without override', () => {
    expect(hasPermission('sdr', 'pipeline:write')).toBe(false)
  })

  it('returns true for sdr pipeline:write when canWritePipeline is true', () => {
    expect(hasPermission('sdr', 'pipeline:write', { canWritePipeline: true })).toBe(true)
  })

  it('does not apply overrides to non-sdr roles', () => {
    expect(hasPermission('manager', 'pipeline:write', { canWritePipeline: false })).toBe(true)
  })

  it('does not grant unknown permissions via override', () => {
    expect(hasPermission('sdr', 'clients:write', { canManageCampaigns: true })).toBe(false)
  })
})

describe('requirePermission', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('throws ForbiddenError when role is null', async () => {
    mockCurrentUser.mockResolvedValue(null)
    await expect(requirePermission('clients:read')).rejects.toThrow(ForbiddenError)
  })

  it('throws ForbiddenError when role lacks permission', async () => {
    mockCurrentUser.mockResolvedValue({ publicMetadata: { role: 'sdr' } })
    await expect(requirePermission('clients:write')).rejects.toThrow(ForbiddenError)
  })

  it('resolves without throwing when role has permission', async () => {
    mockCurrentUser.mockResolvedValue({ publicMetadata: { role: 'admin' } })
    await expect(requirePermission('clients:write')).resolves.toBeUndefined()
  })
})
