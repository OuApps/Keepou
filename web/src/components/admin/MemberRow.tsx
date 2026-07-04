import { useEffect, useRef, useState } from 'react'
import type { AdminUserPatch, MemberOut } from '../../api/admin'
import { formatDayMonth } from '../../lib/time'

/**
 * One registered member (`Keepou - Admin.dc.html`): avatar, name + admin badge,
 * email + join date, status pill and the ⋯ menu (« Promouvoir admin » /
 * « Désactiver le compte », plus their reverse actions). Actions that would
 * leave the instance without an active admin are disabled with the guard note
 * (FR-U5) — the server enforces the same rule with a 409.
 */

// Deterministic avatar shade per member (the mockup rotates the brand colors);
// gold keeps dark ink for contrast, the others are white-on-color.
const AVATAR_SHADES = [
  { background: 'var(--brand-green)', color: '#fff' },
  { background: 'var(--brand-salsa)', color: '#fff' },
  { background: 'var(--brand-teal)', color: '#fff' },
  { background: 'var(--brand-gold)', color: '#2e2a20' },
]

function avatarShade(email: string) {
  let sum = 0
  for (const char of email) sum += char.codePointAt(0) ?? 0
  return AVATAR_SHADES[sum % AVATAR_SHADES.length]
}

export function MemberRow({
  member,
  isLastActiveAdmin,
  onPatch,
}: {
  member: MemberOut
  /** True when this row is the only ACTIVE admin left (guard, FR-U5). */
  isLastActiveAdmin: boolean
  onPatch: (userId: string, patch: AdminUserPatch) => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    const onPointerDown = (e: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [menuOpen])

  const name = member.display_name ?? member.email
  const isAdmin = member.role === 'ADMIN'
  const isActive = member.status === 'ACTIVE'
  const initial = name.trim().charAt(0).toUpperCase() || '?'

  const act = (patch: AdminUserPatch) => {
    setMenuOpen(false)
    if (member.user_id) onPatch(member.user_id, patch)
  }

  return (
    <li className="kp-row">
      <span className="kp-row__avatar" style={avatarShade(member.email)} aria-hidden="true">
        {initial}
      </span>
      <div className="kp-row__main">
        <div className="kp-row__name-line">
          <span className="kp-row__name">{name}</span>
          {isAdmin && <span className="kp-row__admin-badge">admin</span>}
        </div>
        <div className="kp-row__meta">
          {member.email}
          {member.created_at && <> · inscrit le {formatDayMonth(member.created_at)}</>}
        </div>
      </div>
      <span className={`kp-pill ${isActive ? 'kp-pill--active' : 'kp-pill--gold'}`}>
        {isActive ? 'Actif' : 'Désactivé'}
      </span>
      <div className="kp-row__actions" ref={menuRef}>
        <button
          type="button"
          className="kp-row__more"
          onClick={() => setMenuOpen((open) => !open)}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-label={`Actions pour ${name}`}
        >
          ⋯
        </button>
        {menuOpen && (
          <div className="kp-menu kp-row__menu" role="menu">
            {isAdmin ? (
              <button
                type="button"
                className="kp-menu__item"
                role="menuitem"
                disabled={isLastActiveAdmin}
                onClick={() => act({ role: 'MEMBER' })}
              >
                Retirer le rôle admin
              </button>
            ) : (
              <button
                type="button"
                className="kp-menu__item"
                role="menuitem"
                onClick={() => act({ role: 'ADMIN' })}
              >
                Promouvoir admin
              </button>
            )}
            {isActive ? (
              <button
                type="button"
                className="kp-menu__item kp-menu__item--warn"
                role="menuitem"
                disabled={isLastActiveAdmin}
                onClick={() => act({ status: 'DISABLED' })}
              >
                Désactiver le compte
              </button>
            ) : (
              <button
                type="button"
                className="kp-menu__item"
                role="menuitem"
                onClick={() => act({ status: 'ACTIVE' })}
              >
                Réactiver le compte
              </button>
            )}
            {isLastActiveAdmin && (
              <p className="kp-row__guard-note">Il doit toujours rester au moins un admin actif.</p>
            )}
          </div>
        )}
      </div>
    </li>
  )
}
