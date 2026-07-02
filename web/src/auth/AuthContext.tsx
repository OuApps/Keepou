import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { fetchMe, type TokenPair, type UserOut } from '../api/auth'
import { SESSION_EXPIRED_EVENT } from '../api/client'
import { clearTokens, getAccessToken, getRefreshToken, setTokens } from './storage'

/**
 * Session state for the SPA. The session is only `authenticated` once
 * `GET /api/auth/me` has validated the stored tokens — the authoritative check
 * is always the API (server-side allowlist, role, status); this context only
 * drives client-side routing/UI (avatar, /admin entry).
 */
type AuthStatus = 'loading' | 'authenticated' | 'anonymous'

interface AuthContextValue {
  status: AuthStatus
  user: UserOut | null
  /** Store the token pair (login/register response), then load the user via `me`. */
  signIn: (tokens: TokenPair) => Promise<void>
  /** Logout is client-side (ARCHITECTURE §8): drop the tokens. */
  signOut: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserOut | null>(null)
  const [status, setStatus] = useState<AuthStatus>(() =>
    getAccessToken() || getRefreshToken() ? 'loading' : 'anonymous',
  )

  // Hydrate on load: validate the stored tokens against /api/auth/me.
  useEffect(() => {
    if (status !== 'loading') return
    let cancelled = false
    fetchMe()
      .then((me) => {
        if (cancelled) return
        setUser(me)
        setStatus('authenticated')
      })
      .catch(() => {
        // A 401 already dropped the tokens (client wrapper); anything else
        // (network, 403 disabled) also falls back to the login screen.
        if (cancelled) return
        setUser(null)
        setStatus('anonymous')
      })
    return () => {
      cancelled = true
    }
  }, [status])

  // A 401 that survived the refresh retry anywhere in the app ends the session.
  useEffect(() => {
    const onExpired = () => {
      setUser(null)
      setStatus('anonymous')
    }
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired)
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired)
  }, [])

  const signIn = useCallback(async (tokens: TokenPair) => {
    setTokens(tokens.access, tokens.refresh)
    try {
      const me = await fetchMe()
      setUser(me)
      setStatus('authenticated')
    } catch (err) {
      clearTokens()
      setUser(null)
      setStatus('anonymous')
      throw err
    }
  }, [])

  const signOut = useCallback(() => {
    clearTokens()
    setUser(null)
    setStatus('anonymous')
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({ status, user, signIn, signOut }),
    [status, user, signIn, signOut],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (ctx === null) throw new Error('useAuth must be used within <AuthProvider>')
  return ctx
}
