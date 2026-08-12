'use server'

import { revalidatePath } from 'next/cache'
import { db, withTenant } from '@/lib/db'
import { getCurrentTenantId, requirePermission } from '@/lib/auth'
import { ClientSchema, type ClientFormData } from './schemas'
export type { ClientFormData } from './schemas'

export async function createClient(data: ClientFormData) {
  await requirePermission('clients:write')
  const tenantId = await getCurrentTenantId()
  if (!tenantId) throw new Error('No tenant context')

  const parsed = ClientSchema.parse(data)

  const client = await withTenant(tenantId, () =>
    db.client.create({
      data: {
        tenantId,
        name: parsed.name,
        contactName: parsed.contactName || null,
        email: parsed.email || null,
        phone: parsed.phone || null,
        website: parsed.website || null,
      },
    })
  )

  revalidatePath('/clients')
  revalidatePath('/settings/portal')
  return client
}

export async function updateClient(id: string, data: ClientFormData) {
  await requirePermission('clients:write')
  const tenantId = await getCurrentTenantId()
  if (!tenantId) throw new Error('No tenant context')

  const parsed = ClientSchema.parse(data)

  await withTenant(tenantId, () =>
    db.client.update({
      where: { id },
      data: {
        name: parsed.name,
        contactName: parsed.contactName || null,
        email: parsed.email || null,
        phone: parsed.phone || null,
        website: parsed.website || null,
      },
    })
  )

  revalidatePath('/clients')
}

export async function deleteClient(id: string) {
  await requirePermission('clients:write')
  const tenantId = await getCurrentTenantId()
  if (!tenantId) throw new Error('No tenant context')

  await withTenant(tenantId, () =>
    db.client.update({
      where: { id },
      data: { deletedAt: new Date() },
    })
  )

  revalidatePath('/clients')
}
