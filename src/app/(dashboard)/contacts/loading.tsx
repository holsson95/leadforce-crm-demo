export default function ContactsLoading() {
  return (
    <>
      <div className="flex-shrink-0 h-20 sticky top-0 z-10 flex items-center justify-between px-8 border-b border-[var(--panel-border)] bg-[var(--bg-dark)] animate-pulse">
        <div className="space-y-2">
          <div className="h-5 w-24 bg-[var(--panel-border)] rounded-lg" />
          <div className="h-3 w-48 bg-[var(--panel-border)] rounded-lg" />
        </div>
        <div className="flex items-center gap-4">
          <div className="h-9 w-36 bg-[var(--panel-border)] rounded-full" />
          <div className="h-9 w-9 bg-[var(--panel-border)] rounded-xl" />
          <div className="h-9 w-9 bg-[var(--panel-border)] rounded-xl" />
        </div>
      </div>

      <div className="p-8 space-y-4 animate-pulse">
        <div className="flex items-center gap-3">
          <div className="h-9 w-64 bg-[var(--panel-border)] rounded-xl" />
          <div className="h-9 w-32 bg-[var(--panel-border)] rounded-xl" />
          <div className="h-9 w-32 bg-[var(--panel-border)] rounded-xl" />
          <div className="h-9 w-28 bg-[var(--panel-border)] rounded-xl" />
          <div className="ml-auto h-9 w-24 bg-[var(--panel-border)] rounded-xl" />
        </div>

        <div className="bg-[var(--panel-border)] rounded-2xl border border-[var(--panel-border)] overflow-hidden">
          <div className="flex items-center gap-4 px-5 py-3 border-b border-[var(--panel-border)]">
            {[40, 32, 48, 36, 32, 28].map((w, i) => (
              <div key={i} style={{ width: `${w * 4}px` }} className="h-3 bg-[var(--panel-border)] rounded" />
            ))}
          </div>
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-5 py-3.5 border-b border-[var(--panel-border)] last:border-0">
              <div className="h-4 w-36 bg-[var(--panel-border)] rounded" />
              <div className="h-4 w-44 bg-[var(--panel-border)] rounded" />
              <div className="h-4 w-32 bg-[var(--panel-border)] rounded" />
              <div className="h-6 w-20 bg-[var(--panel-border)] rounded-full" />
              <div className="h-4 w-24 bg-[var(--panel-border)] rounded" />
              <div className="ml-auto h-7 w-7 bg-[var(--panel-border)] rounded-lg" />
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between">
          <div className="h-4 w-40 bg-[var(--panel-border)] rounded" />
          <div className="flex gap-2">
            <div className="h-8 w-8 bg-[var(--panel-border)] rounded-lg" />
            <div className="h-8 w-8 bg-[var(--panel-border)] rounded-lg" />
          </div>
        </div>
      </div>
    </>
  )
}
