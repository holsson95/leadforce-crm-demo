'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Building2, Phone, Users, Globe, User, Kanban, Shield } from 'lucide-react'
import { cn } from '@/lib/utils'

export type SettingsSection = {
  href: string
  label: string
  icon: React.ElementType
}

const ALL_SECTIONS: SettingsSection[] = [
  { href: '/settings/company',     label: 'Company',          icon: Building2 },
  { href: '/settings/dialer',      label: 'Dialer Thresholds', icon: Phone     },
  { href: '/settings/team',        label: 'Team',             icon: Users     },
  { href: '/settings/portal',      label: 'Client Portal',    icon: Globe     },
  { href: '/settings/pipeline',    label: 'Pipeline',         icon: Kanban    },
  { href: '/settings/permissions', label: 'Permissions',      icon: Shield    },
  { href: '/settings/account',     label: 'Account',          icon: User      },
]

interface SettingsNavProps {
  allowedSections: string[]
}

export function SettingsNav({ allowedSections }: SettingsNavProps) {
  const pathname = usePathname()
  const sections = ALL_SECTIONS.filter(s => allowedSections.includes(s.href))

  return (
    <nav className="w-56 flex-shrink-0 space-y-0.5">
      {sections.map(({ href, label, icon: Icon }) => {
        const active = pathname.startsWith(href)
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-colors duration-200',
              active
                ? 'bg-[var(--accent-muted)] text-[var(--lf-accent)]'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--panel-border-hover)]'
            )}
          >
            <Icon className="w-4 h-4 flex-shrink-0" />
            <span>{label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
