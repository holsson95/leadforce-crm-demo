import { KanbanBoard } from '@/components/pipeline/KanbanBoard'
import { getCurrentClientRecord, getPortalPipelineData, getClientPermission } from '@/lib/client-portal'
import type { PipelineDealRow, PipelineStageRow } from '@/types/models'

export default async function ClientPortalPipelinePage() {
  const client = await getCurrentClientRecord()
  if (!client) return null  // layout shows PortalPending in this case

  const canWrite = getClientPermission(client.portalPermissions, 'pipeline.write')
  const { rawStages, rawDeals } = await getPortalPipelineData(client.id, client.tenantId)

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

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">Pipeline</h1>
        <p className="text-sm text-[var(--text-secondary)] mt-0.5">Your open deals by stage</p>
      </div>
      <KanbanBoard
        stages={stages}
        initialDeals={initialDeals}
        readOnly={!canWrite}
        hideHeader
      />
    </div>
  )
}
