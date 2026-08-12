export function timeRemaining(deletedAtIso: string, now = new Date()): string {
  const expiresAt = new Date(new Date(deletedAtIso).getTime() + 72 * 60 * 60 * 1000)
  const msLeft = expiresAt.getTime() - now.getTime()
  if (msLeft <= 0) return 'Expired'
  const totalHours = Math.floor(msLeft / (60 * 60 * 1000))
  const days = Math.floor(totalHours / 24)
  const hours = totalHours % 24
  return days > 0 ? `${days}d ${hours}h remaining` : `${totalHours}h remaining`
}
