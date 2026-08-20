'use client'

import { useState, useEffect } from 'react'
import { X, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useDialerStore } from '@/stores/dialer-store'
import { CALL_OUTCOMES_FOR_FILTER, CONTACT_STATUSES_FOR_FILTER } from '@/lib/dialer-filters'
import type { QueueFilters, NumericOp } from '@/lib/dialer-filters'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'

const OP_OPTIONS: { value: NumericOp; label: string }[] = [
  { value: 'eq',  label: 'Equal to' },
  { value: 'gt',  label: 'More than' },
  { value: 'lt',  label: 'Less than' },
  { value: 'gte', label: 'At least' },
  { value: 'lte', label: 'At most' },
]

const INPUT_CLASS =
  'w-full bg-[var(--panel-border)] border border-[var(--panel-border)] rounded-lg px-3 py-1.5 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--lf-accent)]/30'

const LABEL_CLASS = 'text-[10px] uppercase tracking-wider text-[var(--text-muted)] block mb-1.5'

function FilterSection({
  title,
  defaultOpen = true,
  children,
}: {
  title: string
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border-b border-[var(--panel-border)]">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
      >
        {title}
        <ChevronDown className={cn('w-3 h-3 transition-transform duration-150', open && 'rotate-180')} />
      </button>
      {open && <div className="px-4 pb-4 space-y-3">{children}</div>}
    </div>
  )
}

function NumericFilterControl({
  opValue,
  numValue,
  onOpChange,
  onNumChange,
  placeholder,
}: {
  opValue:     NumericOp
  numValue:    number | undefined
  onOpChange:  (op: NumericOp) => void
  onNumChange: (val: number | undefined) => void
  placeholder: string
}) {
  return (
    <div className="flex gap-2">
      <Select value={opValue} onValueChange={(v) => onOpChange(v as NumericOp)}>
        <SelectTrigger className="w-28 bg-[var(--panel-border)] border-[var(--panel-border)] text-[var(--text-primary)] rounded-lg text-xs">
          <SelectValue>{OP_OPTIONS.find((o) => o.value === opValue)?.label ?? opValue}</SelectValue>
        </SelectTrigger>
        <SelectContent className="rounded-lg border-[var(--panel-border)] bg-[var(--card-bg)]">
          {OP_OPTIONS.map((o) => (
            <SelectItem
              key={o.value}
              value={o.value}
              className="text-[var(--text-secondary)] focus:bg-[var(--panel-border-hover)] focus:text-[var(--text-primary)] rounded-md text-xs"
            >
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <input
        type="number"
        min={0}
        value={numValue ?? ''}
        onChange={(e) =>
          onNumChange(e.target.value !== '' ? Number(e.target.value) : undefined)
        }
        placeholder={placeholder}
        className={cn(INPUT_CLASS, 'flex-1')}
      />
    </div>
  )
}

interface QueueFilterDrawerProps {
  open:       boolean
  onClose:    () => void
  campaignId: string
  users:      { id: string; name: string }[]
}

export function QueueFilterDrawer({
  open,
  onClose,
  campaignId,
  users,
}: QueueFilterDrawerProps) {
  const { pendingFilters, updatePendingFilters, applyFilters, discardPendingFilters, clearFilters } =
    useDialerStore()
  const [industries, setIndustries] = useState<string[]>([])

  useEffect(() => {
    if (!open || !campaignId) return
    fetch(`/api/dialer/queue/meta?campaignId=${encodeURIComponent(campaignId)}`)
      .then((r) => r.json())
      .then(({ data }) => setIndustries(data?.industries ?? []))
      .catch(() => {})
  }, [open, campaignId])

  const handleClose = () => {
    discardPendingFilters()
    onClose()
  }

  const handleApply = async () => {
    try {
      await applyFilters()
    } finally {
      onClose()
    }
  }

  const handleClearAll = () => {
    void clearFilters()
    onClose()
  }

  const upd = (partial: Partial<QueueFilters>) => updatePendingFilters(partial)
  const f   = pendingFilters

  const toggleOutcome = (value: string, checked: boolean) => {
    const curr = f.lastCallOutcome ?? []
    const next = checked
      ? [...curr, value as NonNullable<QueueFilters['lastCallOutcome']>[number]]
      : curr.filter((v) => v !== value)
    upd({ lastCallOutcome: next.length ? next : undefined })
  }

  const toggleIndustry = (value: string, checked: boolean) => {
    const curr = f.industry ?? []
    const next = checked ? [...curr, value] : curr.filter((v) => v !== value)
    upd({ industry: next.length ? next : undefined })
  }

  const toggleContactStatus = (value: string, checked: boolean) => {
    const curr = f.contactStatus ?? []
    const next = checked
      ? [...curr, value as NonNullable<QueueFilters['contactStatus']>[number]]
      : curr.filter((v) => v !== value)
    upd({ contactStatus: next.length ? next : undefined })
  }

  if (!open) return null

  const selectedUser = users.find((u) => u.id === f.accountOwnerId)

  return (
    <>
      {/* Backdrop — closes drawer without applying */}
      <div className="absolute inset-0 z-40" onClick={handleClose} />

      {/* Drawer panel */}
      <div className="absolute top-0 right-0 h-full w-80 z-50 bg-[var(--card-bg-solid)] border-l border-[var(--panel-border)] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--panel-border)] flex-shrink-0">
          <p className="text-sm font-semibold text-[var(--text-primary)]">Filter queue</p>
          <button
            onClick={handleClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--panel-border-hover)] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable filter groups */}
        <div className="flex-1 overflow-y-auto min-h-0">

          <FilterSection title="Contact Status">
            <div className="space-y-1.5">
              {CONTACT_STATUSES_FOR_FILTER.map(({ value, label }) => (
                <label key={value} className="flex items-center gap-2 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={f.contactStatus?.includes(value) ?? false}
                    onChange={(e) => toggleContactStatus(value, e.target.checked)}
                    className="accent-[var(--lf-accent)]"
                  />
                  <span className="text-xs text-[var(--text-secondary)] group-hover:text-[var(--text-primary)] transition-colors">
                    {label}
                  </span>
                </label>
              ))}
            </div>
          </FilterSection>

          <FilterSection title="Call History">
            <div>
              <label className={LABEL_CLASS}>Last call on or before</label>
              <input
                type="date"
                value={f.lastCallBefore ?? ''}
                onChange={(e) => upd({ lastCallBefore: e.target.value || undefined })}
                className={cn(INPUT_CLASS, '[color-scheme:dark]')}
              />
            </div>

            <div>
              <label className={LABEL_CLASS}>Last call outcome</label>
              <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
                {CALL_OUTCOMES_FOR_FILTER.map(({ value, label }) => (
                  <label key={value} className="flex items-center gap-2 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={f.lastCallOutcome?.includes(value) ?? false}
                      onChange={(e) => toggleOutcome(value, e.target.checked)}
                      className="accent-[var(--lf-accent)]"
                    />
                    <span className="text-xs text-[var(--text-secondary)] group-hover:text-[var(--text-primary)] transition-colors">
                      {label}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <label className={LABEL_CLASS}>Dial attempts</label>
              <NumericFilterControl
                opValue={f.dialAttemptsOp ?? 'gt'}
                numValue={f.dialAttemptsVal}
                onOpChange={(op) => upd({ dialAttemptsOp: op })}
                onNumChange={(val) => upd({
                  dialAttemptsVal: val,
                  dialAttemptsOp: val == null ? undefined : (f.dialAttemptsOp ?? 'gt'),
                })}
                placeholder="e.g. 3"
              />
            </div>

            <label className="flex items-center gap-2 cursor-pointer group">
              <input
                type="checkbox"
                checked={f.hasNotes === true}
                onChange={(e) => upd({ hasNotes: e.target.checked || undefined })}
                className="accent-[var(--lf-accent)]"
              />
              <span className="text-xs text-[var(--text-secondary)] group-hover:text-[var(--text-primary)] transition-colors">Has notes</span>
            </label>
          </FilterSection>

          <FilterSection title="Phone">
            <div>
              <label className={LABEL_CLASS}>Number starts with</label>
              <input
                type="text"
                value={f.phonePrefix ?? ''}
                onChange={(e) => upd({ phonePrefix: e.target.value || undefined })}
                placeholder="+1"
                className={cn(INPUT_CLASS, 'font-mono')}
              />
            </div>
          </FilterSection>

          <FilterSection title="Contact">
            <div>
              <label className={LABEL_CLASS}>Job title contains</label>
              <input
                type="text"
                value={f.jobTitle ?? ''}
                onChange={(e) => upd({ jobTitle: e.target.value || undefined })}
                placeholder="Director"
                className={INPUT_CLASS}
              />
            </div>
            <div>
              <label className={LABEL_CLASS}>Company name contains</label>
              <input
                type="text"
                value={f.companyName ?? ''}
                onChange={(e) => upd({ companyName: e.target.value || undefined })}
                placeholder="Acme"
                className={INPUT_CLASS}
              />
            </div>
          </FilterSection>

          <FilterSection title="Company">
            <div>
              <label className={LABEL_CLASS}>Employee count</label>
              <NumericFilterControl
                opValue={f.employeeCountOp ?? 'gt'}
                numValue={f.employeeCountVal}
                onOpChange={(op) => upd({ employeeCountOp: op })}
                onNumChange={(val) => upd({
                  employeeCountVal: val,
                  employeeCountOp: val == null ? undefined : (f.employeeCountOp ?? 'gt'),
                })}
                placeholder="e.g. 500"
              />
            </div>
            {industries.length > 0 && (
              <div>
                <label className={LABEL_CLASS}>Industry</label>
                <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                  {industries.map((ind) => (
                    <label key={ind} className="flex items-center gap-2 cursor-pointer group">
                      <input
                        type="checkbox"
                        checked={f.industry?.includes(ind) ?? false}
                        onChange={(e) => toggleIndustry(ind, e.target.checked)}
                        className="accent-[var(--lf-accent)]"
                      />
                      <span className="text-xs text-[var(--text-secondary)] group-hover:text-[var(--text-primary)] transition-colors">
                        {ind}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </FilterSection>

          <FilterSection title="Location">
            {(
              [
                { label: 'City',    key: 'city',    placeholder: 'Austin' },
                { label: 'State',   key: 'state',   placeholder: 'TX' },
                { label: 'Country', key: 'country', placeholder: 'US' },
              ] as const
            ).map(({ label, key, placeholder }) => (
              <div key={key}>
                <label className={LABEL_CLASS}>{label}</label>
                <input
                  type="text"
                  value={f[key] ?? ''}
                  onChange={(e) => upd({ [key]: e.target.value || undefined })}
                  placeholder={placeholder}
                  className={INPUT_CLASS}
                />
              </div>
            ))}
          </FilterSection>

          <FilterSection title="Assignment">
            <div>
              <label className={LABEL_CLASS}>Account owner</label>
              <Select
                value={f.accountOwnerId ?? ''}
                onValueChange={(v) => upd({ accountOwnerId: v || undefined })}
              >
                <SelectTrigger className="bg-[var(--panel-border)] border-[var(--panel-border)] text-[var(--text-primary)] rounded-lg text-xs">
                  <SelectValue placeholder="Any owner">
                    {selectedUser ? selectedUser.name : 'Any owner'}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent className="rounded-xl border-[var(--panel-border)] bg-[var(--card-bg-solid)]">
                  <SelectItem
                    value=""
                    className="text-[var(--text-secondary)] focus:bg-[var(--panel-border-hover)] focus:text-[var(--text-primary)] rounded-lg text-xs"
                  >
                    Any owner
                  </SelectItem>
                  {users.map((u) => (
                    <SelectItem
                      key={u.id}
                      value={u.id}
                      className="text-[var(--text-secondary)] focus:bg-[var(--panel-border-hover)] focus:text-[var(--text-primary)] rounded-lg text-xs"
                    >
                      {u.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </FilterSection>
        </div>

        {/* Footer */}
        <div className="flex items-center gap-3 px-4 py-3 border-t border-[var(--panel-border)] flex-shrink-0">
          <button
            onClick={handleApply}
            className="flex-1 py-2 bg-[var(--lf-accent)]/10 text-[var(--lf-accent)] border border-[var(--lf-accent)]/20 rounded-xl text-xs font-semibold hover:bg-[var(--lf-accent)]/20 transition-colors"
          >
            Apply filters
          </button>
          <button
            onClick={handleClearAll}
            className="px-3 py-2 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
          >
            Clear all
          </button>
        </div>
      </div>
    </>
  )
}
