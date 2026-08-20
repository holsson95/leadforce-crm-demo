'use client'

import { useEffect, useState } from 'react'
import { Building2, ChevronDown } from 'lucide-react'

interface DemoTenant {
  id:   string
  name: string
  slug: string
}

export function DemoTenantSwitcher() {
  const [tenants, setTenants] = useState<DemoTenant[]>([])
  const [activeTenantId, setActiveTenantId] = useState<string | null>(null)
  const [visible, setVisible] = useState(false)
  const [open, setOpen] = useState(false)
  const [switching, setSwitching] = useState(false)

  useEffect(() => {
    fetch('/api/demo/switch-tenant')
      .then(res => res.json())
      .then(({ data }) => {
        if (!data?.isDemoUser) return
        setTenants(data.tenants ?? [])
        setActiveTenantId(data.activeTenantId ?? null)
        setVisible(true)
      })
      .catch(() => {})
  }, [])

  if (!visible) return null

  async function switchTo(tenantId: string) {
    if (tenantId === activeTenantId) {
      setOpen(false)
      return
    }
    setSwitching(true)
    setOpen(false)
    const res = await fetch('/api/demo/switch-tenant', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ tenantId }),
    })
    if (res.ok) {
      window.location.reload()
    } else {
      setSwitching(false)
    }
  }

  const active = tenants.find(t => t.id === activeTenantId)

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        disabled={switching}
        className="flex items-center gap-2 px-4 py-2 rounded-full border border-[var(--panel-border)] text-sm text-[var(--text-secondary)] hover:border-[var(--panel-border-hover)] transition-colors duration-200 bg-[var(--bg-dark)] disabled:opacity-50"
      >
        <Building2 className="w-4 h-4 text-[var(--text-muted)]" />
        <span>{switching ? 'Switching…' : (active?.name ?? 'Demo tenant')}</span>
        <ChevronDown className="w-3.5 h-3.5 text-[var(--text-muted)]" />
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-60 rounded-2xl border border-[var(--panel-border)] bg-[var(--bg-dark)] shadow-xl overflow-hidden z-20">
          <div className="px-3 py-2 text-[10px] uppercase tracking-wide text-[var(--text-muted)] border-b border-[var(--panel-border)]">
            Viewing as (demo tenant)
          </div>
          {tenants.map(t => (
            <button
              key={t.id}
              type="button"
              onClick={() => switchTo(t.id)}
              className={`w-full text-left px-3 py-2 text-sm hover:bg-[var(--panel-border-hover)] transition-colors ${
                t.id === activeTenantId ? 'text-[var(--lf-accent)]' : 'text-[var(--text-secondary)]'
              }`}
            >
              {t.name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
