import { useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { login } from '../api/auth'
import { ApiError } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { AuthMessage } from '../components/AuthMessage'
import { ThemeToggle } from '../components/ThemeToggle'

/**
 * Login screen (`Keepou - Auth.dc.html`): brand, e-mail + password card, gold
 * gradient submit. Inline states — bad credentials (terracotta, 401) and
 * disabled account (gold, 403). Copy is frozen French (HANDOFF §7 "Auth").
 */
export default function LoginPage() {
  const { signIn } = useAuth()
  const navigate = useNavigate()
  const location = useLocation() as { state?: { from?: { pathname?: string } } }
  const from = location.state?.from?.pathname ?? '/'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<{ variant: 'error' | 'warning'; text: string } | null>(null)

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      const tokens = await login(email, password)
      await signIn(tokens)
      navigate(from, { replace: true })
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setError({ variant: 'error', text: 'E-mail ou mot de passe incorrect.' })
      } else if (err instanceof ApiError && err.status === 403) {
        setError({
          variant: 'warning',
          text: "Ton accès a été suspendu. Contacte l'administrateur.",
        })
      } else {
        setError({ variant: 'error', text: 'Connexion impossible. Réessaie dans un instant.' })
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="kp-auth kp-auth--gold">
      <div className="kp-auth__theme">
        <ThemeToggle />
      </div>

      <div className="kp-auth__panel">
        <div className="kp-auth__brand">
          <img
            src="/keepou-mascot.png"
            alt=""
            className="kp-auth__brand-logo"
            width={72}
            height={72}
          />
          <h1 className="kp-auth__brand-name">Keepou</h1>
        </div>

        <form className="kp-auth__card" onSubmit={onSubmit}>
          <label className="kp-auth__label" htmlFor="login-email">
            E-mail
          </label>
          <div className="kp-auth__field">
            <input
              id="login-email"
              className="kp-auth__input"
              type="email"
              name="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <label className="kp-auth__label" htmlFor="login-password">
            Mot de passe
          </label>
          <div className="kp-auth__field">
            <input
              id="login-password"
              className="kp-auth__input"
              type={showPassword ? 'text' : 'password'}
              name="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button
              type="button"
              className="kp-auth__eye"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
              aria-pressed={showPassword}
            >
              <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden="true">
                <path
                  d="M2 10s3-5 8-5 8 5 8 5-3 5-8 5-8-5-8-5Z"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.4"
                />
                <circle
                  cx="10"
                  cy="10"
                  r="2.2"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.4"
                />
                {showPassword && (
                  <path
                    d="M4 16 16 4"
                    stroke="currentColor"
                    strokeWidth="1.4"
                    strokeLinecap="round"
                  />
                )}
              </svg>
            </button>
          </div>

          {error && <AuthMessage variant={error.variant}>{error.text}</AuthMessage>}

          <button type="submit" className="kp-auth__submit" disabled={submitting}>
            Se connecter
          </button>
        </form>

        <p className="kp-auth__alt kp-auth__alt--salsa">
          Pas encore de compte ? <Link to="/register">Créer un compte</Link>
        </p>
      </div>
    </div>
  )
}
