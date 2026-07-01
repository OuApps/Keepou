import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { ThemeToggle } from '../components/ThemeToggle'

/**
 * Login — placeholder (E2). The real form (email + password, error states,
 * disabled-account message) lands in E2 with the `/api/auth/login` call.
 *
 * The "Entrer en mode démo" button is E0 scaffolding: it sets a placeholder token
 * so the guarded shell is reachable for design QA. E2 replaces it with real auth.
 */
export default function LoginPage() {
  const { signIn } = useAuth()
  const navigate = useNavigate()
  const location = useLocation() as { state?: { from?: { pathname?: string } } }
  const from = location.state?.from?.pathname ?? '/'

  const enterDemo = () => {
    signIn('dev-placeholder-token')
    navigate(from, { replace: true })
  }

  return (
    <div className="kp-center">
      <div style={{ position: 'absolute', top: 16, right: 16 }}>
        <ThemeToggle />
      </div>

      <div className="kp-brand">
        <img src="/keepou-mascot.png" alt="" className="kp-brand__logo" width={44} height={44} />
        <span className="kp-brand__name">Keepou</span>
      </div>

      <h1 className="kp-title" style={{ fontSize: 22 }}>
        Se connecter
      </h1>
      <p className="kp-muted">
        Écran d’authentification — implémenté en E2 (e-mail + mot de passe, liste d’autorisation
        vérifiée côté serveur).
      </p>

      <button type="button" className="kp-btn" onClick={enterDemo}>
        Entrer en mode démo
      </button>

      <p className="kp-muted" style={{ fontSize: 14 }}>
        Pas encore de compte ?{' '}
        <Link to="/register" className="kp-link">
          Créer mon compte
        </Link>
      </p>
    </div>
  )
}
