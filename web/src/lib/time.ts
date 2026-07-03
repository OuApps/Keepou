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

/* --- History timestamps (E6, `Keepou - Historique.dc.html`) --- */

/** Calendar days between `date` and `now` in local time (0 = today, 1 = yesterday). */
function calendarDaysAgo(date: Date, now: Date): number {
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  return Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000)
}

const timeOf = (date: Date) =>
  date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })

const dayOf = (date: Date) => date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })

/** History row label: « Aujourd'hui · 14:32 » / « Hier · 18:42 » / « 12 juin · 20:10 ». */
export function formatVersionWhen(iso: string, now: Date = new Date()): string {
  const date = parseApiDate(iso)
  const days = calendarDaysAgo(date, now)
  if (days <= 0) return `Aujourd'hui · ${timeOf(date)}`
  if (days === 1) return `Hier · ${timeOf(date)}`
  return `${dayOf(date)} · ${timeOf(date)}`
}

/** Day-only, genitive: « d'aujourd'hui » / « d'hier » / « du 12 juin » (confirm title). */
export function formatVersionDay(iso: string, now: Date = new Date()): string {
  const date = parseApiDate(iso)
  const days = calendarDaysAgo(date, now)
  if (days <= 0) return "d'aujourd'hui"
  if (days === 1) return "d'hier"
  return `du ${dayOf(date)}`
}

/** Day + time, genitive: « d'hier à 18:42 » / « du 12 juin à 20:10 » (confirm body). */
export function formatVersionAt(iso: string, now: Date = new Date()): string {
  return `${formatVersionDay(iso, now)} à ${timeOf(parseApiDate(iso))}`
}

/** Day + time, plain: « hier à 18:42 » / « le 12 juin à 20:10 » (banner, preview meta). */
export function formatVersionMoment(iso: string, now: Date = new Date()): string {
  const date = parseApiDate(iso)
  const days = calendarDaysAgo(date, now)
  const day = days <= 0 ? "aujourd'hui" : days === 1 ? 'hier' : `le ${dayOf(date)}`
  return `${day} à ${timeOf(date)}`
}

/** « 9 juin » — the panel subtitle « N versions · depuis le 9 juin ». */
export function formatDayMonth(iso: string): string {
  return dayOf(parseApiDate(iso))
}
