'use client'

import { Pencil, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { TaskRow } from '@/types/models'

interface TaskRowProps {
  task: TaskRow
  checked: boolean
  showAssignee: boolean
  onToggle: (id: string) => void
  onEdit: (task: TaskRow) => void
  onDelete: (id: string) => void
}

export function TaskRow({ task, checked, showAssignee, onToggle, onEdit, onDelete }: TaskRowProps) {
  const isOverdue = task.dueDate && !checked && new Date(task.dueDate) < new Date()

  return (
    <div className="group flex items-center gap-3 p-2.5 rounded-xl hover:bg-[var(--panel-border-hover)] border border-transparent hover:border-[var(--panel-border)] transition-colors duration-150">
      <span
        className="w-3 h-3 rounded-full flex-shrink-0"
        style={{ backgroundColor: task.color }}
      />

      <button
        type="button"
        onClick={() => onToggle(task.id)}
        className={cn(
          'w-5 h-5 rounded border flex-shrink-0 flex items-center justify-center transition-colors duration-150',
          checked
            ? 'border-[var(--lf-accent)] bg-[var(--lf-accent)]/20'
            : 'border-[var(--panel-border-hover)] bg-[var(--panel-border)] hover:border-[var(--lf-accent)]/50'
        )}
        aria-label={checked ? 'Mark incomplete' : 'Mark complete'}
      >
        {checked && (
          <svg className="w-3 h-3 text-[var(--lf-accent)]" viewBox="0 0 12 12" fill="none">
            <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>

      <div className="flex-1 min-w-0">
        <span
          className={cn(
            'text-sm transition-colors duration-150',
            checked ? 'line-through text-[var(--text-muted)] decoration-gray-600' : 'text-[var(--text-secondary)] group-hover:text-[var(--text-primary)]'
          )}
        >
          {task.title}
        </span>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          {task.contact && (
            <span className="text-[10px] bg-[var(--panel-border)] text-[var(--text-secondary)] px-1.5 py-0.5 rounded-full">
              {task.contact.firstName} {task.contact.lastName}
            </span>
          )}
          {task.campaign && (
            <span className="text-[10px] bg-[var(--panel-border)] text-[var(--text-secondary)] px-1.5 py-0.5 rounded-full">
              {task.campaign.name}
            </span>
          )}
          {task.dueDate && (
            <span className={cn('text-[10px]', isOverdue ? 'text-red-400' : 'text-[var(--text-muted)]')}>
              {new Date(task.dueDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
            </span>
          )}
          {showAssignee && (
            <span className="text-[10px] text-[var(--text-muted)]">{task.assignee.name}</span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150 flex-shrink-0">
        <button
          type="button"
          onClick={() => onEdit(task)}
          className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--panel-border-hover)] transition-colors duration-150"
          aria-label="Edit task"
        >
          <Pencil className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() => onDelete(task.id)}
          className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--text-secondary)] hover:text-red-400 hover:bg-red-500/10 transition-colors duration-150"
          aria-label="Delete task"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}
