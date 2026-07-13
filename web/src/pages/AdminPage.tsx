import { useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { AccessManager } from '../components/admin/AccessManager'
import { TokenManager } from '../components/TokenManager'
import { useI18n } from '../i18n'

/**
 * /admin — access administration (E7) + agent (MCP) access (E13). The real guard
 * is the API: every /api/admin/* route requires the admin role server-side
 * (claude.md §6); this client check is UX only, so a member who forces the URL
 * gets the refusal without a doomed API round-trip.
 */
export default function AdminPage() {
  const { ADMIN_COPY, TOKEN_COPY } = useI18n()
  const { user } = useAuth()
  const [tokensOpen, setTokensOpen] = useState(false)

  if (user?.role !== 'ADMIN') {
    return (
      <section className="kp-admin">
        <h1 className="kp-admin__title">{ADMIN_COPY.title}</h1>
        <p className="kp-admin__subtitle">{ADMIN_COPY.restricted}</p>
      </section>
    )
  }

  return (
    <>
      <AccessManager />
      <section className="kp-admin kp-admin--mcp">
        <h2 className="kp-admin__section-title">{TOKEN_COPY.title}</h2>
        <p className="kp-admin__subtitle">{TOKEN_COPY.adminIntro}</p>
        <button type="button" className="kp-admin__add-btn" onClick={() => setTokensOpen(true)}>
          {TOKEN_COPY.manage}
        </button>
      </section>
      {tokensOpen && <TokenManager onClose={() => setTokensOpen(false)} />}
    </>
  )
}
