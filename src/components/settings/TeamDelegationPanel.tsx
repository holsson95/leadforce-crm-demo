'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import {
  canEditUserRole,
  allowedRolesToAssign,
  canEditUserPermissions,
} from '@/lib/team-permissions'
import type { UserRole } from '@/lib/team-permissions'

type SdrPermission = {
  canManageCampaigns: boolean
  canAccessDashboard: boolean
  canWritePipeline:   boolean
}

type MemberRow = {
  id:            string
  name:          string
  email:         string
  role:          UserRole
  managerId:     string | null
  sdrPermission: SdrPermission | null
}

interface TeamDelegationPanelProps {
  initialMembers: MemberRow[]
  viewerRole:     'admin' | 'manager'
  viewerDbId:     string
}

type PermKey = keyof SdrPermission
type FilterRole = 'all' | 'admin' | 'manager' | 'sdr'

const ROLE_ORDER: Record<string, number> = { admin: 0, manager: 1, sdr: 2 }

const ROLE_LABELS: Record<string, string> = {
  admin:   'Admin',
  manager: 'Manager',
  sdr:     'SDR',
}

const TOGGLES: { key: PermKey; label: string; description: string }[] = [
  {
    key:         'canManageCampaigns',
    label:       'Campaign management',
    description: 'Can create and edit campaigns',
  },
  {
    key:         'canAccessDashboard',
    label:       'Dashboard access',
    description: 'Can view the main dashboard',
  },
  {
    key:         'canWritePipeline',
    label:       'Pipeline write',
    description: 'Can move deals between stages',
  },
]

const FILTER_PILLS: { label: string; value: FilterRole }[] = [
  { label: 'All',     value: 'all' },
  { label: 'Admin',   value: 'admin' },
  { label: 'Manager', value: 'manager' },
  { label: 'SDR',     value: 'sdr' },
]

function getPermValue(perm: SdrPermission | null, key: PermKey): boolean {
  if (!perm) return key === 'canAccessDashboard'
  return perm[key]
}

export function TeamDelegationPanel({
  initialMembers,
  viewerRole,
  viewerDbId,
}: TeamDelegationPanelProps) {
  const [members, setMembers]         = useState(initialMembers)
  const [saving, setSaving]           = useState<string | null>(null)
  const [filterRole, setFilterRole]   = useState<FilterRole>('all')
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole]   = useState<'sdr' | 'manager'>('sdr')
  const [inviting, setInviting]       = useState(false)

  const sorted = [...members].sort((a, b) => {
    const roleDiff = (ROLE_ORDER[a.role] ?? 99) - (ROLE_ORDER[b.role] ?? 99)
    return roleDiff !== 0 ? roleDiff : a.name.localeCompare(b.name)
  })

  const filtered =
    filterRole === 'all' ? sorted : sorted.filter(m => m.role === filterRole)

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!inviteEmail.trim()) return
    setInviting(true)
    try {
      const res = await fetch('/api/settings/invitation', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email: inviteEmail.trim(), role: inviteRole }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        toast.error((body as { error?: string }).error ?? 'Failed to send invite')
        return
      }
      toast.success(`Invite sent to ${inviteEmail.trim()}`)
      setInviteEmail('')
    } finally {
      setInviting(false)
    }
  }

  const handleRoleChange = async (userId: string, newRole: UserRole) => {
    const prev = members.find(m => m.id === userId)
    if (!prev) return
    setSaving(`${userId}-role`)
    setMembers(ms => ms.map(m => m.id === userId ? { ...m, role: newRole } : m))
    try {
      const res = await fetch(`/api/settings/delegation/${userId}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ role: newRole }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        toast.error((body as { error?: string }).error ?? 'Failed to update role')
        setMembers(ms => ms.map(m => m.id === userId ? prev : m))
        return
      }
      toast.success('Role updated')
    } finally {
      setSaving(null)
    }
  }

  const handleToggle = async (userId: string, key: PermKey, value: boolean) => {
    setSaving(`${userId}-${key}`)
    try {
      const res = await fetch(`/api/settings/delegation/${userId}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ [key]: value }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        toast.error((body as { error?: string }).error ?? 'Failed to save')
        return
      }
      setMembers(prev =>
        prev.map(m =>
          m.id === userId
            ? {
                ...m,
                sdrPermission: {
                  canManageCampaigns: getPermValue(m.sdrPermission, 'canManageCampaigns'),
                  canAccessDashboard: getPermValue(m.sdrPermission, 'canAccessDashboard'),
                  canWritePipeline:   getPermValue(m.sdrPermission, 'canWritePipeline'),
                  [key]: value,
                },
              }
            : m
        )
      )
      toast.success('Saved')
    } finally {
      setSaving(null)
    }
  }

  const inviteForm = (
    <form onSubmit={handleInvite} className="glass-panel rounded-2xl p-5">
      <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-3">
        Invite team member
      </p>
      <div className="flex gap-2">
        <input
          type="email"
          required
          placeholder="colleague@company.com"
          value={inviteEmail}
          onChange={e => setInviteEmail(e.target.value)}
          className="flex-1 bg-[var(--panel-border)] border border-[var(--panel-border)] rounded-xl px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--lf-accent)]"
        />
        {viewerRole === 'admin' && (
          <select
            value={inviteRole}
            onChange={e => setInviteRole(e.target.value as 'sdr' | 'manager')}
            className="bg-[var(--panel-border)] border border-[var(--panel-border)] rounded-xl px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--lf-accent)]"
          >
            <option value="sdr">SDR</option>
            <option value="manager">Manager</option>
          </select>
        )}
        <Button
          type="submit"
          size="sm"
          disabled={inviting || !inviteEmail.trim()}
          className="bg-[var(--accent-muted)] border border-[var(--accent-muted)] text-[var(--lf-accent)] hover:bg-[var(--accent-muted)] rounded-xl text-xs disabled:opacity-40"
        >
          {inviting ? 'Sending…' : 'Send Invite'}
        </Button>
      </div>
    </form>
  )

  return (
    <div className="space-y-4 max-w-2xl">
      {inviteForm}

      <div className="flex gap-2 flex-wrap">
        {FILTER_PILLS.map(pill => (
          <button
            key={pill.value}
            onClick={() => setFilterRole(pill.value)}
            className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
              filterRole === pill.value
                ? 'bg-[var(--accent-muted)] text-[var(--lf-accent)] border border-[var(--panel-border-hover)]'
                : 'bg-[var(--panel-border)] text-[var(--text-secondary)] border border-[var(--panel-border)] hover:bg-[var(--panel-border-hover)]'
            }`}
          >
            {pill.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="glass-panel rounded-2xl p-8 text-center">
          <p className="text-[var(--text-muted)] text-sm">No team members found.</p>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-[var(--text-muted)]">
            {viewerRole === 'admin'
              ? 'Edit any role inline. SDR permission toggles save automatically.'
              : 'Edit SDR roles inline. SDR permission toggles save automatically.'}
          </p>
          {filtered.map(member => {
            const canEditRole  = canEditUserRole(viewerRole, member.role)
            const roleOptions  = allowedRolesToAssign(viewerRole)
            const canEditPerms = canEditUserPermissions(
              viewerRole,
              member.role,
              member.managerId,
              viewerDbId,
            )
            return (
              <div key={member.id} className="glass-panel rounded-2xl p-5">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-8 h-8 rounded-xl bg-[var(--panel-border)] border border-[var(--panel-border)] flex items-center justify-center text-xs font-semibold text-[var(--text-secondary)]">
                    {member.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[var(--text-primary)]">{member.name}</p>
                    <p className="text-xs text-[var(--text-muted)]">{member.email}</p>
                  </div>
                  {canEditRole ? (
                    <select
                      value={member.role}
                      disabled={saving === `${member.id}-role`}
                      onChange={e => handleRoleChange(member.id, e.target.value as UserRole)}
                      className="bg-[var(--panel-border)] border border-[var(--panel-border)] rounded-lg px-2 py-1 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--lf-accent)] disabled:opacity-40 cursor-pointer"
                    >
                      {roleOptions.map(r => (
                        <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                      ))}
                      {!roleOptions.includes(member.role) && (
                        <option value={member.role}>{ROLE_LABELS[member.role]}</option>
                      )}
                    </select>
                  ) : (
                    <span className="px-2 py-1 rounded-lg text-xs font-medium bg-[var(--panel-border)] border border-[var(--panel-border)] text-[var(--text-secondary)]">
                      {ROLE_LABELS[member.role]}
                    </span>
                  )}
                </div>
                {member.role === 'sdr' && (
                  <div className="space-y-3 pt-1 border-t border-[var(--panel-border)]">
                    {TOGGLES.map(({ key, label, description }) => {
                      const savingKey = `${member.id}-${key}`
                      const checked   = getPermValue(member.sdrPermission, key)
                      return (
                        <div key={key} className="flex items-center justify-between gap-4 pt-3">
                          <div>
                            <Label className="text-sm text-[var(--text-secondary)]">{label}</Label>
                            <p className="text-[11px] text-[var(--text-muted)]">{description}</p>
                          </div>
                          <Switch
                            checked={checked}
                            disabled={!canEditPerms || saving === savingKey}
                            onCheckedChange={val => handleToggle(member.id, key, val)}
                            className="data-[checked]:bg-[var(--lf-accent)]"
                          />
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
