import { redirect } from 'next/navigation'
import { Kanban } from 'lucide-react'
import { auth } from '@clerk/nextjs/server'
import { db, withTenant } from '@/lib/db'
import { getCurrentTenantId, getCurrentUserRole, hasPermission } from '@/lib/auth'
import { KanbanBoard } from '@/components/pipeline/KanbanBoard'
import { ClientSelector } from '@/components/pipeline/ClientSelector'
import { PendingPipelineSection } from '@/components/pipeline/PendingPipelineSection'
import type { PipelineDealRow, PipelineStageRow, PendingPipelineDealRow } from '@/types/models'

export default async function PipelinePage({
  searchParams,
}: {
  searchParams: Promise<{ clientId?: string }>
}) {
  const tenantId = await getCurrentTenantId()
  if (!tenantId) redirect('/sign-in')

  const role = await getCurrentUserRole()
  if (!role || !hasPermission(role, 'pipeline:read')) redirect('/')

  const { clientId } = await searchParams

  const clients = await withTenant(tenantId, () =>
    db.client.findMany({
      where:   { deletedAt: null },
      select:  { id: true, name: true },
      orderBy: { createdAt: 'asc' },
    })
  )

  if (clients.length === 0) {
    return (
      <div className="p-8">
        <div className="glass-panel rounded-3xl p-12 flex flex-col items-center justify-center gap-4 text-center">
          <Kanban className="w-10 h-10 text-[var(--text-muted)]" />
          <div>
            <p className="text-[var(--text-secondary)] text-sm font-medium">No clients found</p>
            <p className="text-[var(--text-muted)] text-xs mt-1">Create a client to start building your pipeline.</p>
          </div>
          <a
            href="/settings"
            className="px-4 py-2 rounded-xl bg-gradient-to-r from-[var(--lf-accent)] to-amber-600 text-black text-sm font-semibold shadow-xl shadow-[var(--lf-accent)]/30"
          >
            Go to Settings
          </a>
        </div>
      </div>
    )
  }

  const selectedClientId = clientId && clients.some((c) => c.id === clientId)
    ? clientId
    : clients[0].id

  const { userId } = await auth()
  const userCanWrite = userId
    ? hasPermission(role, 'pipeline:write')
    : false

  const [rawStages, rawDeals, rawPending] = await withTenant(tenantId, () =>
    Promise.all([
      db.pipelineStage.findMany({
        where:   { clientId: selectedClientId },
        select:  { id: true, name: true, color: true, position: true },
        orderBy: { position: 'asc' },
      }),
      db.pipelineDeal.findMany({
        where: { clientId: selectedClientId },
        select: {
          id: true, stageId: true, clientId: true, contactId: true,
          title: true, value: true, notes: true, source: true, createdAt: true,
          contact:  { select: { firstName: true, lastName: true, companyName: true } },
          campaign: { select: { name: true } },
        },
      }),
      db.pendingPipelineDeal.findMany({
        where: {
          clientId: selectedClientId,
          campaign: { deletedAt: null, archivedAt: null },
        },
        select: {
          id: true, clientId: true, contactId: true, campaignId: true,
          outcome: true, createdAt: true,
          contact:  { select: { firstName: true, lastName: true, companyName: true, jobTitle: true } },
          campaign: { select: { name: true } },
        },
        orderBy: { createdAt: 'asc' },
      }),
    ])
  )

  const stages: PipelineStageRow[] = rawStages

  const initialDeals: PipelineDealRow[] = rawDeals.map((d) => ({
    id:        d.id,
    stageId:   d.stageId,
    clientId:  d.clientId,
    contactId: d.contactId,
    title:     d.title,
    value:     d.value != null ? d.value.toString() : null,
    notes:     d.notes,
    source:    d.source,
    createdAt: d.createdAt.toISOString(),
    contact:   d.contact,
    campaign:  d.campaign,
  }))

  const pendingDeals: PendingPipelineDealRow[] = rawPending.map((p) => ({
    ...p,
    outcome:   p.outcome as string,
    createdAt: p.createdAt.toISOString(),
  }))

  if (rawStages.length === 0) {
    return (
      <div className="p-8 space-y-4">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h1 className="text-2xl font-bold text-[var(--text-primary)]">Pipeline</h1>
            <p className="text-sm text-[var(--text-secondary)] mt-0.5">Track deals through your sales stages</p>
          </div>
          {clients.length > 1 && (
            <ClientSelector clients={clients} selectedClientId={selectedClientId} />
          )}
        </div>
        {pendingDeals.length > 0 && (
          <PendingPipelineSection
            pending={pendingDeals}
            stages={[]}
            canWrite={userCanWrite}
          />
        )}
        <div className="glass-panel rounded-3xl p-12 flex flex-col items-center justify-center gap-4 text-center">
          <Kanban className="w-10 h-10 text-[var(--text-muted)]" />
          <div>
            <p className="text-[var(--text-secondary)] text-sm font-medium">
              No pipeline stages configured for this client
            </p>
            <p className="text-[var(--text-muted)] text-xs mt-1">
              Add stages to start tracking deals.
            </p>
          </div>
          {userCanWrite && (
            <a
              href={`/settings/pipeline?clientId=${selectedClientId}`}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-[var(--lf-accent)] to-amber-600 text-black text-sm font-semibold shadow-xl shadow-[var(--lf-accent)]/30"
            >
              Configure pipeline →
            </a>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="p-8">
      <KanbanBoard
        clients={clients}
        selectedClientId={selectedClientId}
        stages={stages}
        initialDeals={initialDeals}
        pendingDeals={pendingDeals}
        canWrite={userCanWrite}
      />
    </div>
  )
}
