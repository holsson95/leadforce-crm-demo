import { describe, it, expect } from 'vitest'
import {
  canEditUserRole,
  allowedRolesToAssign,
  canEditUserPermissions,
} from '../team-permissions'

describe('canEditUserRole', () => {
  it('admin can edit an admin', () =>
    expect(canEditUserRole('admin', 'admin')).toBe(true))
  it('admin can edit a manager', () =>
    expect(canEditUserRole('admin', 'manager')).toBe(true))
  it('admin can edit an sdr', () =>
    expect(canEditUserRole('admin', 'sdr')).toBe(true))
  it('manager can edit an sdr', () =>
    expect(canEditUserRole('manager', 'sdr')).toBe(true))
  it('manager cannot edit an admin', () =>
    expect(canEditUserRole('manager', 'admin')).toBe(false))
  it('manager cannot edit another manager', () =>
    expect(canEditUserRole('manager', 'manager')).toBe(false))
  it('sdr cannot edit anyone', () => {
    expect(canEditUserRole('sdr', 'sdr')).toBe(false)
    expect(canEditUserRole('sdr', 'admin')).toBe(false)
  })
})

describe('allowedRolesToAssign', () => {
  it('admin can assign any role', () => {
    const roles = allowedRolesToAssign('admin')
    expect(roles).toContain('admin')
    expect(roles).toContain('manager')
    expect(roles).toContain('sdr')
  })
  it('manager can assign sdr or manager but not admin', () => {
    const roles = allowedRolesToAssign('manager')
    expect(roles).toContain('sdr')
    expect(roles).toContain('manager')
    expect(roles).not.toContain('admin')
  })
  it('sdr cannot assign any role', () =>
    expect(allowedRolesToAssign('sdr')).toHaveLength(0))
})

describe('canEditUserPermissions', () => {
  it('admin can edit any sdr permissions regardless of managerId', () => {
    expect(canEditUserPermissions('admin', 'sdr', null,     'admin-id')).toBe(true)
    expect(canEditUserPermissions('admin', 'sdr', 'mgr-2',  'admin-id')).toBe(true)
  })
  it('admin cannot edit permissions of a non-sdr', () => {
    expect(canEditUserPermissions('admin', 'manager', null, 'admin-id')).toBe(false)
    expect(canEditUserPermissions('admin', 'admin',   null, 'admin-id')).toBe(false)
  })
  it('manager can edit permissions of their own sdr', () =>
    expect(canEditUserPermissions('manager', 'sdr', 'mgr-1', 'mgr-1')).toBe(true))
  it('manager cannot edit permissions of sdr under a different manager', () =>
    expect(canEditUserPermissions('manager', 'sdr', 'mgr-2', 'mgr-1')).toBe(false))
  it('manager cannot edit permissions of sdr with no manager', () =>
    expect(canEditUserPermissions('manager', 'sdr', null, 'mgr-1')).toBe(false))
  it('sdr cannot edit anyone permissions', () =>
    expect(canEditUserPermissions('sdr', 'sdr', null, 'sdr-id')).toBe(false))
})
