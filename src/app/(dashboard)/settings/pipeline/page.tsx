import { redirect } from 'next/navigation'
import { auth } from '@clerk/nextjs/server'
import { Kanban, Shield } from 'lucide-react'
import { db, withTenant } from '@/lib/db'
import { getCurrentUserRole, getCurrentTenantId, resolvePermission } from '@/lib/auth'
import { ClientSelector } from '@/components/pipeline/ClientSelector'
import { PipelineStagesPanel } from '@/components/settings/PipelineStagesPanel'

export default async function PipelineSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ clientId?: string }>
}) {
  const tenantId = await getCurrentTenantId()
  if (!tenantId) redirect('/sign-in')

  const role = await getCurrentUserRole()
  if (!role || role === 'client') redirect('/')

  const { userId } = await auth()
  const canWrite   = await resolvePermission(userId!, tenantId, role, 'pipeline:write')
  const hasAccess  = canWrite !== null ? canWrite : (role === 'admin' || role === 'manager')

  if (!hasAccess) {
    return (
      <div className="glass-panel rounded-3xl p-12 flex flex-col items-center justify-center gap-4 text-center">
        <Shield className="w-10 h-10 text-[var(--text-muted)]" />
        <div>
          <p className="text-[var(--text-secondary)] text-sm font-medium">Access restricted</p>
          <p className="text-[var(--text-muted)] text-xs mt-1">
            You don't have permission to edit pipeline stages.
          </p>
        </div>
      </div>
    )
  }

  const clients = await withTenant(tenantId, () =>
    db.client.findMany({
      where:   { deletedAt: null },
      select:  { id: true, name: true },
      orderBy: { createdAt: 'asc' },
    })
  )

  if (clients.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">Pipeline Stages</h2>
          <p className="text-sm text-[var(--text-secondary)] mt-0.5">
            Configure the stages for each client's pipeline.
          </p>
        </div>
        <div className="glass-panel rounded-3xl p-12 flex flex-col items-center justify-center gap-4 text-center">
          <Kanban className="w-10 h-10 text-[var(--text-muted)]" />
          <div>
            <p className="text-[var(--text-secondary)] text-sm font-medium">No clients yet</p>
            <p className="text-[var(--text-muted)] text-xs mt-1">
              Create a client first to configure pipeline stages.
            </p>
          </div>
        </div>
      </div>
    )
  }

  const { clientId: qClientId } = await searchParams
  const selectedClientId = qClientId && clients.some(c => c.id === qClientId)
    ? qClientId
    : clients[0].id

  const stages = await withTenant(tenantId, () =>
    db.pipelineStage.findMany({
      where:   { clientId: selectedClientId },
      select:  { id: true, name: true, color: true, position: true },
      orderBy: { position: 'asc' },
    })
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">Pipeline Stages</h2>
          <p className="text-sm text-[var(--text-secondary)] mt-0.5">
            Configure the stages for each client's pipeline. Drag to reorder.
          </p>
        </div>
        <ClientSelector
          clients={clients}
          selectedClientId={selectedClientId}
          basePath="/settings/pipeline"
        />
      </div>
      <div className="glass-panel rounded-2xl p-5">
        <PipelineStagesPanel
          clientId={selectedClientId}
          initialStages={stages}
        />
      </div>
    </div>
  )
}
