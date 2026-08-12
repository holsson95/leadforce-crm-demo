'use client'

import { useState } from 'react'
import { Plus, CheckSquare } from 'lucide-react'
import { toast } from 'sonner'
import { TaskRow } from './TaskRow'
import { TaskDrawer } from './TaskDrawer'
import { cn } from '@/lib/utils'
import type { TaskRow as TaskRowType } from '@/types/models'

type StatusFilter = 'all' | 'pending' | 'in_progress' | 'completed'

const STATUS_TABS: { label: string; value: StatusFilter }[] = [
  { label: 'All',         value: 'all' },
  { label: 'Pending',     value: 'pending' },
  { label: 'In Progress', value: 'in_progress' },
  { label: 'Completed',   value: 'completed' },
]

interface TaskListProps {
  initialTasks: TaskRowType[]
  isManager: boolean
  currentUserId: string
}

export function TaskList({ initialTasks, isManager, currentUserId }: TaskListProps) {
  const [tasks, setTasks]             = useState<TaskRowType[]>(initialTasks)
  const [statusFilter, setFilter]     = useState<StatusFilter>('all')
  const [drawerOpen, setDrawerOpen]   = useState(false)
  const [editingTask, setEditingTask] = useState<TaskRowType | null>(null)

  const filtered = tasks.filter((t) => {
    if (statusFilter === 'all') return true
    return t.status === statusFilter
  })

  async function handleToggle(id: string) {
    const task = tasks.find((t) => t.id === id)
    if (!task) return

    const newStatus = task.status === 'completed' ? 'pending' : 'completed'

    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, status: newStatus } : t))
    )

    try {
      const res = await fetch(`/api/tasks/${id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ status: newStatus }),
      })
      if (!res.ok) throw new Error()
    } catch {
      setTasks((prev) =>
        prev.map((t) => (t.id === id ? { ...t, status: task.status } : t))
      )
      toast.error('Failed to update task')
    }
  }

  async function handleDelete(id: string) {
    const task = tasks.find((t) => t.id === id)
    setTasks((prev) => prev.filter((t) => t.id !== id))

    try {
      const res = await fetch(`/api/tasks/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
    } catch {
      if (task) setTasks((prev) => [task, ...prev])
      toast.error('Failed to delete task')
    }
  }

  function handleSaved(task: TaskRowType) {
    setTasks((prev) => {
      const exists = prev.find((t) => t.id === task.id)
      return exists
        ? prev.map((t) => (t.id === task.id ? task : t))
        : [task, ...prev]
    })
    setDrawerOpen(false)
    setEditingTask(null)
  }

  function handleEdit(task: TaskRowType) {
    setEditingTask(task)
    setDrawerOpen(true)
  }

  function handleNewTask() {
    setEditingTask(null)
    setDrawerOpen(true)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div className="flex items-center gap-1 bg-[var(--panel-border)] rounded-xl p-1">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => setFilter(tab.value)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors duration-150',
                statusFilter === tab.value
                  ? 'bg-[var(--lf-accent)]/10 text-[var(--lf-accent)]'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={handleNewTask}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-[var(--lf-accent)] to-amber-600 text-black text-sm font-semibold shadow-xl shadow-[var(--lf-accent)]/30"
        >
          <Plus className="w-4 h-4" />
          New Task
        </button>
      </div>

      <div className="glass-panel rounded-2xl p-2">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <CheckSquare className="w-8 h-8 text-[var(--text-muted)]" />
            <p className="text-sm text-[var(--text-secondary)]">No tasks yet</p>
            <button
              type="button"
              onClick={handleNewTask}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-[var(--lf-accent)] to-amber-600 text-black text-sm font-semibold"
            >
              <Plus className="w-4 h-4" />
              New Task
            </button>
          </div>
        ) : (
          <div className="space-y-0.5">
            {filtered.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                checked={task.status === 'completed'}
                showAssignee={isManager}
                onToggle={handleToggle}
                onEdit={handleEdit}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </div>

      <TaskDrawer
        open={drawerOpen}
        task={editingTask}
        isManager={isManager}
        currentUserId={currentUserId}
        onClose={() => { setDrawerOpen(false); setEditingTask(null) }}
        onSaved={handleSaved}
      />
    </div>
  )
}
