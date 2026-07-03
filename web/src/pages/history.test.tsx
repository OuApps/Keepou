import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { NoteOut } from '../api/notes'
import type { NoteVersionOut } from '../api/versions'
import App from '../App'

/**
 * E6-S6 (front): history list (who / when, newest-first, « actuelle » badge,
 * « Créée par » root), read-only preview re-rendered as-is (no diff), the
 * restore confirmation with the frozen copy (HANDOFF §7), and the mobile
 * 2-screen flow (list → preview → Fermer / Restaurer bar).
 */

const ME = {
  id: 'u-marie',
  email: 'marie@famille-ou.fr',
  display_name: 'Marie',
  role: 'MEMBER',
  status: 'ACTIVE',
  created_at: '2026-06-09T09:15:00',
}

const CREATED_AT = '2026-06-09T09:15:00'

function note(overrides: Partial<NoteOut> = {}): NoteOut {
  return {
    id: 'n-repas',
    title: 'Repas de quartier',
    body: '- [x] Réserver la salle\n- [ ] Tables & chaises',
    color: 'GOLD',
    visibility: 'PUBLIC',
    owner_id: 'u-bob',
    author_name: 'Bob',
    created_at: CREATED_AT,
    updated_at: '2026-06-14T14:32:00',
    locked_by: null,
    lock_expires_at: null,
    ...overrides,
  }
}

/** Newest-first, like the API: current (Marie) → edit (Léa) → creation (Bob). */
function versions(): NoteVersionOut[] {
  const base = { note_id: 'n-repas', color: 'GOLD' as const, visibility: 'PUBLIC' as const }
  return [
    {
      ...base,
      id: 'v-3',
      author_id: 'u-marie',
      author_name: 'Marie',
      title: 'Repas de quartier',
      body: '- [x] Réserver la salle\n- [ ] Tables & chaises',
      created_at: '2026-06-14T14:32:00',
    },
    {
      ...base,
      id: 'v-2',
      author_id: 'u-lea',
      author_name: 'Léa',
      title: 'Repas de quartier',
      body: 'Pour le repas de quartier on se répartit les tâches.\n\n- [ ] Réserver la salle',
      created_at: '2026-06-12T18:42:00',
    },
    {
      ...base,
      id: 'v-1',
      author_id: 'u-bob',
      author_name: 'Bob',
      title: 'Repas de quartier',
      body: 'Idée : repas de quartier.',
      created_at: CREATED_AT, // == note.created_at → « Créée par »
    },
  ]
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

type Handler = (init?: RequestInit) => Response | Promise<Response>

function stubFetch(routes: Record<string, Handler>) {
  const mock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString()
    const handler = routes[url]
    if (!handler) throw new Error(`Unexpected fetch: ${url}`)
    return Promise.resolve(handler(init))
  })
  vi.stubGlobal('fetch', mock)
  return mock
}

/** History page stubs; the editor routes cover the post-restore navigation. */
function stubHistory(current: NoteOut, history: NoteVersionOut[]) {
  const restored: string[] = []
  const mock = stubFetch({
    '/api/auth/me': () => json(200, ME),
    [`/api/notes/${current.id}`]: (init) =>
      init?.method === 'PATCH' ? json(200, current) : json(200, current),
    [`/api/notes/${current.id}/versions`]: () => json(200, history),
    [`/api/notes/${current.id}/lock`]: (init) =>
      init?.method === 'DELETE'
        ? new Response(null, { status: 204 })
        : json(200, {
            ...current,
            locked_by: { id: ME.id, display_name: ME.display_name },
            lock_expires_at: new Date(Date.now() + 60_000).toISOString(),
          }),
    [`/api/notes/${current.id}/restore/v-1`]: (init) => {
      restored.push(String(init?.method))
      return json(200, { ...current, body: 'Idée : repas de quartier.' })
    },
  })
  return { restored, mock }
}

function renderHistory(id = 'n-repas') {
  return render(
    <MemoryRouter initialEntries={[`/note/${id}/history`]}>
      <App />
    </MemoryRouter>,
  )
}

describe('HistoryPage (E6)', () => {
  beforeEach(() => {
    localStorage.setItem('keepou.access', 'access-token')
    localStorage.setItem('keepou.refresh', 'refresh-token')
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    localStorage.clear()
  })

  it('lists who and when, newest-first, with the « actuelle » badge on the current version', async () => {
    stubHistory(note(), versions())
    renderHistory()

    expect(await screen.findByText('actuelle')).toBeInTheDocument()
    const rows = screen.getAllByRole('listitem')
    expect(rows).toHaveLength(3)
    // Newest-first ordering with the badge on the first row only.
    expect(rows[0]).toHaveTextContent('actuelle')
    expect(rows[0]).toHaveTextContent('Modifié par Marie')
    expect(rows[1]).toHaveTextContent('Modifié par Léa')
    expect(rows[1]).not.toHaveTextContent('actuelle')
    // The history root (created_at == note.created_at) reads « Créée par ».
    expect(rows[2]).toHaveTextContent('Créée par Bob')
    // Panel subtitle (desktop variant): count + since.
    expect(screen.getByText(/3 versions · depuis le/)).toBeInTheDocument()
  })

  it('previews a selected version read-only, re-rendered as-is', async () => {
    stubHistory(note(), versions())
    renderHistory()

    fireEvent.click(await screen.findByText('Modifié par Léa'))
    // The snapshot's paragraph + its unchecked box, not the current content.
    expect(
      await screen.findByText('Pour le repas de quartier on se répartit les tâches.'),
    ).toBeInTheDocument()
    // No editable field anywhere in the preview.
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    // The mobile banner carries the frozen preview copy; « Version de Léa »
    // appears in both the banner and the preview meta line.
    expect(screen.getByText('Aperçu — lecture seule')).toBeInTheDocument()
    expect(screen.getAllByText(/Version de Léa/)).toHaveLength(2)
  })

  it('restores after the confirmation with the frozen copy, then returns to the editor', async () => {
    const { restored } = stubHistory(note(), versions())
    renderHistory()

    // Select the creation version and ask to restore it.
    fireEvent.click(await screen.findByText('Créée par Bob'))
    fireEvent.click(screen.getAllByText('Restaurer cette version')[0])
    // Frozen confirmation copy (HANDOFF §7) — split across the <b> emphasis.
    expect(await screen.findByText(/rien n'est perdu/)).toBeInTheDocument()
    expect(screen.getByText("conservée dans l'historique")).toBeInTheDocument()

    const dialog = screen.getByRole('alertdialog')
    fireEvent.click(dialog.querySelector('.kp-restore__ok')!)
    await waitFor(() => expect(restored).toEqual(['POST']))
    // Back to the editor (its dialog replaces the history one).
    expect(await screen.findByLabelText('Titre de la note')).toBeInTheDocument()
  })

  it('cancelling the confirmation restores nothing', async () => {
    const { restored } = stubHistory(note(), versions())
    renderHistory()

    fireEvent.click(await screen.findByText('Créée par Bob'))
    fireEvent.click(screen.getAllByText('Restaurer cette version')[0])
    fireEvent.click(await screen.findByText('Annuler'))
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(restored).toEqual([])
  })

  it('offers no restore button on the current version', async () => {
    stubHistory(note(), versions())
    renderHistory()

    fireEvent.click(await screen.findByText('Modifié par Marie'))
    expect(screen.queryByText('Restaurer cette version')).not.toBeInTheDocument()
  })

  it('mobile 2-screen flow: tapping a row opens the preview, Fermer returns to the list', async () => {
    stubHistory(note(), versions())
    renderHistory()

    const frame =
      (await screen.findByRole('dialog')).closest('.kp-history') ?? screen.getByRole('dialog')
    expect(frame).not.toHaveClass('kp-history--preview')
    fireEvent.click(screen.getByText('Modifié par Léa'))
    expect(screen.getByRole('dialog')).toHaveClass('kp-history--preview')
    fireEvent.click(screen.getByText('Fermer'))
    expect(screen.getByRole('dialog')).not.toHaveClass('kp-history--preview')
  })

  it('the editor footer opens the history (flush-first entry point)', async () => {
    stubHistory(note({ visibility: 'PRIVATE', owner_id: ME.id, author_name: 'Marie' }), versions())
    render(
      <MemoryRouter initialEntries={['/note/n-repas']}>
        <App />
      </MemoryRouter>,
    )

    fireEvent.click(await screen.findByText('Historique'))
    // The history panel replaces the editor.
    expect(await screen.findByText(/3 versions · depuis le/)).toBeInTheDocument()
    expect(screen.getByText('actuelle')).toBeInTheDocument()
  })
})
