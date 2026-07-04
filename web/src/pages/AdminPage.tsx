import { Navigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { AccessManager } from '../components/admin/AccessManager'

/**
 * /admin — the access manager (E7). The redirect below is UX only: the real
 * guard is the API's `require_admin` (claude.md §6), which answers 403 to any
 * non-admin call regardless of what the client renders.
 */
export default function AdminPage() {
  const { user } = useAuth()
  if (user && user.role !== 'ADMIN') return <Navigate to="/" replace />
  return <AccessManager />
}
