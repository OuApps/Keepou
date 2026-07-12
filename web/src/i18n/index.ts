/**
 * i18n public surface (E12). Components import `useI18n` (active copy) and, for
 * the language switcher, `useLocale`. The dictionaries live in `fr.ts` / `en.ts`;
 * the locale primitives (types + server mapping) live in `locale.ts`.
 */
export { I18nProvider, useI18n, useLocale } from './I18nProvider'
export { localeToServer, serverToLocale, type Locale, type ServerLanguage } from './locale'
export type { Copy } from './fr'
