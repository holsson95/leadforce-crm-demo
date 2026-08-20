// Shared constants for the public portfolio demo build.
// The two seeded tenants a visitor can switch between (see scripts/seed-demo.ts),
// and the cookie used to remember which one the single demo account is viewing.
export const DEMO_TENANT_SLUGS = ['demo-acme-outreach', 'demo-nova-sales'] as const

export const DEMO_TENANT_COOKIE = 'demo_active_tenant'

// Lets the single shared demo login flip which role it appears as, so a
// visitor can see the admin, manager, sdr, and client-portal views through
// the identical account (see scripts/seed-demo.ts and src/lib/auth.ts).
export const DEMO_ROLE_COOKIE = 'demo_active_role'

export const DEMO_ROLES = ['admin', 'manager', 'sdr', 'client'] as const
export type DemoRole = (typeof DEMO_ROLES)[number]

export function isDemoModeConfigured(): boolean {
  return Boolean(process.env.DEMO_USER_CLERK_ID)
}
