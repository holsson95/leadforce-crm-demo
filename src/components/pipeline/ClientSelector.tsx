'use client'

interface ClientSelectorProps {
  clients:          { id: string; name: string }[]
  selectedClientId: string
  basePath?:        string
}

export function ClientSelector({ clients, selectedClientId, basePath = '/pipeline' }: ClientSelectorProps) {
  return (
    <select
      value={selectedClientId}
      onChange={(e) => { window.location.href = `${basePath}?clientId=${e.target.value}` }}
      className="bg-[var(--panel-border)] border border-[var(--panel-border)] rounded-xl px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--lf-accent)]/30"
    >
      {clients.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
        </option>
      ))}
    </select>
  )
}
