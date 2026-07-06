import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { BOARD_COPY, COMMON_COPY, IMPORT_COPY, PROFILE_COPY } from '../lib/copy'
import { ProfileDialog } from './ProfileDialog'
import { ThemeToggle } from './ThemeToggle'

/**
 * App topbar — sticky, blurred, faithful to `Keepou - Board.dc.html`: logo +
 * brand, a central slot (the Board's search), a `tabs` slot (segmented pill),
 * theme toggle, avatar + menu (display name + « Administration » for admins
 * only — the real /admin guard is the API, E7 — + « Se déconnecter »).
 */
export function Topbar({ center, tabs }: { center?: ReactNode; tabs?: ReactNode }) {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const initial = user?.display_name?.trim().charAt(0).toUpperCase() || '?'

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

  return (
    <header className="kp-topbar">
      <div className="kp-topbar__brand">
        <img src="/keepou-mascot.png" alt="" className="kp-topbar__logo" width={38} height={38} />
        <span className="kp-topbar__name">{COMMON_COPY.appName}</span>
      </div>

      <div className="kp-topbar__center">{center}</div>

      {tabs !== undefined && <div className="kp-topbar__tabs">{tabs}</div>}

      <ThemeToggle />

      <div className="kp-topbar__account" ref={menuRef}>
        <button
          type="button"
          className="kp-topbar__avatar"
          onClick={() => setMenuOpen((open) => !open)}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-label={BOARD_COPY.accountMenu}
        >
          {initial}
        </button>
        {menuOpen && (
          <div className="kp-menu" role="menu">
            <div className="kp-menu__user">
              <span className="kp-menu__name">{user?.display_name}</span>
              <span className="kp-menu__email">{user?.email}</span>
            </div>
            <button
              type="button"
              className="kp-menu__item"
              role="menuitem"
              onClick={() => {
                setMenuOpen(false)
                setProfileOpen(true)
              }}
            >
              {PROFILE_COPY.menuEntry}
            </button>
            {user?.role === 'ADMIN' && (
              <button
                type="button"
                className="kp-menu__item"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false)
                  navigate('/admin')
                }}
              >
                {BOARD_COPY.adminEntry}
              </button>
            )}
            <button
              type="button"
              className="kp-menu__item"
              role="menuitem"
              onClick={() => {
                setMenuOpen(false)
                navigate('/?archived=1')
              }}
            >
              {BOARD_COPY.archivedEntry}
            </button>
            <button
              type="button"
              className="kp-menu__item"
              role="menuitem"
              onClick={() => {
                setMenuOpen(false)
                navigate('/import')
              }}
            >
              {IMPORT_COPY.menuEntry}
            </button>
            <button type="button" className="kp-menu__item" role="menuitem" onClick={signOut}>
              {BOARD_COPY.signOut}
            </button>
          </div>
        )}
      </div>

      {profileOpen && <ProfileDialog onClose={() => setProfileOpen(false)} />}
    </header>
  )
}
