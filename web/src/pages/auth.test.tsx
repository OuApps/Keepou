import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App'

/**
 * E2-S8 (front): inline login errors (terracotta 401 / gold 403-disabled),
 * the allowlist-denial screen on register 403, and the full sign-in flow.
 * fetch is stubbed — the real business rules live (and are tested) server-side.
 */

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  )
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

function stubFetch(routes: Record<string, (init?: RequestInit) => Response>) {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString()
      const handler = routes[url]
      if (!handler) throw new Error(`Unexpected fetch: ${url}`)
      return Promise.resolve(handler(init))
    }),
  )
}

function fillLogin(email: string, password: string) {
  fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: email } })
  fireEvent.change(screen.getByLabelText('Mot de passe'), { target: { value: password } })
}

describe('LoginPage', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => vi.unstubAllGlobals())

  it('shows the terracotta inline error on bad credentials (401)', async () => {
    stubFetch({
      '/api/auth/login': () => json(401, { detail: 'E-mail ou mot de passe incorrect.' }),
    })
    renderAt('/login')
    fillLogin('marie@famille-ou.fr', 'mauvais')
    fireEvent.click(screen.getByRole('button', { name: 'Se connecter' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('E-mail ou mot de passe incorrect.')
    expect(alert).toHaveClass('kp-auth__msg--error')
  })

  it('shows the gold inline message for a disabled account (403)', async () => {
    stubFetch({
      '/api/auth/login': () =>
        json(403, {
          detail: {
            code: 'account_disabled',
            message: "Ton accès a été suspendu. Contacte l'administrateur.",
          },
        }),
    })
    renderAt('/login')
    fillLogin('marie@famille-ou.fr', 'un mot de passe')
    fireEvent.click(screen.getByRole('button', { name: 'Se connecter' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent("Ton accès a été suspendu. Contacte l'administrateur.")
    expect(alert).toHaveClass('kp-auth__msg--warning')
  })

  it('stores the tokens and lands on the board after a successful login', async () => {
    stubFetch({
      '/api/auth/login': () => json(200, { access: 'jwt-access', refresh: 'jwt-refresh' }),
      '/api/auth/me': () =>
        json(200, {
          id: 'u1',
          email: 'marie@famille-ou.fr',
          display_name: 'Marie',
          role: 'ADMIN',
          status: 'ACTIVE',
          created_at: '2026-07-02T00:00:00Z',
        }),
    })
    renderAt('/login')
    fillLogin('marie@famille-ou.fr', 'un mot de passe')
    fireEvent.click(screen.getByRole('button', { name: 'Se connecter' }))

    // Board reached via the guard; the avatar shows the user's initial.
    const avatar = await screen.findByRole('button', { name: 'Se déconnecter' })
    expect(avatar).toHaveTextContent('M')
    expect(localStorage.getItem('keepou.access')).toBe('jwt-access')
    expect(localStorage.getItem('keepou.refresh')).toBe('jwt-refresh')
  })
})

describe('RegisterPage', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => vi.unstubAllGlobals())

  function fillRegister(name: string, email: string, password: string) {
    fireEvent.change(screen.getByLabelText('Nom affiché'), { target: { value: name } })
    fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: email } })
    fireEvent.change(screen.getByLabelText('Mot de passe'), { target: { value: password } })
  }

  it('shows the « Accès non autorisé » screen on an allowlist 403', async () => {
    stubFetch({
      '/api/auth/register': () =>
        json(403, {
          detail:
            "L'adresse inconnu@gmail.com ne figure pas sur la liste des membres autorisés " +
            'de cette instance Keepou.',
        }),
    })
    renderAt('/register')
    fillRegister('Tom', 'inconnu@gmail.com', 'un mot de passe')
    fireEvent.click(screen.getByRole('button', { name: 'Créer mon compte' }))

    expect(await screen.findByRole('heading', { name: 'Accès non autorisé' })).toBeInTheDocument()
    expect(screen.getByText('inconnu@gmail.com')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Retour à la connexion' })).toHaveAttribute(
      'href',
      '/login',
    )
    // No account was created: the tokens were never stored.
    expect(localStorage.getItem('keepou.access')).toBeNull()
  })

  it('shows an inline error when the email is already registered (409)', async () => {
    stubFetch({
      '/api/auth/register': () =>
        json(409, { detail: 'Un compte existe déjà avec cette adresse e-mail.' }),
    })
    renderAt('/register')
    fillRegister('Tom', 'tom@famille-ou.fr', 'un mot de passe')
    fireEvent.click(screen.getByRole('button', { name: 'Créer mon compte' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Un compte existe déjà avec cette adresse e-mail.')
    expect(alert).toHaveClass('kp-auth__msg--error')
  })
})

describe('Session hydration', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => vi.unstubAllGlobals())

  it('drops the stored tokens and returns to login when the account was disabled (403)', async () => {
    localStorage.setItem('keepou.access', 'jwt-access')
    localStorage.setItem('keepou.refresh', 'jwt-refresh')
    stubFetch({
      '/api/auth/me': () =>
        json(403, {
          detail: {
            code: 'account_disabled',
            message: "Ton accès a été suspendu. Contacte l'administrateur.",
          },
        }),
    })
    renderAt('/')

    // FR-A5: the disabled account's session ends — no stale tokens left behind.
    expect(await screen.findByRole('button', { name: 'Se connecter' })).toBeInTheDocument()
    expect(localStorage.getItem('keepou.access')).toBeNull()
    expect(localStorage.getItem('keepou.refresh')).toBeNull()
  })
})
