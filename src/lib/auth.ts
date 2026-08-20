// src/lib/auth.ts
import { cache } from 'react'
import { cookies } from 'next/headers'
import { auth, currentUser } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { DEMO_TENANT_SLUGS, DEMO_TENANT_COOKIE, DEMO_ROLES, DEMO_ROLE_COOKIE, type DemoRole } from '@/lib/demo'

// `currentUser()` hits Clerk's Backend API on every call (no built-in memoization).
// Wrapping it in React's request cache means every helper below — and every call
// site that imports `getCurrentClerkUser` instead of Clerk's `currentUser` directly —
// shares a single network round-trip per request instead of one each.
export const getCurrentClerkUser = cache(currentUser)

// Demo build only: the public portfolio deploy has exactly one real login (a
// pre-seeded Clerk account whose ID is DEMO_USER_CLERK_ID) that visitors share
// via the "View Demo" button. That one account can flip which of the two seeded
// tenants it's viewing via a cookie, to show tenant isolation live in one session.
// This never applies to any other Clerk user — real customers always resolve to
// their own tenantId from Clerk metadata, exactly as before.
const resolveDemoOverrideTenantId = cache(async (clerkUserId: string | null | undefined): Promise<string | null> => {
  if (!clerkUserId || !process.env.DEMO_USER_CLERK_ID) return null
  if (clerkUserId !== process.env.DEMO_USER_CLERK_ID) return null

  const store = await cookies()
  const override = store.get(DEMO_TENANT_COOKIE)?.value
  if (!override) return null

  const tenant = await db.tenant.findFirst({
    where:  { id: override, slug: { in: [...DEMO_TENANT_SLUGS] } },
    select: { id: true },
  })
  return tenant?.id ?? null
})

// Same demo-only trick as the tenant override above, but for role: lets the
// shared login flip between admin/manager/sdr/client to show each view
// (including the client portal) without needing separate Clerk accounts.
const resolveDemoOverrideRole = cache(async (clerkUserId: string | null | undefined): Promise<DemoRole | null> => {
  if (!clerkUserId || !process.env.DEMO_USER_CLERK_ID) return null
  if (clerkUserId !== process.env.DEMO_USER_CLERK_ID) return null

  const store = await cookies()
  const override = store.get(DEMO_ROLE_COOKIE)?.value
  if (!override || !(DEMO_ROLES as readonly string[]).includes(override)) return null

  return override as DemoRole
})

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
  const override = await resolveDemoOverrideRole(user?.id)
  return override ?? (user?.publicMetadata as { role?: string })?.role ?? null
}

export async function getCurrentTenantId(): Promise<string | null> {
  const user = await getCurrentClerkUser()
  const homeTenantId = (user?.publicMetadata as { tenantId?: string })?.tenantId ?? null
  const override = await resolveDemoOverrideTenantId(user?.id)
  return override ?? homeTenantId
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
  const [tenantOverride, roleOverride] = await Promise.all([
    resolveDemoOverrideTenantId(user?.id),
    resolveDemoOverrideRole(user?.id),
  ])
  return { role: roleOverride ?? meta?.role ?? '', tenantId: tenantOverride ?? meta?.tenantId }
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
