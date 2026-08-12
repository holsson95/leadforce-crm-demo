'use client'

import { Dialog } from '@base-ui/react/dialog'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ReactNode } from 'react'

interface FormModalProps {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  width?: 'md' | 'lg'
}

export function FormModal({ open, onClose, title, children, width = 'md' }: FormModalProps) {
  return (
    <Dialog.Root open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose() }}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm transition-opacity duration-200 data-starting-style:opacity-0 data-ending-style:opacity-0" />
        <Dialog.Popup
          className={cn(
            'fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2',
            'flex flex-col bg-[var(--card-bg-solid)] border border-[var(--panel-border)] rounded-3xl shadow-2xl',
            'transition-all duration-200 data-starting-style:opacity-0 data-starting-style:scale-95 data-ending-style:opacity-0 data-ending-style:scale-95',
            width === 'md' ? 'w-full max-w-lg' : 'w-full max-w-2xl'
          )}
        >
          <div className="flex-shrink-0 flex items-center justify-between px-6 h-16 border-b border-[var(--panel-border)]">
            <Dialog.Title className="text-sm font-semibold text-[var(--text-primary)]">{title}</Dialog.Title>
            <Dialog.Close
              className="w-8 h-8 rounded-xl flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--panel-border-hover)] transition-colors duration-200"
              aria-label="Close modal"
            >
              <X className="w-4 h-4" />
            </Dialog.Close>
          </div>
          {children}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
