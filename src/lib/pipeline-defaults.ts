import { db } from '@/lib/db'

export type DefaultStage = { name: string; color: string; position: number }

export const DEFAULT_STAGES: DefaultStage[] = [
  { name: 'Prospecting',    color: '#3b82f6', position: 0 },
  { name: 'Qualified',      color: '#8b5cf6', position: 1 },
  { name: 'Demo Scheduled', color: '#06b6d4', position: 2 },
  { name: 'Proposal Sent',  color: '#f59e0b', position: 3 },
  { name: 'Won',            color: '#22c55e', position: 4 },
  { name: 'Lost',           color: '#ef4444', position: 5 },
]

export async function seedDefaultStages(tenantId: string, clientId: string): Promise<void> {
  await db.pipelineStage.createMany({
    data: DEFAULT_STAGES.map(s => ({ ...s, tenantId, clientId })),
  })
}
