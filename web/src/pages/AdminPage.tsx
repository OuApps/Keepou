/**
 * Administration — placeholder (E7). Rendered inside the authenticated shell.
 * The real access manager (allowlist, members / pending, roles, enable-disable)
 * and the server-side `/admin` guard land in E7.
 */
export default function AdminPage() {
  return (
    <section>
      <p className="kp-tag">E7 · Administration</p>
      <h1 className="kp-title" style={{ fontSize: 26, marginBottom: 8 }}>
        Administration
      </h1>
      <p className="kp-muted">
        Gestion des accès (liste d’autorisation, membres / invités en attente, rôles, activation /
        désactivation). Écran implémenté en E7 — l’accès est gardé côté serveur.
      </p>
    </section>
  )
}
