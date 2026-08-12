import { computeDedupeHash } from './dedup'
import { normalizePhoneDigits } from '../utils/phone'
import type { RawRow, MappedRow, ColumnMapping, ContactField } from './types'

export function applyMapping(
  row: RawRow,
  mappings: ColumnMapping[]
): Partial<Record<ContactField, string>> {
  const result: Partial<Record<ContactField, string>> = {}
  for (const { csvHeader, contactField } of mappings) {
    if (contactField && csvHeader in row) {
      const val = row[csvHeader]?.trim()
      // Only write non-empty values so a later empty column doesn't erase a prior one
      if (val) result[contactField] = val
    }
  }
  return result
}

export function isValidRow(mapped: Partial<Record<ContactField, string>>): boolean {
  const email = mapped.email?.trim()
  const mobilePhone = mapped.mobilePhone?.trim()
  const corporatePhone = mapped.corporatePhone?.trim()
  return !!(email || mobilePhone || corporatePhone)
}

export function toMappedRow(mapped: Partial<Record<ContactField, string>>): MappedRow {
  const email = mapped.email?.trim() || null
  const mobilePhone = mapped.mobilePhone?.trim() || null
  const corporatePhone = mapped.corporatePhone?.trim() || null
  const rawEmployeeCount = mapped.employeeCount?.trim()
  const employeeCount = rawEmployeeCount ? (parseInt(rawEmployeeCount, 10) || null) : null
  return {
    firstName:      mapped.firstName?.trim()      ?? '',
    lastName:       mapped.lastName?.trim()       ?? '',
    email,
    mobilePhone,
    corporatePhone,
    mobilePhoneDigits:    normalizePhoneDigits(mobilePhone),
    corporatePhoneDigits: normalizePhoneDigits(corporatePhone),
    companyName:    mapped.companyName?.trim()    || null,
    jobTitle:       mapped.jobTitle?.trim()       || null,
    industry:       mapped.industry?.trim()       || null,
    employeeCount,
    address:        mapped.address?.trim()        || null,
    city:           mapped.city?.trim()           || null,
    state:          mapped.state?.trim()          || null,
    zip:            mapped.zip?.trim()            || null,
    country:        mapped.country?.trim()        || null,
    companyAddress: mapped.companyAddress?.trim() || null,
    companyCity:    mapped.companyCity?.trim()    || null,
    website:        mapped.website?.trim()        || null,
    linkedinUrl:    mapped.linkedinUrl?.trim()    || null,
    dedupeHash:     computeDedupeHash(email, mobilePhone),
  }
}

export function processRows(
  rawRows: RawRow[],
  mappings: ColumnMapping[]
): { valid: MappedRow[]; invalidCount: number } {
  let invalidCount = 0
  const valid: MappedRow[] = []

  for (const row of rawRows) {
    const mapped = applyMapping(row, mappings)
    if (!isValidRow(mapped)) {
      invalidCount++
      continue
    }
    valid.push(toMappedRow(mapped))
  }

  return { valid, invalidCount }
}
