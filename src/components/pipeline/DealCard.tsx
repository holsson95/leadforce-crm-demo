'use client'

import { useDraggable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical } from 'lucide-react'
import { DealExpandPanel } from './DealExpandPanel'
import type { PipelineDealRow } from '@/types/models'

interface DealCardProps {
  deal:           PipelineDealRow
  stageColor:     string
  expandedCardId: string | null
  onToggleExpand: (id: string) => void
}

export function DealCard({ deal, stageColor, expandedCardId, onToggleExpand }: DealCardProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id:   deal.id,
    data: { stageId: deal.stageId },
  })

  const isExpanded = expandedCardId === deal.id

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), borderLeftColor: stageColor }}
      className={`
        glass-panel rounded-2xl border-l-2
        hover:border-[var(--lf-accent)]/20 transition-colors duration-200
        ${isDragging ? 'opacity-50 shadow-2xl cursor-grabbing' : 'cursor-pointer'}
      `}
    >
      {/* Card header — click to expand, drag handle stops propagation */}
      <div
        className="p-4 flex items-start justify-between gap-2"
        onClick={() => onToggleExpand(deal.id)}
      >
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-[var(--text-primary)] truncate">
            {deal.contact.firstName} {deal.contact.lastName}
          </p>
          {deal.contact.companyName && (
            <p className="text-xs text-[var(--text-secondary)] truncate mt-0.5">{deal.contact.companyName}</p>
          )}
          <p className="text-[11px] text-[var(--text-muted)] mt-2 truncate">{deal.campaign.name}</p>
          <div className="flex items-center justify-between mt-2">
            {deal.value ? (
              <span className="font-mono text-[11px] text-[var(--lf-accent)]">£{deal.value}</span>
            ) : (
              <span />
            )}
            <span className="text-[10px] text-[var(--text-muted)]">
              {new Date(deal.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
            </span>
          </div>
        </div>
        <div
          className="flex-shrink-0 mt-0.5 cursor-grab active:cursor-grabbing"
          onClick={(e) => e.stopPropagation()}
          {...attributes}
          {...listeners}
        >
          <GripVertical className="w-4 h-4 text-[var(--text-muted)]" />
        </div>
      </div>

      {/* Expanded panel */}
      {isExpanded && (
        <DealExpandPanel contactId={deal.contactId} notes={deal.notes} />
      )}
    </div>
  )
}
