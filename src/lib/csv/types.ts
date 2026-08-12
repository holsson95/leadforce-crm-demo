export type ContactField =
  | 'firstName'
  | 'lastName'
  | 'email'
  | 'mobilePhone'
  | 'corporatePhone'
  | 'companyName'
  | 'jobTitle'
  | 'industry'
  | 'employeeCount'
  | 'address'
  | 'city'
  | 'state'
  | 'zip'
  | 'country'
  | 'companyAddress'
  | 'companyCity'
  | 'website'
  | 'linkedinUrl'

export const CONTACT_FIELDS: { value: ContactField; label: string }[] = [
  { value: 'firstName',      label: 'First Name' },
  { value: 'lastName',       label: 'Last Name' },
  { value: 'email',          label: 'Email' },
  { value: 'mobilePhone',    label: 'Mobile Phone' },
  { value: 'corporatePhone', label: 'Corporate Phone' },
  { value: 'companyName',    label: 'Company Name' },
  { value: 'jobTitle',       label: 'Job Title' },
  { value: 'industry',       label: 'Industry' },
  { value: 'employeeCount',  label: '# Employees' },
  { value: 'address',        label: 'Address' },
  { value: 'city',           label: 'City' },
  { value: 'state',          label: 'State' },
  { value: 'zip',            label: 'ZIP' },
  { value: 'country',        label: 'Country' },
  { value: 'companyAddress', label: 'Company Address' },
  { value: 'companyCity',    label: 'Company City' },
  { value: 'website',        label: 'Website' },
  { value: 'linkedinUrl',    label: 'LinkedIn URL' },
]

export type ColumnMapping = {
  csvHeader: string
  contactField: ContactField | null
}

export type RawRow = Record<string, string>

export type MappedRow = {
  firstName: string
  lastName: string
  email: string | null
  mobilePhone: string | null
  corporatePhone: string | null
  mobilePhoneDigits: string | null
  corporatePhoneDigits: string | null
  companyName: string | null
  jobTitle: string | null
  industry: string | null
  employeeCount: number | null
  address: string | null
  city: string | null
  state: string | null
  zip: string | null
  country: string | null
  companyAddress: string | null
  companyCity: string | null
  website: string | null
  linkedinUrl: string | null
  dedupeHash: string
  dncReason?: string
}

export type DuplicateRow = {
  incoming: MappedRow
  existing: {
    id: string
    firstName: string
    lastName: string
    email: string | null
    mobilePhone: string | null
    companyName: string | null
    status: string
  }
  resolution: 'skip' | 'overwrite'
}

export type ImportPreviewResult = {
  clean: MappedRow[]
  duplicates: DuplicateRow[]
  dnc: MappedRow[]
  invalidRowCount: number
}

export type ImportResult = {
  created: number
  overwritten: number
  skipped: number
  dncBlocked: number
}
