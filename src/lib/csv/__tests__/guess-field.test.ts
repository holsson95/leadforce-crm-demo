import { describe, it, expect } from 'vitest'
import { guessField } from '../guess-field'

describe('guessField', () => {
  it('maps common email headers', () => {
    expect(guessField('Email')).toBe('email')
    expect(guessField('Work Email')).toBe('email')
    expect(guessField('EMAIL_ADDRESS')).toBe('email')
  })

  it('maps mobile phone headers', () => {
    expect(guessField('Mobile')).toBe('mobilePhone')
    expect(guessField('Cell Phone')).toBe('mobilePhone')
    expect(guessField('Phone')).toBe('mobilePhone')
    expect(guessField('Tel')).toBe('mobilePhone')
  })

  it('maps corporate phone headers before generic phone', () => {
    expect(guessField('Corporate Phone')).toBe('corporatePhone')
    expect(guessField('Direct Line')).toBe('corporatePhone')
    expect(guessField('Office Number')).toBe('corporatePhone')
  })

  it('maps name headers', () => {
    expect(guessField('First Name')).toBe('firstName')
    expect(guessField('first')).toBe('firstName')
    expect(guessField('Last Name')).toBe('lastName')
    expect(guessField('last')).toBe('lastName')
  })

  it('maps company headers', () => {
    expect(guessField('Company')).toBe('companyName')
    expect(guessField('Organization')).toBe('companyName')
    expect(guessField('Org')).toBe('companyName')
  })

  it('maps company city before generic city', () => {
    expect(guessField('Company City')).toBe('companyCity')
    expect(guessField('City')).toBe('city')
  })

  it('returns null for unmapped headers', () => {
    expect(guessField('Notes')).toBeNull()
    expect(guessField('Custom Field')).toBeNull()
    expect(guessField('Revenue')).toBeNull()
  })
})
