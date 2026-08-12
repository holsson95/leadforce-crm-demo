'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { PermissionToggleRow } from './PermissionToggleRow'

type Override = {
  id:          string
  subjectType: string
  subjectId:   string
  permission:  string
  granted:     boolean
}

type Member = {
  id:    string
  name:  string
  email: string
  role:  'manager' | 'sdr'
}

interface PermissionsPanelProps {
  members:   Member[]
  overrides: Override[]
}

const ROLE_DEFAULTS: Record<string, boolean> = {
  manager: true,
  sdr:     false,
}

function findOverride(overrides: Override[], subjectType: string, subjectId: string) {
  return overrides.find(
    o => o.subjectType === subjectType && o.subjectId === subjectId && o.permission === 'pipeline:write'
  ) ?? null
}

export function PermissionsPanel({ members, overrides: initialOverrides }: PermissionsPanelProps) {
  const [overrides, setOverrides] = useState(initialOverrides)
  const [saving,    setSaving]    = useState<string | null>(null)

  const upsert = async (key: string, subjectType: 'user' | 'role', subjectId: string, granted: boolean) => {
    setSaving(key)
    try {
      const res = await fetch('/api/settings/permissions', {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ subjectType, subjectId, permission: 'pipeline:write', granted }),
      })
      if (!res.ok) { toast.error('Failed to save permission'); return }
      const { data } = await res.json()
      setOverrides(prev => {
        const without = prev.filter(
          o => !(o.subjectType === subjectType && o.subjectId === subjectId && o.permission === 'pipeline:write')
        )
        return [...without, data as Override]
      })
      toast.success('Saved')
    } finally {
      setSaving(null)
    }
  }

  const remove = async (key: string, overrideId: string, subjectType: string, subjectId: string) => {
    setSaving(key)
    try {
      const res = await fetch(`/api/settings/permissions/${overrideId}`, { method: 'DELETE' })
      if (!res.ok) { toast.error('Failed to reset permission'); return }
      setOverrides(prev =>
        prev.filter(
          o => !(o.subjectType === subjectType && o.subjectId === subjectId && o.permission === 'pipeline:write')
        )
      )
      toast.success('Reset to default')
    } finally {
      setSaving(null)
    }
  }

  const handleRoleToggle = async (roleId: string, newValue: boolean) => {
    const existing = findOverride(overrides, 'role', roleId)
    const inherited = ROLE_DEFAULTS[roleId] ?? false
    if (existing && newValue === inherited) {
      await remove(`role-${roleId}`, existing.id, 'role', roleId)
    } else {
      await upsert(`role-${roleId}`, 'role', roleId, newValue)
    }
  }

  const handleMemberToggle = async (member: Member, newValue: boolean) => {
    const roleOverride = findOverride(overrides, 'role', member.role)
    const inherited    = roleOverride?.granted ?? ROLE_DEFAULTS[member.role] ?? false
    const existing     = findOverride(overrides, 'user', member.id)

    if (existing && newValue === inherited) {
      await remove(`user-${member.id}`, existing.id, 'user', member.id)
    } else {
      await upsert(`user-${member.id}`, 'user', member.id, newValue)
    }
  }

  const resolveRole = (roleId: string) => {
    const override = findOverride(overrides, 'role', roleId)
    return { granted: override?.granted ?? ROLE_DEFAULTS[roleId] ?? false, hasOverride: !!override }
  }

  const resolveMember = (member: Member) => {
    const roleResolved = resolveRole(member.role)
    const userOverride = findOverride(overrides, 'user', member.id)
    return {
      granted:     userOverride?.granted ?? roleResolved.granted,
      inherited:   !userOverride,
    }
  }

  const managers = members.filter(m => m.role === 'manager')
  const sdrs      = members.filter(m => m.role === 'sdr')

  return (
    <div className="space-y-8">
      {/* Role Defaults */}
      <div className="glass-panel rounded-2xl p-5">
        <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-4">
          Role Defaults
        </p>
        <p className="text-xs text-[var(--text-muted)] mb-4">
          These apply to all members of a role unless overridden individually below.
        </p>
        {(['manager', 'sdr'] as const).map(roleId => {
          const { granted } = resolveRole(roleId)
          const key = `role-${roleId}`
          return (
            <PermissionToggleRow
              key={roleId}
              label={`${roleId === 'manager' ? 'Managers' : 'SDRs'} can edit pipeline stages`}
              checked={granted}
              inherited={false}
              saving={saving === key}
              onChange={v => handleRoleToggle(roleId, v)}
            />
          )
        })}
      </div>

      {/* Member Overrides */}
      <div className="glass-panel rounded-2xl p-5">
        <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-4">
          Member Overrides
        </p>
        {members.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)]">No team members to configure.</p>
        ) : (
          <div>
            {[...managers, ...sdrs].map(member => {
              const { granted, inherited } = resolveMember(member)
              const key = `user-${member.id}`
              return (
                <PermissionToggleRow
                  key={member.id}
                  label={member.name}
                  description={`${member.email} · ${member.role}`}
                  checked={granted}
                  inherited={inherited}
                  saving={saving === key}
                  onChange={v => handleMemberToggle(member, v)}
                />
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
