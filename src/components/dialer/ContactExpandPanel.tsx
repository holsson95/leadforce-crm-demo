'use client'

import { useState } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { X, Pencil } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { UpdateContactSchema } from '@/app/(dashboard)/contacts/schemas'
import type { ContactFormData } from '@/app/(dashboard)/contacts/schemas'
import type { ContactWithCampaign } from '@/types/models'
import { useDialerStore } from '@/stores/dialer-store'

interface ContactExpandPanelProps {
  contact: ContactWithCampaign
  users: { id: string; name: string }[]
  onClose: () => void
  onSaved: (updated: ContactWithCampaign) => void
  embedded?: boolean
}

const STATUS_LABELS: Record<string, string> = {
  prospect:       'Prospect',
  lead:           'Lead',
  dnc:            'DNC',
  future:         'Future',
  call_back:      'Call Back',
  meeting_booked: 'Meeting Booked',
}

const STATUS_COLORS: Record<string, string> = {
  prospect:       'bg-blue-500/10 text-blue-400 border-blue-500/20',
  lead:           'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  dnc:            'bg-red-500/10 text-red-400 border-red-500/20',
  future:         'bg-purple-500/10 text-purple-400 border-purple-500/20',
  call_back:      'bg-[var(--lf-accent)]/10 text-amber-400 border-amber-500/20',
  meeting_booked: 'bg-[var(--lf-accent)]/10 text-amber-400 border-amber-500/20',
}

const inputClass =
  'bg-[var(--panel-border)] border-[var(--panel-border)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--lf-accent)]/50 focus:ring-1 focus:ring-[var(--lf-accent)]/10 rounded-xl'

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-0.5">
      {children}
    </p>
  )
}

function FieldValue({ children }: { children: React.ReactNode }) {
  const empty = children === null || children === undefined || children === ''
  return (
    <p className={cn('text-sm', empty ? 'text-[var(--text-muted)]' : 'text-[var(--text-primary)]')}>
      {empty ? '—' : children}
    </p>
  )
}

function SectionDivider({ label }: { label: string }) {
  return (
    <div className="col-span-2 mt-2 mb-1 pb-1.5 border-b border-[var(--panel-border)]">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">{label}</p>
    </div>
  )
}

function buildDefaults(contact: ContactWithCampaign): Partial<ContactFormData> {
  return {
    firstName:      contact.firstName,
    lastName:       contact.lastName,
    email:          contact.email          ?? '',
    mobilePhone:    contact.mobilePhone    ?? '',
    corporatePhone: contact.corporatePhone ?? '',
    jobTitle:       contact.jobTitle       ?? '',
    companyName:    contact.companyName    ?? '',
    industry:       contact.industry       ?? '',
    employeeCount:  contact.employeeCount  ?? undefined,
    address:        contact.address        ?? '',
    city:           contact.city           ?? '',
    state:          contact.state          ?? '',
    zip:            contact.zip            ?? '',
    country:        contact.country        ?? '',
    companyAddress: contact.companyAddress ?? '',
    companyCity:    contact.companyCity    ?? '',
    website:        contact.website        ?? '',
    linkedinUrl:    contact.linkedinUrl    ?? '',
    accountOwnerId: contact.accountOwnerId ?? '',
    status:         contact.status,
    dncReason:      contact.dncReason      ?? '',
  }
}

export function ContactExpandPanel({ contact, users, onClose, onSaved, embedded = false }: ContactExpandPanelProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const patchContact = useDialerStore((s) => s.patchContact)

  const { register, handleSubmit, reset, control, watch, setValue, formState: { errors, isSubmitting } } =
    useForm<Partial<ContactFormData>>({
      resolver:      zodResolver(UpdateContactSchema) as never,
      defaultValues: buildDefaults(contact),
    })

  const selectedStatus = watch('status')

  const wrapperClass = embedded
    ? 'p-6'
    : 'bg-[var(--card-bg)] border-t border-[var(--panel-border)] rounded-b-2xl px-6 py-4'

  const handleEdit = () => {
    reset(buildDefaults(contact))
    setSaveError(null)
    setIsEditing(true)
  }

  const handleCancel = () => {
    reset(buildDefaults(contact))
    setIsEditing(false)
    setSaveError(null)
  }

  const onSubmit = async (data: Partial<ContactFormData>) => {
    setSaveError(null)
    const res = await fetch(`/api/contacts/${contact.id}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(data),
    })
    if (!res.ok) {
      setSaveError('Failed to save changes. Please try again.')
      return
    }
    const { data: updated } = (await res.json()) as { data: ContactWithCampaign }
    patchContact(contact.id, {
      firstName:      updated.firstName,
      lastName:       updated.lastName,
      companyName:    updated.companyName    ?? undefined,
      jobTitle:       updated.jobTitle       ?? undefined,
      mobilePhone:    updated.mobilePhone    ?? undefined,
      corporatePhone: updated.corporatePhone ?? undefined,
      status:         updated.status,
    })
    onSaved(updated)
    setIsEditing(false)
  }

  if (isEditing) {
    return (
      <div className={wrapperClass}>
        <form onSubmit={handleSubmit(onSubmit)}>
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm font-semibold text-[var(--text-primary)]">Edit Contact</p>
            <button
              type="button"
              onClick={handleCancel}
              className="w-6 h-6 flex items-center justify-center rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--panel-border-hover)] transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="space-y-5">
            {/* Personal */}
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-3 pb-1.5 border-b border-[var(--panel-border)]">Personal</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-[var(--text-secondary)]">First Name</Label>
                  <Input {...register('firstName')} className={inputClass} />
                  {errors.firstName && <p className="text-xs text-red-400">{errors.firstName.message}</p>}
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-[var(--text-secondary)]">Last Name</Label>
                  <Input {...register('lastName')} className={inputClass} />
                  {errors.lastName && <p className="text-xs text-red-400">{errors.lastName.message}</p>}
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-[var(--text-secondary)]">Email</Label>
                  <Input {...register('email')} type="email" className={inputClass} />
                  {errors.email && <p className="text-xs text-red-400">{errors.email.message}</p>}
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-[var(--text-secondary)]">Job Title</Label>
                  <Input {...register('jobTitle')} className={inputClass} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-[var(--text-secondary)]">Mobile Phone</Label>
                  <Input {...register('mobilePhone')} className={inputClass} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-[var(--text-secondary)]">Corporate Phone</Label>
                  <Input {...register('corporatePhone')} className={inputClass} />
                </div>
              </div>
            </div>

            {/* Company */}
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-3 pb-1.5 border-b border-[var(--panel-border)]">Company</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5 col-span-2">
                  <Label className="text-xs text-[var(--text-secondary)]">Company Name</Label>
                  <Input {...register('companyName')} className={inputClass} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-[var(--text-secondary)]">Industry</Label>
                  <Input {...register('industry')} className={inputClass} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-[var(--text-secondary)]">Employee Count</Label>
                  <Input {...register('employeeCount', { valueAsNumber: true })} type="number" min={0} className={inputClass} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-[var(--text-secondary)]">Website</Label>
                  <Input {...register('website')} className={inputClass} />
                  {errors.website && <p className="text-xs text-red-400">{errors.website.message}</p>}
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-[var(--text-secondary)]">LinkedIn URL</Label>
                  <Input {...register('linkedinUrl')} className={inputClass} />
                  {errors.linkedinUrl && <p className="text-xs text-red-400">{errors.linkedinUrl.message}</p>}
                </div>
              </div>
            </div>

            {/* Location */}
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-3 pb-1.5 border-b border-[var(--panel-border)]">Location</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5 col-span-2">
                  <Label className="text-xs text-[var(--text-secondary)]">Address</Label>
                  <Input {...register('address')} className={inputClass} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-[var(--text-secondary)]">City</Label>
                  <Input {...register('city')} className={inputClass} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-[var(--text-secondary)]">State</Label>
                  <Input {...register('state')} className={inputClass} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-[var(--text-secondary)]">ZIP</Label>
                  <Input {...register('zip')} className={inputClass} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-[var(--text-secondary)]">Country</Label>
                  <Input {...register('country')} className={inputClass} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-[var(--text-secondary)]">Company Address</Label>
                  <Input {...register('companyAddress')} className={inputClass} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-[var(--text-secondary)]">Company City</Label>
                  <Input {...register('companyCity')} className={inputClass} />
                </div>
              </div>
            </div>

            {/* Assignment */}
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-3 pb-1.5 border-b border-[var(--panel-border)]">Assignment</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-[var(--text-secondary)]">Status</Label>
                  <Controller
                    name="status"
                    control={control}
                    render={({ field }) => (
                      <Select onValueChange={(val) => { field.onChange(val); if (val !== 'dnc') setValue('dncReason', '') }} value={field.value ?? ''}>
                        <SelectTrigger className={inputClass}>
                          <SelectValue>
                            {(v: string | null) => v ? (STATUS_LABELS[v] ?? v) : ''}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent className="rounded-xl border-[var(--panel-border)] bg-[var(--card-bg)]">
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
                <div className="space-y-1.5">
                  <Label className="text-xs text-[var(--text-secondary)]">Account Owner</Label>
                  <Controller
                    name="accountOwnerId"
                    control={control}
                    render={({ field }) => (
                      <Select onValueChange={field.onChange} value={field.value ?? ''}>
                        <SelectTrigger className={inputClass}>
                          <SelectValue>
                            {(v: string) => users.find((u) => u.id === v)?.name ?? 'No owner'}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent className="rounded-xl border-[var(--panel-border)] bg-[var(--card-bg)]">
                          <SelectItem value=""
                            className="text-[var(--text-secondary)] focus:bg-[var(--panel-border-hover)] focus:text-[var(--text-primary)] rounded-lg">
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
                {selectedStatus === 'dnc' && (
                  <div className="space-y-1.5 col-span-2">
                    <Label className="text-xs text-[var(--text-secondary)]">DNC Reason</Label>
                    <Input {...register('dncReason')} placeholder="e.g. Requested removal" className={inputClass} />
                  </div>
                )}
                <div className="space-y-1.5">
                  <Label className="text-xs text-[var(--text-secondary)]">Campaign</Label>
                  <p className="text-sm text-[var(--text-secondary)] py-2">{contact.campaign.name}</p>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-[var(--text-secondary)]">Dial Attempts</Label>
                  <p className="text-sm text-[var(--text-secondary)] py-2">{contact.dialAttempts}</p>
                </div>
              </div>
            </div>
          </div>

          {saveError && <p className="mt-3 text-sm text-red-400">{saveError}</p>}

          <div className="flex gap-3 mt-5 pt-4 border-t border-[var(--panel-border)]">
            <Button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 bg-gradient-to-r from-[var(--lf-accent)] to-amber-600 text-black font-semibold rounded-xl hover:opacity-90"
            >
              {isSubmitting ? 'Saving…' : 'Save Changes'}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={handleCancel}
              className="bg-[var(--panel-border)] border-[var(--panel-border)] text-[var(--text-secondary)] hover:bg-[var(--panel-border-hover)] rounded-xl"
            >
              Cancel
            </Button>
          </div>
        </form>
      </div>
    )
  }

  return (
    <div className={wrapperClass}>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm font-semibold text-[var(--text-primary)]">
          {contact.firstName} {contact.lastName}
        </p>
        <div className="flex items-center gap-2">
          <button
            onClick={handleEdit}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--panel-border-hover)] border border-[var(--panel-border)] transition-colors"
          >
            <Pencil className="w-3 h-3" />
            Edit
          </button>
          <button
            onClick={onClose}
            className="w-6 h-6 flex items-center justify-center rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--panel-border-hover)] transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-6 gap-y-3">
        <SectionDivider label="Personal" />
        <div><FieldLabel>Email</FieldLabel><FieldValue>{contact.email}</FieldValue></div>
        <div><FieldLabel>Mobile Phone</FieldLabel><FieldValue>{contact.mobilePhone}</FieldValue></div>
        <div><FieldLabel>Corporate Phone</FieldLabel><FieldValue>{contact.corporatePhone}</FieldValue></div>
        <div><FieldLabel>Job Title</FieldLabel><FieldValue>{contact.jobTitle}</FieldValue></div>

        <SectionDivider label="Company" />
        <div><FieldLabel>Company Name</FieldLabel><FieldValue>{contact.companyName}</FieldValue></div>
        <div><FieldLabel>Industry</FieldLabel><FieldValue>{contact.industry}</FieldValue></div>
        <div><FieldLabel>Employee Count</FieldLabel><FieldValue>{contact.employeeCount?.toLocaleString()}</FieldValue></div>
        <div>
          <FieldLabel>Website</FieldLabel>
          {contact.website ? (
            <a
              href={contact.website.startsWith('http') ? contact.website : `https://${contact.website}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-[var(--lf-accent)] hover:underline truncate block"
            >
              {contact.website}
            </a>
          ) : (
            <FieldValue>{null}</FieldValue>
          )}
        </div>
        <div className="col-span-2">
          <FieldLabel>LinkedIn</FieldLabel>
          {contact.linkedinUrl ? (
            <a
              href={contact.linkedinUrl.startsWith('http') ? contact.linkedinUrl : `https://${contact.linkedinUrl}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-[var(--lf-accent)] hover:underline truncate block"
            >
              {contact.linkedinUrl}
            </a>
          ) : (
            <FieldValue>{null}</FieldValue>
          )}
        </div>

        <SectionDivider label="Location" />
        <div><FieldLabel>Address</FieldLabel><FieldValue>{contact.address}</FieldValue></div>
        <div><FieldLabel>City</FieldLabel><FieldValue>{contact.city}</FieldValue></div>
        <div><FieldLabel>State</FieldLabel><FieldValue>{contact.state}</FieldValue></div>
        <div><FieldLabel>ZIP</FieldLabel><FieldValue>{contact.zip}</FieldValue></div>
        <div><FieldLabel>Country</FieldLabel><FieldValue>{contact.country}</FieldValue></div>
        <div><FieldLabel>Company Address</FieldLabel><FieldValue>{contact.companyAddress}</FieldValue></div>
        <div><FieldLabel>Company City</FieldLabel><FieldValue>{contact.companyCity}</FieldValue></div>

        <SectionDivider label="Assignment" />
        <div>
          <FieldLabel>Status</FieldLabel>
          <div className="mt-0.5">
            <Badge className={cn('text-[10px] h-5 px-2 border', STATUS_COLORS[contact.status] ?? 'bg-gray-500/10 text-[var(--text-secondary)] border-gray-500/20')}>
              {STATUS_LABELS[contact.status] ?? contact.status}
            </Badge>
          </div>
        </div>
        <div><FieldLabel>Account Owner</FieldLabel><FieldValue>{contact.accountOwner?.name}</FieldValue></div>
        {contact.dncReason && (
          <div><FieldLabel>DNC Reason</FieldLabel><FieldValue>{contact.dncReason}</FieldValue></div>
        )}
        <div><FieldLabel>Campaign</FieldLabel><FieldValue>{contact.campaign.name}</FieldValue></div>
        <div><FieldLabel>Dial Attempts</FieldLabel><FieldValue>{contact.dialAttempts}</FieldValue></div>
      </div>
    </div>
  )
}
