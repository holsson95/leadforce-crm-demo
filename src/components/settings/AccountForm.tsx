'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { ExternalLink, Bell } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'

const IANA_REGEX = /^[A-Za-z][A-Za-z0-9_+\-]*(?:\/[A-Za-z0-9_+\-]+)+$/

const Schema = z.object({
  name:     z.string().min(1, 'Name is required'),
  timezone: z.string().regex(IANA_REGEX, 'Must be a valid IANA timezone (e.g. Europe/London)').or(z.literal('')),
})

type FormValues = z.infer<typeof Schema>

interface AccountFormProps {
  initialName:     string
  initialTimezone: string | null
  clerkProfileUrl: string
}

const inputClass = 'bg-[var(--panel-border)] border-[var(--panel-border)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--lf-accent)] focus:ring-1 focus:ring-[var(--lf-accent)]/20 rounded-xl'

export function AccountForm({ initialName, initialTimezone, clerkProfileUrl }: AccountFormProps) {
  const [saving, setSaving] = useState(false)

  const { register, handleSubmit, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(Schema),
    defaultValues: { name: initialName, timezone: initialTimezone ?? '' },
  })

  const onSubmit = async (data: FormValues) => {
    setSaving(true)
    try {
      const res = await fetch('/api/settings/account', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ name: data.name, timezone: data.timezone || null }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        toast.error((body as { error?: string }).error ?? 'Failed to save')
        return
      }
      toast.success('Account updated')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-8 max-w-xl">
      <section className="glass-panel rounded-2xl p-6 space-y-5">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">Profile</h2>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs text-[var(--text-secondary)]">Display name</Label>
            <Input {...register('name')} className={inputClass} placeholder="Your name" />
            {errors.name && <p className="text-xs text-red-400">{errors.name.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-[var(--text-secondary)]">Timezone</Label>
            <Input {...register('timezone')} className={inputClass} placeholder="e.g. Europe/London" />
            <p className="text-[11px] text-[var(--text-muted)]">Leave blank to use the workspace timezone.</p>
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
          <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">Notifications</h2>
          <Badge className="bg-[var(--panel-border)] border-0 text-[10px] text-[var(--text-muted)]">Coming soon</Badge>
        </div>
        <div className="space-y-3 opacity-40 pointer-events-none">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-[var(--text-secondary)]" />
              <Label className="text-sm text-[var(--text-secondary)]">Email notifications</Label>
            </div>
            <Switch disabled />
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-[var(--text-secondary)]" />
              <Label className="text-sm text-[var(--text-secondary)]">In-app notifications</Label>
            </div>
            <Switch disabled />
          </div>
        </div>
      </section>

      <section className="glass-panel rounded-2xl p-6 space-y-4">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">Account Security</h2>
        <p className="text-sm text-[var(--text-secondary)]">Manage your password, MFA, and connected accounts via Clerk.</p>
        <a href={clerkProfileUrl} target="_blank" rel="noopener noreferrer">
          <Button
            type="button"
            variant="outline"
            className="bg-[var(--panel-border)] border-[var(--panel-border)] text-[var(--text-secondary)] hover:bg-[var(--panel-border-hover)] rounded-xl flex items-center gap-2"
          >
            <ExternalLink className="w-4 h-4" />
            Manage password &amp; security
          </Button>
        </a>
      </section>
    </div>
  )
}
