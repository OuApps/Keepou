/**
 * Locale primitives (E12) — kept in their own module (no component exports) so
 * the provider file stays fast-refresh friendly. Types + the FR/EN ⇄ server
 * mapping + first-load detection.
 */
export type Locale = 'fr' | 'en'
export type ServerLanguage = 'FR' | 'EN'

export const LOCALE_STORAGE_KEY = 'keepou.language'

export function localeToServer(locale: Locale): ServerLanguage {
  return locale === 'en' ? 'EN' : 'FR'
}

export function serverToLocale(language: ServerLanguage): Locale {
  return language === 'EN' ? 'en' : 'fr'
}

export function detectLocale(): Locale {
  const stored = localStorage.getItem(LOCALE_STORAGE_KEY)
  if (stored === 'fr' || stored === 'en') return stored
  // Default to French unless the browser is clearly English (francophone community).
  return navigator.language?.toLowerCase().startsWith('en') ? 'en' : 'fr'
}
