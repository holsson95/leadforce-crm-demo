import type { Client, Campaign, User, CampaignSDR, Contact } from '@prisma/client'
import type { CallOutcome } from '@prisma/client'

export type ClientWithCampaignCount = Client & {
  _count: { campaigns: number }
}

export type CampaignWithDetails = Campaign & {
  client: Pick<Client, 'id' | 'name'>
  sdrs: (CampaignSDR & {
    user: Pick<User, 'id' | 'name' | 'email'>
  })[]
}

export type ArchivedCampaign = {
  id: string
  name: string
  clientName: string
  archivedAt: string  // ISO string — serialized by the server component before passing to client
}

export type RecentlyDeletedCampaign = {
  id: string
  name: string
  clientName: string
  deletedAt: string  // ISO string
}

export type UserSummary = Pick<User, 'id' | 'name' | 'email' | 'role'>

export type ContactWithCampaign = Contact & {
  campaign: Pick<Campaign, 'id' | 'name'>
  accountOwner: Pick<User, 'id' | 'name'> | null
}

export type CallHistoryRecord = {
  id: string
  outcome: CallOutcome | null
  notes: string | null
  createdAt: string  // ISO string (JSON serialized from Date)
  callerName: string
}

export type ContactSummary = Pick<
  Contact,
  'id' | 'firstName' | 'lastName' | 'mobilePhone' | 'corporatePhone' | 'companyName' | 'status'
> & {
  jobTitle:      string | null
  employeeCount: number | null
  linkedinUrl:   string | null
  website:       string | null
  email:         string | null
  country:       string | null
  city:          string | null
  callHistory:   CallHistoryRecord[]
}

export type PipelineStageRow = {
  id: string
  name: string
  color: string
  position: number
}

export type PipelineDealRow = {
  id:        string
  stageId:   string
  clientId:  string
  contactId: string
  title:     string
  value:     string | null
  notes:     string | null
  source:    string
  createdAt: string
  contact: {
    firstName:   string
    lastName:    string
    companyName: string | null
  }
  campaign: {
    name: string
  }
}

export type PendingPipelineDealRow = {
  id:         string
  clientId:   string
  contactId:  string
  campaignId: string
  outcome:    string
  createdAt:  string
  contact: {
    firstName:   string
    lastName:    string
    companyName: string | null
    jobTitle:    string | null
  }
  campaign: {
    name: string
  }
}

export type TaskRow = {
  id: string
  title: string
  description: string | null
  color: string
  dueDate: string | null
  status: 'pending' | 'in_progress' | 'completed'
  contactId: string | null
  campaignId: string | null
  assigneeId: string
  createdAt: string
  assignee: { id: string; name: string }
  contact: { id: string; firstName: string; lastName: string } | null
  campaign: { id: string; name: string } | null
}

export type KpiStat = {
  current: number
  sparkline: number[]
  trend: number
}

export type DashboardKpisData = {
  calls: KpiStat
  conversations: KpiStat
  meetings: KpiStat
  conversionRate: KpiStat
}

export type CampaignHealthRow = {
  campaignId: string
  campaignName: string
  clientName: string
  score: number
  scoreLabel: 'green' | 'yellow' | 'red'
  activityRate: number
  conversionRate: number
  totalMBs: number
}

export type LeaderboardRow = {
  userId: string
  name: string
  calls: number
  conversations: number
  meetings: number
  score: number
  isMostImproved: boolean
}

export type MBDetailRow = {
  callRecordId: string
  contactFirstName: string
  contactLastName: string
  companyName: string | null
  sdrName: string
  campaignName: string
  date: string
  mbLeadStatus: 'first_conversation' | 'follow_up' | 'nurtured_lead'
}

export type MBBreakdownData = {
  summary: {
    total: number
    firstConversation: number
    followUp: number
    nurturedLead: number
  }
  rows: MBDetailRow[]
}

export type DailyTargetStats = {
  count: number
  target: number
}
