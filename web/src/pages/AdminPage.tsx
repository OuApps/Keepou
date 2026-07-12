import { useAuth } from '../auth/AuthContext'
import { AccessManager } from '../components/admin/AccessManager'
import { useI18n } from '../i18n'

/**
 * /admin — access administration (E7). The real guard is the API: every
 * /api/admin/* route requires the admin role server-side (claude.md §6); this
 * client check is UX only, so a member who forces the URL gets the refusal
 * without a doomed API round-trip.
 */
export default function AdminPage() {
  const { ADMIN_COPY } = useI18n()
  const { user } = useAuth()

  if (user?.role !== 'ADMIN') {
    return (
      <section className="kp-admin">
        <h1 className="kp-admin__title">{ADMIN_COPY.title}</h1>
        <p className="kp-admin__subtitle">{ADMIN_COPY.restricted}</p>
      </section>
    )
  }

  return <AccessManager />
}
