'use client'

import { UserButton } from '@clerk/nextjs'
import { HeaderSearch } from '@/components/layout/HeaderSearch'
import { DemoTenantSwitcher } from '@/components/shared/DemoTenantSwitcher'
import { DemoRoleSwitcher } from '@/components/shared/DemoRoleSwitcher'

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
        <DemoTenantSwitcher />
        <DemoRoleSwitcher />
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
