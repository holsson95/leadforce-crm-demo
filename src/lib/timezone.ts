import cityTimezones from 'city-timezones'

export function getCityTimezone(city: string, country?: string | null): string | null {
  const results = cityTimezones.lookupViaCity(city)
  if (!results.length) return null
  const match = country
    ? (results.find((r) => r.iso2 === country.toUpperCase()) ?? results[0])
    : results[0]
  return match.timezone
}

export function formatLocalTime(timezone: string): string {
  return new Intl.DateTimeFormat('en-AU', {
    timeZone: timezone,
    hour:     'numeric',
    minute:   '2-digit',
    hour12:   true,
  }).format(new Date())
}
