import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { fetchMe, updateMe, type TokenPair, type UserOut } from '../api/auth'
import { ApiError, SESSION_EXPIRED_EVENT } from '../api/client'
import { clearBoardCache } from '../lib/boardCache'
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
  /** Change the current user's display name (E11), reflected immediately in the UI. */
  changeDisplayName: (displayName: string) => Promise<void>
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
    let timer: number | undefined

    const attempt = (retriesLeft: number) => {
      fetchMe()
        .then((me) => {
          if (cancelled) return
          setUser(me)
          setStatus('authenticated')
        })
        .catch((err) => {
          if (cancelled) return
          // Only a real auth verdict ends the session: 401 (invalid/expired —
          // tokens already dropped by the wrapper) or 403 (account disabled).
          const isAuthError = err instanceof ApiError && (err.status === 401 || err.status === 403)
          if (!isAuthError && retriesLeft > 0) {
            // Network blip / 5xx: retry instead of bouncing valid tokens to /login.
            timer = window.setTimeout(() => attempt(retriesLeft - 1), 1500)
            return
          }
          if (isAuthError) clearTokens()
          setUser(null)
          setStatus('anonymous')
        })
    }

    attempt(2)
    return () => {
      cancelled = true
      if (timer !== undefined) window.clearTimeout(timer)
    }
  }, [status])

  // A 401 that survived the refresh retry anywhere in the app ends the session.
  useEffect(() => {
    const onExpired = () => {
      clearBoardCache()
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
    clearBoardCache()
    setUser(null)
    setStatus('anonymous')
  }, [])

  const changeDisplayName = useCallback(async (displayName: string) => {
    const updated = await updateMe(displayName)
    setUser(updated)
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({ status, user, signIn, signOut, changeDisplayName }),
    [status, user, signIn, signOut, changeDisplayName],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (ctx === null) throw new Error('useAuth must be used within <AuthProvider>')
  return ctx
}
