import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { NoteOut } from '../api/notes'
import App from '../App'

/**
 * E3-S8 (front): card rendering (shade, read-only checklist, author badge),
 * TabSwitch ?tab= routing, client-side search filter and the quick composer.
 * fetch is stubbed — visibility & permissions are enforced (and tested) server-side.
 */

const ME = {
  id: 'u-marie',
  email: 'marie@famille-ou.fr',
  display_name: 'Marie',
  role: 'MEMBER',
  status: 'ACTIVE',
  created_at: '2026-07-01T10:00:00',
}

function note(overrides: Partial<NoteOut>): NoteOut {
  return {
    id: 'n1',
    title: 'Sans titre',
    body: '',
    color: 'GOLD',
    visibility: 'PRIVATE',
    owner_id: ME.id,
    author_name: 'Marie',
    created_at: '2026-07-01T10:00:00',
    updated_at: new Date(Date.now() - 5_000).toISOString(),
    locked_by: null,
    lock_expires_at: null,
    ...overrides,
  }
}

const MINE: NoteOut[] = [
  note({
    id: 'n-courses',
    title: 'Courses du week-end',
    body: 'Tortillas de maïs, coriandre fraîche.',
    color: 'GOLD',
  }),
  note({
    id: 'n-repas',
    title: 'Repas de quartier',
    body: '- [x] Réserver la salle\n- [ ] Tables & chaises',
    color: 'AVOCAT',
    visibility: 'PUBLIC',
  }),
]

const PUBLIC: NoteOut[] = [
  note({
    id: 'n-cine',
    title: 'Sorties ciné',
    body: 'Le festival commence le 3 août.',
    color: 'TEAL',
    visibility: 'PUBLIC',
    owner_id: 'u-lea',
    author_name: 'Léa',
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

function stubBoard(extra: Record<string, (init?: RequestInit) => Response> = {}) {
  stubFetch({
    '/api/auth/me': () => json(200, ME),
    '/api/notes?tab=mine': () => json(200, MINE),
    '/api/notes?tab=public': () => json(200, PUBLIC),
    ...extra,
  })
}

function renderBoard(path = '/') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  )
}

describe('BoardPage', () => {
  beforeEach(() => {
    localStorage.setItem('keepou.access', 'access-token')
    localStorage.setItem('keepou.refresh', 'refresh-token')
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    localStorage.clear()
  })

  it('renders the cards with their shade and a read-only checklist', async () => {
    stubBoard()
    renderBoard()

    const card = (await screen.findByRole('button', { name: 'Repas de quartier' })) as HTMLElement
    expect(card).toHaveClass('kp-note--avocat')
    expect(screen.getByRole('button', { name: 'Courses du week-end' })).toHaveClass('kp-note--gold')

    // Checked line struck through, unchecked line plain — no interactive inputs.
    expect(screen.getByText('Réserver la salle')).toHaveClass('kp-note__done')
    expect(screen.getByText('Tables & chaises')).not.toHaveClass('kp-note__done')
    expect(card.querySelectorAll('input')).toHaveLength(0)
  })

  it('shows the visibility meta on own cards and no author badge', async () => {
    stubBoard()
    renderBoard()

    expect(await screen.findByText('Public · partagé par toi')).toBeInTheDocument()
    expect(screen.getByText(/^Privé ·/)).toBeInTheDocument()
    expect(screen.queryByText(/modifié/)).not.toBeInTheDocument()
  })

  it('deep-links ?tab=public and shows the author badge', async () => {
    stubBoard()
    renderBoard('/?tab=public')

    expect(await screen.findByRole('button', { name: 'Sorties ciné' })).toBeInTheDocument()
    expect(screen.getByText(/Léa · modifié/)).toBeInTheDocument()
    expect(screen.queryByText('Courses du week-end')).not.toBeInTheDocument()
  })

  it('switches the list when clicking the Public tab', async () => {
    stubBoard()
    renderBoard()
    await screen.findByRole('button', { name: 'Courses du week-end' })

    fireEvent.click(screen.getByRole('tab', { name: 'Public' }))

    expect(await screen.findByRole('button', { name: 'Sorties ciné' })).toBeInTheDocument()
    expect(screen.queryByText('Courses du week-end')).not.toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Public' })).toHaveAttribute('aria-selected', 'true')
  })

  it('filters the visible cards from the search input (title + body, accent-insensitive)', async () => {
    stubBoard()
    renderBoard()
    await screen.findByRole('button', { name: 'Courses du week-end' })

    const search = screen.getByLabelText('Rechercher dans mes notes…')
    fireEvent.change(search, { target: { value: 'mais' } }) // matches « maïs » in the body

    expect(screen.getByRole('button', { name: 'Courses du week-end' })).toBeInTheDocument()
    expect(screen.queryByText('Repas de quartier')).not.toBeInTheDocument()

    fireEvent.change(search, { target: { value: 'introuvable' } })
    expect(screen.getByText('Aucune note ne correspond à ta recherche.')).toBeInTheDocument()
  })

  it('creates a note from the composer and prepends it to the board', async () => {
    const created = note({
      id: 'n-new',
      title: 'Idées déco salon',
      color: 'SALSA',
      visibility: 'PUBLIC',
    })
    stubBoard({
      '/api/notes': (init) => {
        expect(init?.method).toBe('POST')
        expect(JSON.parse(String(init?.body))).toEqual({
          title: 'Idées déco salon',
          color: 'SALSA',
          visibility: 'PUBLIC',
        })
        return json(201, created)
      },
    })
    renderBoard()
    await screen.findByRole('button', { name: 'Courses du week-end' })

    const input = screen.getByLabelText('Prends une note…')
    fireEvent.focus(input) // opens the color + visibility options
    fireEvent.change(input, { target: { value: 'Idées déco salon' } })
    fireEvent.click(screen.getByRole('radio', { name: 'Salsa' }))
    fireEvent.click(screen.getByRole('button', { name: 'Public' }))
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter' }))

    const card = await screen.findByRole('button', { name: 'Idées déco salon' })
    expect(card).toHaveClass('kp-note--salsa')
    // The composer resets after a successful create.
    expect(screen.getByLabelText('Prends une note…')).toHaveValue('')
  })

  it('defaults the composer to Public when created from the Public tab (E3-S9)', async () => {
    const created = note({
      id: 'n-fete',
      title: 'Fête des voisins',
      color: 'GOLD',
      visibility: 'PUBLIC',
      author_name: 'Marie',
    })
    stubBoard({
      '/api/notes': (init) => {
        expect(init?.method).toBe('POST')
        // No toggle click below — Public comes from the active tab.
        expect(JSON.parse(String(init?.body))).toEqual({
          title: 'Fête des voisins',
          color: 'GOLD',
          visibility: 'PUBLIC',
        })
        return json(201, created)
      },
    })
    renderBoard('/?tab=public')
    await screen.findByRole('button', { name: 'Sorties ciné' })

    const input = screen.getByLabelText('Prends une note…')
    fireEvent.focus(input)
    // The toggle reflects the tab before any interaction.
    expect(screen.getByRole('button', { name: 'Public' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.change(input, { target: { value: 'Fête des voisins' } })
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter' }))

    expect(await screen.findByRole('button', { name: 'Fête des voisins' })).toBeInTheDocument()
  })
})
