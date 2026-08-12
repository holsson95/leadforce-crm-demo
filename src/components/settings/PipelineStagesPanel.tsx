'use client'

import { useState } from 'react'
import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  SortableContext,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable'
import { toast } from 'sonner'
import { StageRow } from './StageRow'
import { AddStageForm } from './AddStageForm'
import type { PipelineStageRow } from '@/types/models'

interface PipelineStagesPanelProps {
  clientId:      string
  initialStages: PipelineStageRow[]
}

export function PipelineStagesPanel({ clientId, initialStages }: PipelineStagesPanelProps) {
  const [stages,      setStages]      = useState(initialStages)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  )

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex  = stages.findIndex(s => s.id === String(active.id))
    const newIndex  = stages.findIndex(s => s.id === String(over.id))
    const reordered = arrayMove(stages, oldIndex, newIndex).map((s, i) => ({ ...s, position: i }))
    setStages(reordered)

    const res = await fetch('/api/pipeline/stages/reorder', {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ clientId, stageIds: reordered.map(s => s.id) }),
    })
    if (!res.ok) {
      setStages(stages)
      toast.error('Failed to reorder stages')
    }
  }

  const handleSave = async (id: string, name: string) => {
    const res = await fetch(`/api/pipeline/stages/${id}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ name }),
    })
    if (!res.ok) { toast.error('Failed to save stage'); return }
    const { data } = await res.json()
    setStages(prev => prev.map(s => s.id === id ? { ...s, ...data } : s))
    toast.success('Stage saved')
  }

  const handleDelete = async (id: string) => {
    setDeleteError(null)
    const res = await fetch(`/api/pipeline/stages/${id}`, { method: 'DELETE' })
    if (res.status === 409) {
      const body = await res.json()
      setDeleteError((body as { error?: string }).error ?? 'Cannot delete stage')
      return
    }
    if (!res.ok) { toast.error('Failed to delete stage'); return }
    setStages(prev => prev.filter(s => s.id !== id))
    toast.success('Stage deleted')
  }

  const handleAdd = async (name: string, color: string) => {
    const res = await fetch('/api/pipeline/stages', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ clientId, name, color }),
    })
    if (!res.ok) { toast.error('Failed to add stage'); return }
    const { data } = await res.json()
    setStages(prev => [...prev, data as PipelineStageRow])
    toast.success('Stage added')
  }

  return (
    <div>
      {deleteError && (
        <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
          {deleteError}
        </div>
      )}

      {stages.length === 0 ? (
        <p className="text-sm text-[var(--text-muted)] py-2">
          No stages yet. Add your first stage below.
        </p>
      ) : (
        <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
          <SortableContext
            items={stages.map(s => s.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-2">
              {stages.map(stage => (
                <StageRow
                  key={stage.id}
                  stage={stage}
                  onSave={handleSave}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      <AddStageForm onAdd={handleAdd} />
    </div>
  )
}
