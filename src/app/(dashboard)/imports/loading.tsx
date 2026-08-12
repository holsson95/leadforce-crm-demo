export default function ImportsLoading() {
  return (
    <>
      <div className="flex-shrink-0 h-20 sticky top-0 z-10 flex items-center justify-between px-8 border-b border-[var(--panel-border)] bg-[var(--bg-dark)] animate-pulse">
        <div className="space-y-2">
          <div className="h-5 w-20 bg-[var(--panel-border)] rounded-lg" />
          <div className="h-3 w-52 bg-[var(--panel-border)] rounded-lg" />
        </div>
        <div className="flex items-center gap-4">
          <div className="h-9 w-36 bg-[var(--panel-border)] rounded-full" />
          <div className="h-9 w-9 bg-[var(--panel-border)] rounded-xl" />
          <div className="h-9 w-9 bg-[var(--panel-border)] rounded-xl" />
        </div>
      </div>

      <div className="p-8 space-y-6 animate-pulse">
        <div className="bg-[var(--panel-border)] rounded-3xl border border-[var(--panel-border)] border-dashed h-48 flex items-center justify-center">
          <div className="space-y-3 flex flex-col items-center">
            <div className="h-10 w-10 bg-[var(--panel-border)] rounded-xl" />
            <div className="h-4 w-48 bg-[var(--panel-border)] rounded" />
            <div className="h-3 w-36 bg-[var(--panel-border)] rounded" />
          </div>
        </div>
        <div className="bg-[var(--panel-border)] rounded-2xl border border-[var(--panel-border)] overflow-hidden">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-5 py-4 border-b border-[var(--panel-border)] last:border-0">
              <div className="h-4 w-36 bg-[var(--panel-border)] rounded" />
              <div className="h-4 w-24 bg-[var(--panel-border)] rounded" />
              <div className="h-6 w-20 bg-[var(--panel-border)] rounded-full" />
              <div className="ml-auto h-4 w-16 bg-[var(--panel-border)] rounded" />
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
