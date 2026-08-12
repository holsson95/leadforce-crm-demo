'use client'

import { UserButton } from '@clerk/nextjs'
import { ThemeToggle } from '@/components/shared/ThemeToggle'

interface PortalHeaderProps {
  clientName: string
}

export function PortalHeader({ clientName }: PortalHeaderProps) {
  return (
    <header className="flex-shrink-0 h-20 sticky top-0 z-10 flex items-center justify-between px-8 border-b border-[var(--panel-border)] bg-[var(--bg-dark)]">
      <div className="flex items-center gap-3">
        <span className="font-bold text-[var(--text-primary)] text-lg tracking-tight">
          Lead<span className="text-[var(--lf-accent)]">Force</span>
        </span>
        <span className="w-px h-5 bg-[var(--panel-border)]" />
        <span className="text-sm text-[var(--text-secondary)] truncate max-w-xs">{clientName}</span>
      </div>
      <div className="flex items-center gap-3">
        <ThemeToggle />
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
