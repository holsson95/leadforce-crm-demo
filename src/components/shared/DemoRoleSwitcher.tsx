'use client'

import { useEffect, useState } from 'react'
import { UserCog, ChevronDown } from 'lucide-react'

const ROLE_LABELS: Record<string, string> = {
  admin:   'Admin',
  manager: 'Manager',
  sdr:     'SDR',
  client:  'Client portal',
}

export function DemoRoleSwitcher() {
  const [roles, setRoles] = useState<string[]>([])
  const [activeRole, setActiveRole] = useState<string | null>(null)
  const [visible, setVisible] = useState(false)
  const [open, setOpen] = useState(false)
  const [switching, setSwitching] = useState(false)

  useEffect(() => {
    fetch('/api/demo/switch-role')
      .then(res => res.json())
      .then(({ data }) => {
        if (!data?.isDemoUser) return
        setRoles(data.roles ?? [])
        setActiveRole(data.activeRole ?? null)
        setVisible(true)
      })
      .catch(() => {})
  }, [])

  if (!visible) return null

  async function switchTo(role: string) {
    if (role === activeRole) {
      setOpen(false)
      return
    }
    setSwitching(true)
    setOpen(false)
    const res = await fetch('/api/demo/switch-role', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ role }),
    })
    if (res.ok) {
      window.location.assign(role === 'client' ? '/client-portal' : '/')
    } else {
      setSwitching(false)
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        disabled={switching}
        className="flex items-center gap-2 px-4 py-2 rounded-full border border-[var(--panel-border)] text-sm text-[var(--text-secondary)] hover:border-[var(--panel-border-hover)] transition-colors duration-200 bg-[var(--bg-dark)] disabled:opacity-50"
      >
        <UserCog className="w-4 h-4 text-[var(--text-muted)]" />
        <span>{switching ? 'Switching…' : (activeRole ? ROLE_LABELS[activeRole] ?? activeRole : 'Demo role')}</span>
        <ChevronDown className="w-3.5 h-3.5 text-[var(--text-muted)]" />
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-48 rounded-2xl border border-[var(--panel-border)] bg-[var(--bg-dark)] shadow-xl overflow-hidden z-20">
          <div className="px-3 py-2 text-[10px] uppercase tracking-wide text-[var(--text-muted)] border-b border-[var(--panel-border)]">
            Viewing as (demo role)
          </div>
          {roles.map(r => (
            <button
              key={r}
              type="button"
              onClick={() => switchTo(r)}
              className={`w-full text-left px-3 py-2 text-sm hover:bg-[var(--panel-border-hover)] transition-colors ${
                r === activeRole ? 'text-[var(--lf-accent)]' : 'text-[var(--text-secondary)]'
              }`}
            >
              {ROLE_LABELS[r] ?? r}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
