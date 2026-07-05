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
    pinned: false,
    archived: false,
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

  it('renders the inline Markdown subset on the card preview (E8-S9)', async () => {
    stubBoard({
      '/api/notes?tab=mine': () =>
        json(200, [
          note({
            id: 'n-md',
            title: 'Vacances',
            body: '# Programme\nOn part **samedi** en *covoiturage*.',
          }),
        ]),
    })
    renderBoard()

    const card = (await screen.findByRole('button', { name: 'Vacances' })) as HTMLElement
    // Heading rendered as a styled paragraph (no document heading above the h2 title).
    const heading = card.querySelector('.kp-rich__h1')
    expect(heading).not.toBeNull()
    expect(heading!.tagName).toBe('P')
    expect(heading).toHaveTextContent('Programme')
    // Bold / italic as semantic elements, markers hidden.
    expect(card.querySelector('strong')).toHaveTextContent('samedi')
    expect(card.querySelector('em')).toHaveTextContent('covoiturage')
    expect(card.textContent).not.toContain('**')
  })

  it('keeps line breaks inside a card paragraph (rendered on several lines)', async () => {
    stubBoard({
      '/api/notes?tab=mine': () =>
        json(200, [
          note({ id: 'n-wifi', title: 'Wifi', body: 'Réseau : Keepou-Casa\nMot de passe : guaca' }),
        ]),
    })
    renderBoard()

    const card = (await screen.findByRole('button', { name: 'Wifi' })) as HTMLElement
    // A single paragraph block keeps its newline (not collapsed to a space).
    const text = card.querySelector('.kp-note__text')
    expect(text?.textContent).toBe('Réseau : Keepou-Casa\nMot de passe : guaca')
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

  it('creates a note from the composer and opens it in the editor', async () => {
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
      // The editor mounts on the created note (load + acquire the lock).
      '/api/notes/n-new': () => json(200, created),
      '/api/notes/n-new/lock': () => json(200, created),
    })
    renderBoard()
    await screen.findByRole('button', { name: 'Courses du week-end' })

    const input = screen.getByLabelText('Prends une note…')
    fireEvent.focus(input) // opens the color + visibility options
    fireEvent.change(input, { target: { value: 'Idées déco salon' } })
    fireEvent.click(screen.getByRole('radio', { name: 'Salsa' }))
    fireEvent.click(screen.getByRole('button', { name: 'Public' }))
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter' }))

    // The note opens in the editor, title carried; the composer is gone.
    const title = await screen.findByLabelText('Titre de la note')
    expect(title).toHaveValue('Idées déco salon')
    expect(screen.queryByLabelText('Prends une note…')).not.toBeInTheDocument()
  })

  it('creates a note without a title and still opens the editor', async () => {
    const created = note({ id: 'n-blank', title: '', color: 'GOLD', visibility: 'PRIVATE' })
    stubBoard({
      '/api/notes': (init) => {
        expect(init?.method).toBe('POST')
        expect(JSON.parse(String(init?.body))).toEqual({
          title: '',
          color: 'GOLD',
          visibility: 'PRIVATE',
        })
        return json(201, created)
      },
      '/api/notes/n-blank': () => json(200, created),
      '/api/notes/n-blank/lock': () => new Response(null, { status: 204 }),
    })
    renderBoard()
    await screen.findByRole('button', { name: 'Courses du week-end' })

    fireEvent.focus(screen.getByLabelText('Prends une note…'))
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter' }))

    // A private note has no lock round-trip; the editor still opens on it.
    expect(await screen.findByLabelText('Titre de la note')).toHaveValue('')
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
      '/api/notes/n-fete': () => json(200, created),
      '/api/notes/n-fete/lock': () => json(200, created),
    })
    renderBoard('/?tab=public')
    await screen.findByRole('button', { name: 'Sorties ciné' })

    const input = screen.getByLabelText('Prends une note…')
    fireEvent.focus(input)
    // The toggle reflects the tab before any interaction.
    expect(screen.getByRole('button', { name: 'Public' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.change(input, { target: { value: 'Fête des voisins' } })
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter' }))

    expect(await screen.findByLabelText('Titre de la note')).toHaveValue('Fête des voisins')
  })

  // --- pin / archive (E8) ---

  it('shows the pin/archive menu on owned cards only', async () => {
    stubBoard()
    renderBoard('/?tab=public')
    // Léa's public note is not owned by Marie → no actions affordance.
    await screen.findByRole('button', { name: 'Sorties ciné' })
    expect(screen.queryByRole('button', { name: /^Actions pour/ })).not.toBeInTheDocument()
  })

  it('pins a note and floats it to the top of the board (optimistic)', async () => {
    stubBoard({
      '/api/notes/n-repas': (init) => {
        expect(init?.method).toBe('PATCH')
        expect(JSON.parse(String(init?.body))).toEqual({ pinned: true })
        return json(200, { ...MINE[1], pinned: true })
      },
    })
    renderBoard()
    await screen.findByRole('button', { name: 'Courses du week-end' })

    fireEvent.click(screen.getByRole('button', { name: 'Actions pour Repas de quartier' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Épingler' }))

    const titles = [...document.querySelectorAll('.kp-note__title')].map((h) => h.textContent)
    expect(titles[0]).toBe('Repas de quartier')
  })

  it('archives a note and removes it from the board (optimistic)', async () => {
    stubBoard({
      '/api/notes/n-courses': (init) => {
        expect(init?.method).toBe('PATCH')
        expect(JSON.parse(String(init?.body))).toEqual({ archived: true })
        return json(200, { ...MINE[0], archived: true })
      },
    })
    renderBoard()
    await screen.findByRole('button', { name: 'Courses du week-end' })

    fireEvent.click(screen.getByRole('button', { name: 'Actions pour Courses du week-end' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Archiver' }))

    expect(screen.queryByRole('button', { name: 'Courses du week-end' })).not.toBeInTheDocument()
  })

  it('opens the archived view and unarchives a note', async () => {
    const archivedNote = note({ id: 'n-old', title: 'Vieux mémo', archived: true })
    stubBoard({
      '/api/notes?tab=mine&archived=true': () => json(200, [archivedNote]),
      '/api/notes/n-old': (init) => {
        expect(init?.method).toBe('PATCH')
        expect(JSON.parse(String(init?.body))).toEqual({ archived: false })
        return json(200, { ...archivedNote, archived: false })
      },
    })
    renderBoard('/?archived=1')

    await screen.findByRole('button', { name: 'Vieux mémo' })
    expect(screen.getByRole('heading', { name: 'Notes archivées' })).toBeInTheDocument()
    // No composer in the archived view.
    expect(screen.queryByLabelText('Prends une note…')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Actions pour Vieux mémo' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Désarchiver' }))
    expect(screen.queryByRole('button', { name: 'Vieux mémo' })).not.toBeInTheDocument()
  })
})
