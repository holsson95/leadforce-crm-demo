function HeaderSkeleton({ wide = false }: { wide?: boolean }) {
  return (
    <div className="flex-shrink-0 h-20 sticky top-0 z-10 flex items-center justify-between px-8 border-b border-[var(--panel-border)] bg-[var(--bg-dark)] animate-pulse">
      <div className="space-y-2">
        <div className={`h-5 bg-[var(--panel-border)] rounded-lg ${wide ? 'w-28' : 'w-24'}`} />
        <div className="h-3 w-52 bg-[var(--panel-border)] rounded-lg" />
      </div>
      <div className="flex items-center gap-4">
        <div className="h-9 w-36 bg-[var(--panel-border)] rounded-full" />
        <div className="h-9 w-9 bg-[var(--panel-border)] rounded-xl" />
        <div className="h-9 w-9 bg-[var(--panel-border)] rounded-xl" />
      </div>
    </div>
  )
}

export default function DashboardLoading() {
  return (
    <>
      <HeaderSkeleton wide />
      <div className="p-8 space-y-8 animate-pulse">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-28 bg-[var(--panel-border)] rounded-2xl border border-[var(--panel-border)]" />
          ))}
        </div>

        <section className="space-y-4">
          <div className="h-3 w-36 bg-[var(--panel-border)] rounded" />
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-24 bg-[var(--panel-border)] rounded-2xl border border-[var(--panel-border)]" />
            ))}
          </div>
        </section>

        <section className="space-y-4">
          <div className="h-3 w-28 bg-[var(--panel-border)] rounded" />
          <div className="bg-[var(--panel-border)] rounded-2xl border border-[var(--panel-border)] overflow-hidden">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-5 py-4 border-b border-[var(--panel-border)] last:border-0">
                <div className="h-4 w-4 bg-[var(--panel-border)] rounded" />
                <div className="h-4 w-32 bg-[var(--panel-border)] rounded" />
                <div className="ml-auto h-4 w-16 bg-[var(--panel-border)] rounded" />
              </div>
            ))}
          </div>
        </section>
      </div>
    </>
  )
}
