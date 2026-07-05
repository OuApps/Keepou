import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { register } from '../api/auth'
import { ApiError } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { AuthMessage } from '../components/AuthMessage'
import { ThemeToggle } from '../components/ThemeToggle'

/**
 * Create-account screen + allowlist-denial screen (`Keepou - Auth.dc.html`).
 * The allowlist is checked **server-side**: a 403 from `POST /api/auth/register`
 * switches to « Accès non autorisé » (no account created, no in-app "request
 * access" — claude.md §4). Copy is frozen French (HANDOFF §7 "Auth").
 */
export default function RegisterPage() {
  const { signIn } = useAuth()
  const navigate = useNavigate()

  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [deniedEmail, setDeniedEmail] = useState<string | null>(null)

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      const tokens = await register({ email, password, display_name: displayName })
      await signIn(tokens)
      navigate('/', { replace: true })
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        // Not on the allowlist → dedicated denial screen (mockup « Refus »).
        setDeniedEmail(email.trim().toLowerCase())
      } else if (err instanceof ApiError && err.status === 409) {
        setError('Un compte existe déjà avec cette adresse e-mail.')
      } else {
        setError('Création du compte impossible. Réessaie dans un instant.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  if (deniedEmail !== null) {
    return (
      <div className="kp-auth kp-auth--salsa">
        <div className="kp-auth__theme">
          <ThemeToggle />
        </div>

        <div className="kp-auth__panel">
          <div className="kp-denial">
            <div className="kp-denial__icon">
              <svg width="30" height="30" viewBox="0 0 24 24" aria-hidden="true">
                <rect
                  x="4.5"
                  y="10"
                  width="15"
                  height="10"
                  rx="2.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                />
                <path
                  d="M7.5 10 V7.5 a4.5 4.5 0 0 1 9 0 V10"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                />
              </svg>
            </div>
            <h1 className="kp-denial__title">Accès non autorisé</h1>
            <p className="kp-denial__text">
              L'adresse <b>{deniedEmail}</b> ne figure pas sur la liste des membres autorisés de
              cette instance Keepou.
            </p>
            <div className="kp-denial__hint">
              <svg width="16" height="16" viewBox="0 0 20 20" aria-hidden="true">
                <path
                  d="M10 2.5a5 5 0 0 0-2.9 9.07c.55.4.9 1 .9 1.68v.25h4v-.25c0-.68.35-1.28.9-1.68A5 5 0 0 0 10 2.5Z"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinejoin="round"
                />
                <path
                  d="M8.4 16h3.2"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                />
              </svg>
              <span>
                Demande à l'administrateur de ton instance d'ajouter ton e-mail. Tu pourras ensuite
                créer ton compte.
              </span>
            </div>
            <Link to="/login" className="kp-auth__submit">
              Retour à la connexion
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="kp-auth kp-auth--avocat">
      <div className="kp-auth__theme">
        <ThemeToggle />
      </div>

      <div className="kp-auth__panel">
        <div className="kp-auth__brand">
          <h1 className="kp-auth__title">Créer un compte</h1>
          <p className="kp-auth__subtitle">
            Keepou est une instance privée. Ton compte n'est créé que si ton e-mail figure sur la
            liste autorisée.
          </p>
        </div>

        <form className="kp-auth__card" onSubmit={onSubmit}>
          <label className="kp-auth__label" htmlFor="register-name">
            Nom affiché
          </label>
          <div className="kp-auth__field">
            <input
              id="register-name"
              className="kp-auth__input"
              type="text"
              name="displayName"
              autoComplete="nickname"
              required
              maxLength={80}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </div>

          <label className="kp-auth__label" htmlFor="register-email">
            E-mail
          </label>
          <div className="kp-auth__field">
            <input
              id="register-email"
              className="kp-auth__input"
              type="email"
              name="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <label className="kp-auth__label" htmlFor="register-password">
            Mot de passe
          </label>
          <div className="kp-auth__field">
            <input
              id="register-password"
              className="kp-auth__input"
              type="password"
              name="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          {error && <AuthMessage variant="error">{error}</AuthMessage>}

          <button
            type="submit"
            className="kp-auth__submit kp-auth__submit--green"
            disabled={submitting}
          >
            Créer mon compte
          </button>
        </form>

        <p className="kp-auth__alt kp-auth__alt--green">
          Déjà un compte ? <Link to="/login">Se connecter</Link>
        </p>
      </div>
    </div>
  )
}
