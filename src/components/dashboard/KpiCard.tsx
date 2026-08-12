interface KpiCardProps {
  title: string
  value: number
  format: 'number' | 'percent'
  icon: React.ReactNode
}

export function KpiCard({ title, value, format, icon }: KpiCardProps) {
  const displayValue = format === 'percent' ? `${value}%` : value.toLocaleString()

  return (
    <div className="glass-panel rounded-2xl px-[18px] py-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">{title}</p>
        <div className="text-[var(--text-muted)]">{icon}</div>
      </div>
      <span className="font-mono text-3xl font-semibold text-[var(--text-primary)] leading-none">{displayValue}</span>
    </div>
  )
}
