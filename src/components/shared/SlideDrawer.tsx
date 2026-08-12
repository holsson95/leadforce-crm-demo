'use client'

import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface SlideDrawerProps {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  width?: 'md' | 'lg'
  hideHeader?: boolean
}

export function SlideDrawer({
  open,
  onClose,
  title,
  children,
  width = 'md',
  hideHeader = false,
}: SlideDrawerProps) {
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    if (open) document.addEventListener('keydown', handleEsc)
    return () => document.removeEventListener('keydown', handleEsc)
  }, [open, onClose])

  if (!open) return null

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          'fixed top-0 right-0 z-50 h-full flex flex-col will-change-transform animate-slide-in-right',
          'border-l border-[var(--panel-border)] bg-[var(--card-bg-solid)]',
          width === 'md' ? 'w-[480px]' : 'w-[640px]'
        )}
      >
        {!hideHeader && (
          <div className="flex-shrink-0 flex items-center justify-between px-6 h-16 border-b border-[var(--panel-border)]">
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">{title}</h2>
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-xl flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--panel-border-hover)] transition-colors duration-200"
              aria-label="Close drawer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
        {children}
      </div>
    </>
  )
}
