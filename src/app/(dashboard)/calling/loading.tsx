export default function CallingLoading() {
  return (
    <div className="flex h-full gap-4 p-4 overflow-hidden animate-pulse">
      <div className="flex-1 min-w-0 bg-[var(--panel-border)] rounded-3xl border border-[var(--panel-border)] flex flex-col p-5 gap-4">
        <div className="flex items-center justify-between">
          <div className="h-5 w-32 bg-[var(--panel-border)] rounded-lg" />
          <div className="h-8 w-32 bg-[var(--panel-border)] rounded-xl" />
        </div>
        <div className="h-px bg-[var(--panel-border)]" />
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 p-3 rounded-2xl bg-[var(--panel-border)]">
            <div className="h-10 w-10 rounded-xl bg-[var(--panel-border)] flex-shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-36 bg-[var(--panel-border)] rounded" />
              <div className="h-3 w-48 bg-[var(--panel-border)] rounded" />
            </div>
            <div className="h-7 w-20 bg-[var(--panel-border)] rounded-xl flex-shrink-0" />
          </div>
        ))}
      </div>

      <div className="w-1/3 flex flex-col gap-4 min-w-0">
        <div className="bg-[var(--panel-border)] rounded-3xl border border-[var(--panel-border)] p-5 space-y-4">
          <div className="h-5 w-28 bg-[var(--panel-border)] rounded-lg" />
          <div className="h-24 bg-[var(--panel-border)] rounded-2xl" />
          <div className="grid grid-cols-3 gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-12 bg-[var(--panel-border)] rounded-xl" />
            ))}
          </div>
          <div className="h-12 bg-[var(--panel-border)] rounded-xl" />
        </div>

        <div className="flex-1 bg-[var(--panel-border)] rounded-3xl border border-[var(--panel-border)] p-5 space-y-3">
          <div className="h-5 w-20 bg-[var(--panel-border)] rounded-lg" />
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className={`h-4 bg-[var(--panel-border)] rounded ${i % 3 === 2 ? 'w-3/4' : 'w-full'}`} />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
