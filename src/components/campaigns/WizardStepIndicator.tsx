import { cn } from '@/lib/utils'

export type WizardStep = 'campaign' | 'upload' | 'dnc' | 'done'

const STEPS: { key: WizardStep; label: string }[] = [
  { key: 'campaign', label: 'Campaign' },
  { key: 'upload',   label: 'Upload' },
  { key: 'dnc',      label: 'DNC' },
  { key: 'done',     label: 'Done' },
]

const ORDER: WizardStep[] = ['campaign', 'upload', 'dnc', 'done']

interface WizardStepIndicatorProps {
  current: WizardStep
}

export function WizardStepIndicator({ current }: WizardStepIndicatorProps) {
  const currentIndex = ORDER.indexOf(current)

  return (
    <div className="flex items-center gap-1.5">
      {STEPS.map(({ key, label }, i) => {
        const isDone   = i < currentIndex
        const isActive = i === currentIndex

        return (
          <div key={key} className="flex items-center gap-1.5">
            <div className={cn(
              'w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-semibold',
              isDone   ? 'bg-emerald-500/20 text-emerald-400' :
              isActive ? 'bg-[var(--accent-muted)] text-[var(--lf-accent)]' :
                         'bg-[var(--panel-border)] text-[var(--text-muted)]'
            )}>
              {isDone ? '✓' : i + 1}
            </div>
            <span className={cn(
              'text-xs',
              isDone   ? 'text-emerald-400' :
              isActive ? 'text-[var(--lf-accent)]' :
                         'text-[var(--text-muted)]'
            )}>
              {label}
            </span>
            {i < STEPS.length - 1 && (
              <span className="text-[var(--text-muted)] text-xs mx-0.5">→</span>
            )}
          </div>
        )
      })}
    </div>
  )
}
