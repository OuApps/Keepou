import { useEffect, useMemo, useState, type FormEvent } from 'react'
import {
  addAllowlistEntry,
  fetchMembers,
  patchUser,
  removeAllowlistEntry,
  type AdminUserPatch,
  type MemberOut,
} from '../../api/admin'
import { ApiError } from '../../api/client'
import { MemberRow } from './MemberRow'
import { PendingRow } from './PendingRow'

/**
 * The /admin screen (E7-S4/S5), faithful to `Keepou - Admin.dc.html`:
 * add-to-allowlist bar, « Membres » / « Invités en attente » tabs with live
 * counters, member rows (role/status actions) and pending rows (remove).
 * All mutations go through the admin API — the server enforces the rules
 * (admin-only 403, pending-only remove, last-admin guard 409) and this screen
 * surfaces its answers inline.
 */

type Tab = 'members' | 'pending'

export function AccessManager() {
  const [members, setMembers] = useState<MemberOut[] | null>(null)
  const [tab, setTab] = useState<Tab>('members')
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchMembers()
      .then((rows) => {
        if (!cancelled) setMembers(rows)
      })
      .catch((err) => {
        if (!cancelled) {
          setLoadError(err instanceof ApiError ? err.message : 'Erreur réseau — réessaie.')
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  const registered = useMemo(() => (members ?? []).filter((m) => !m.pending), [members])
  const pending = useMemo(() => (members ?? []).filter((m) => m.pending), [members])
  const activeAdmins = registered.filter((m) => m.role === 'ADMIN' && m.status === 'ACTIVE')

  const surface = (err: unknown) => {
    setError(err instanceof ApiError ? err.message : 'Erreur réseau — réessaie.')
  }

  const onAdd = async (e: FormEvent) => {
    e.preventDefault()
    const value = email.trim()
    if (!value || busy) return
    setBusy(true)
    setError(null)
    try {
      const entry = await addAllowlistEntry(value)
      setMembers((rows) => [...(rows ?? []), entry])
      setEmail('')
      setTab('pending') // the new invitee shows up as « En attente » (mockup behavior)
    } catch (err) {
      surface(err)
    } finally {
      setBusy(false)
    }
  }

  const onPatch = async (userId: string, patch: AdminUserPatch) => {
    setError(null)
    try {
      const updated = await patchUser(userId, patch)
      setMembers((rows) =>
        (rows ?? []).map((m) =>
          m.user_id === userId ? { ...m, role: updated.role, status: updated.status } : m,
        ),
      )
    } catch (err) {
      surface(err)
    }
  }

  const onRemove = async (entryId: string) => {
    setError(null)
    try {
      await removeAllowlistEntry(entryId)
      setMembers((rows) => (rows ?? []).filter((m) => m.allowlist_id !== entryId))
    } catch (err) {
      surface(err)
    }
  }

  if (loadError) {
    return (
      <section className="kp-admin">
        <h1 className="kp-admin__title">Gestion des accès</h1>
        <p className="kp-admin__error" role="alert">
          {loadError}
        </p>
      </section>
    )
  }

  return (
    <section className="kp-admin">
      <h1 className="kp-admin__title">Gestion des accès</h1>
      <p className="kp-admin__sub">
        Seuls les e-mails autorisés peuvent créer un compte sur cette instance.
      </p>

      <form className="kp-admin__addbar" onSubmit={onAdd}>
        <input
          type="email"
          className="kp-admin__addinput"
          placeholder="Ajouter un e-mail…"
          aria-label="Ajouter un e-mail"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <button type="submit" className="kp-admin__addbtn" disabled={busy || !email.trim()}>
          Ajouter à la liste
        </button>
      </form>

      {error && (
        <p className="kp-admin__error" role="alert">
          {error}
        </p>
      )}

      <div className="kp-admin__tabs" role="tablist" aria-label="Membres et invités">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'members'}
          className={`kp-admin__tab ${tab === 'members' ? 'kp-admin__tab--active' : ''}`}
          onClick={() => setTab('members')}
        >
          Membres <span className="kp-admin__count">{registered.length}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'pending'}
          className={`kp-admin__tab ${tab === 'pending' ? 'kp-admin__tab--active' : ''}`}
          onClick={() => setTab('pending')}
        >
          Invités en attente <span className="kp-admin__count">{pending.length}</span>
        </button>
      </div>

      {members === null ? (
        <p className="kp-admin__empty">Chargement…</p>
      ) : tab === 'members' ? (
        <ul className="kp-admin__list">
          {registered.map((m) => (
            <MemberRow
              key={m.user_id ?? m.email}
              member={m}
              isLastActiveAdmin={activeAdmins.length === 1 && activeAdmins[0].user_id === m.user_id}
              onPatch={onPatch}
            />
          ))}
        </ul>
      ) : pending.length === 0 ? (
        <p className="kp-admin__empty">Aucun invité en attente — ajoute un e-mail ci-dessus.</p>
      ) : (
        <ul className="kp-admin__list">
          {pending.map((m) => (
            <PendingRow key={m.allowlist_id ?? m.email} entry={m} onRemove={onRemove} />
          ))}
        </ul>
      )}

      <p className="kp-admin__note">
        <strong>Désactiver, jamais supprimer</strong> — désactiver bloque la connexion tout en
        conservant le compte et ses notes. Un membre désactivé peut être réactivé à tout moment.
      </p>
    </section>
  )
}
