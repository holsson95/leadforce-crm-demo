'use client'

import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'

interface PermissionToggleRowProps {
  label:       string
  description?: string
  checked:     boolean
  inherited:   boolean
  saving:      boolean
  onChange:    (value: boolean) => void
}

export function PermissionToggleRow({
  label,
  description,
  checked,
  inherited,
  saving,
  onChange,
}: PermissionToggleRowProps) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-[var(--panel-border)] last:border-0">
      <div className="flex-1 min-w-0 pr-4">
        <div className="flex items-center gap-2">
          <span className="text-sm text-[var(--text-primary)]">{label}</span>
          {inherited && (
            <Badge variant="outline" className="text-[10px] text-[var(--text-muted)] border-[var(--panel-border)] px-1.5 py-0">
              Inherited
            </Badge>
          )}
        </div>
        {description && (
          <p className="text-xs text-[var(--text-muted)] mt-0.5">{description}</p>
        )}
      </div>
      <Switch
        checked={checked}
        onCheckedChange={onChange}
        disabled={saving}
        className={inherited ? 'opacity-60' : ''}
      />
    </div>
  )
}
