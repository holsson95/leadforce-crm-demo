'use client'

import { Bell, Building2 } from 'lucide-react'
import { UserButton } from '@clerk/nextjs'
import { ThemeToggle } from '@/components/shared/ThemeToggle'
import { HeaderSearch } from '@/components/layout/HeaderSearch'

interface HeaderProps {
  title: string
  subtitle?: string
}

export function Header({ title, subtitle }: HeaderProps) {
  return (
    <header className="flex-shrink-0 h-20 sticky top-0 z-10 flex items-center justify-between px-8 border-b border-[var(--panel-border)] bg-[var(--bg-dark)]">
      <div>
        <h1 className="text-xl font-semibold text-[var(--text-primary)]">{title}</h1>
        {subtitle && <p className="text-xs text-[var(--text-muted)] mt-0.5">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-4">
        <HeaderSearch />
        <button
          type="button"
          className="flex items-center gap-2 px-4 py-2 rounded-full border border-[var(--panel-border)] text-sm text-[var(--text-secondary)] hover:border-[var(--panel-border-hover)] transition-colors duration-200 bg-[var(--bg-dark)]"
        >
          <Building2 className="w-4 h-4 text-[var(--text-muted)]" />
          <span>My Organisation</span>
        </button>
        <ThemeToggle />
        <div className="relative">
          <button type="button" aria-label="Notifications" className="w-9 h-9 rounded-xl flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--panel-border-hover)] transition-colors duration-200">
            <Bell className="w-5 h-5" />
          </button>
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full border-2 border-[var(--bg-dark)]" />
        </div>
        <UserButton
          appearance={{
            elements: {
              avatarBox: 'w-9 h-9 rounded-xl',
              userButtonPopoverCard: 'glass-panel border border-[var(--panel-border)] rounded-2xl',
              userButtonPopoverActionButton: 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--panel-border-hover)] rounded-xl',
              userButtonPopoverActionButtonText: 'text-sm',
            },
          }}
        />
      </div>
    </header>
  )
}
