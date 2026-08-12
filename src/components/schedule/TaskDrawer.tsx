'use client'

import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { SlideDrawer } from '@/components/shared/SlideDrawer'
import type { TaskRow } from '@/types/models'

const PRESET_COLORS = [
  '#f5a623', '#22c55e', '#7aaedb', '#ef4444',
  '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16',
  '#f97316', '#64748b', '#e2e8f0', '#ffffff',
]

const TaskSchema = z.object({
  title:       z.string().min(1, 'Title is required'),
  description: z.string().optional(),
  color:       z.string().min(1),
  dueDate:     z.string().optional(),
  status:      z.enum(['pending', 'in_progress', 'completed']),
  contactId:   z.string().optional(),
  campaignId:  z.string().optional(),
})

type TaskFormValues = z.infer<typeof TaskSchema>

interface TaskDrawerProps {
  open:          boolean
  task:          TaskRow | null
  isManager:     boolean
  currentUserId: string
  onClose:       () => void
  onSaved:       (task: TaskRow) => void
}

export function TaskDrawer({ open, task, isManager, currentUserId, onClose, onSaved }: TaskDrawerProps) {
  const [saving, setSaving] = useState(false)

  const { register, handleSubmit, setValue, watch, reset, formState: { errors } } = useForm<TaskFormValues>({
    resolver: zodResolver(TaskSchema),
    defaultValues: {
      title:       '',
      description: '',
      color:       PRESET_COLORS[0],
      status:      'pending',
    },
  })

  const selectedColor = watch('color')

  useEffect(() => {
    if (open) {
      if (task) {
        reset({
          title:       task.title,
          description: task.description ?? '',
          color:       task.color,
          dueDate:     task.dueDate ? task.dueDate.slice(0, 10) : '',
          status:      task.status,
          contactId:   task.contactId ?? '',
          campaignId:  task.campaignId ?? '',
        })
      } else {
        reset({
          title:       '',
          description: '',
          color:       PRESET_COLORS[0],
          status:      'pending',
          dueDate:     '',
          contactId:   '',
          campaignId:  '',
        })
      }
    }
  }, [open, task, reset])

  async function onSubmit(values: TaskFormValues) {
    setSaving(true)
    try {
      const url    = task ? `/api/tasks/${task.id}` : '/api/tasks'
      const method = task ? 'PATCH' : 'POST'

      const body = {
        ...values,
        dueDate:    values.dueDate ? new Date(values.dueDate).toISOString() : undefined,
        contactId:  values.contactId  || undefined,
        campaignId: values.campaignId || undefined,
        ...(!task && !isManager && { assigneeId: currentUserId }),
      }

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      })

      if (!res.ok) throw new Error()

      if (task) {
        onSaved({ ...task, ...values, dueDate: values.dueDate ? new Date(values.dueDate).toISOString() : null })
      } else {
        const { data } = await res.json()
        onSaved({
          id:          data.id,
          title:       values.title,
          description: values.description ?? null,
          color:       values.color,
          dueDate:     values.dueDate ? new Date(values.dueDate).toISOString() : null,
          status:      values.status,
          contactId:   values.contactId  ?? null,
          campaignId:  values.campaignId ?? null,
          assigneeId:  currentUserId,
          createdAt:   new Date().toISOString(),
          assignee:    { id: currentUserId, name: 'You' },
          contact:     null,
          campaign:    null,
        })
      }

      toast.success(task ? 'Task updated' : 'Task created')
    } catch {
      toast.error('Failed to save task')
    } finally {
      setSaving(false)
    }
  }

  return (
    <SlideDrawer open={open} onClose={onClose} title={task ? 'Edit Task' : 'New Task'}>
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col flex-1 overflow-hidden">
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">

          {/* Title */}
          <div>
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">Title *</label>
            <input
              {...register('title')}
              className="w-full bg-[var(--panel-border)] border border-[var(--panel-border)] rounded-xl px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--lf-accent)]/50"
              placeholder="Task title"
            />
            {errors.title && <p className="text-red-400 text-xs mt-1">{errors.title.message}</p>}
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">Description</label>
            <textarea
              {...register('description')}
              rows={3}
              className="w-full bg-[var(--panel-border)] border border-[var(--panel-border)] rounded-xl px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--lf-accent)]/50 resize-none"
              placeholder="Optional details..."
            />
          </div>

          {/* Color */}
          <div>
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">Color</label>
            <div className="flex flex-wrap gap-2 mb-2">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setValue('color', c)}
                  className={`w-6 h-6 rounded-full transition-transform duration-150 ${selectedColor === c ? 'scale-125 ring-2 ring-white/30' : 'hover:scale-110'}`}
                  style={{ backgroundColor: c }}
                  aria-label={c}
                />
              ))}
            </div>
            <div className="flex items-center gap-2">
              <span className="w-5 h-5 rounded-full flex-shrink-0" style={{ backgroundColor: selectedColor }} />
              <input
                {...register('color')}
                className="flex-1 bg-[var(--panel-border)] border border-[var(--panel-border)] rounded-xl px-3 py-1.5 text-xs text-[var(--text-primary)] font-mono focus:outline-none focus:border-[var(--lf-accent)]/50"
                placeholder="#f5a623"
              />
            </div>
          </div>

          {/* Status */}
          <div>
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">Status</label>
            <select
              {...register('status')}
              className="w-full bg-[var(--panel-border)] border border-[var(--panel-border)] rounded-xl px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--lf-accent)]/50"
            >
              <option value="pending">Pending</option>
              <option value="in_progress">In Progress</option>
              <option value="completed">Completed</option>
            </select>
          </div>

          {/* Due Date */}
          <div>
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">Due Date</label>
            <input
              type="date"
              {...register('dueDate')}
              className="w-full bg-[var(--panel-border)] border border-[var(--panel-border)] rounded-xl px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--lf-accent)]/50"
            />
          </div>

        </div>

        {/* Footer */}
        <div className="flex-shrink-0 flex items-center justify-end gap-3 px-6 py-4 border-t border-[var(--panel-border)]">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-[var(--panel-border)] border border-[var(--panel-border)] text-[var(--text-secondary)] text-sm hover:bg-[var(--panel-border-hover)] transition-colors duration-150"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 rounded-xl bg-gradient-to-r from-[var(--lf-accent)] to-amber-600 text-black text-sm font-semibold shadow-xl shadow-[var(--lf-accent)]/30 disabled:opacity-50"
          >
            {saving ? 'Saving…' : task ? 'Save Changes' : 'Create Task'}
          </button>
        </div>
      </form>
    </SlideDrawer>
  )
}
