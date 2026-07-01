import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from './AuthContext'

/**
 * Client-side route guard (handoff §5): redirect to /login when unauthenticated,
 * remembering where the user was headed so E2 can bounce them back after login.
 * The real gate is the API — this only avoids rendering authenticated screens.
 */
export function RequireAuth() {
  const { isAuthenticated } = useAuth()
  const location = useLocation()

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />
  }

  return <Outlet />
}
