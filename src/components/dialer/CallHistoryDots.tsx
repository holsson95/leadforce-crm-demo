'use client'

import { Tooltip } from '@base-ui/react/tooltip'
import { OUTCOME_COLOR, OUTCOME_LABEL, DOT_CLASS, TEXT_CLASS } from './outcome-colors'
import type { CallHistoryRecord } from '@/types/models'
import { cn } from '@/lib/utils'

const TOTAL_DOTS = 10

interface CallHistoryDotsProps {
  history: CallHistoryRecord[]
}

function Dot({ record }: { record: CallHistoryRecord | null }) {
  if (!record) {
    return <span className="w-2 h-2 rounded-full bg-[var(--panel-border)] flex-shrink-0 block" />
  }

  const color = record.outcome ? OUTCOME_COLOR[record.outcome] : 'red'
  const label = record.outcome ? OUTCOME_LABEL[record.outcome] : 'Unknown'
  const date  = new Date(record.createdAt).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: '2-digit',
  })

  return (
    <Tooltip.Root>
      <Tooltip.Trigger
        delay={150}
        render={<span className="flex-shrink-0 cursor-default" />}
      >
        <span className={cn('w-2 h-2 rounded-full block', DOT_CLASS[color])} />
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Positioner side="top" sideOffset={8}>
          <Tooltip.Popup className="w-44 bg-[var(--bg-dark)] border border-[var(--panel-border)] rounded-xl p-2.5 text-[10px] z-50 shadow-xl">
            <span className="block font-semibold text-[var(--text-primary)] truncate">{record.callerName}</span>
            <span className="block text-[var(--text-secondary)] mt-0.5">{date}</span>
            <span className={cn('block mt-1 font-medium', TEXT_CLASS[color])}>{label}</span>
            {record.notes && (
              <span className="block text-[var(--text-secondary)] mt-1 line-clamp-2">{record.notes}</span>
            )}
          </Tooltip.Popup>
        </Tooltip.Positioner>
      </Tooltip.Portal>
    </Tooltip.Root>
  )
}

export function CallHistoryDots({ history }: CallHistoryDotsProps) {
  const slots: (CallHistoryRecord | null)[] = [
    ...history.slice(0, TOTAL_DOTS),
    ...Array(Math.max(0, TOTAL_DOTS - history.length)).fill(null),
  ]

  const topRow    = slots.slice(0, 5)
  const bottomRow = slots.slice(5, 10)

  return (
    <div className="flex flex-col gap-0.5 flex-shrink-0">
      <div className="flex gap-0.5">
        {topRow.map((r, i) => <Dot key={i} record={r} />)}
      </div>
      <div className="flex gap-0.5">
        {bottomRow.map((r, i) => <Dot key={i + 5} record={r} />)}
      </div>
    </div>
  )
}
