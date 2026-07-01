import { Link } from 'react-router-dom'

/** 404 — unknown route. */
export default function NotFoundPage() {
  return (
    <div className="kp-center">
      <div className="kp-brand">
        <img src="/keepou-mascot.png" alt="" className="kp-brand__logo" width={44} height={44} />
        <span className="kp-brand__name">Keepou</span>
      </div>
      <h1 className="kp-title" style={{ fontSize: 22 }}>
        Page introuvable
      </h1>
      <p className="kp-muted">Cette page n’existe pas.</p>
      <Link to="/" className="kp-link">
        Retour au board
      </Link>
    </div>
  )
}
