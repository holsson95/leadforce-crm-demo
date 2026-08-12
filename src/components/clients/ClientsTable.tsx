'use client'

import { useState } from 'react'
import { Plus, MoreHorizontal } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ClientDrawer } from './ClientDrawer'
import { deleteClient } from '@/app/(dashboard)/clients/actions'
import type { ClientWithCampaignCount } from '@/types/models'

interface ClientsTableProps {
  clients: ClientWithCampaignCount[]
}

export function ClientsTable({ clients }: ClientsTableProps) {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [selected, setSelected] = useState<ClientWithCampaignCount | null>(null)
  const [invitingId, setInvitingId] = useState<string | null>(null)
  const [sentIds, setSentIds]       = useState<Set<string>>(new Set())

  const openEdit = (client: ClientWithCampaignCount) => {
    setSelected(client)
    setDrawerOpen(true)
  }

  const openCreate = () => {
    setSelected(null)
    setDrawerOpen(true)
  }

  const handleSendInvite = async (client: ClientWithCampaignCount, e: React.MouseEvent) => {
    e.stopPropagation()
    setInvitingId(client.id)
    try {
      const res = await fetch(`/api/clients/${client.id}/portal-invite`, { method: 'POST' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        toast.error((body as { error?: string }).error ?? 'Failed to send invite')
      } else {
        setSentIds((prev) => new Set(prev).add(client.id))
        toast.success('Portal invite sent!')
      }
    } finally {
      setInvitingId(null)
    }
  }

  return (
    <>
    <div className="glass-panel rounded-3xl overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--panel-border)]">
        <h2 className="text-sm font-semibold text-[var(--text-primary)]">
          All Clients
          <span className="ml-2 font-mono text-[10px] bg-[var(--accent-muted)] text-[var(--lf-accent)] px-2 py-0.5 rounded-full">
            {clients.length}
          </span>
        </h2>
        <Button
          type="button"
          onClick={openCreate}
          size="sm"
          className="bg-gradient-to-r from-[var(--lf-accent)] to-amber-600 text-black font-semibold rounded-xl hover:opacity-90"
        >
          <Plus className="w-4 h-4 mr-1.5" />
          New Client
        </Button>
      </div>

      <div className="grid grid-cols-[2fr_1.5fr_2fr_100px_44px] gap-4 px-6 py-3 border-b border-[var(--panel-border)]">
        {['Name', 'Contact', 'Email', 'Campaigns', ''].map((col) => (
          <span key={col} className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
            {col}
          </span>
        ))}
      </div>

      {clients.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20">
          <p className="text-sm text-[var(--text-muted)] mb-4">No clients yet</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={openCreate}
            className="border-dashed border-[var(--panel-border)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:border-[var(--panel-border-hover)] rounded-xl"
          >
            <Plus className="w-4 h-4 mr-1.5" />
            Add your first client
          </Button>
        </div>
      )}

      <div className="divide-y divide-[var(--panel-border)]">
        {clients.map((client) => (
          <div
            key={client.id}
            onClick={() => openEdit(client)}
            className="grid grid-cols-[2fr_1.5fr_2fr_100px_44px] gap-4 px-6 py-4 items-center cursor-pointer hover:bg-white/[0.02] transition-colors duration-200"
          >
            <span className="text-sm font-medium text-[var(--text-primary)] truncate">{client.name}</span>
            <span className="text-sm text-[var(--text-secondary)] truncate">{client.contactName ?? '—'}</span>
            <span className="text-sm text-[var(--text-secondary)] truncate">{client.email ?? '—'}</span>
            <Badge className="font-mono text-[10px] bg-[var(--accent-muted)] text-[var(--lf-accent)] border-0 w-fit">
              {client._count.campaigns}
            </Badge>
            <DropdownMenu>
              <DropdownMenuTrigger
                className="w-8 h-8 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] flex items-center justify-center"
                onClick={(e) => e.stopPropagation()}
              >
                <MoreHorizontal className="w-4 h-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="rounded-xl border-[var(--panel-border)] bg-[var(--card-bg-solid)]"
              >
                <DropdownMenuItem
                  onClick={(e) => { e.stopPropagation(); openEdit(client) }}
                  className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] rounded-lg cursor-pointer"
                >
                  Edit
                </DropdownMenuItem>
                {!client.clerkId && client.email && (
                  <DropdownMenuItem
                    onClick={(e) => handleSendInvite(client, e)}
                    disabled={invitingId === client.id || sentIds.has(client.id)}
                    className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] rounded-lg cursor-pointer"
                  >
                    {sentIds.has(client.id) ? 'Invite Sent ✓' : invitingId === client.id ? 'Sending…' : 'Send Portal Invite'}
                  </DropdownMenuItem>
                )}
                {client.clerkId && (
                  <DropdownMenuItem disabled className="text-emerald-400 rounded-lg text-xs">
                    Portal Active
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem
                  onClick={async (e) => {
                    e.stopPropagation()
                    if (!window.confirm(`Delete ${client.name}?`)) return
                    await deleteClient(client.id)
                  }}
                  className="text-red-400 hover:text-red-300 focus:text-red-300 rounded-lg cursor-pointer"
                >
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ))}
      </div>

    </div>
    <ClientDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} client={selected} />
    </>
  )
}
