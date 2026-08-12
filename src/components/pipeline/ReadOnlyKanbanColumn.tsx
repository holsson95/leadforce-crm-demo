import { ReadOnlyDealCard } from './ReadOnlyDealCard'
import type { PipelineStageRow, PipelineDealRow } from '@/types/models'

interface ReadOnlyKanbanColumnProps {
  stage: PipelineStageRow
  deals: PipelineDealRow[]
}

export function ReadOnlyKanbanColumn({ stage, deals }: ReadOnlyKanbanColumnProps) {
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
      <div className="min-h-[200px] rounded-2xl p-2 space-y-2">
        {deals.map((deal) => (
          <ReadOnlyDealCard key={deal.id} deal={deal} stageColor={stage.color} />
        ))}
        {deals.length === 0 && (
          <div className="h-24 rounded-xl border border-dashed border-[var(--panel-border)] flex items-center justify-center">
            <span className="text-xs text-[var(--text-muted)]">No deals</span>
          </div>
        )}
      </div>
    </div>
  )
}
