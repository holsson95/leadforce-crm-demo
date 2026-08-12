import { redirect } from 'next/navigation'
import { CheckSquare } from 'lucide-react'
import { db, withTenant } from '@/lib/db'
import { getCurrentTenantId, getCurrentUserRole, getCurrentClerkUser, hasPermission } from '@/lib/auth'
import { TaskList } from '@/components/schedule/TaskList'
import type { TaskRow } from '@/types/models'

export default async function SchedulePage() {
  const tenantId = await getCurrentTenantId()
  if (!tenantId) redirect('/sign-in')

  const role = await getCurrentUserRole()
  if (!role || !hasPermission(role, 'tasks:read')) redirect('/')

  const clerkUser = await getCurrentClerkUser()
  if (!clerkUser) redirect('/sign-in')

  const dbUser = await withTenant(tenantId, () =>
    db.user.findFirst({
      where:  { clerkId: clerkUser.id },
      select: { id: true, name: true },
    })
  )
  if (!dbUser) redirect('/sign-in')

  const isManager = role === 'admin' || role === 'manager'

  const rawTasks = await withTenant(tenantId, () =>
    db.task.findMany({
      where: {
        ...(!isManager && { assigneeId: dbUser.id }),
      },
      include: {
        assignee: { select: { id: true, name: true } },
        contact:  { select: { id: true, firstName: true, lastName: true } },
        campaign: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    })
  )

  const initialTasks: TaskRow[] = rawTasks.map((t) => ({
    id:          t.id,
    title:       t.title,
    description: t.description,
    color:       t.color,
    dueDate:     t.dueDate?.toISOString() ?? null,
    status:      t.status,
    contactId:   t.contactId,
    campaignId:  t.campaignId,
    assigneeId:  t.assigneeId,
    createdAt:   t.createdAt.toISOString(),
    assignee:    t.assignee,
    contact:     t.contact,
    campaign:    t.campaign,
  }))

  return (
    <div className="p-8">
      <div className="flex items-center gap-3 mb-6">
        <CheckSquare className="w-6 h-6 text-[var(--lf-accent)]" />
        <h1 className="text-xl font-semibold text-[var(--text-primary)]">Schedule &amp; Tasks</h1>
      </div>
      <TaskList
        initialTasks={initialTasks}
        isManager={isManager}
        currentUserId={dbUser.id}
      />
    </div>
  )
}
