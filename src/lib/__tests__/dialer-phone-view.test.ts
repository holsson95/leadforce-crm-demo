import { describe, it, expect } from 'vitest'
import { resolvePhoneNumber } from '../dialer-phone-view'

const contact = { mobilePhone: '555-1000', corporatePhone: '555-2000' }

describe('resolvePhoneNumber', () => {
  it('returns the mobile number when view is mobile', () => {
    expect(resolvePhoneNumber(contact, 'mobile')).toBe('555-1000')
  })

  it('returns the corporate number when view is corporate', () => {
    expect(resolvePhoneNumber(contact, 'corporate')).toBe('555-2000')
  })

  it('returns null when the mobile number is not on file', () => {
    expect(resolvePhoneNumber({ mobilePhone: null, corporatePhone: '555-2000' }, 'mobile')).toBeNull()
  })

  it('returns null when the corporate number is not on file', () => {
    expect(resolvePhoneNumber({ mobilePhone: '555-1000', corporatePhone: null }, 'corporate')).toBeNull()
  })
})
