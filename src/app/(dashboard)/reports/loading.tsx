export default function ReportsLoading() {
  return (
    <>
      <div className="flex-shrink-0 h-20 sticky top-0 z-10 flex items-center justify-between px-8 border-b border-[var(--panel-border)] bg-[var(--bg-dark)] animate-pulse">
        <div className="space-y-2">
          <div className="h-5 w-20 bg-[var(--panel-border)] rounded-lg" />
          <div className="h-3 w-56 bg-[var(--panel-border)] rounded-lg" />
        </div>
        <div className="flex items-center gap-4">
          <div className="h-9 w-36 bg-[var(--panel-border)] rounded-full" />
          <div className="h-9 w-9 bg-[var(--panel-border)] rounded-xl" />
          <div className="h-9 w-9 bg-[var(--panel-border)] rounded-xl" />
        </div>
      </div>

      <div className="p-8 space-y-8 animate-pulse">
        <div className="flex justify-end">
          <div className="h-9 w-40 bg-[var(--panel-border)] rounded-xl" />
        </div>

        <section className="space-y-4">
          <div className="h-3 w-32 bg-[var(--panel-border)] rounded" />
          <div className="bg-[var(--panel-border)] rounded-2xl border border-[var(--panel-border)] overflow-hidden">
            <div className="flex items-center gap-4 px-5 py-3 border-b border-[var(--panel-border)]">
              {[8, 40, 20, 20, 20, 20].map((w, i) => (
                <div key={i} style={{ width: `${w * 4}px` }} className="h-3 bg-[var(--panel-border)] rounded" />
              ))}
            </div>
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-5 py-4 border-b border-[var(--panel-border)] last:border-0">
                <div className="h-4 w-8 bg-[var(--panel-border)] rounded font-mono" />
                <div className="h-8 w-8 bg-[var(--panel-border)] rounded-xl flex-shrink-0" />
                <div className="h-4 w-32 bg-[var(--panel-border)] rounded" />
                <div className="ml-auto flex gap-6">
                  {Array.from({ length: 4 }).map((_, j) => (
                    <div key={j} className="h-4 w-12 bg-[var(--panel-border)] rounded" />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="h-3 w-36 bg-[var(--panel-border)] rounded" />
            <div className="h-8 w-40 bg-[var(--panel-border)] rounded-xl" />
          </div>
          <div className="grid grid-cols-3 gap-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="bg-[var(--panel-border)] rounded-2xl border border-[var(--panel-border)] p-5 space-y-3">
                <div className="h-3 w-24 bg-[var(--panel-border)] rounded" />
                <div className="h-8 w-16 bg-[var(--panel-border)] rounded" />
                <div className="h-2 w-full bg-[var(--panel-border)] rounded-full" />
              </div>
            ))}
          </div>
        </section>
      </div>
    </>
  )
}
