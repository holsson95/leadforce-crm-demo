'use client'

import { useState } from 'react'
import { useForm, type Resolver } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const Schema = z.object({
  dialUnresponsiveLimit:     z.coerce.number().int().min(1, 'Min 1').max(50),
  dialFutureReentryDays:     z.coerce.number().int().min(30, 'Min 30 days').max(730),
  dialFutureReattempts:      z.coerce.number().int().min(1, 'Min 1').max(20),
  notInterestedCooldownDays: z.coerce.number().int().min(1, 'Min 1').max(365),
})

type FormValues = {
  dialUnresponsiveLimit:     number
  dialFutureReentryDays:     number
  dialFutureReattempts:      number
  notInterestedCooldownDays: number
}

interface DialerThresholdsFormProps {
  initialValues: FormValues
}

const inputClass = 'bg-[var(--panel-border)] border-[var(--panel-border)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--lf-accent)] focus:ring-1 focus:ring-[var(--lf-accent)]/20 rounded-xl w-24'

type FieldDef = { key: keyof FormValues; label: string; description: string; comingSoon?: boolean }

const FIELDS: FieldDef[] = [
  {
    key:         'dialUnresponsiveLimit',
    label:       'Unanswered dial limit',
    description: 'After this many unanswered dials, the contact moves to the Future list.',
  },
  {
    key:         'dialFutureReentryDays',
    label:       'Future list re-entry (days)',
    description: 'Days before a Future contact re-enters the prospect queue for another attempt.',
    comingSoon:  true,
  },
  {
    key:         'dialFutureReattempts',
    label:       'Max re-dial attempts after re-entry',
    description: 'If still unresponsive after this many re-attempts, the contact is permanently marked DNC.',
    comingSoon:  true,
  },
  {
    key:         'notInterestedCooldownDays',
    label:       'Not Interested cooldown (days)',
    description: 'Days before a Not Interested contact re-enters the Lead queue.',
  },
]

export function DialerThresholdsForm({ initialValues }: DialerThresholdsFormProps) {
  const [saving, setSaving] = useState(false)

  const { register, handleSubmit, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(Schema) as Resolver<FormValues>,
    defaultValues: initialValues,
  })

  const onSubmit = async (data: FormValues) => {
    setSaving(true)
    try {
      const res = await fetch('/api/settings/dialer', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(data),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        toast.error((body as { error?: string }).error ?? 'Failed to save')
        return
      }
      toast.success('Dialer thresholds saved')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-xl">
      <section className="glass-panel rounded-2xl p-6 space-y-6">
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">Dialer Thresholds</h2>
          <p className="text-xs text-[var(--text-muted)] mt-1">Workspace-wide defaults. Individual campaigns can override these in their settings.</p>
        </div>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {FIELDS.map(({ key, label, description, comingSoon }) => (
            <div key={key} className="flex items-start justify-between gap-6">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <Label className="text-sm text-[var(--text-secondary)]">{label}</Label>
                  {comingSoon && (
                    <Badge className="bg-[var(--panel-border)] border-0 text-[10px] text-[var(--text-muted)]">Saved — scheduling job coming soon</Badge>
                  )}
                </div>
                <p className="text-[11px] text-[var(--text-muted)] mt-0.5">{description}</p>
                {errors[key] && <p className="text-xs text-red-400 mt-1">{errors[key]?.message}</p>}
              </div>
              <Input
                {...register(key)}
                type="number"
                min={key === 'dialFutureReentryDays' ? 30 : 1}
                className={inputClass}
              />
            </div>
          ))}
          <Button
            type="submit"
            disabled={saving}
            className="bg-gradient-to-r from-accent to-amber-600 text-black font-semibold rounded-xl shadow-xl hover:opacity-90"
          >
            {saving ? 'Saving…' : 'Save thresholds'}
          </Button>
        </form>
      </section>
    </div>
  )
}
