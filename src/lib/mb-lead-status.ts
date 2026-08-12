import { MBLeadStatus } from '@prisma/client'

export function classifyMBLeadStatus(
  priorConversationCount: number,
  contactCreatedAt: Date,
  now = new Date()
): MBLeadStatus {
  if (priorConversationCount === 0) return MBLeadStatus.first_conversation
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
  if (contactCreatedAt < thirtyDaysAgo) return MBLeadStatus.nurtured_lead
  return MBLeadStatus.follow_up
}
