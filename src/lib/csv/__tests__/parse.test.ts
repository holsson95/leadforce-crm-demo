import { describe, it, expect } from 'vitest'
import { applyMapping, isValidRow, toMappedRow, processRows } from '../parse'
import type { ColumnMapping, RawRow } from '../types'

const mappings: ColumnMapping[] = [
  { csvHeader: 'First Name',     contactField: 'firstName' },
  { csvHeader: 'Last Name',      contactField: 'lastName' },
  { csvHeader: 'Email Address',  contactField: 'email' },
  { csvHeader: 'Phone',          contactField: 'mobilePhone' },
  { csvHeader: 'Company',        contactField: 'companyName' },
]

describe('applyMapping', () => {
  it('maps csv headers to contact fields', () => {
    const row: RawRow = {
      'First Name': 'John', 'Last Name': 'Doe',
      'Email Address': 'john@test.com', 'Phone': '', 'Company': 'Acme',
    }
    const result = applyMapping(row, mappings)
    expect(result.firstName).toBe('John')
    expect(result.email).toBe('john@test.com')
    expect(result.companyName).toBe('Acme')
  })
  it('ignores headers not present in mappings', () => {
    const row: RawRow = { 'First Name': 'John', 'Notes': 'ignored' }
    const result = applyMapping(row, mappings)
    expect(result).not.toHaveProperty('Notes')
  })
  it('skips columns with null contactField', () => {
    const m: ColumnMapping[] = [{ csvHeader: 'Notes', contactField: null }]
    const row: RawRow = { Notes: 'some note' }
    const result = applyMapping(row, m)
    expect(Object.keys(result)).toHaveLength(0)
  })
  it('does not overwrite a populated field with an empty one', () => {
    const m: ColumnMapping[] = [
      { csvHeader: 'Mobile Phone', contactField: 'mobilePhone' },
      { csvHeader: 'Phone',        contactField: 'mobilePhone' },
    ]
    const row: RawRow = { 'Mobile Phone': '555-1111', 'Phone': '' }
    const result = applyMapping(row, m)
    expect(result.mobilePhone).toBe('555-1111')
  })
})

describe('isValidRow', () => {
  it('returns true when email present', () => {
    expect(isValidRow({ email: 'test@test.com' })).toBe(true)
  })
  it('returns true when mobilePhone present', () => {
    expect(isValidRow({ mobilePhone: '5550001234' })).toBe(true)
  })
  it('returns true when only corporatePhone present', () => {
    expect(isValidRow({ corporatePhone: '5550001234' })).toBe(true)
  })
  it('returns false when neither email nor any phone', () => {
    expect(isValidRow({ firstName: 'John' })).toBe(false)
  })
  it('returns false when email and mobilePhone are empty strings', () => {
    expect(isValidRow({ email: '   ', mobilePhone: '  ' })).toBe(false)
  })
})

describe('toMappedRow', () => {
  it('converts mapped fields to MappedRow with dedupeHash', () => {
    const row = toMappedRow({ firstName: 'John', lastName: 'Doe', email: 'john@test.com' })
    expect(row.firstName).toBe('John')
    expect(row.email).toBe('john@test.com')
    expect(row.mobilePhone).toBeNull()
    expect(row.dedupeHash).toHaveLength(64)
  })
  it('sets optional fields to null when absent', () => {
    const row = toMappedRow({ email: 'a@b.com' })
    expect(row.firstName).toBe('')
    expect(row.companyName).toBeNull()
  })
  it('computes mobilePhoneDigits and corporatePhoneDigits', () => {
    const row = toMappedRow({
      firstName: 'John', lastName: 'Smith',
      mobilePhone: '+1 (555) 123-4567',
      corporatePhone: '555-987-6543',
    })
    expect(row.mobilePhoneDigits).toBe('5551234567')
    expect(row.corporatePhoneDigits).toBe('5559876543')
  })
  it('sets mobilePhoneDigits/corporatePhoneDigits to null when phone fields are absent', () => {
    const row = toMappedRow({ firstName: 'John', lastName: 'Smith' })
    expect(row.mobilePhoneDigits).toBeNull()
    expect(row.corporatePhoneDigits).toBeNull()
  })
})

describe('processRows', () => {
  it('filters out invalid rows and counts them', () => {
    const rows: RawRow[] = [
      { 'First Name': 'John', 'Last Name': 'Doe', 'Email Address': 'john@test.com', 'Phone': '', 'Company': '' },
      { 'First Name': 'No',   'Last Name': 'Contact', 'Email Address': '', 'Phone': '', 'Company': '' },
    ]
    const { valid, invalidCount } = processRows(rows, mappings)
    expect(valid).toHaveLength(1)
    expect(invalidCount).toBe(1)
  })
  it('returns empty arrays for empty input', () => {
    const { valid, invalidCount } = processRows([], mappings)
    expect(valid).toHaveLength(0)
    expect(invalidCount).toBe(0)
  })
  it('assigns a dedupeHash to each valid row', () => {
    const rows: RawRow[] = [
      { 'First Name': 'Jane', 'Last Name': 'Doe', 'Email Address': 'jane@test.com', 'Phone': '', 'Company': '' },
    ]
    const { valid } = processRows(rows, mappings)
    expect(valid[0].dedupeHash).toHaveLength(64)
  })
})
