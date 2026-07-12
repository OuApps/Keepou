import { useEffect, useRef, useState } from 'react'
import type { MemberOut, UserAdminPatch } from '../../api/admin'
import { useI18n } from '../../i18n'
import { formatDayMonth } from '../../lib/time'

/**
 * A registered member: avatar (deterministic brand color), name + « admin »
 * badge, e-mail + registration date, the Actif / Désactivé status pill and the
 * ⋯ menu (« Promouvoir admin » / « Désactiver le compte », plus their reverse
 * actions — disabling is reversible, never a deletion, claude.md §5).
 *
 * The last-admin guard (FR-U5) is surfaced here: when the member is the last
 * ACTIVE admin, demote/disable are disabled with an explanatory footnote — the
 * server enforces the same rule with a 409.
 */

// Avatar palette from the mockup members (green / salsa / teal / gold); gold
// keeps ink text for contrast, the others are white-on-color.
const AVATAR_COLORS = [
  { background: 'var(--brand-green)', color: '#fff' },
  { background: 'var(--brand-salsa)', color: '#fff' },
  { background: 'var(--brand-teal)', color: '#fff' },
  { background: 'var(--brand-gold)', color: 'var(--brand-ink)' },
]

function avatarColor(email: string) {
  let hash = 0
  for (const char of email) hash = (hash * 31 + char.charCodeAt(0)) % 997
  return AVATAR_COLORS[hash % AVATAR_COLORS.length]
}

export function MemberRow({
  member,
  isLastActiveAdmin,
  onPatch,
  busy,
}: {
  member: MemberOut
  isLastActiveAdmin: boolean
  onPatch: (patch: UserAdminPatch) => void
  busy: boolean
}) {
  const { ADMIN_COPY } = useI18n()
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

  const isAdmin = member.role === 'ADMIN'
  const isActive = member.status === 'ACTIVE'
  const name = member.display_name ?? member.email
  const initial = name.trim().charAt(0).toUpperCase() || '?'

  const act = (patch: UserAdminPatch) => {
    setMenuOpen(false)
    onPatch(patch)
  }

  return (
    <li className="kp-admin__row">
      <div className="kp-admin__avatar" style={avatarColor(member.email)} aria-hidden="true">
        {initial}
      </div>
      <div className="kp-admin__id">
        <div className="kp-admin__name-line">
          <span className="kp-admin__name">{name}</span>
          {isAdmin && <span className="kp-admin__badge-admin">{ADMIN_COPY.adminBadge}</span>}
        </div>
        <div className="kp-admin__meta">
          {member.email}
          {member.registered_at
            ? ADMIN_COPY.registeredOn(formatDayMonth(member.registered_at))
            : ''}
        </div>
      </div>
      <div className="kp-admin__actions" ref={menuRef}>
        <span
          className={`kp-admin__status ${isActive ? 'kp-admin__status--active' : 'kp-admin__status--warn'}`}
        >
          {isActive ? ADMIN_COPY.statusActive : ADMIN_COPY.statusDisabled}
        </span>
        <button
          type="button"
          className="kp-admin__more"
          onClick={() => setMenuOpen((open) => !open)}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-label={ADMIN_COPY.actionsFor(name)}
          disabled={busy}
        >
          ⋯
        </button>
        {menuOpen && (
          <div className="kp-menu" role="menu">
            {isAdmin ? (
              <button
                type="button"
                className="kp-menu__item kp-admin__menu-item"
                role="menuitem"
                onClick={() => act({ role: 'MEMBER' })}
                disabled={isLastActiveAdmin}
              >
                {ADMIN_COPY.demote}
              </button>
            ) : (
              <button
                type="button"
                className="kp-menu__item kp-admin__menu-item"
                role="menuitem"
                onClick={() => act({ role: 'ADMIN' })}
              >
                {ADMIN_COPY.promote}
              </button>
            )}
            {isActive ? (
              <button
                type="button"
                className="kp-menu__item kp-admin__menu-item"
                role="menuitem"
                onClick={() => act({ status: 'DISABLED' })}
                disabled={isLastActiveAdmin}
              >
                {ADMIN_COPY.disable}
              </button>
            ) : (
              <button
                type="button"
                className="kp-menu__item kp-admin__menu-item"
                role="menuitem"
                onClick={() => act({ status: 'ACTIVE' })}
              >
                {ADMIN_COPY.enable}
              </button>
            )}
          </div>
        )}
      </div>
    </li>
  )
}
