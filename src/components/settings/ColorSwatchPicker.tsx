'use client'

interface ColorSwatchPickerProps {
  value:    string
  onChange: (color: string) => void
}

export const STAGE_COLORS = [
  '#3b82f6', '#8b5cf6', '#06b6d4', '#f59e0b',
  '#22c55e', '#ef4444', '#ec4899', '#f97316',
  '#14b8a6', '#84cc16', '#6366f1', '#94a3b8',
]

export function ColorSwatchPicker({ value, onChange }: ColorSwatchPickerProps) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {STAGE_COLORS.map(color => (
        <button
          key={color}
          type="button"
          onClick={() => onChange(color)}
          className={`w-5 h-5 rounded-full transition-transform ${
            value === color
              ? 'ring-2 ring-[var(--text-primary)] ring-offset-1 ring-offset-[var(--bg-dark)] scale-110'
              : 'hover:scale-110'
          }`}
          style={{ backgroundColor: color }}
          aria-label={`Select color ${color}`}
        />
      ))}
    </div>
  )
}
