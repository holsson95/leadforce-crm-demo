export default function SettingsLoading() {
  return (
    <>
      <div className="flex-shrink-0 h-20 sticky top-0 z-10 flex items-center justify-between px-8 border-b border-[var(--panel-border)] bg-[var(--bg-dark)] animate-pulse">
        <div className="space-y-2">
          <div className="h-5 w-24 bg-[var(--panel-border)] rounded-lg" />
          <div className="h-3 w-44 bg-[var(--panel-border)] rounded-lg" />
        </div>
        <div className="flex items-center gap-4">
          <div className="h-9 w-36 bg-[var(--panel-border)] rounded-full" />
          <div className="h-9 w-9 bg-[var(--panel-border)] rounded-xl" />
          <div className="h-9 w-9 bg-[var(--panel-border)] rounded-xl" />
        </div>
      </div>

      <div className="p-8 space-y-6 animate-pulse">
        <div className="flex gap-2 border-b border-[var(--panel-border)] pb-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-8 w-24 bg-[var(--panel-border)] rounded-lg" />
          ))}
        </div>
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-[var(--panel-border)] rounded-2xl border border-[var(--panel-border)] p-5 space-y-4">
              <div className="h-4 w-40 bg-[var(--panel-border)] rounded" />
              <div className="h-px bg-[var(--panel-border)]" />
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <div className="h-3 w-24 bg-[var(--panel-border)] rounded" />
                  <div className="h-10 bg-[var(--panel-border)] rounded-xl" />
                </div>
                <div className="space-y-2">
                  <div className="h-3 w-20 bg-[var(--panel-border)] rounded" />
                  <div className="h-10 bg-[var(--panel-border)] rounded-xl" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
