import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { setTimeLocale } from '../lib/time'
import { en } from './en'
import { fr, type Copy } from './fr'
import { detectLocale, LOCALE_STORAGE_KEY, type Locale } from './locale'

/**
 * App-wide i18n (E12). Owns the active locale — sourced from localStorage, then
 * the browser language, and adopted from the server (`User.language`) once the
 * session loads (AuthContext). `useI18n()` returns the active copy dictionary so
 * components read strings that re-render on a language switch; `useLocale()`
 * exposes the current locale + setter for the switcher. The product is
 * francophone-first, so French is the default (design/claude.md).
 */
const dictionaries: Record<Locale, Copy> = { fr, en }

interface I18nContextValue {
  locale: Locale
  setLocale: (locale: Locale) => void
  t: Copy
}

const I18nContext = createContext<I18nContextValue | null>(null)

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(detectLocale)

  useEffect(() => {
    // Reflect the locale on <html lang> (a11y / correct hyphenation) and persist
    // it so the next boot renders in the right language before /auth/me resolves.
    document.documentElement.lang = locale
    localStorage.setItem(LOCALE_STORAGE_KEY, locale)
    // Keep the timestamp formatters (lib/time) in sync — they read a module-level
    // locale rather than being threaded through every call site.
    setTimeLocale(locale)
  }, [locale])

  const setLocale = useCallback((next: Locale) => setLocaleState(next), [])
  const value = useMemo<I18nContextValue>(
    () => ({ locale, setLocale, t: dictionaries[locale] }),
    [locale, setLocale],
  )

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

function useI18nContext(): I18nContextValue {
  const ctx = useContext(I18nContext)
  if (ctx === null) throw new Error('useI18n must be used within <I18nProvider>')
  return ctx
}

/** The active copy dictionary — components destructure the `*_COPY` groups from it. */
// eslint-disable-next-line react-refresh/only-export-components
export function useI18n(): Copy {
  return useI18nContext().t
}

/** The current locale and its setter — for the language switcher. */
// eslint-disable-next-line react-refresh/only-export-components
export function useLocale(): { locale: Locale; setLocale: (locale: Locale) => void } {
  const { locale, setLocale } = useI18nContext()
  return { locale, setLocale }
}
