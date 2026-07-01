import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { clearTokens, getAccessToken, setTokens } from './storage'

/**
 * Minimal auth state for the SPA. `isAuthenticated` is derived from the presence of
 * an access token. The authoritative check is always the API (server-side allowlist,
 * role, lock — handoff §5); this context only drives client-side routing/UI.
 *
 * E2 fills `signIn` from the real /api/auth/login|register response.
 */
interface AuthContextValue {
  isAuthenticated: boolean
  signIn: (access: string, refresh?: string) => void
  signOut: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => getAccessToken())

  const signIn = useCallback((access: string, refresh?: string) => {
    setTokens(access, refresh)
    setToken(access)
  }, [])

  const signOut = useCallback(() => {
    clearTokens()
    setToken(null)
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({ isAuthenticated: token !== null, signIn, signOut }),
    [token, signIn, signOut],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (ctx === null) throw new Error('useAuth must be used within <AuthProvider>')
  return ctx
}
