import { describe, it, expect } from 'vitest'
import { withTenant, tenantStore } from '../db'

// Mimics Prisma's lazy PrismaPromise: a plain thenable that defers its real
// work (and thus, inside src/lib/db.ts's $allOperations extension, the read
// of tenantStore.getStore()) until something actually calls .then() on it —
// which is exactly what db.contact.findUnique(...) etc. return.
function lazyTenantRead(): Promise<string | undefined> {
  return {
    then(resolve: (v: string | undefined) => void) {
      setTimeout(() => resolve(tenantStore.getStore()?.tenantId), 0)
    },
  } as Promise<string | undefined>
}

describe('withTenant', () => {
  it('keeps the tenant context alive across a lazy Prisma-style thenable', async () => {
    // This is the shape used throughout the app:
    //   withTenant(tenantId, () => db.contact.findUnique(...))
    // where the arrow returns Prisma's lazy thenable without awaiting it.
    const result = await withTenant('tenant-A', () => lazyTenantRead())
    expect(result).toBe('tenant-A')
  })

  it('still works when the caller awaits the query directly', async () => {
    const result = await withTenant('tenant-B', async () => await lazyTenantRead())
    expect(result).toBe('tenant-B')
  })

  it('keeps concurrent withTenant calls isolated from each other', async () => {
    const [a, b] = await Promise.all([
      withTenant('tenant-A', () => lazyTenantRead()),
      withTenant('tenant-B', () => lazyTenantRead()),
    ])
    expect(a).toBe('tenant-A')
    expect(b).toBe('tenant-B')
  })
})
