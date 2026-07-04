import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { ThemeToggle } from './ThemeToggle'

/**
 * App topbar — sticky, blurred, faithful to `Keepou - Board.dc.html`: logo +
 * brand, a central slot (the Board's search), a `tabs` slot (segmented pill),
 * theme toggle, avatar + menu (display name, « Administration » for admins
 * only — the API is the real guard —, « Se déconnecter »).
 */
export function Topbar({ center, tabs }: { center?: ReactNode; tabs?: ReactNode }) {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)
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
        <span className="kp-topbar__name">Keepou</span>
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
          aria-label="Menu du compte"
        >
          {initial}
        </button>
        {menuOpen && (
          <div className="kp-menu" role="menu">
            <div className="kp-menu__user">
              <span className="kp-menu__name">{user?.display_name}</span>
              <span className="kp-menu__email">{user?.email}</span>
            </div>
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
                Administration
              </button>
            )}
            <button type="button" className="kp-menu__item" role="menuitem" onClick={signOut}>
              Se déconnecter
            </button>
          </div>
        )}
      </div>
    </header>
  )
}
