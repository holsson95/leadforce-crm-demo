export enum UserRole {
  admin = 'admin',
  manager = 'manager',
  sdr = 'sdr',
  client = 'client',
}

export enum CampaignStatus {
  draft = 'draft',
  active = 'active',
  paused = 'paused',
  completed = 'completed',
}

export enum ContactList {
  prospect = 'prospect',
  lead = 'lead',
  dnc = 'dnc',
  future = 'future',
  call_back = 'call_back',
  meeting_booked = 'meeting_booked',
}

export enum TaskStatus {
  pending = 'pending',
  in_progress = 'in_progress',
  completed = 'completed',
}
