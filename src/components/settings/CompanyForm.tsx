'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ImageIcon } from 'lucide-react'

const IANA_REGEX = /^[A-Za-z][A-Za-z0-9_+\-]*(?:\/[A-Za-z0-9_+\-]+)+$/

const Schema = z.object({
  name:     z.string().min(1, 'Company name is required'),
  timezone: z.string().regex(IANA_REGEX, 'Must be a valid IANA timezone (e.g. Europe/London)'),
})

type FormValues = z.infer<typeof Schema>

interface CompanyFormProps {
  initialName:     string
  initialTimezone: string
}

const inputClass = 'bg-[var(--panel-border)] border-[var(--panel-border)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--lf-accent)] focus:ring-1 focus:ring-[var(--lf-accent)]/20 rounded-xl'

export function CompanyForm({ initialName, initialTimezone }: CompanyFormProps) {
  const [saving, setSaving] = useState(false)

  const { register, handleSubmit, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(Schema),
    defaultValues: { name: initialName, timezone: initialTimezone },
  })

  const onSubmit = async (data: FormValues) => {
    setSaving(true)
    try {
      const res = await fetch('/api/settings/company', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(data),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        toast.error((body as { error?: string }).error ?? 'Failed to save')
        return
      }
      toast.success('Company settings saved')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-8 max-w-xl">
      <section className="glass-panel rounded-2xl p-6 space-y-5">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">Company</h2>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs text-[var(--text-secondary)]">Company name</Label>
            <Input {...register('name')} className={inputClass} placeholder="Acme Corp" />
            {errors.name && <p className="text-xs text-red-400">{errors.name.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-[var(--text-secondary)]">Workspace timezone</Label>
            <Input {...register('timezone')} className={inputClass} placeholder="e.g. Europe/London" />
            <p className="text-[11px] text-[var(--text-muted)]">Used as the default for reports and session timestamps.</p>
            {errors.timezone && <p className="text-xs text-red-400">{errors.timezone.message}</p>}
          </div>
          <Button
            type="submit"
            disabled={saving}
            className="bg-gradient-to-r from-accent to-amber-600 text-black font-semibold rounded-xl shadow-xl hover:opacity-90"
          >
            {saving ? 'Saving…' : 'Save changes'}
          </Button>
        </form>
      </section>

      <section className="glass-panel rounded-2xl p-6 space-y-4">
        <div className="flex items-center gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">Logo</h2>
          <Badge className="bg-[var(--panel-border)] border-0 text-[10px] text-[var(--text-muted)]">Coming soon</Badge>
        </div>
        <div className="flex items-center gap-4 opacity-40 pointer-events-none">
          <div className="w-16 h-16 rounded-2xl bg-[var(--panel-border)] border border-[var(--panel-border)] flex items-center justify-center">
            <ImageIcon className="w-6 h-6 text-[var(--text-muted)]" />
          </div>
          <div>
            <p className="text-sm text-[var(--text-secondary)]">Upload a company logo</p>
            <p className="text-[11px] text-[var(--text-muted)] mt-0.5">PNG or SVG, max 1 MB</p>
          </div>
        </div>
      </section>
    </div>
  )
}
