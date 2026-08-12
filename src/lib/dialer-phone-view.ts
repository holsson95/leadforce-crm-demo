export type PhoneNumberView = 'mobile' | 'corporate'

export function resolvePhoneNumber(
  contact: { mobilePhone: string | null; corporatePhone: string | null },
  view: PhoneNumberView,
): string | null {
  return view === 'corporate' ? contact.corporatePhone : contact.mobilePhone
}
