import { useAuth } from '../auth/AuthContext'
import { AccessManager } from '../components/admin/AccessManager'

/**
 * /admin — access administration (E7). The real guard is the API: every
 * /api/admin/* route requires the admin role server-side (claude.md §6); this
 * client check is UX only, so a member who forces the URL gets the refusal
 * without a doomed API round-trip.
 */
export default function AdminPage() {
  const { user } = useAuth()

  if (user?.role !== 'ADMIN') {
    return (
      <section className="kp-admin">
        <h1 className="kp-admin__title">Administration</h1>
        <p className="kp-admin__subtitle">Accès réservé aux administrateurs de l’instance.</p>
      </section>
    )
  }

  return <AccessManager />
}
