export default function PipelineLoading() {
  return (
    <div className="p-8 animate-pulse">
      <div className="flex items-center gap-4 mb-6">
        <div className="h-9 w-48 bg-[var(--panel-border)] rounded-xl" />
        <div className="h-9 w-32 bg-[var(--panel-border)] rounded-xl" />
        <div className="ml-auto h-9 w-36 bg-[var(--panel-border)] rounded-xl" />
      </div>

      <div className="flex gap-4 overflow-x-auto pb-4">
        {Array.from({ length: 4 }).map((_, col) => (
          <div key={col} className="flex-shrink-0 w-72 bg-[var(--panel-border)] rounded-3xl border border-[var(--panel-border)] p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="h-2.5 w-2.5 rounded-full bg-white/20" />
                <div className="h-4 w-24 bg-[var(--panel-border)] rounded" />
              </div>
              <div className="h-5 w-8 bg-[var(--panel-border)] rounded-full" />
            </div>

            {Array.from({ length: col === 0 ? 4 : col === 1 ? 3 : col === 2 ? 2 : 1 }).map((_, card) => (
              <div key={card} className="bg-[var(--bg-dark)]/40 rounded-2xl border border-[var(--panel-border)] p-4 space-y-2.5">
                <div className="h-4 w-40 bg-[var(--panel-border)] rounded" />
                <div className="h-3 w-28 bg-[var(--panel-border)] rounded" />
                <div className="flex items-center justify-between pt-1">
                  <div className="h-5 w-20 bg-[var(--panel-border)] rounded-full" />
                  <div className="h-3 w-16 bg-[var(--panel-border)] rounded" />
                </div>
              </div>
            ))}

            <div className="h-9 bg-[var(--panel-border)] rounded-xl border border-dashed border-[var(--panel-border)]" />
          </div>
        ))}
      </div>
    </div>
  )
}
