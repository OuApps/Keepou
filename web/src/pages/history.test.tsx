import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { NoteOut } from '../api/notes'
import type { VersionOut } from '../api/versions'
import App from '../App'

/**
 * E6-S6 (front): the history list (who/when, newest-first, « actuelle » badge),
 * the read-only preview re-rendered as-is, the restore confirmation (frozen
 * copy) that appends a new version, and the mobile 2-screen flow.
 * fetch is stubbed — visibility & the lock are enforced (and tested) server-side.
 */

const ME = {
  id: 'u-marie',
  email: 'marie@famille-ou.fr',
  display_name: 'Marie',
  role: 'MEMBER',
  status: 'ACTIVE',
  created_at: '2026-07-01T10:00:00',
}

function note(): NoteOut {
  return {
    id: 'n-repas',
    title: 'Repas de quartier',
    body: '- [x] Réserver la salle',
    color: 'GOLD',
    visibility: 'PRIVATE',
    owner_id: ME.id,
    author_name: 'Marie',
    created_at: '2026-06-09T09:15:00',
    updated_at: '2026-07-03T14:32:00',
    locked_by: null,
    lock_expires_at: null,
  }
}

function version(over: Partial<VersionOut>): VersionOut {
  return {
    id: 'v',
    note_id: 'n-repas',
    author_id: 'u',
    author_name: 'Marie',
    title: 'Repas de quartier',
    body: '',
    color: 'GOLD',
    visibility: 'PRIVATE',
    created_at: '2026-07-03T14:32:00',
    ...over,
  }
}

// Newest-first, exactly as the API returns them.
const VERSIONS: VersionOut[] = [
  version({
    id: 'v-cur',
    author_name: 'Marie',
    body: '- [x] Réserver la salle',
    created_at: '2026-07-03T14:32:00',
  }),
  version({
    id: 'v-mid',
    author_name: 'Léa',
    body: 'On répartit les tâches.\n\n- [ ] Tables & chaises',
    created_at: '2026-07-02T18:42:00',
  }),
  version({
    id: 'v-old',
    author_name: 'Bob',
    body: 'Idée : repas de quartier.',
    created_at: '2026-06-09T09:15:00',
  }),
]

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

type Handler = (init?: RequestInit) => Response | Promise<Response>

function stubFetch(routes: Record<string, Handler>) {
  const mock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString()
    const handler = routes[url]
    if (!handler) throw new Error(`Unexpected fetch: ${init?.method ?? 'GET'} ${url}`)
    return Promise.resolve(handler(init))
  })
  vi.stubGlobal('fetch', mock)
  return mock
}

/** GET note + GET versions; POST restore records the call and echoes a note. */
function stubHistory(current = note(), versions = VERSIONS) {
  const restores: string[] = []
  stubFetch({
    '/api/auth/me': () => json(200, ME),
    '/api/notes/n-repas': () => json(200, current),
    '/api/notes/n-repas/versions': () => json(200, versions),
    '/api/notes/n-repas/restore/v-old': () => {
      restores.push('v-old')
      return json(200, { ...current, body: 'Idée : repas de quartier.' })
    },
  })
  return restores
}

function renderHistory() {
  return render(
    <MemoryRouter initialEntries={['/note/n-repas/history']}>
      <App />
    </MemoryRouter>,
  )
}

function setMatchMedia(mobile: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: mobile && query.includes('max-width'),
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia
}

describe('HistoryPage', () => {
  beforeEach(() => {
    localStorage.setItem('keepou.access', 'access-token')
    localStorage.setItem('keepou.refresh', 'refresh-token')
    setMatchMedia(false) // desktop by default
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    localStorage.clear()
  })

  it('lists versions newest-first with the « actuelle » badge and author lines', async () => {
    stubHistory()
    renderHistory()

    expect(await screen.findByText('actuelle')).toBeInTheDocument()
    // First version says « Créée par », the others « Modifié par ».
    expect(screen.getByText('Créée par Bob')).toBeInTheDocument()
    expect(screen.getByText('Modifié par Léa')).toBeInTheDocument()
    expect(screen.getByText('Modifié par Marie')).toBeInTheDocument()
    // 3 versions · depuis le 9 juin.
    expect(screen.getByText(/3 versions · depuis le 9 juin/)).toBeInTheDocument()
  })

  it('previews the selected version read-only, re-rendered as-is (no diff)', async () => {
    stubHistory()
    renderHistory()

    // Defaults to the current (newest) version.
    expect(await screen.findByText('Réserver la salle')).toBeInTheDocument()

    // Selecting the oldest re-renders its snapshot instead.
    fireEvent.click(screen.getByText('Créée par Bob'))
    expect(await screen.findByText('Idée : repas de quartier.')).toBeInTheDocument()
    expect(screen.queryByText('Réserver la salle')).not.toBeInTheDocument()
  })

  it('restores a version after the frozen confirmation, appending a new one', async () => {
    const restores = stubHistory()
    renderHistory()

    await screen.findByText('actuelle')
    fireEvent.click(screen.getByText('Créée par Bob')) // select v-old
    fireEvent.click(screen.getByRole('button', { name: 'Restaurer cette version' }))

    // Exact frozen copy (HANDOFF §7).
    const dialog = screen.getByRole('dialog', { name: 'Confirmer la restauration' })
    expect(within(dialog).getByText(/La version actuelle sera/)).toHaveTextContent(
      "La version actuelle sera conservée dans l'historique — rien n'est perdu.",
    )

    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Restaurer cette version' }))
    })

    expect(restores).toEqual(['v-old'])
    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: 'Confirmer la restauration' }),
      ).not.toBeInTheDocument(),
    )
  })

  it('mobile: tap a row → read-only preview with the gold banner → restore', async () => {
    setMatchMedia(true)
    const restores = stubHistory()
    renderHistory()

    // Screen 1: the list. Tap the oldest row to open the preview screen.
    fireEvent.click(await screen.findByText('Créée par Bob'))

    // Screen 2: gold « Aperçu — lecture seule » banner + the snapshot.
    expect(await screen.findByText('Aperçu — lecture seule')).toBeInTheDocument()
    expect(screen.getByText('Idée : repas de quartier.')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Restaurer cette version' }))
    const dialog = screen.getByRole('dialog', { name: 'Confirmer la restauration' })
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Restaurer cette version' }))
    })
    expect(restores).toEqual(['v-old'])
  })
})
