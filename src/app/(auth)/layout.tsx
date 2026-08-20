import { DemoModeBanner } from '@/components/shared/DemoModeBanner'

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col items-center bg-slate-50">
      <DemoModeBanner />
      <div className="flex-1 flex flex-col items-center justify-center p-4 w-full">
        <div className="mb-10 text-center">
          <div className="inline-flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#fbbf24] to-[#f59e0b]" />
            <h1 className="text-3xl font-bold text-slate-900">
              LeadForce
            </h1>
          </div>
          <p className="text-slate-500 text-sm">Sales Engagement Platform</p>
        </div>
        {children}
      </div>
    </div>
  )
}
