import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from './AuthContext'

/**
 * Client-side route guard (handoff §5): gate on a **valid** session (tokens
 * verified against /api/auth/me), not just a token's presence. Redirect to
 * /login when absent/invalid, remembering where the user was headed. The real
 * gate is the API — this only avoids rendering authenticated screens.
 */
export function RequireAuth() {
  const { status } = useAuth()
  const location = useLocation()

  // Tokens found but not validated yet: render nothing rather than flashing
  // the login screen (hydration resolves in one `me` round-trip).
  if (status === 'loading') {
    return null
  }

  if (status === 'anonymous') {
    return <Navigate to="/login" replace state={{ from: location }} />
  }

  return <Outlet />
}
