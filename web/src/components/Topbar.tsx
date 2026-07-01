import { type ReactNode } from 'react'
import { useAuth } from '../auth/AuthContext'
import { ThemeToggle } from './ThemeToggle'

/**
 * App topbar — sticky, blurred, faithful to `Keepou - Board.dc.html` (logo + brand,
 * a central slot filled per screen, theme toggle, avatar).
 *
 * `center` hosts screen-specific chrome (the Board's search + tabs land here in E3).
 * The avatar is a temporary dev sign-out until E7 turns it into the real menu
 * (Administration / logout).
 */
export function Topbar({ center }: { center?: ReactNode }) {
  const { signOut } = useAuth()

  return (
    <header className="kp-topbar">
      <div className="kp-topbar__brand">
        <img src="/keepou-mascot.png" alt="" className="kp-topbar__logo" width={38} height={38} />
        <span className="kp-topbar__name">Keepou</span>
      </div>

      <div className="kp-topbar__center">{center}</div>

      <ThemeToggle />

      <button
        type="button"
        className="kp-topbar__avatar"
        onClick={signOut}
        title="Se déconnecter"
        aria-label="Se déconnecter"
      >
        M
      </button>
    </header>
  )
}
