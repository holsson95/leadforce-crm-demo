'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Plus } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { ChevronDown, ChevronUp } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { createClient } from '@/app/(dashboard)/clients/actions'

type PortalPermissions = {
  viewPipeline: boolean
  movePipeline: boolean
  viewReports:  boolean
}

type ClientRow = {
  id:                string
  name:              string
  contactName:       string | null
  email:             string | null
  clerkId:           string | null
  portalPermissions: Partial<PortalPermissions> | PortalPermissions
}

interface PortalPermissionsPanelProps {
  clients: ClientRow[]
  isAdmin: boolean
}

const DEFAULT_PERMISSIONS: PortalPermissions = {
  viewPipeline: true,
  movePipeline: false,
  viewReports:  true,
}

const PERMISSION_TOGGLES: { key: keyof PortalPermissions; label: string }[] = [
  { key: 'viewPipeline', label: 'View pipeline' },
  { key: 'movePipeline', label: 'Move deals' },
  { key: 'viewReports',  label: 'View reports' },
]

function parsePermissions(raw: unknown): PortalPermissions {
  const p = raw as Partial<PortalPermissions> ?? {}
  return {
    viewPipeline: p.viewPipeline ?? DEFAULT_PERMISSIONS.viewPipeline,
    movePipeline: p.movePipeline ?? DEFAULT_PERMISSIONS.movePipeline,
    viewReports:  p.viewReports  ?? DEFAULT_PERMISSIONS.viewReports,
  }
}

const inputClass =
  'bg-[var(--panel-border)] border-[var(--panel-border)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--lf-accent)]/50 focus:ring-1 focus:ring-[var(--lf-accent)]/10 rounded-xl'

export function PortalPermissionsPanel({ clients, isAdmin }: PortalPermissionsPanelProps) {
  const [rows, setRows]             = useState(clients)
  const [inviting, setInviting]     = useState<string | null>(null)
  const [expanded, setExpanded]     = useState<string | null>(null)
  const [permSaving, setPermSaving] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [newName, setNewName]       = useState('')
  const [newEmail, setNewEmail]     = useState('')
  const [saving, setSaving]         = useState(false)

  const openDialog = () => {
    setNewName('')
    setNewEmail('')
    setDialogOpen(true)
  }

  const handleCreate = async () => {
    if (!newName.trim()) return
    setSaving(true)
    try {
      const client = await createClient({
        name:  newName.trim(),
        email: newEmail.trim() || undefined,
      })
      setRows(prev => [...prev, {
        id:                client.id,
        name:              client.name,
        contactName:       client.contactName,
        email:             client.email,
        clerkId:           client.clerkId,
        portalPermissions: {},
      }])
      setDialogOpen(false)
      toast.success('Client created')
    } catch {
      toast.error('Failed to create client')
    } finally {
      setSaving(false)
    }
  }

  const handleInvite = async (clientId: string, resend = false) => {
    setInviting(clientId)
    try {
      const url = `/api/clients/${clientId}/portal-invite${resend ? '?resend=true' : ''}`
      const res = await fetch(url, { method: 'POST' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        toast.error((body as { error?: string }).error ?? 'Failed to send invite')
        return
      }
      toast.success(resend ? 'Invite resent!' : 'Invite sent!')
    } finally {
      setInviting(null)
    }
  }

  const handlePermToggle = async (clientId: string, key: keyof PortalPermissions, value: boolean) => {
    setPermSaving(`${clientId}-${key}`)
    try {
      const client = rows.find(r => r.id === clientId)
      if (!client) return
      const current = parsePermissions(client.portalPermissions)
      const updated = { ...current, [key]: value }

      const res = await fetch(`/api/clients/${clientId}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ portalPermissions: updated }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        toast.error((body as { error?: string }).error ?? 'Failed to save')
        return
      }
      setRows(prev =>
        prev.map(r => r.id === clientId ? { ...r, portalPermissions: updated } : r)
      )
      toast.success('Saved')
    } finally {
      setPermSaving(null)
    }
  }

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="flex items-center justify-between">
        <p className="text-xs text-[var(--text-muted)]">Manage portal access and permissions for each client.</p>
        <Button
          type="button"
          size="sm"
          onClick={openDialog}
          className="bg-gradient-to-r from-[var(--lf-accent)] to-amber-600 text-black font-semibold rounded-xl hover:opacity-90"
        >
          <Plus className="w-3.5 h-3.5 mr-1.5" />
          New Client
        </Button>
      </div>

      {rows.length === 0 ? (
        <div className="glass-panel rounded-2xl p-10 flex flex-col items-center gap-4 text-center">
          <p className="text-[var(--text-muted)] text-sm">No clients yet.</p>
          <Button
            type="button"
            size="sm"
            onClick={openDialog}
            className="bg-gradient-to-r from-[var(--lf-accent)] to-amber-600 text-black font-semibold rounded-xl hover:opacity-90"
          >
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            Add your first client
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map(client => {
            const perms    = parsePermissions(client.portalPermissions)
            const isOpen   = expanded === client.id
            const hasEmail = !!client.email

            return (
              <div key={client.id} className="glass-panel rounded-2xl overflow-hidden">
                <div className="flex items-center justify-between p-4">
                  <div>
                    <p className="text-sm font-medium text-[var(--text-primary)]">{client.name}</p>
                    {client.contactName && (
                      <p className="text-xs text-[var(--text-muted)]">{client.contactName}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    {client.clerkId ? (
                      <>
                        <Badge className="bg-emerald-500/10 text-emerald-400 border-0 text-[10px]">Active</Badge>
                        <Button
                          type="button"
                          size="sm"
                          disabled={inviting === client.id}
                          onClick={() => handleInvite(client.id, true)}
                          className="bg-[var(--panel-border)] border border-[var(--panel-border)] text-[var(--text-secondary)] hover:bg-[var(--panel-border-hover)] rounded-xl text-xs disabled:opacity-40"
                        >
                          {inviting === client.id ? 'Sending…' : 'Resend'}
                        </Button>
                      </>
                    ) : hasEmail ? (
                      <Button
                        type="button"
                        size="sm"
                        disabled={inviting === client.id}
                        onClick={() => handleInvite(client.id)}
                        className="bg-[var(--panel-border)] border border-[var(--panel-border)] text-[var(--text-secondary)] hover:bg-[var(--panel-border-hover)] rounded-xl text-xs disabled:opacity-40"
                      >
                        {inviting === client.id ? 'Sending…' : 'Send Invite'}
                      </Button>
                    ) : (
                      <span className="text-xs text-amber-400/70">Add email first</span>
                    )}
                    {isAdmin && client.clerkId && (
                      <button
                        type="button"
                        onClick={() => setExpanded(isOpen ? null : client.id)}
                        className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                      >
                        {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </button>
                    )}
                  </div>
                </div>

                {isAdmin && isOpen && client.clerkId && (
                  <div className="border-t border-[var(--panel-border)] px-4 pb-4 pt-3 space-y-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">Portal permissions</p>
                    {PERMISSION_TOGGLES.map(({ key, label }) => (
                      <div key={key} className="flex items-center justify-between">
                        <Label className="text-sm text-[var(--text-secondary)]">{label}</Label>
                        <Switch
                          checked={perms[key]}
                          disabled={permSaving === `${client.id}-${key}`}
                          onCheckedChange={(val) => handlePermToggle(client.id, key, val)}
                          className="data-[checked]:bg-[var(--lf-accent)]"
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={(v) => !v && setDialogOpen(false)}>
        <DialogContent className="glass-panel border-[var(--panel-border)] max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-[var(--text-primary)]">New Client</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-1">
            <div className="space-y-1.5">
              <Label className="text-xs text-[var(--text-secondary)]">Company Name *</Label>
              <Input
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="Acme Corporation"
                className={inputClass}
                onKeyDown={e => e.key === 'Enter' && handleCreate()}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-[var(--text-secondary)]">Email <span className="text-[var(--text-muted)]">(needed to send portal invite)</span></Label>
              <Input
                value={newEmail}
                onChange={e => setNewEmail(e.target.value)}
                type="email"
                placeholder="contact@acme.com"
                className={inputClass}
                onKeyDown={e => e.key === 'Enter' && handleCreate()}
              />
            </div>
          </div>
          <div className="flex gap-3 justify-end mt-2">
            <Button
              variant="ghost"
              onClick={() => setDialogOpen(false)}
              disabled={saving}
              className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] rounded-xl"
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              disabled={saving || !newName.trim()}
              className="bg-gradient-to-r from-[var(--lf-accent)] to-amber-600 text-black font-semibold rounded-xl hover:opacity-90 disabled:opacity-40"
            >
              {saving ? 'Creating…' : 'Create Client'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
