// src/lib/auth.ts
import { cache } from 'react'
import { auth, currentUser } from '@clerk/nextjs/server'
import { db } from '@/lib/db'

// `currentUser()` hits Clerk's Backend API on every call (no built-in memoization).
// Wrapping it in React's request cache means every helper below — and every call
// site that imports `getCurrentClerkUser` instead of Clerk's `currentUser` directly —
// shares a single network round-trip per request instead of one each.
export const getCurrentClerkUser = cache(currentUser)

export type Permission =
  | 'clients:read'
  | 'clients:write'
  | 'campaigns:read'
  | 'campaigns:write'
  | 'sdrs:manage'
  | 'contacts:read'
  | 'contacts:write'
  | 'calls:write'
  | 'pipeline:read'
  | 'pipeline:write'
  | 'tasks:read'
  | 'tasks:write'
  | 'reports:read'

export type UserRole = 'admin' | 'manager' | 'sdr' | 'client'

const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  admin:   ['clients:read', 'clients:write', 'campaigns:read', 'campaigns:write', 'sdrs:manage', 'contacts:read', 'contacts:write', 'calls:write', 'pipeline:read', 'pipeline:write', 'tasks:read', 'tasks:write', 'reports:read'],
  manager: ['clients:read', 'clients:write', 'campaigns:read', 'campaigns:write', 'sdrs:manage', 'contacts:read', 'contacts:write', 'calls:write', 'pipeline:read', 'pipeline:write', 'tasks:read', 'tasks:write', 'reports:read'],
  sdr:     ['campaigns:read', 'contacts:read', 'contacts:write', 'calls:write', 'pipeline:read', 'tasks:read', 'tasks:write', 'reports:read'],
  client:  ['campaigns:read', 'pipeline:read', 'pipeline:write'],
}

export type SdrPermissionOverrides = {
  canManageCampaigns?: boolean
  canAccessDashboard?: boolean
  canWritePipeline?: boolean
}

export function hasPermission(
  role: string,
  permission: Permission,
  overrides?: SdrPermissionOverrides
): boolean {
  if (role === 'sdr' && overrides) {
    if (permission === 'campaigns:write' && overrides.canManageCampaigns) return true
    if (permission === 'pipeline:write' && overrides.canWritePipeline) return true
  }
  const perms = ROLE_PERMISSIONS[role as UserRole]
  return perms?.includes(permission) ?? false
}

export class ForbiddenError extends Error {
  readonly status = 403
  constructor() {
    super('Forbidden')
    this.name = 'ForbiddenError'
  }
}

export async function getCurrentUserRole(): Promise<string | null> {
  const user = await getCurrentClerkUser()
  return (user?.publicMetadata as { role?: string })?.role ?? null
}

export async function getCurrentTenantId(): Promise<string | null> {
  const user = await getCurrentClerkUser()
  return (user?.publicMetadata as { tenantId?: string })?.tenantId ?? null
}

export async function requirePermission(permission: Permission): Promise<void> {
  const role = await getCurrentUserRole()
  if (!role || !hasPermission(role, permission)) {
    throw new ForbiddenError()
  }
}

export async function getClerkMeta(): Promise<{ role: string; tenantId: string | undefined }> {
  const user = await getCurrentClerkUser()
  const meta = user?.publicMetadata as { role?: string; tenantId?: string } | undefined
  return { role: meta?.role ?? '', tenantId: meta?.tenantId }
}

export async function resolvePermission(
  userId:     string,
  tenantId:   string,
  role:       UserRole | string,
  permission: Permission,
): Promise<boolean | null> {
  if (role === 'admin') return true

  const overrides = await db.permissionOverride.findMany({
    where: {
      tenantId,
      permission,
      subjectId: { in: [userId, role] },
    },
    select: { subjectType: true, subjectId: true, granted: true },
  })

  const userOverride = overrides.find(o => o.subjectType === 'user' && o.subjectId === userId)
  if (userOverride) return userOverride.granted

  const roleOverride = overrides.find(o => o.subjectType === 'role' && o.subjectId === role)
  if (roleOverride) return roleOverride.granted

  return null
}
