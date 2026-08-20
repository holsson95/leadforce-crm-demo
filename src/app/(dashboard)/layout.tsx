import { auth } from '@clerk/nextjs/server'
import { db, withTenant } from '@/lib/db'
import { getClerkMeta } from '@/lib/auth'
import { getDailyTargetStats } from '@/lib/reports'
import { Sidebar } from '@/components/layout/Sidebar'
import { Toaster } from '@/components/ui/sonner'
import { DemoModeBanner } from '@/components/shared/DemoModeBanner'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  let dailyStats = { count: 0, target: 0 }
  let logoUrl: string | null = null
  let role = ''
  let pendingPipelineCount = 0

  try {
    const { userId: clerkId } = await auth()
    const { role: fetchedRole, tenantId } = await getClerkMeta()
    role = fetchedRole

    if (clerkId && tenantId && fetchedRole) {
      const [dbUser, tenantSettings] = await Promise.all([
        withTenant(tenantId, () =>
          db.user.findFirst({ where: { clerkId }, select: { id: true } })
        ),
        db.tenantSettings.findUnique({ where: { tenantId }, select: { logoUrl: true } }),
      ])
      if (dbUser) {
        dailyStats = await getDailyTargetStats(tenantId, dbUser.id, role)
      }
      logoUrl = tenantSettings?.logoUrl ?? null
      if (dbUser && tenantId) {
        pendingPipelineCount = await withTenant(tenantId, () =>
          db.pendingPipelineDeal.count({
            where: { campaign: { deletedAt: null, archivedAt: null } },
          })
        )
      }
    }
  } catch (e) {
    if (process.env.NODE_ENV !== 'production') console.error('[DashboardLayout]', e)
    // unauthenticated or fetch error — individual pages handle redirect
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-[var(--bg-dark)]">
      <DemoModeBanner />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar dailyStats={dailyStats} logoUrl={logoUrl} role={role} pendingPipelineCount={pendingPipelineCount} />
        <main className="flex-1 overflow-y-auto custom-scrollbar">
          {children}
        </main>
      </div>
      <Toaster position="bottom-right" theme="dark" />
    </div>
  )
}
