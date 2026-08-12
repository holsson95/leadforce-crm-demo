'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'
import { ColorSwatchPicker, STAGE_COLORS } from './ColorSwatchPicker'

interface AddStageFormProps {
  onAdd: (name: string, color: string) => Promise<void>
}

export function AddStageForm({ onAdd }: AddStageFormProps) {
  const [open,   setOpen]   = useState(false)
  const [name,   setName]   = useState('')
  const [color,  setColor]  = useState(STAGE_COLORS[0])
  const [saving, setSaving] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    setSaving(true)
    await onAdd(trimmed, color)
    setSaving(false)
    setName('')
    setColor(STAGE_COLORS[0])
    setOpen(false)
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 mt-3 text-xs text-[var(--text-muted)] hover:text-[var(--lf-accent)] transition-colors"
      >
        <Plus className="w-3.5 h-3.5" />
        Add stage
      </button>
    )
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-3 p-4 rounded-xl bg-[var(--panel-border)] border border-[var(--panel-border)] space-y-3"
    >
      <input
        autoFocus
        value={name}
        onChange={e => setName(e.target.value)}
        placeholder="Stage name"
        className="w-full bg-[var(--panel-border)] border border-[var(--panel-border)] rounded-xl px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--lf-accent)]"
      />
      <ColorSwatchPicker value={color} onChange={setColor} />
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={!name.trim() || saving}
          className="px-4 py-1.5 rounded-xl bg-gradient-to-r from-[var(--lf-accent)] to-amber-600 text-black text-xs font-semibold disabled:opacity-50"
        >
          {saving ? 'Adding…' : 'Add stage'}
        </button>
        <button
          type="button"
          onClick={() => { setOpen(false); setName(''); setColor(STAGE_COLORS[0]) }}
          className="px-4 py-1.5 rounded-xl bg-[var(--panel-border)] text-[var(--text-secondary)] text-xs hover:text-[var(--text-primary)] transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}
