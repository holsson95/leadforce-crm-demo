'use client'

import { useState, useRef, useEffect } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, Trash2 } from 'lucide-react'
import type { PipelineStageRow } from '@/types/models'

interface StageRowProps {
  stage:    PipelineStageRow
  onSave:   (id: string, name: string) => Promise<void>
  onDelete: (id: string) => Promise<void>
}

export function StageRow({ stage, onSave, onDelete }: StageRowProps) {
  const [editing, setEditing] = useState(false)
  const [name,    setName]    = useState(stage.name)
  const [saving,  setSaving]  = useState(false)
  const inputRef              = useRef<HTMLInputElement>(null)

  const {
    attributes, listeners, setNodeRef,
    transform, transition, isDragging,
  } = useSortable({ id: stage.id })

  const style = {
    transform:  CSS.Transform.toString(transform),
    transition,
    opacity:    isDragging ? 0.5 : 1,
  }

  useEffect(() => {
    if (editing) inputRef.current?.focus()
  }, [editing])

  const handleSaveName = async () => {
    const trimmed = name.trim()
    if (!trimmed) { setName(stage.name); setEditing(false); return }
    if (trimmed === stage.name) { setEditing(false); return }
    setSaving(true)
    await onSave(stage.id, trimmed)
    setSaving(false)
    setEditing(false)
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-[var(--panel-border)] border border-[var(--panel-border)] group"
    >
      <button
        {...attributes}
        {...listeners}
        className="text-[var(--text-muted)] hover:text-[var(--text-secondary)] cursor-grab active:cursor-grabbing touch-none flex-shrink-0"
        aria-label="Drag to reorder"
      >
        <GripVertical className="w-4 h-4" />
      </button>

      <span
        className="w-3 h-3 rounded-full flex-shrink-0"
        style={{ backgroundColor: stage.color }}
      />

      {editing ? (
        <input
          ref={inputRef}
          value={name}
          onChange={e => setName(e.target.value)}
          onBlur={handleSaveName}
          onKeyDown={e => {
            if (e.key === 'Enter') handleSaveName()
            if (e.key === 'Escape') { setName(stage.name); setEditing(false) }
          }}
          disabled={saving}
          className="flex-1 bg-[var(--panel-border)] border border-[var(--panel-border-hover)] rounded-lg px-2 py-0.5 text-sm text-[var(--text-primary)] focus:outline-none"
        />
      ) : (
        <span
          onClick={() => setEditing(true)}
          className="flex-1 text-sm text-[var(--text-primary)] cursor-text hover:text-[var(--lf-accent)] transition-colors"
        >
          {stage.name}
        </span>
      )}

      <button
        onClick={() => onDelete(stage.id)}
        className="opacity-0 group-hover:opacity-100 text-[var(--text-muted)] hover:text-red-400 transition-all flex-shrink-0"
        aria-label={`Delete ${stage.name}`}
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}
