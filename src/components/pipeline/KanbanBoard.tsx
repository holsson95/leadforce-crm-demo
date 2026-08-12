'use client'

import { useState } from 'react'
import { DndContext, DragEndEvent, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import { Kanban } from 'lucide-react'
import { toast } from 'sonner'
import { KanbanColumn } from './KanbanColumn'
import { ReadOnlyKanbanColumn } from './ReadOnlyKanbanColumn'
import { ClientSelector } from './ClientSelector'
import { PendingPipelineSection } from './PendingPipelineSection'
import type { PipelineStageRow, PipelineDealRow, PendingPipelineDealRow } from '@/types/models'

interface KanbanBoardProps {
  clients?:          { id: string; name: string }[]
  selectedClientId?: string
  stages:            PipelineStageRow[]
  initialDeals:      PipelineDealRow[]
  pendingDeals?:     PendingPipelineDealRow[]
  canWrite?:         boolean
  readOnly?:         boolean
  hideHeader?:       boolean
}

function groupByStage(deals: PipelineDealRow[]): Record<string, PipelineDealRow[]> {
  return deals.reduce<Record<string, PipelineDealRow[]>>((acc, deal) => {
    ;(acc[deal.stageId] ??= []).push(deal)
    return acc
  }, {})
}

export function KanbanBoard({
  clients,
  selectedClientId,
  stages,
  initialDeals,
  pendingDeals  = [],
  canWrite      = false,
  readOnly      = false,
  hideHeader    = false,
}: KanbanBoardProps) {
  const [dealsByStage, setDealsByStage] = useState(() => groupByStage(initialDeals))
  const [expandedCardId, setExpandedCardId] = useState<string | null>(null)

  function handleToggleExpand(id: string) {
    setExpandedCardId((prev) => (prev === id ? null : id))
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  )

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over) return

    const dealId     = String(active.id)
    const newStageId = String(over.id)

    const currentStageId = Object.keys(dealsByStage).find((sid) =>
      dealsByStage[sid]?.some((d) => d.id === dealId)
    )
    if (!currentStageId || currentStageId === newStageId) return

    const deal = dealsByStage[currentStageId].find((d) => d.id === dealId)!

    setDealsByStage((prev) => {
      const next = { ...prev }
      next[currentStageId] = prev[currentStageId].filter((d) => d.id !== dealId)
      next[newStageId]     = [...(prev[newStageId] ?? []), { ...deal, stageId: newStageId }]
      return next
    })

    try {
      const res = await fetch(`/api/pipeline/deals/${dealId}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ stageId: newStageId }),
      })
      if (!res.ok) throw new Error()
    } catch {
      setDealsByStage((prev) => {
        const next = { ...prev }
        next[newStageId]     = prev[newStageId].filter((d) => d.id !== dealId)
        next[currentStageId] = [...(prev[currentStageId] ?? []), { ...deal, stageId: currentStageId }]
        return next
      })
      toast.error('Failed to move deal — please try again')
    }
  }

  return (
    <div>
      {!hideHeader && (
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-[var(--text-primary)]">Pipeline</h1>
            <p className="text-sm text-[var(--text-secondary)] mt-0.5">Track deals through your sales stages</p>
          </div>
          {clients && selectedClientId && (
            <ClientSelector clients={clients} selectedClientId={selectedClientId} />
          )}
        </div>
      )}

      {pendingDeals.length > 0 && (
        <PendingPipelineSection
          pending={pendingDeals}
          stages={stages}
          canWrite={canWrite}
        />
      )}

      {stages.length === 0 ? (
        <div className="glass-panel rounded-3xl p-12 flex flex-col items-center justify-center gap-4 text-center">
          <Kanban className="w-10 h-10 text-[var(--text-muted)]" />
          <div>
            <p className="text-[var(--text-secondary)] text-sm font-medium">No pipeline stages configured</p>
            <p className="text-[var(--text-muted)] text-xs mt-1">Add stages in Settings to get started.</p>
          </div>
        </div>
      ) : readOnly ? (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {stages.map((stage) => (
            <ReadOnlyKanbanColumn
              key={stage.id}
              stage={stage}
              deals={dealsByStage[stage.id] ?? []}
            />
          ))}
        </div>
      ) : (
        <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
          <div className="flex gap-4 overflow-x-auto pb-4">
            {stages.map((stage) => (
              <KanbanColumn
                key={stage.id}
                stage={stage}
                deals={dealsByStage[stage.id] ?? []}
                expandedCardId={expandedCardId}
                onToggleExpand={handleToggleExpand}
              />
            ))}
          </div>
        </DndContext>
      )}
    </div>
  )
}
