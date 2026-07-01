import { Link } from 'react-router-dom'
import { ThemeToggle } from '../components/ThemeToggle'

/**
 * Create account — placeholder (E2). The real form and the server-side allowlist
 * gate (`POST /api/auth/register` → 403 off-allowlist, else 201) land in E2, along
 * with the "Accès non autorisé" denial screen.
 */
export default function RegisterPage() {
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
        Créer mon compte
      </h1>
      <p className="kp-muted">
        Écran de création de compte — implémenté en E2. La création n’aboutit que si l’adresse
        figure sur la liste des membres autorisés (vérification serveur).
      </p>

      <p className="kp-muted" style={{ fontSize: 14 }}>
        Déjà un compte ?{' '}
        <Link to="/login" className="kp-link">
          Se connecter
        </Link>
      </p>
    </div>
  )
}
