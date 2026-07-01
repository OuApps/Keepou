import { createContext, useContext, type ReactNode } from 'react'
import { useTheme as useThemeState, type Theme } from '../hooks/useTheme'

/**
 * App-wide theme context. Wraps the `useTheme` hook (which owns `data-theme` on
 * <html>, the `prefers-color-scheme` default and the persistent override) so the
 * whole tree shares a single source of truth — Topbar toggles it, every screen
 * reads it — without duplicating state (handoff §8).
 */
interface ThemeContextValue {
  theme: Theme
  setTheme: (theme: Theme) => void
  toggle: () => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

export function ThemeProvider({ children }: { children: ReactNode }) {
  const value = useThemeState()
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useThemeContext(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (ctx === null) throw new Error('useThemeContext must be used within <ThemeProvider>')
  return ctx
}
