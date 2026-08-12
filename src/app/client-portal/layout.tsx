import { redirect } from 'next/navigation'
import { getCurrentUserRole } from '@/lib/auth'
import { getCurrentClientRecord } from '@/lib/client-portal'
import { ThemeProvider } from '@/components/shared/ThemeProvider'
import { PortalHeader } from '@/components/client-portal/PortalHeader'
import { PortalPending } from '@/components/client-portal/PortalPending'
import { Toaster } from '@/components/ui/sonner'

export default async function ClientPortalLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const role = await getCurrentUserRole()
  if (role !== 'client') redirect('/')

  const client = await getCurrentClientRecord()

  if (!client) {
    return <PortalPending />
  }

  return (
    <ThemeProvider>
      <div className="flex flex-col min-h-screen bg-[var(--bg-dark)]">
        <PortalHeader clientName={client.name} />
        <main className="flex-1 overflow-y-auto custom-scrollbar">
          {children}
        </main>
        <Toaster position="bottom-right" theme="system" />
      </div>
    </ThemeProvider>
  )
}
