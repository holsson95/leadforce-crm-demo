import { z } from 'zod'

export const CampaignSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  clientId: z.string().min(1, 'Client is required'),
  status: z.enum(['draft', 'active', 'paused', 'completed']).default('draft'),
  dailyTargetCalls: z.number().int().positive().nullable().optional(),
  sdrIds: z.array(z.string()).default([]),
})

export type CampaignFormData = z.infer<typeof CampaignSchema>
