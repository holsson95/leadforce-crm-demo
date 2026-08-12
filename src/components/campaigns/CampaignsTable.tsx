'use client'

import { useState } from 'react'
import { Plus, MoreHorizontal, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { CampaignModal } from './CampaignModal'
import { ArchiveDeleteModal } from './ArchiveDeleteModal'
import type { CampaignWithDetails, UserSummary } from '@/types/models'
import type { Client } from '@prisma/client'

const STATUS_STYLES: Record<string, string> = {
  draft:     'bg-gray-500/10 text-[var(--text-secondary)]',
  active:    'bg-emerald-500/10 text-emerald-400',
  paused:    'bg-[var(--lf-accent)]/10 text-amber-400',
  completed: 'bg-blue-500/10 text-blue-400',
}

interface CampaignsTableProps {
  campaigns: CampaignWithDetails[]
  clients: Pick<Client, 'id' | 'name'>[]
  sdrs: UserSummary[]
  canManage: boolean
}

export function CampaignsTable({ campaigns, clients, sdrs, canManage }: CampaignsTableProps) {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [selected, setSelected] = useState<CampaignWithDetails | null>(null)
  const [lifecycleModal, setLifecycleModal] = useState<{
    id: string
    name: string
    initialChoice: 'archive' | 'delete'
  } | null>(null)

  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'draft' | 'active' | 'paused' | 'completed'>('all')

  const filteredCampaigns = campaigns.filter((c) => {
    const matchesSearch = c.name.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesStatus = statusFilter === 'all' || c.status === statusFilter
    return matchesSearch && matchesStatus
  })

  const openEdit = (campaign: CampaignWithDetails) => {
    setSelected(campaign)
    setDrawerOpen(true)
  }
  const openCreate = () => {
    setSelected(null)
    setDrawerOpen(true)
  }

  return (
    <div className="glass-panel rounded-3xl overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--panel-border)]">
        <h2 className="text-sm font-semibold text-[var(--text-primary)]">
          All Campaigns
          <span className="ml-2 font-mono text-[10px] bg-[var(--accent-muted)] text-[var(--lf-accent)] px-2 py-0.5 rounded-full">
            {filteredCampaigns.length}
          </span>
        </h2>
        {canManage && (
          <Button
            type="button"
            onClick={openCreate}
            size="sm"
            className="bg-gradient-to-r from-[var(--lf-accent)] to-amber-600 text-black font-semibold rounded-xl hover:opacity-90"
          >
            <Plus className="w-4 h-4 mr-1.5" />
            New Campaign
          </Button>
        )}
      </div>

      {/* Filter row */}
      <div className="flex items-center gap-3 px-6 py-3 border-b border-[var(--panel-border)]">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--text-muted)] pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search campaigns…"
            className="w-full bg-[var(--panel-border)] border border-[var(--panel-border)] rounded-xl pl-8 pr-3 py-1.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--lf-accent)]/40 transition-colors"
          />
        </div>
        <div className="flex items-center gap-1.5">
          {(['all', 'draft', 'active', 'paused', 'completed'] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatusFilter(s)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold capitalize transition-colors ${
                statusFilter === s
                  ? 'bg-[var(--lf-accent)]/10 text-[var(--lf-accent)] border border-[var(--lf-accent)]/20'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--panel-border-hover)] border border-transparent'
              }`}
            >
              {s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-[2fr_1.5fr_100px_120px_100px_44px] gap-4 px-6 py-3 border-b border-[var(--panel-border)]">
        {['Name', 'Client', 'Status', 'SDRs', 'Target', ''].map((col) => (
          <span key={col} className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">{col}</span>
        ))}
      </div>

      {filteredCampaigns.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20">
          {campaigns.length === 0 ? (
            <>
              <p className="text-sm text-[var(--text-muted)] mb-4">No campaigns yet</p>
              {canManage && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={openCreate}
                  className="border-dashed border-[var(--panel-border)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:border-[var(--panel-border-hover)] rounded-xl"
                >
                  <Plus className="w-4 h-4 mr-1.5" />
                  Create your first campaign
                </Button>
              )}
            </>
          ) : (
            <p className="text-sm text-[var(--text-muted)]">No campaigns match your filters</p>
          )}
        </div>
      )}

      <div className="divide-y divide-[var(--panel-border)]">
        {filteredCampaigns.map((campaign) => {
          const visibleSdrs = campaign.sdrs.slice(0, 3)
          const overflowCount = campaign.sdrs.length - visibleSdrs.length

          return (
            <div
              key={campaign.id}
              onClick={() => canManage && openEdit(campaign)}
              className={`grid grid-cols-[2fr_1.5fr_100px_120px_100px_44px] gap-4 px-6 py-4 items-center transition-colors duration-200 ${
                canManage ? 'cursor-pointer hover:bg-white/[0.02]' : ''
              }`}
            >
              <span className="text-sm font-medium text-[var(--text-primary)] truncate">{campaign.name}</span>
              <span className="text-sm text-[var(--text-secondary)] truncate">{campaign.client.name}</span>
              <Badge className={`text-[10px] font-semibold uppercase border-0 w-fit ${STATUS_STYLES[campaign.status]}`}>
                {campaign.status}
              </Badge>
              <div className="flex items-center -space-x-2">
                {visibleSdrs.map((s) => (
                  <Avatar key={s.userId} className="w-7 h-7 rounded-full border border-dark">
                    <AvatarFallback className="text-[10px] bg-[var(--panel-border)] text-[var(--text-secondary)]">
                      {s.user.name.slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                ))}
                {overflowCount > 0 && (
                  <div className="w-7 h-7 rounded-full border border-dark bg-[var(--panel-border)] flex items-center justify-center">
                    <span className="text-[10px] text-[var(--text-secondary)] font-mono">+{overflowCount}</span>
                  </div>
                )}
                {campaign.sdrs.length === 0 && <span className="text-xs text-[var(--text-muted)]">—</span>}
              </div>
              <span className="font-mono text-sm text-[var(--text-secondary)]">{campaign.dailyTargetCalls ?? '—'}</span>
              {canManage ? (
                <DropdownMenu>
                  <DropdownMenuTrigger
                    className="w-8 h-8 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] flex items-center justify-center"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <MoreHorizontal className="w-4 h-4" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="rounded-xl border-[var(--panel-border)] bg-[var(--card-bg-solid)]">
                    <DropdownMenuItem
                      onClick={(e) => { e.stopPropagation(); openEdit(campaign) }}
                      className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] rounded-lg cursor-pointer"
                    >
                      Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={(e) => {
                        e.stopPropagation()
                        setLifecycleModal({ id: campaign.id, name: campaign.name, initialChoice: 'archive' })
                      }}
                      className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] rounded-lg cursor-pointer"
                    >
                      Archive
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={(e) => {
                        e.stopPropagation()
                        setLifecycleModal({ id: campaign.id, name: campaign.name, initialChoice: 'delete' })
                      }}
                      className="text-red-400 hover:text-red-300 focus:text-red-300 rounded-lg cursor-pointer"
                    >
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <div />
              )}
            </div>
          )
        })}
      </div>

      {canManage && (
        <CampaignModal
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          campaign={selected}
          clients={clients}
          sdrs={sdrs}
        />
      )}

      {lifecycleModal && (
        <ArchiveDeleteModal
          key={`${lifecycleModal.id}-${lifecycleModal.initialChoice}`}
          campaignId={lifecycleModal.id}
          campaignName={lifecycleModal.name}
          open={true}
          onClose={() => setLifecycleModal(null)}
          initialChoice={lifecycleModal.initialChoice}
        />
      )}
    </div>
  )
}
