/**
 * Relative timestamps in French for the card meta line
 * (« il y a 2 h », « hier », « il y a 3 j » — cf. `Keepou - Board.dc.html`).
 */

/** API datetimes are naive UTC (no offset); pin them to UTC before parsing. */
export function parseApiDate(iso: string): Date {
  const hasZone = /Z$|[+-]\d\d:\d\d$/.test(iso)
  return new Date(hasZone ? iso : `${iso}Z`)
}

export function formatRelative(iso: string, now: Date = new Date()): string {
  const date = parseApiDate(iso)
  const seconds = Math.max(0, (now.getTime() - date.getTime()) / 1000)

  if (seconds < 60) return "à l'instant"
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `il y a ${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `il y a ${hours} h`
  const days = Math.floor(hours / 24)
  if (days === 1) return 'hier'
  if (days < 7) return `il y a ${days} j`
  return `le ${date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}`
}
