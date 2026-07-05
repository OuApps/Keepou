import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { LockHolder, NoteOut } from '../api/notes'
import App from '../App'

/**
 * E5-S6 (front): the 4 LockBanner states with the frozen copy (HANDOFF §7
 * "Lock"), read-only mode disabling every control, the short-poll takeover
 * flow, the save conflict → « Passer en lecture seule », the ~20 s heartbeat
 * and the release on close. fetch is stubbed — the conflict itself is decided
 * (and tested) server-side.
 */

const ME = {
  id: 'u-marie',
  email: 'marie@famille-ou.fr',
  display_name: 'Marie',
  role: 'MEMBER',
  status: 'ACTIVE',
  created_at: '2026-07-01T10:00:00',
}

const BOB: LockHolder = { id: 'u-bob', display_name: 'Bob' }
const LEA: LockHolder = { id: 'u-lea', display_name: 'Léa' }

const inOneMinute = () => new Date(Date.now() + 60_000).toISOString()

function note(overrides: Partial<NoteOut> = {}): NoteOut {
  return {
    id: 'n-apero',
    title: 'Liste apéro 🍹',
    body: 'Guacamole, chips de maïs.\n\n- [ ] Citron vert',
    color: 'AVOCAT',
    visibility: 'PUBLIC',
    owner_id: 'u-bob', // shared note: Marie is a reader/editor, not the owner
    author_name: 'Bob',
    created_at: '2026-07-01T10:00:00',
    updated_at: new Date(Date.now() - 5_000).toISOString(),
    locked_by: null,
    lock_expires_at: null,
    ...overrides,
  }
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

function renderEditor(id = 'n-apero') {
  return render(
    <MemoryRouter initialEntries={[`/note/${id}`]}>
      <App />
    </MemoryRouter>,
  )
}

const conflict409 = (holder: LockHolder) =>
  json(409, {
    detail: {
      code: 'note_locked',
      message: `${holder.display_name} est en cours d'édition.`,
      locked_by: holder,
      lock_expires_at: inOneMinute(),
    },
  })

describe('NoteEditor — single-editor lock (E5)', () => {
  beforeEach(() => {
    localStorage.setItem('keepou.access', 'access-token')
    localStorage.setItem('keepou.refresh', 'refresh-token')
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    localStorage.clear()
  })

  it('acquires the lock on a public note: « Tu modifies cette note », fields editable', async () => {
    const current = note()
    const lockCalls: string[] = []
    stubFetch({
      '/api/auth/me': () => json(200, ME),
      '/api/notes?tab=mine': () => json(200, [current]),
      [`/api/notes/${current.id}`]: () => json(200, current),
      [`/api/notes/${current.id}/lock`]: (init) => {
        lockCalls.push(init?.method ?? 'POST')
        if (init?.method === 'DELETE') return new Response(null, { status: 204 })
        return json(200, { ...current, locked_by: ME, lock_expires_at: inOneMinute() })
      },
    })
    renderEditor()

    expect(await screen.findByText('Tu modifies cette note')).toBeInTheDocument()
    expect(document.querySelector('.kp-editor__bar--mine')).not.toBeNull()
    await waitFor(() => expect(screen.getByLabelText('Titre de la note')).toBeEnabled())
    expect(lockCalls).toEqual(['POST'])

    // Leaving the editor releases promptly.
    fireEvent.click(screen.getByRole('button', { name: 'Terminé' }))
    await waitFor(() => expect(lockCalls).toContain('DELETE'))
  })

  it('renews the lock ~every 20 s (heartbeat), independent of autosave', async () => {
    vi.useFakeTimers()
    const current = note()
    const lockPosts: RequestInit[] = []
    stubFetch({
      '/api/auth/me': () => json(200, ME),
      [`/api/notes/${current.id}`]: () => json(200, current),
      [`/api/notes/${current.id}/lock`]: (init) => {
        if (init?.method === 'DELETE') return new Response(null, { status: 204 })
        lockPosts.push(init!)
        return json(200, { ...current, locked_by: ME, lock_expires_at: inOneMinute() })
      },
    })
    renderEditor()

    // Load + acquisition settle on microtasks (no timers involved).
    await act(async () => {})
    await act(async () => {})
    expect(lockPosts).toHaveLength(1)
    expect(screen.getByText('Tu modifies cette note')).toBeInTheDocument()

    await act(async () => {
      vi.advanceTimersByTime(20_500)
    })
    expect(lockPosts).toHaveLength(2)
    // No content save was triggered by the heartbeat (PATCH would throw:
    // the stub above only answers GET on the note).
  })

  it('opens read-only when locked by another: exact copy, every control disabled', async () => {
    const current = note({ locked_by: BOB, lock_expires_at: inOneMinute() })
    const fetchMock = stubFetch({
      '/api/auth/me': () => json(200, ME),
      [`/api/notes/${current.id}`]: () => json(200, current),
    })
    renderEditor()

    expect(
      await screen.findByText("🔒 Bob est en cours d'édition — lecture seule"),
    ).toBeInTheDocument()
    expect(document.querySelector('.kp-editor__bar--locked')).not.toBeNull()
    expect(screen.getByText('en direct')).toBeInTheDocument()
    expect(
      screen.getByText(
        "Édition indisponible tant que Bob modifie la note. L'affichage se met à jour en temps réel.",
      ),
    ).toBeInTheDocument()
    // « Dernière édition par X » line (E5-S5) — desktop and mobile share it.
    expect(screen.getByText(/Dernière édition par/)).toBeInTheDocument()

    // Read-only: every field and tool is inert, no insertion, no acquire attempt.
    expect(screen.getByLabelText('Titre de la note')).toBeDisabled()
    // The paragraph is a static formatted rendering (E8-S9), not an editable surface.
    expect(screen.queryByLabelText('Paragraphe')).not.toBeInTheDocument()
    expect(screen.getByText('Guacamole, chips de maïs.')).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'Citron vert' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: /Insérer une case/ })).not.toBeInTheDocument()
    for (const swatch of screen.getAllByRole('radio')) expect(swatch).toBeDisabled()
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(0)
  })

  it('renders the formatted body — markers hidden — in the locked read-only view (E8-S9)', async () => {
    const current = note({
      locked_by: BOB,
      lock_expires_at: inOneMinute(),
      body: '# Menu\n**Guacamole** et *chips*.\n\n- [ ] Citron vert',
    })
    stubFetch({
      '/api/auth/me': () => json(200, ME),
      [`/api/notes/${current.id}`]: () => json(200, current),
    })
    renderEditor()
    await screen.findByText("🔒 Bob est en cours d'édition — lecture seule")

    const staticBlock = document.querySelector('.kp-blocks__text--static')!
    expect(staticBlock.querySelector('h1')).toHaveTextContent('Menu')
    expect(staticBlock.querySelector('strong')).toHaveTextContent('Guacamole')
    expect(staticBlock.querySelector('em')).toHaveTextContent('chips')
    expect(staticBlock.textContent).not.toContain('**')
    // The checkbox row stays a (disabled) real checkbox, untouched by formatting.
    expect(screen.getByRole('checkbox', { name: 'Citron vert' })).toBeDisabled()
  })

  it('polls while read-only, offers the takeover once released, then acquires', async () => {
    vi.useFakeTimers()
    let current = note({ locked_by: BOB, lock_expires_at: inOneMinute() })
    stubFetch({
      '/api/auth/me': () => json(200, ME),
      [`/api/notes/${current.id}`]: () => json(200, current),
      [`/api/notes/${current.id}/lock`]: (init) =>
        init?.method === 'DELETE'
          ? new Response(null, { status: 204 })
          : json(200, { ...current, locked_by: ME, lock_expires_at: inOneMinute() }),
    })
    renderEditor()
    await act(async () => {})
    expect(screen.getByText("🔒 Bob est en cours d'édition — lecture seule")).toBeInTheDocument()

    // Bob leaves: the next poll (≤ ~12 s) flips the banner to the takeover.
    current = { ...current, locked_by: null, lock_expires_at: null }
    await act(async () => {
      vi.advanceTimersByTime(12_500)
    })
    expect(screen.getByText('Bob a fini de modifier — note disponible')).toBeInTheDocument()
    expect(document.querySelector('.kp-editor__bar--available')).not.toBeNull()

    // « Modifier la note » acquires and unlocks the fields.
    fireEvent.click(screen.getByRole('button', { name: 'Modifier la note' }))
    await act(async () => {})
    expect(screen.getByText('Tu modifies cette note')).toBeInTheDocument()
    expect(screen.getByLabelText('Titre de la note')).toBeEnabled()
  })

  it('save lost to a takeover → conflict state, then « Passer en lecture seule »', async () => {
    // Free at open (we acquire it) — Léa steals the lock before our next save.
    let current = note()
    let patched = 0
    stubFetch({
      '/api/auth/me': () => json(200, ME),
      [`/api/notes/${current.id}`]: (init) => {
        if (init?.method === 'PATCH') {
          patched += 1
          current = { ...current, locked_by: LEA, lock_expires_at: inOneMinute() }
          return conflict409(LEA) // Léa took over while we were away
        }
        return json(200, current)
      },
      [`/api/notes/${current.id}/lock`]: (init) =>
        init?.method === 'DELETE'
          ? new Response(null, { status: 204 })
          : json(200, { ...current, locked_by: ME, lock_expires_at: inOneMinute() }),
    })
    renderEditor()
    const title = await screen.findByLabelText('Titre de la note')
    await waitFor(() => expect(title).toBeEnabled())

    fireEvent.change(title, { target: { value: 'Modif perdue' } })
    fireEvent.blur(title) // immediate flush → 409

    // State 4 — sand banner, frozen copy, no hard error.
    expect(await screen.findByText('Léa modifie cette note')).toBeInTheDocument()
    expect(document.querySelector('.kp-editor__bar--conflict')).not.toBeNull()
    expect(
      screen.getByText(
        'Léa a commencé à modifier cette note pendant ton absence. Tes dernières modifications ' +
          "n'ont pas pu être enregistrées.",
      ),
    ).toBeInTheDocument()
    expect(patched).toBe(1)

    // « Passer en lecture seule » → follow along read-only, Léa still editing.
    fireEvent.click(screen.getByRole('button', { name: 'Passer en lecture seule' }))
    expect(
      await screen.findByText("🔒 Léa est en cours d'édition — lecture seule"),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Titre de la note')).toBeDisabled()
  })

  it('never locks a private note: no banner, no lock request, editing allowed', async () => {
    const current = note({ visibility: 'PRIVATE', owner_id: ME.id, author_name: 'Marie' })
    const fetchMock = stubFetch({
      '/api/auth/me': () => json(200, ME),
      [`/api/notes/${current.id}`]: () => json(200, current),
    })
    renderEditor()

    const title = await screen.findByLabelText('Titre de la note')
    await waitFor(() => expect(title).toBeEnabled())
    expect(screen.queryByText('Tu modifies cette note')).not.toBeInTheDocument()
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/lock'))).toBe(false)
  })
})
