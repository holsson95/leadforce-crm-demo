import type { ContactField } from './types'

export function guessField(header: string): ContactField | null {
  const h = header.toLowerCase().replace(/[^a-z]/g, '')
  if (h.includes('firstname') || h === 'first')                                                        return 'firstName'
  if (h.includes('lastname')  || h === 'last')                                                         return 'lastName'
  if (h.includes('email'))                                                                              return 'email'
  if (h.includes('corporate') || h.includes('direct') || h.includes('office'))                        return 'corporatePhone'
  if (h.includes('mobile') || h.includes('cell'))                                                      return 'mobilePhone'
  if (h.includes('phone') || h.includes('tel'))                                                        return 'mobilePhone'
  if (h.includes('employees') || h.includes('headcount') || h.includes('empcount') || h.includes('numemployees')) return 'employeeCount'
  if (h.includes('industry') || h.includes('sector') || h.includes('vertical'))                       return 'industry'
  if (h.includes('companycity') || h.includes('officecity'))                                           return 'companyCity'
  if (h.includes('companyaddress') || h.includes('officeaddress') || h.includes('hqaddress'))          return 'companyAddress'
  if (h.includes('company') || h.includes('organization') || h.includes('org'))                       return 'companyName'
  if (h.includes('title') || h.includes('jobtitle') || h.includes('position') || h.includes('role'))  return 'jobTitle'
  if (h.includes('address') || h.includes('street'))                                                   return 'address'
  if (h.includes('city'))                                                                               return 'city'
  if (h.includes('state') || h.includes('province') || h.includes('region'))                          return 'state'
  if (h.includes('zip') || h.includes('postal'))                                                       return 'zip'
  if (h.includes('country') || h.includes('nation'))                                                   return 'country'
  if (h.includes('linkedin'))                                                                           return 'linkedinUrl'
  if (h.includes('website') || h.includes('domain') || h.includes('url'))                             return 'website'
  return null
}
