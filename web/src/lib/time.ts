/**
 * Relative + absolute timestamps for the board cards (« il y a 2 h » / « 2 h
 * ago ») and the history screens (« Aujourd'hui · 14:32 » / « Today · 2:32 PM »).
 *
 * i18n (E12): these formatters are called from many render paths, so rather than
 * thread the locale through every call site they read a module-level active
 * locale, kept in sync by the `I18nProvider` (`setTimeLocale`). It is seeded from
 * localStorage at load so the first paint is already correct; a language switch
 * re-renders the tree, which re-runs the formatters against the new locale.
 * French stays the default (design/claude.md) — tests pin it implicitly.
 */

type TimeLocale = 'fr' | 'en'

let activeLocale: TimeLocale = readInitialLocale()

function readInitialLocale(): TimeLocale {
  try {
    return localStorage.getItem('keepou.language') === 'en' ? 'en' : 'fr'
  } catch {
    return 'fr'
  }
}

/** Kept in sync by the I18nProvider so timestamps follow the UI language. */
export function setTimeLocale(locale: TimeLocale): void {
  activeLocale = locale
}

const intlLocale = (): string => (activeLocale === 'en' ? 'en-US' : 'fr-FR')

/** API datetimes are naive UTC (no offset); pin them to UTC before parsing. */
export function parseApiDate(iso: string): Date {
  const hasZone = /Z$|[+-]\d\d:\d\d$/.test(iso)
  return new Date(hasZone ? iso : `${iso}Z`)
}

export function formatRelative(iso: string, now: Date = new Date()): string {
  const date = parseApiDate(iso)
  const seconds = Math.max(0, (now.getTime() - date.getTime()) / 1000)
  const en = activeLocale === 'en'

  if (seconds < 60) return en ? 'just now' : "à l'instant"
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return en ? `${minutes} min ago` : `il y a ${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return en ? `${hours}h ago` : `il y a ${hours} h`
  const days = Math.floor(hours / 24)
  if (days === 1) return en ? 'yesterday' : 'hier'
  if (days < 7) return en ? `${days}d ago` : `il y a ${days} j`
  return en ? `on ${dayOf(date, now)}` : `le ${dayOf(date, now)}`
}

/* --- History timestamps (E6, `Keepou - Historique.dc.html`) --- */

/** Calendar days between `date` and `now` in local time (0 = today, 1 = yesterday). */
function calendarDaysAgo(date: Date, now: Date): number {
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  return Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000)
}

const timeOf = (date: Date) =>
  date.toLocaleTimeString(intlLocale(), { hour: '2-digit', minute: '2-digit' })

/** « 12 juin » / « June 12 » — with the year when `date` is not in `now`'s year,
 * so imported Keep notes (E10/E11) read right instead of looking recent. */
const dayOf = (date: Date, now?: Date) =>
  date.toLocaleDateString(intlLocale(), {
    day: 'numeric',
    month: 'long',
    ...(now !== undefined && date.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}),
  })

/** History row label: « Aujourd'hui · 14:32 » / « Today · 2:32 PM » / « 12 juin · 20:10 ». */
export function formatVersionWhen(iso: string, now: Date = new Date()): string {
  const date = parseApiDate(iso)
  const days = calendarDaysAgo(date, now)
  const en = activeLocale === 'en'
  if (days <= 0) return `${en ? 'Today' : "Aujourd'hui"} · ${timeOf(date)}`
  if (days === 1) return `${en ? 'Yesterday' : 'Hier'} · ${timeOf(date)}`
  return `${dayOf(date, now)} · ${timeOf(date)}`
}

/** Day-only: « d'aujourd'hui » / « today » (confirm title, after « … version [from] »). */
export function formatVersionDay(iso: string, now: Date = new Date()): string {
  const date = parseApiDate(iso)
  const days = calendarDaysAgo(date, now)
  const en = activeLocale === 'en'
  if (days <= 0) return en ? 'today' : "d'aujourd'hui"
  if (days === 1) return en ? 'yesterday' : "d'hier"
  return en ? dayOf(date, now) : `du ${dayOf(date, now)}`
}

/** Day + time: « d'hier à 18:42 » / « yesterday at 6:42 PM » (confirm body). */
export function formatVersionAt(iso: string, now: Date = new Date()): string {
  const sep = activeLocale === 'en' ? 'at' : 'à'
  return `${formatVersionDay(iso, now)} ${sep} ${timeOf(parseApiDate(iso))}`
}

/** Day + time, plain: « hier à 18:42 » / « yesterday at 6:42 PM » (banner, preview meta). */
export function formatVersionMoment(iso: string, now: Date = new Date()): string {
  const date = parseApiDate(iso)
  const days = calendarDaysAgo(date, now)
  const en = activeLocale === 'en'
  const day =
    days <= 0
      ? en
        ? 'today'
        : "aujourd'hui"
      : days === 1
        ? en
          ? 'yesterday'
          : 'hier'
        : en
          ? dayOf(date, now)
          : `le ${dayOf(date, now)}`
  return `${day} ${en ? 'at' : 'à'} ${timeOf(date)}`
}

/** « 9 juin » / « June 9 » — the panel subtitle « N versions · depuis le 9 juin ». */
export function formatDayMonth(iso: string): string {
  return dayOf(parseApiDate(iso))
}

/** « 13 sept. 2020 » / « Sep 13, 2020 » — Keep dates on the import review cards (E10). */
export function formatImportDate(iso: string): string {
  return parseApiDate(iso).toLocaleDateString(intlLocale(), {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}
