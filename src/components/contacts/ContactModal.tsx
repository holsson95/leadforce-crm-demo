'use client'

import { useEffect } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { FormModal } from '@/components/shared/FormModal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { createContact, updateContact } from '@/app/(dashboard)/contacts/actions'
import { ContactSchema } from '@/app/(dashboard)/contacts/schemas'
import type { ContactFormData } from '@/app/(dashboard)/contacts/schemas'
import type { ContactWithCampaign } from '@/types/models'
import type { Campaign } from '@prisma/client'

interface ContactModalProps {
  open: boolean
  onClose: () => void
  contact: ContactWithCampaign | null
  campaigns: Pick<Campaign, 'id' | 'name'>[]
  defaultCampaignId?: string
  users: { id: string; name: string }[]
}

const inputClass =
  'bg-[var(--panel-border)] border-[var(--panel-border)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--lf-accent)]/50 focus:ring-1 focus:ring-[var(--lf-accent)]/10 rounded-xl'

const STATUS_LABELS: Record<string, string> = {
  prospect:       'Prospect',
  lead:           'Lead',
  dnc:            'DNC',
  future:         'Future',
  call_back:      'Call Back',
  meeting_booked: 'Meeting Booked',
}

export function ContactModal({ open, onClose, contact, campaigns, defaultCampaignId, users }: ContactModalProps) {
  const {
    register,
    handleSubmit,
    reset,
    control,
    watch,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ContactFormData>({ resolver: zodResolver(ContactSchema) as never })

  const selectedStatus = watch('status')

  useEffect(() => {
    reset({
      campaignId:      contact?.campaignId      ?? defaultCampaignId ?? '',
      firstName:       contact?.firstName       ?? '',
      lastName:        contact?.lastName        ?? '',
      email:           contact?.email           ?? '',
      mobilePhone:     contact?.mobilePhone     ?? '',
      corporatePhone:  contact?.corporatePhone  ?? '',
      jobTitle:        contact?.jobTitle        ?? '',
      companyName:     contact?.companyName     ?? '',
      industry:        contact?.industry        ?? '',
      employeeCount:   contact?.employeeCount   ?? undefined,
      website:         contact?.website         ?? '',
      linkedinUrl:     contact?.linkedinUrl     ?? '',
      address:         contact?.address         ?? '',
      city:            contact?.city            ?? '',
      state:           contact?.state           ?? '',
      zip:             contact?.zip             ?? '',
      country:         contact?.country         ?? '',
      companyAddress:  contact?.companyAddress  ?? '',
      companyCity:     contact?.companyCity     ?? '',
      accountOwnerId:  contact?.accountOwnerId  ?? '',
      status:          contact?.status          ?? 'prospect',
      dncReason:       contact?.dncReason       ?? '',
    })
  }, [contact, reset, open, defaultCampaignId])

  const onSubmit = async (data: ContactFormData) => {
    try {
      if (contact) {
        await updateContact(contact.id, data)
      } else {
        await createContact(data)
      }
      onClose()
    } catch {
      setError('root', { message: 'Something went wrong. Please try again.' })
    }
  }

  return (
    <FormModal key={`${contact?.id ?? 'new'}-${open ? '1' : '0'}`} open={open} onClose={onClose} title={contact ? 'Edit Contact' : 'New Contact'} width="lg">
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col">
        <div className="overflow-y-auto max-h-[70vh] p-6 space-y-6 custom-scrollbar">

          {/* Campaign */}
          <div className="space-y-1.5">
            <Label className="text-xs text-[var(--text-secondary)]">Campaign *</Label>
            <Controller
              name="campaignId"
              control={control}
              render={({ field }) => (
                <Select onValueChange={field.onChange} value={field.value}>
                  <SelectTrigger className={inputClass}>
                    <SelectValue>
                      {(v: string | null) => v ? (campaigns.find(c => c.id === v)?.name ?? v) : 'Select a campaign…'}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent
                    className="rounded-xl border-[var(--panel-border)] bg-[var(--card-bg-solid)]"
                    alignItemWithTrigger={false}
                  >
                    {campaigns.length === 0 ? (
                      <div className="px-2 py-1.5 text-sm text-[var(--text-muted)] select-none">No campaigns found</div>
                    ) : (
                      campaigns.map((c) => (
                        <SelectItem key={c.id} value={c.id}
                          className="text-[var(--text-secondary)] focus:bg-[var(--panel-border-hover)] focus:text-[var(--text-primary)] rounded-lg">
                          {c.name}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              )}
            />
            {errors.campaignId && <p className="text-xs text-red-400">{errors.campaignId.message}</p>}
          </div>

          {/* Personal Info */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-3">Personal Info</p>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-[var(--text-secondary)]">First Name *</Label>
                  <Input {...register('firstName')} placeholder="John" className={inputClass} />
                  {errors.firstName && <p className="text-xs text-red-400">{errors.firstName.message}</p>}
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-[var(--text-secondary)]">Last Name *</Label>
                  <Input {...register('lastName')} placeholder="Smith" className={inputClass} />
                  {errors.lastName && <p className="text-xs text-red-400">{errors.lastName.message}</p>}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-[var(--text-secondary)]">Email</Label>
                <Input {...register('email')} type="email" placeholder="john@acme.com" className={inputClass} />
                {errors.email && <p className="text-xs text-red-400">{errors.email.message}</p>}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-[var(--text-secondary)]">Mobile Phone</Label>
                  <Input {...register('mobilePhone')} placeholder="+1 555 000 0000" className={inputClass} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-[var(--text-secondary)]">Corporate Phone</Label>
                  <Input {...register('corporatePhone')} placeholder="+1 555 000 0001" className={inputClass} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-[var(--text-secondary)]">Job Title</Label>
                <Input {...register('jobTitle')} placeholder="VP of Sales" className={inputClass} />
              </div>
            </div>
          </div>

          {/* Company */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-3">Company</p>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-[var(--text-secondary)]">Company Name</Label>
                <Input {...register('companyName')} placeholder="Acme Corp" className={inputClass} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-[var(--text-secondary)]">Industry</Label>
                  <Input {...register('industry')} placeholder="SaaS" className={inputClass} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-[var(--text-secondary)]">Employee Count</Label>
                  <Input
                    {...register('employeeCount', { valueAsNumber: true })}
                    type="number"
                    min={0}
                    placeholder="250"
                    className={inputClass}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-[var(--text-secondary)]">Website</Label>
                <Input {...register('website')} placeholder="https://acme.com" className={inputClass} />
                {errors.website && <p className="text-xs text-red-400">{errors.website.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-[var(--text-secondary)]">LinkedIn URL</Label>
                <Input {...register('linkedinUrl')} placeholder="https://linkedin.com/in/john" className={inputClass} />
                {errors.linkedinUrl && <p className="text-xs text-red-400">{errors.linkedinUrl.message}</p>}
              </div>
            </div>
          </div>

          {/* Personal Location */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-3">Personal Location</p>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-[var(--text-secondary)]">Address</Label>
                <Input {...register('address')} placeholder="123 Main St" className={inputClass} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-[var(--text-secondary)]">City</Label>
                  <Input {...register('city')} placeholder="New York" className={inputClass} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-[var(--text-secondary)]">State</Label>
                  <Input {...register('state')} placeholder="NY" className={inputClass} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-[var(--text-secondary)]">ZIP</Label>
                  <Input {...register('zip')} placeholder="10001" className={inputClass} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-[var(--text-secondary)]">Country</Label>
                  <Input {...register('country')} placeholder="US" className={inputClass} />
                </div>
              </div>
            </div>
          </div>

          {/* Company Location */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-3">Company Location</p>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-[var(--text-secondary)]">Company Address</Label>
                <Input {...register('companyAddress')} placeholder="456 Market St" className={inputClass} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-[var(--text-secondary)]">Company City</Label>
                <Input {...register('companyCity')} placeholder="San Francisco" className={inputClass} />
              </div>
            </div>
          </div>

          {/* Assignment */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-3">Assignment</p>
            <div className="space-y-3">

              {/* Account Owner */}
              <div className="space-y-1.5">
                <Label className="text-xs text-[var(--text-secondary)]">Account Owner</Label>
                <Controller
                  name="accountOwnerId"
                  control={control}
                  render={({ field }) => (
                    <Select onValueChange={field.onChange} value={field.value ?? ''}>
                      <SelectTrigger className={inputClass}>
                        <SelectValue>
                          {(v: string) => users.find((u) => u.id === v)?.name ?? 'Select owner'}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent
                        className="rounded-xl border-[var(--panel-border)] bg-[var(--card-bg-solid)]"
                        alignItemWithTrigger={false}
                      >
                        <SelectItem value="" className="text-[var(--text-secondary)] focus:bg-[var(--panel-border-hover)] focus:text-[var(--text-primary)] rounded-lg">
                          No owner
                        </SelectItem>
                        {users.map((u) => (
                          <SelectItem key={u.id} value={u.id}
                            className="text-[var(--text-secondary)] focus:bg-[var(--panel-border-hover)] focus:text-[var(--text-primary)] rounded-lg">
                            {u.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>

              {/* Status */}
              <div className="space-y-1.5">
                <Label className="text-xs text-[var(--text-secondary)]">Status</Label>
                <Controller
                  name="status"
                  control={control}
                  render={({ field }) => (
                    <Select onValueChange={field.onChange} value={field.value}>
                      <SelectTrigger className={inputClass}>
                        <SelectValue>
                          {(v: string | null) => v ? (STATUS_LABELS[v] ?? v) : ''}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent
                        className="rounded-xl border-[var(--panel-border)] bg-[var(--card-bg-solid)]"
                        alignItemWithTrigger={false}
                      >
                        {Object.entries(STATUS_LABELS).map(([value, label]) => (
                          <SelectItem key={value} value={value}
                            className="text-[var(--text-secondary)] focus:bg-[var(--panel-border-hover)] focus:text-[var(--text-primary)] rounded-lg">
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>

              {/* DNC Reason — conditional */}
              {selectedStatus === 'dnc' && (
                <div className="space-y-1.5">
                  <Label className="text-xs text-[var(--text-secondary)]">DNC Reason</Label>
                  <Input {...register('dncReason')} placeholder="e.g. Requested removal" className={inputClass} />
                </div>
              )}
            </div>
          </div>

        </div>

        {errors.root && (
          <p className="px-6 pb-2 text-sm text-red-400">{errors.root.message}</p>
        )}
        <div className="flex-shrink-0 border-t border-[var(--panel-border)] p-6 flex gap-3">
          <Button
            type="submit"
            disabled={isSubmitting}
            className="flex-1 bg-gradient-to-r from-[var(--lf-accent)] to-amber-600 text-black font-semibold rounded-xl hover:opacity-90"
          >
            {isSubmitting ? 'Saving…' : contact ? 'Save Changes' : 'Create Contact'}
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
    </FormModal>
  )
}
