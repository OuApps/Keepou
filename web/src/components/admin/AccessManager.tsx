import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import {
  addToAllowlist,
  fetchMembers,
  patchUser,
  removeAllowlistEntry,
  type MemberOut,
  type UserAdminPatch,
} from '../../api/admin'
import { ApiError } from '../../api/client'
import { AuthMessage } from '../AuthMessage'
import { MemberRow } from './MemberRow'
import { PendingRow } from './PendingRow'

/**
 * The /admin access manager (E7-S4/S5), faithful to `Keepou - Admin.dc.html`:
 * « Ajouter à la liste » field, Membres / Invités en attente tabs with live
 * counters, MemberRow / PendingRow lists and the « Désactiver, jamais
 * supprimer » note. Every rule is enforced by the API (require_admin, pending-
 * only removal, last-admin guard) — this screen renders what the API returns
 * and surfaces its 409s inline.
 */
export function AccessManager() {
  const [rows, setRows] = useState<MemberOut[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [tab, setTab] = useState<'members' | 'pending'>('members')
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => {
    return fetchMembers()
      .then((data) => {
        setRows(data)
        setLoadError(null)
      })
      .catch((err) => {
        setLoadError(err instanceof ApiError ? err.message : 'Erreur réseau')
      })
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const members = useMemo(() => (rows ?? []).filter((r) => !r.pending), [rows])
  const pending = useMemo(() => (rows ?? []).filter((r) => r.pending), [rows])
  const activeAdmins = members.filter((m) => m.role === 'ADMIN' && m.status === 'ACTIVE')

  /** Run a mutation then re-sync the list; 409s (guards) surface inline. */
  const run = (mutation: () => Promise<unknown>) => {
    setBusy(true)
    setActionError(null)
    return mutation()
      .then(() => load())
      .catch((err) => {
        setActionError(err instanceof ApiError ? err.message : 'Erreur réseau')
      })
      .finally(() => setBusy(false))
  }

  const onAdd = (e: FormEvent) => {
    e.preventDefault()
    const value = email.trim()
    if (!value || busy) return
    void run(() => addToAllowlist(value)).then(() => {
      setEmail('')
      setTab('pending')
    })
  }

  if (loadError !== null) {
    return (
      <section className="kp-admin">
        <h1 className="kp-admin__title">Administration</h1>
        <p className="kp-admin__subtitle">{loadError}</p>
      </section>
    )
  }

  return (
    <section className="kp-admin">
      <h1 className="kp-admin__title">Gestion des accès</h1>
      <p className="kp-admin__subtitle">
        Seuls les e-mails autorisés peuvent créer un compte sur cette instance.
      </p>

      <form className="kp-admin__add" onSubmit={onAdd}>
        <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden="true">
          <rect
            x="2.5"
            y="4.5"
            width="15"
            height="11"
            rx="2"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
          />
          <path
            d="M3 5.5 L10 10.5 L17 5.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinejoin="round"
          />
        </svg>
        <input
          type="email"
          className="kp-admin__add-input"
          placeholder="Ajouter un e-mail…"
          aria-label="Adresse e-mail à autoriser"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <button type="submit" className="kp-admin__add-btn" disabled={busy || !email.trim()}>
          <span className="kp-admin__long">Ajouter à la liste</span>
          <span className="kp-admin__short">Ajouter</span>
        </button>
      </form>

      {actionError !== null && <AuthMessage variant="warning">{actionError}</AuthMessage>}

      <div className="kp-admin__tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'members'}
          className={`kp-admin__tab ${tab === 'members' ? 'kp-admin__tab--active' : ''}`}
          onClick={() => setTab('members')}
        >
          Membres <span className="kp-admin__count">{members.length}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'pending'}
          className={`kp-admin__tab ${tab === 'pending' ? 'kp-admin__tab--active' : ''}`}
          onClick={() => setTab('pending')}
        >
          <span className="kp-admin__long">Invités en attente</span>
          <span className="kp-admin__short">En attente</span>
          <span className="kp-admin__count">{pending.length}</span>
        </button>
      </div>

      {rows === null ? (
        <p className="kp-admin__empty">Chargement…</p>
      ) : tab === 'members' ? (
        <ul className="kp-admin__list">
          {members.map((member) => (
            <MemberRow
              key={member.user_id ?? member.email}
              member={member}
              busy={busy}
              isLastActiveAdmin={
                member.role === 'ADMIN' && member.status === 'ACTIVE' && activeAdmins.length <= 1
              }
              onPatch={(patch: UserAdminPatch) => {
                if (member.user_id) void run(() => patchUser(member.user_id!, patch))
              }}
            />
          ))}
        </ul>
      ) : pending.length === 0 ? (
        <p className="kp-admin__empty">
          Aucun invité en attente — ajoute un e-mail pour autoriser un nouveau membre.
        </p>
      ) : (
        <ul className="kp-admin__list">
          {pending.map((entry) => (
            <PendingRow
              key={entry.allowlist_id ?? entry.email}
              entry={entry}
              busy={busy}
              onRemove={() => {
                if (entry.allowlist_id) void run(() => removeAllowlistEntry(entry.allowlist_id!))
              }}
            />
          ))}
        </ul>
      )}

      <p className="kp-admin__note">
        <b>Désactiver, jamais supprimer</b> — désactiver <b>bloque la connexion</b> tout en
        conservant le compte et ses notes. Aucune suppression de compte : un membre désactivé peut
        être réactivé à tout moment.
      </p>
    </section>
  )
}
