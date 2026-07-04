import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MemberOut } from '../api/admin'
import App from '../App'

/**
 * E7-S6 (front): AccessManager rendering (members / pending + counters,
 * status pills), the add-email / member-menu / remove actions calling the API,
 * the last-admin guard surfaced in the menu, and the admins-only
 * « Administration » entry. The real guard is the API (tested in pytest).
 */

const ME_ADMIN = {
  id: 'u-marie',
  email: 'marie@famille-ou.fr',
  display_name: 'Marie',
  role: 'ADMIN',
  status: 'ACTIVE',
  created_at: '2026-06-09T10:00:00',
}

const ME_MEMBER = { ...ME_ADMIN, id: 'u-lea', email: 'lea@famille-ou.fr', role: 'MEMBER' }

function registered(overrides: Partial<MemberOut>): MemberOut {
  return {
    email: '',
    pending: false,
    user_id: null,
    display_name: null,
    role: 'MEMBER',
    status: 'ACTIVE',
    registered_at: '2026-06-10T10:00:00',
    allowlist_id: null,
    allowed_at: null,
    ...overrides,
  }
}

const ROWS: MemberOut[] = [
  registered({
    email: 'marie@famille-ou.fr',
    user_id: 'u-marie',
    display_name: 'Marie',
    role: 'ADMIN',
    registered_at: '2026-06-09T10:00:00',
  }),
  registered({ email: 'lea@famille-ou.fr', user_id: 'u-lea', display_name: 'Léa' }),
  registered({
    email: 'bob@famille-ou.fr',
    user_id: 'u-bob',
    display_name: 'Bob',
    status: 'DISABLED',
  }),
  registered({
    email: 'tom@famille-ou.fr',
    pending: true,
    role: null,
    status: null,
    registered_at: null,
    allowlist_id: 'al-tom',
    allowed_at: '2026-06-14T10:00:00',
  }),
  registered({
    email: 'mamie@famille-ou.fr',
    pending: true,
    role: null,
    status: null,
    registered_at: null,
    allowlist_id: 'al-mamie',
    allowed_at: '2026-06-15T10:00:00',
  }),
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

function stubAdmin(extra: Record<string, (init?: RequestInit) => Response> = {}) {
  stubFetch({
    '/api/auth/me': () => json(200, ME_ADMIN),
    '/api/admin/members': () => json(200, ROWS),
    ...extra,
  })
}

function renderAdmin() {
  return render(
    <MemoryRouter initialEntries={['/admin']}>
      <App />
    </MemoryRouter>,
  )
}

describe('AdminPage / AccessManager', () => {
  beforeEach(() => {
    localStorage.setItem('keepou.access', 'access-token')
    localStorage.setItem('keepou.refresh', 'refresh-token')
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    localStorage.clear()
  })

  it('renders members with counters, status pills and the admin badge', async () => {
    stubAdmin()
    renderAdmin()

    expect(await screen.findByText('Marie')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Membres 3' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /En attente.*2/ })).toBeInTheDocument()

    // Marie is admin (mono badge), Bob is disabled (gold pill), Léa active.
    expect(screen.getByText('admin')).toBeInTheDocument()
    expect(screen.getAllByText('Actif')).toHaveLength(2)
    expect(screen.getByText('Désactivé')).toBeInTheDocument()
    expect(screen.getByText(/lea@famille-ou\.fr · inscrit le/)).toBeInTheDocument()
  })

  it('separates pending invitees on their tab', async () => {
    stubAdmin()
    renderAdmin()

    fireEvent.click(await screen.findByRole('tab', { name: /En attente.*2/ }))
    expect(screen.getByText('tom@famille-ou.fr')).toBeInTheDocument()
    expect(screen.getByText('mamie@famille-ou.fr')).toBeInTheDocument()
    expect(screen.getAllByText('En attente')).not.toHaveLength(0)
    expect(screen.getAllByRole('button', { name: 'Retirer' })).toHaveLength(2)
    // Registered members are not on this tab.
    expect(screen.queryByText('Marie')).not.toBeInTheDocument()
  })

  it('adds an e-mail to the allowlist and lands on the pending tab', async () => {
    let posted: unknown = null
    stubAdmin({
      '/api/admin/allowlist': (init) => {
        posted = JSON.parse(String(init?.body))
        return json(201, {
          ...ROWS[3],
          email: 'nouveau@famille-ou.fr',
          allowlist_id: 'al-nouveau',
        })
      },
    })
    renderAdmin()

    fireEvent.change(await screen.findByLabelText('Adresse e-mail à autoriser'), {
      target: { value: 'nouveau@famille-ou.fr' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Ajouter/ }))

    await waitFor(() => expect(posted).toEqual({ email: 'nouveau@famille-ou.fr' }))
    // The screen switches to the pending tab (mockup behavior).
    await waitFor(() =>
      expect(screen.getByRole('tab', { name: /En attente/ })).toHaveAttribute(
        'aria-selected',
        'true',
      ),
    )
  })

  it('promotes a member from the ⋯ menu (PATCH role)', async () => {
    let patched: unknown = null
    stubAdmin({
      '/api/admin/users/u-lea': (init) => {
        patched = JSON.parse(String(init?.body))
        return json(200, { ...ME_MEMBER, role: 'ADMIN' })
      },
    })
    renderAdmin()

    fireEvent.click(await screen.findByRole('button', { name: 'Actions pour Léa' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Promouvoir admin' }))
    await waitFor(() => expect(patched).toEqual({ role: 'ADMIN' }))
  })

  it('disables a member and reactivates a disabled one (PATCH status)', async () => {
    const patches: Record<string, unknown> = {}
    stubAdmin({
      '/api/admin/users/u-lea': (init) => {
        patches['u-lea'] = JSON.parse(String(init?.body))
        return json(200, { ...ME_MEMBER, status: 'DISABLED' })
      },
      '/api/admin/users/u-bob': (init) => {
        patches['u-bob'] = JSON.parse(String(init?.body))
        return json(200, { ...ME_MEMBER, id: 'u-bob', status: 'ACTIVE' })
      },
    })
    renderAdmin()

    fireEvent.click(await screen.findByRole('button', { name: 'Actions pour Léa' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Désactiver le compte' }))
    await waitFor(() => expect(patches['u-lea']).toEqual({ status: 'DISABLED' }))

    fireEvent.click(await screen.findByRole('button', { name: 'Actions pour Bob' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Réactiver le compte' }))
    await waitFor(() => expect(patches['u-bob']).toEqual({ status: 'ACTIVE' }))
  })

  it('removes a pending entry (DELETE, pending only)', async () => {
    const deleted = vi.fn()
    stubAdmin({
      '/api/admin/allowlist/al-tom': () => {
        deleted()
        return new Response(null, { status: 204 })
      },
    })
    renderAdmin()

    fireEvent.click(await screen.findByRole('tab', { name: /En attente.*2/ }))
    fireEvent.click(screen.getAllByRole('button', { name: 'Retirer' })[0])
    await waitFor(() => expect(deleted).toHaveBeenCalled())
  })

  it('surfaces the last-admin guard: demote/disable disabled for the only active admin', async () => {
    stubAdmin()
    renderAdmin()

    fireEvent.click(await screen.findByRole('button', { name: 'Actions pour Marie' }))
    expect(screen.getByRole('menuitem', { name: 'Rétrograder en membre' })).toBeDisabled()
    expect(screen.getByRole('menuitem', { name: 'Désactiver le compte' })).toBeDisabled()
    expect(screen.getByText(/Dernier administrateur actif/)).toBeInTheDocument()
  })

  it('shows the Administration entry to admins only', async () => {
    stubAdmin()
    renderAdmin()

    fireEvent.click(await screen.findByRole('button', { name: 'Menu du compte' }))
    expect(screen.getByRole('menuitem', { name: 'Administration' })).toBeInTheDocument()
  })

  it('navigates from the board to /admin via the avatar menu', async () => {
    stubAdmin({
      '/api/notes?tab=mine': () => json(200, []),
      '/api/notes?tab=public': () => json(200, []),
    })
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>,
    )

    fireEvent.click(await screen.findByRole('button', { name: 'Menu du compte' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Administration' }))
    expect(await screen.findByText('Gestion des accès')).toBeInTheDocument()
  })

  it('refuses the screen to a member without calling the admin API', async () => {
    // No /api/admin/members stub: a call would throw « Unexpected fetch ».
    stubFetch({ '/api/auth/me': () => json(200, ME_MEMBER) })
    renderAdmin()

    expect(
      await screen.findByText('Accès réservé aux administrateurs de l’instance.'),
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Menu du compte' }))
    expect(screen.queryByRole('menuitem', { name: 'Administration' })).not.toBeInTheDocument()
  })
})
