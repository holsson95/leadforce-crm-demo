'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, Target, Users, PhoneCall, Kanban,
  BarChart3, Settings, ChevronLeft, Building2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useUIStore } from '@/stores/ui-store'
import type { DailyTargetStats } from '@/types/models'

const NAV_ITEMS = [
  { href: '/',          label: 'Dashboard', icon: LayoutDashboard, roles: null },
  { href: '/clients',   label: 'Clients',   icon: Building2,       roles: ['admin', 'manager'] },
  { href: '/campaigns', label: 'Campaigns', icon: Target,          roles: null },
  { href: '/contacts',  label: 'Contacts',  icon: Users,           roles: null },
  { href: '/calling',   label: 'Calling',   icon: PhoneCall,       roles: null },
  { href: '/pipeline',  label: 'Pipeline',  icon: Kanban,          roles: null },
  { href: '/reports',   label: 'Reports',   icon: BarChart3,       roles: null },
]

interface SidebarProps {
  dailyStats: DailyTargetStats
  logoUrl?: string | null
  role?: string
  pendingPipelineCount?: number
}

export function Sidebar({ dailyStats, logoUrl, role = '', pendingPipelineCount = 0 }: SidebarProps) {
  const pathname = usePathname()
  const { sidebarCollapsed, toggleSidebar } = useUIStore()
  const pct = dailyStats.target > 0
    ? Math.min(100, Math.round((dailyStats.count / dailyStats.target) * 100))
    : 0

  return (
    <aside
      className={cn(
        'flex flex-col h-screen flex-shrink-0 transition-all duration-300 border-r border-[var(--panel-border)] bg-[var(--bg-dark)]',
        sidebarCollapsed ? 'w-16' : 'w-64'
      )}
    >
      <div className={cn('flex items-center p-6 flex-shrink-0', sidebarCollapsed && 'justify-center px-0')}>
        {logoUrl ? (
          <img
            src={logoUrl}
            alt="Company logo"
            className="w-8 h-8 rounded-xl object-contain flex-shrink-0"
          />
        ) : (
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#fbbf24] to-[#f59e0b] flex-shrink-0" />
        )}
        {!sidebarCollapsed && (
          <span className="ml-3 text-xl font-bold bg-gradient-to-r from-[var(--text-primary)] to-[var(--text-secondary)] bg-clip-text text-transparent select-none">
            LeadForce
          </span>
        )}
      </div>

      <nav className="flex-1 px-4 mt-2 space-y-0.5 overflow-y-auto custom-scrollbar">
        {NAV_ITEMS.filter(item => !item.roles || item.roles.includes(role)).map(({ href, label, icon: Icon }) => {
          const active      = href === '/' ? pathname === '/' : pathname.startsWith(href)
          const isPipeline  = href === '/pipeline'
          const showBadge   = isPipeline && pendingPipelineCount > 0
          return (
            <Link
              key={href}
              href={href}
              title={sidebarCollapsed ? label : undefined}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-colors duration-200',
                active
                  ? 'bg-[var(--panel-border-hover)] text-[var(--lf-accent)]'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--panel-border-hover)]',
                sidebarCollapsed && 'justify-center px-0'
              )}
            >
              <div className="relative flex-shrink-0">
                <Icon className="w-5 h-5" />
                {showBadge && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[var(--lf-accent)] text-[9px] font-bold text-black flex items-center justify-center">
                    {pendingPipelineCount > 9 ? '9+' : pendingPipelineCount}
                  </span>
                )}
              </div>
              {!sidebarCollapsed && <span>{label}</span>}
            </Link>
          )
        })}
      </nav>

      {!sidebarCollapsed && (
        <div className="mx-4 mb-4 glass-panel rounded-2xl p-4">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-3">Daily Target</p>
          <div className="flex items-end justify-between mb-2">
            <span className="font-mono text-2xl font-semibold text-[var(--text-primary)]">{dailyStats.count}</span>
            <span className="font-mono text-sm text-[var(--text-muted)]">
              / {dailyStats.target > 0 ? dailyStats.target : '—'}
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-[var(--panel-border-hover)]">
            <div
              className="h-1.5 rounded-full bg-[var(--lf-accent)] transition-all duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
          {dailyStats.target > 0 && (
            <p className="text-[10px] text-[var(--text-muted)] mt-2">{pct}% of today's target</p>
          )}
        </div>
      )}

      <div className="border-t border-[var(--panel-border)] p-4 space-y-0.5 flex-shrink-0">
        <Link
          href="/settings"
          title={sidebarCollapsed ? 'Settings' : undefined}
          className={cn(
            'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--panel-border-hover)] transition-colors duration-200',
            sidebarCollapsed && 'justify-center px-0'
          )}
        >
          <Settings className="w-5 h-5 flex-shrink-0" />
          {!sidebarCollapsed && <span>Settings</span>}
        </Link>
        <button
          type="button"
          onClick={toggleSidebar}
          title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className={cn(
            'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--panel-border-hover)] w-full transition-colors duration-200',
            sidebarCollapsed && 'justify-center px-0'
          )}
        >
          <ChevronLeft className={cn('w-5 h-5 flex-shrink-0 transition-transform duration-300', sidebarCollapsed && 'rotate-180')} />
          {!sidebarCollapsed && <span>Collapse</span>}
        </button>
      </div>
    </aside>
  )
}
