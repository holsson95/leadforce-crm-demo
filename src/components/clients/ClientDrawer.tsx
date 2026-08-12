'use client'

import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import type { z } from 'zod'
import { SlideDrawer } from '@/components/shared/SlideDrawer'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createClient, updateClient } from '@/app/(dashboard)/clients/actions'
import { ClientSchema, type ClientFormData } from '@/app/(dashboard)/clients/schemas'
import type { ClientWithCampaignCount } from '@/types/models'

interface ClientDrawerProps {
  open: boolean
  onClose: () => void
  client: ClientWithCampaignCount | null
}

const inputClass =
  'bg-[var(--panel-border)] border-[var(--panel-border)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--lf-accent)]/50 focus:ring-1 focus:ring-[var(--lf-accent)]/10 rounded-xl'

export function ClientDrawer({ open, onClose, client }: ClientDrawerProps) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ClientFormData>({ resolver: zodResolver(ClientSchema) })

  const [inviteLoading, setInviteLoading] = useState(false)
  const [inviteSent, setInviteSent]       = useState(false)

  useEffect(() => {
    reset({
      name:        client?.name ?? '',
      contactName: client?.contactName ?? '',
      email:       client?.email ?? '',
      phone:       client?.phone ?? '',
      website:     client?.website ?? '',
    })
    setInviteSent(false)
  }, [client, reset, open])

  const onSubmit = async (data: ClientFormData) => {
    if (client) {
      await updateClient(client.id, data)
    } else {
      await createClient(data)
    }
    onClose()
  }

  const handleSendInvite = async () => {
    if (!client) return
    setInviteLoading(true)
    try {
      const res = await fetch(`/api/clients/${client.id}/portal-invite`, { method: 'POST' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        toast.error((body as { error?: string }).error ?? 'Failed to send invite')
      } else {
        setInviteSent(true)
        toast.success('Portal invite sent!')
      }
    } finally {
      setInviteLoading(false)
    }
  }

  return (
    <SlideDrawer open={open} onClose={onClose} title={client ? 'Edit Client' : 'New Client'}>
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col flex-1 overflow-hidden">
        <div className="flex-1 overflow-y-auto p-6 space-y-5 custom-scrollbar">
          <div className="space-y-1.5">
            <Label className="text-xs text-[var(--text-secondary)]">Company Name *</Label>
            <Input {...register('name')} placeholder="Acme Corporation" className={inputClass} />
            {errors.name && <p className="text-xs text-red-400">{errors.name.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-[var(--text-secondary)]">Contact Name</Label>
            <Input {...register('contactName')} placeholder="John Smith" className={inputClass} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-[var(--text-secondary)]">Email</Label>
            <Input {...register('email')} type="email" placeholder="john@acme.com" className={inputClass} />
            {errors.email && <p className="text-xs text-red-400">{errors.email.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-[var(--text-secondary)]">Phone</Label>
            <Input {...register('phone')} placeholder="+1 555 000 0000" className={inputClass} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-[var(--text-secondary)]">Website</Label>
            <Input {...register('website')} placeholder="https://acme.com" className={inputClass} />
            {errors.website && <p className="text-xs text-red-400">{errors.website.message}</p>}
          </div>

          {client && (
            <div className="border-t border-[var(--panel-border)] pt-5">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold text-[var(--text-secondary)]">Client Portal</p>
                  <p className="text-xs text-[var(--text-muted)] mt-0.5">
                    {client.clerkId
                      ? 'Portal access is active'
                      : 'Send an invite to grant portal access'}
                  </p>
                </div>
                {client.clerkId ? (
                  <Badge className="bg-emerald-500/10 text-emerald-400 border-0 text-[10px] flex-shrink-0">
                    Active
                  </Badge>
                ) : (
                  <Button
                    type="button"
                    size="sm"
                    disabled={!client.email || inviteLoading || inviteSent}
                    onClick={handleSendInvite}
                    className="flex-shrink-0 bg-[var(--panel-border)] border border-[var(--panel-border)] text-[var(--text-secondary)] hover:bg-[var(--panel-border-hover)] rounded-xl text-xs disabled:opacity-40"
                  >
                    {inviteSent ? 'Invite Sent ✓' : inviteLoading ? 'Sending…' : 'Send Invite'}
                  </Button>
                )}
              </div>
              {!client.email && !client.clerkId && (
                <p className="text-[11px] text-amber-400/70 mt-2">
                  Add an email address to enable portal access
                </p>
              )}
            </div>
          )}
        </div>

        <div className="flex-shrink-0 border-t border-[var(--panel-border)] p-6 flex gap-3">
          <Button
            type="submit"
            disabled={isSubmitting}
            className="flex-1 bg-gradient-to-r from-[var(--lf-accent)] to-amber-600 text-black font-semibold rounded-xl shadow-xl hover:opacity-90"
          >
            {isSubmitting ? 'Saving…' : client ? 'Save Changes' : 'Create Client'}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            className="bg-[var(--panel-border)] border-[var(--panel-border)] text-[var(--text-secondary)] hover:bg-[var(--panel-border-hover)] rounded-xl"
          >
            Cancel
          </Button>
        </div>
      </form>
    </SlideDrawer>
  )
}
