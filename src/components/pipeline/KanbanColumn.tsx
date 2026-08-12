'use client'

import { useDroppable } from '@dnd-kit/core'
import { DealCard } from './DealCard'
import type { PipelineStageRow, PipelineDealRow } from '@/types/models'

interface KanbanColumnProps {
  stage:          PipelineStageRow
  deals:          PipelineDealRow[]
  expandedCardId: string | null
  onToggleExpand: (id: string) => void
}

export function KanbanColumn({ stage, deals, expandedCardId, onToggleExpand }: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id })

  return (
    <div className="flex-shrink-0 w-72">
      <div className="flex items-center gap-2 mb-3">
        <span
          className="w-2.5 h-2.5 rounded-full flex-shrink-0"
          style={{ backgroundColor: stage.color }}
        />
        <span className="text-sm font-semibold text-[var(--text-primary)]">{stage.name}</span>
        <span className="ml-auto font-mono text-[10px] bg-[var(--lf-accent)]/10 text-[var(--lf-accent)] px-2 py-0.5 rounded-full">
          {deals.length}
        </span>
      </div>

      <div
        ref={setNodeRef}
        className={`
          min-h-[200px] rounded-2xl p-2 space-y-2 transition-colors duration-150
          ${isOver ? 'bg-white/[0.04]' : 'bg-transparent'}
        `}
      >
        {deals.map((deal) => (
          <DealCard
            key={deal.id}
            deal={deal}
            stageColor={stage.color}
            expandedCardId={expandedCardId}
            onToggleExpand={onToggleExpand}
          />
        ))}

        {deals.length === 0 && !isOver && (
          <div className="h-24 rounded-xl border border-dashed border-[var(--panel-border)] flex items-center justify-center">
            <span className="text-xs text-[var(--text-muted)]">Drop deals here</span>
          </div>
        )}
      </div>
    </div>
  )
}
