import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MemberOut } from '../api/admin'
import App from '../App'

/**
 * E7-S6 (front): AccessManager rendering (tabs + counters, member & pending
 * rows), add-email / member-menu / remove actions hitting the API, the
 * last-admin guard surfaced in the menu, and the admins-only Administration
 * entry. fetch is stubbed — the real guard (require_admin) is server-side.
 */

const ADMIN_ME = {
  id: 'u-marie',
  email: 'marie@famille-ou.fr',
  display_name: 'Marie',
  role: 'ADMIN',
  status: 'ACTIVE',
  created_at: '2026-06-09T10:00:00',
}

const MEMBER_ME = { ...ADMIN_ME, id: 'u-lea', email: 'lea@famille-ou.fr', role: 'MEMBER' }

const MEMBERS: MemberOut[] = [
  {
    email: 'marie@famille-ou.fr',
    pending: false,
    user_id: 'u-marie',
    display_name: 'Marie',
    role: 'ADMIN',
    status: 'ACTIVE',
    created_at: '2026-06-09T10:00:00',
    allowlist_id: null,
    added_at: null,
  },
  {
    email: 'bob@famille-ou.fr',
    pending: false,
    user_id: 'u-bob',
    display_name: 'Bob',
    role: 'MEMBER',
    status: 'DISABLED',
    created_at: '2026-06-11T10:00:00',
    allowlist_id: 'al-bob',
    added_at: '2026-06-10T10:00:00',
  },
  {
    email: 'tom@famille-ou.fr',
    pending: true,
    user_id: null,
    display_name: null,
    role: null,
    status: null,
    created_at: null,
    allowlist_id: 'al-tom',
    added_at: '2026-06-14T10:00:00',
  },
]

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

function renderAdmin(path = '/admin') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  )
}

describe('AdminPage', () => {
  beforeEach(() => {
    localStorage.setItem('keepou.access', 'access-token')
    localStorage.setItem('keepou.refresh', 'refresh-token')
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    localStorage.clear()
  })

  it('renders members and pending in their tabs with live counters', async () => {
    stubFetch({
      '/api/auth/me': () => json(200, ADMIN_ME),
      '/api/admin/members': () => json(200, MEMBERS),
    })
    renderAdmin()

    // Members tab (default): registered rows with role badge + status pills.
    expect(await screen.findByText('Marie')).toBeInTheDocument()
    expect(screen.getByText('admin')).toBeInTheDocument()
    expect(screen.getByText('Actif')).toBeInTheDocument()
    expect(screen.getByText('Désactivé')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Membres 2' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.queryByText('tom@famille-ou.fr')).not.toBeInTheDocument()

    // Pending tab: allowlisted email without an account.
    fireEvent.click(screen.getByRole('tab', { name: 'Invités en attente 1' }))
    expect(screen.getByText('tom@famille-ou.fr')).toBeInTheDocument()
    expect(screen.getByText('En attente')).toBeInTheDocument()
    expect(screen.getByText(/pas encore de compte/)).toBeInTheDocument()
  })

  it('adds an email to the allowlist and shows it as pending', async () => {
    const added: MemberOut = {
      email: 'mamie@famille-ou.fr',
      pending: true,
      user_id: null,
      display_name: null,
      role: null,
      status: null,
      created_at: null,
      allowlist_id: 'al-mamie',
      added_at: '2026-07-03T10:00:00',
    }
    stubFetch({
      '/api/auth/me': () => json(200, ADMIN_ME),
      '/api/admin/members': () => json(200, MEMBERS),
      '/api/admin/allowlist': (init) => {
        expect(init?.method).toBe('POST')
        expect(JSON.parse(String(init?.body))).toEqual({ email: 'mamie@famille-ou.fr' })
        return json(201, added)
      },
    })
    renderAdmin()
    await screen.findByText('Marie')

    fireEvent.change(screen.getByLabelText('Ajouter un e-mail'), {
      target: { value: 'mamie@famille-ou.fr' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter à la liste' }))

    // The screen switches to the pending tab and the counter updates.
    expect(await screen.findByText('mamie@famille-ou.fr')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Invités en attente 2' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
  })

  it('removes a pending entry via « Retirer »', async () => {
    stubFetch({
      '/api/auth/me': () => json(200, ADMIN_ME),
      '/api/admin/members': () => json(200, MEMBERS),
      '/api/admin/allowlist/al-tom': (init) => {
        expect(init?.method).toBe('DELETE')
        return new Response(null, { status: 204 })
      },
    })
    renderAdmin()
    await screen.findByText('Marie')

    fireEvent.click(screen.getByRole('tab', { name: 'Invités en attente 1' }))
    fireEvent.click(screen.getByRole('button', { name: 'Retirer' }))

    expect(
      await screen.findByText('Aucun invité en attente — ajoute un e-mail ci-dessus.'),
    ).toBeInTheDocument()
  })

  it('promotes and re-enables a member from the ⋯ menu', async () => {
    stubFetch({
      '/api/auth/me': () => json(200, ADMIN_ME),
      '/api/admin/members': () => json(200, MEMBERS),
      '/api/admin/users/u-bob': (init) => {
        expect(init?.method).toBe('PATCH')
        const body = JSON.parse(String(init?.body))
        if (body.role) {
          expect(body).toEqual({ role: 'ADMIN' })
          return json(200, { ...ADMIN_ME, id: 'u-bob', role: 'ADMIN', status: 'DISABLED' })
        }
        expect(body).toEqual({ status: 'ACTIVE' })
        return json(200, { ...ADMIN_ME, id: 'u-bob', role: 'ADMIN', status: 'ACTIVE' })
      },
    })
    renderAdmin()
    await screen.findByText('Bob')

    fireEvent.click(screen.getByRole('button', { name: 'Actions pour Bob' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Promouvoir admin' }))
    // Bob now wears the admin badge too (2 badges on screen).
    await waitFor(() => expect(screen.getAllByText('admin')).toHaveLength(2))

    fireEvent.click(screen.getByRole('button', { name: 'Actions pour Bob' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Réactiver le compte' }))
    await waitFor(() => expect(screen.getAllByText('Actif')).toHaveLength(2))
  })

  it('disables the guard-breaking actions for the last active admin', async () => {
    stubFetch({
      '/api/auth/me': () => json(200, ADMIN_ME),
      '/api/admin/members': () => json(200, MEMBERS),
    })
    renderAdmin()
    await screen.findByText('Marie')

    // Marie is the only ACTIVE admin: demote/disable are blocked client-side
    // (the server enforces the same rule with a 409, FR-U5).
    fireEvent.click(screen.getByRole('button', { name: 'Actions pour Marie' }))
    const menu = screen.getByRole('menu')
    expect(within(menu).getByRole('menuitem', { name: 'Retirer le rôle admin' })).toBeDisabled()
    expect(within(menu).getByRole('menuitem', { name: 'Désactiver le compte' })).toBeDisabled()
    expect(
      within(menu).getByText('Il doit toujours rester au moins un admin actif.'),
    ).toBeInTheDocument()
  })

  it('shows the Administration entry to admins only and redirects members off /admin', async () => {
    stubFetch({
      '/api/auth/me': () => json(200, MEMBER_ME),
      '/api/notes?tab=mine': () => json(200, []),
    })
    renderAdmin() // a member deep-linking /admin lands back on the board

    expect(await screen.findByLabelText('Prends une note…')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Menu du compte' }))
    expect(screen.queryByRole('menuitem', { name: 'Administration' })).not.toBeInTheDocument()
  })

  it('navigates to /admin from the avatar menu for an admin', async () => {
    stubFetch({
      '/api/auth/me': () => json(200, ADMIN_ME),
      '/api/notes?tab=mine': () => json(200, []),
      '/api/admin/members': () => json(200, MEMBERS),
    })
    renderAdmin('/')
    await screen.findByLabelText('Prends une note…')

    fireEvent.click(screen.getByRole('button', { name: 'Menu du compte' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Administration' }))

    expect(await screen.findByText('Gestion des accès')).toBeInTheDocument()
  })
})
