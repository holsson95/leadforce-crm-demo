'use client'

import { useEffect, useState } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { FormModal } from '@/components/shared/FormModal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { SDRSelector } from './SDRSelector'
import { WizardStepIndicator } from './WizardStepIndicator'
import { CampaignWizardStep2 } from './CampaignWizardStep2'
import { CampaignWizardStep3 } from './CampaignWizardStep3'
import { CampaignWizardStep4 } from './CampaignWizardStep4'
import { createCampaign, updateCampaign } from '@/app/(dashboard)/campaigns/actions'
import { importContacts } from '@/app/(dashboard)/imports/actions'
import { CampaignSchema } from '@/app/(dashboard)/campaigns/schemas'
import type { CampaignFormData } from '@/app/(dashboard)/campaigns/schemas'
import type { CampaignWithDetails, UserSummary } from '@/types/models'
import type { Client } from '@prisma/client'
import type { ImportPreviewResult, MappedRow } from '@/lib/csv/types'
import type { WizardStep } from './WizardStepIndicator'

interface CampaignModalProps {
  open: boolean
  onClose: () => void
  campaign: CampaignWithDetails | null
  clients: Pick<Client, 'id' | 'name'>[]
  sdrs: UserSummary[]
}

const inputClass =
  'bg-[var(--panel-border)] border-[var(--panel-border)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--lf-accent)]/50 rounded-xl'

const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  active: 'Active',
  paused: 'Paused',
  completed: 'Completed',
}

export function CampaignModal({ open, onClose, campaign, clients, sdrs }: CampaignModalProps) {
  const [step, setStep]               = useState<WizardStep>('campaign')
  const [campaignId, setCampaignId]   = useState<string | null>(null)
  const [campaignName, setCampaignName] = useState('')
  const [importPreview, setImportPreview] = useState<ImportPreviewResult | null>(null)
  const [importResult, setImportResult]   = useState<{ created: number; dncBlocked: number; skipped: number } | null>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const [step2Error, setStep2Error] = useState<string | null>(null)

  const {
    register, handleSubmit, reset, control, setError, getValues,
    formState: { errors, isSubmitting },
  } = useForm<CampaignFormData>({ resolver: zodResolver(CampaignSchema) as never })

  useEffect(() => {
    if (open) {
      setStep('campaign')
      setCampaignId(null)
      setCampaignName('')
      setImportPreview(null)
      setImportResult(null)
      setImportError(null)
      setStep2Error(null)
    }
  }, [open])

  useEffect(() => {
    if (campaign) {
      reset({
        name: campaign.name,
        clientId: campaign.clientId,
        status: campaign.status,
        dailyTargetCalls: campaign.dailyTargetCalls ?? undefined,
        sdrIds: campaign.sdrs.map((s) => s.userId),
      })
    } else {
      reset({ name: '', clientId: '', status: 'draft', dailyTargetCalls: undefined, sdrIds: [] })
    }
  }, [campaign, reset, open])

  const onSubmit = async (data: CampaignFormData) => {
    try {
      if (campaign) {
        await updateCampaign(campaign.id, data)
        onClose()
      } else {
        const { id } = await createCampaign(data)
        setCampaignId(id)
        setCampaignName(data.name)
        setStep('upload')
      }
    } catch {
      setError('root', { message: 'Something went wrong. Please try again.' })
    }
  }

  const handlePreviewReady = async (preview: ImportPreviewResult): Promise<void> => {
    setImportPreview(preview)
    if (preview.dnc.length === 0) {
      try {
        const result = await importContacts(preview.clean, [], campaignId!)
        setCampaignName(getValues('name'))
        setImportResult({
          ...result,
          dncBlocked: 0,
          skipped: preview.invalidRowCount ?? 0,
        })
        setStep('done')
      } catch {
        setStep2Error('Import failed. Please try again.')
      }
    } else {
      setStep('dnc')
    }
  }

  const handleDncImport = async (includedDncRows: MappedRow[]): Promise<void> => {
    if (!importPreview || !campaignId) return
    setImportError(null)
    try {
      const result = await importContacts(
        [...importPreview.clean, ...includedDncRows],
        [],
        campaignId,
      )
      setCampaignName(getValues('name'))
      setImportResult({
        ...result,
        dncBlocked: importPreview.dnc.length - includedDncRows.length,
        skipped: importPreview.invalidRowCount ?? 0,
      })
      setStep('done')
    } catch {
      setImportError('Import failed. Please try again.')
    }
  }

  const isNew = !campaign

  return (
    <FormModal open={open} onClose={onClose} title={campaign ? 'Edit Campaign' : 'New Campaign'}>
      {isNew && (
        <div className="flex-shrink-0 px-6 py-3 border-b border-[var(--panel-border)]">
          <WizardStepIndicator current={step} />
        </div>
      )}

      {step === 'campaign' && (
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col">
          <div className="overflow-y-auto max-h-[70vh] p-6 space-y-5 custom-scrollbar">
            <div className="space-y-1.5">
              <Label className="text-xs text-[var(--text-secondary)]">Campaign Name *</Label>
              <Input {...register('name')} placeholder="Q1 Outreach" className={inputClass} />
              {errors.name && <p className="text-xs text-red-400">{errors.name.message}</p>}
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-[var(--text-secondary)]">Client *</Label>
              <Controller
                name="clientId"
                control={control}
                render={({ field }) => (
                  <Select onValueChange={field.onChange} value={field.value}>
                    <SelectTrigger className={inputClass}>
                      <SelectValue>
                        {(v: string | null) => v ? (clients.find(c => c.id === v)?.name ?? v) : 'Select a client…'}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent className="rounded-xl border-[var(--panel-border)] bg-[var(--card-bg-solid)]" alignItemWithTrigger={false}>
                      {clients.length === 0 ? (
                        <div className="px-2 py-1.5 text-sm text-[var(--text-muted)] select-none">No clients found</div>
                      ) : (
                        clients.map((c) => (
                          <SelectItem key={c.id} value={c.id} className="text-[var(--text-secondary)] focus:bg-[var(--panel-border-hover)] focus:text-[var(--text-primary)] rounded-lg">
                            {c.name}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                )}
              />
              {errors.clientId && <p className="text-xs text-red-400">{errors.clientId.message}</p>}
            </div>

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
                    <SelectContent className="rounded-xl border-[var(--panel-border)] bg-[var(--card-bg-solid)]" alignItemWithTrigger={false}>
                      {Object.entries(STATUS_LABELS).map(([value, label]) => (
                        <SelectItem key={value} value={value} className="text-[var(--text-secondary)] focus:bg-[var(--panel-border-hover)] focus:text-[var(--text-primary)] rounded-lg">
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-[var(--text-secondary)]">Daily Target Calls</Label>
              <Input
                {...register('dailyTargetCalls', { valueAsNumber: true })}
                type="number"
                min={1}
                placeholder="e.g. 50"
                className={inputClass}
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-[var(--text-secondary)]">Assign SDRs</Label>
              <Controller
                name="sdrIds"
                control={control}
                render={({ field }) => (
                  <SDRSelector sdrs={sdrs} selectedIds={field.value ?? []} onChange={field.onChange} />
                )}
              />
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
              {isSubmitting ? 'Saving…' : campaign ? 'Save Changes' : 'Create & Continue →'}
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
      )}

      {step === 'upload' && campaignId && (
        <CampaignWizardStep2
          campaignId={campaignId}
          onPreviewReady={handlePreviewReady}
          onSkip={onClose}
          error={step2Error}
        />
      )}

      {step === 'dnc' && importPreview && (
        <CampaignWizardStep3
          cleanRows={importPreview.clean}
          dncRows={importPreview.dnc}
          onImport={handleDncImport}
          error={importError}
        />
      )}

      {step === 'done' && importResult && campaignId && (
        <CampaignWizardStep4
          campaignId={campaignId}
          campaignName={campaignName}
          result={importResult}
          onClose={onClose}
        />
      )}
    </FormModal>
  )
}
