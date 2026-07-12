import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { NoteOut } from '../api/notes'
import App from '../App'

/**
 * E4-S7 (front): editor loading, autosave debounce (~1.5 s) + flush on blur
 * and close, SaveStatus transitions, checkbox insertion at the bottom, color
 * picker, and the public→private confirmation (owner-only toggle).
 * fetch is stubbed — permissions are enforced (and tested) server-side.
 */

const ME = {
  id: 'u-marie',
  email: 'marie@famille-ou.fr',
  display_name: 'Marie',
  role: 'MEMBER',
  status: 'ACTIVE',
  created_at: '2026-07-01T10:00:00',
}

const BODY =
  'Pour le repas de quartier on se répartit les tâches.\n' +
  '\n' +
  '- [x] Réserver la salle\n' +
  '- [ ] Tables & chaises'

function note(overrides: Partial<NoteOut> = {}): NoteOut {
  return {
    id: 'n-repas',
    title: 'Repas de quartier',
    body: BODY,
    color: 'AVOCAT',
    visibility: 'PUBLIC',
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

/** Lock route stub: POST grants the lock to ME, DELETE releases (E5). */
function grantLock(current: NoteOut): Handler {
  return (init) =>
    init?.method === 'DELETE'
      ? new Response(null, { status: 204 })
      : json(200, {
          ...current,
          locked_by: { id: ME.id, display_name: ME.display_name },
          lock_expires_at: new Date(Date.now() + 60_000).toISOString(),
        })
}

/** Editor stub: GET returns the note, PATCH echoes the merged payload. */
function stubEditor(current: NoteOut, extra: Record<string, Handler> = {}) {
  const patches: Array<Record<string, unknown>> = []
  stubFetch({
    '/api/auth/me': () => json(200, ME),
    '/api/notes?tab=mine': () => json(200, [current]),
    [`/api/notes/${current.id}/lock`]: grantLock(current),
    [`/api/notes/${current.id}`]: (init) => {
      if (init?.method === 'PATCH') {
        const patch = JSON.parse(String(init.body)) as Record<string, unknown>
        patches.push(patch)
        return json(200, { ...current, ...patch, updated_at: new Date().toISOString() })
      }
      return json(200, current)
    },
    ...extra,
  })
  return patches
}

function renderEditor(id = 'n-repas') {
  return render(
    <MemoryRouter initialEntries={[`/note/${id}`]}>
      <App />
    </MemoryRouter>,
  )
}

async function editorLoaded() {
  // Loaded *and* editable: on a public note the fields stay disabled until the
  // lock acquisition (E5) resolves.
  const title = await screen.findByLabelText('Titre de la note')
  await waitFor(() => expect(title).toBeEnabled())
  return title
}

describe('NoteEditor', () => {
  beforeEach(() => {
    localStorage.setItem('keepou.access', 'access-token')
    localStorage.setItem('keepou.refresh', 'refresh-token')
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    localStorage.clear()
  })

  it('loads the note: title, editable paragraph + real checkboxes, subtitle', async () => {
    stubEditor(note())
    renderEditor()

    expect(await editorLoaded()).toHaveValue('Repas de quartier')
    expect(screen.getByRole('dialog', { name: 'Repas de quartier' })).toHaveClass(
      'kp-editor--avocat',
    )
    // The block flow: 1 Markdown-aware paragraph + 2 real checkboxes with their state.
    expect(screen.getByLabelText('Paragraphe').textContent).toBe(
      'Pour le repas de quartier on se répartit les tâches.',
    )
    expect(screen.getByRole('checkbox', { name: 'Réserver la salle' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Tables & chaises' })).not.toBeChecked()
    // "Last saved version" subtitle, distinct from the session state.
    expect(screen.getByText(/Dernière version enregistrée par/)).toBeInTheDocument()
    expect(screen.getByText('Marie')).toBeInTheDocument()
  })

  it('paints a seeded note instantly, without waiting for the fetch (E11 perf)', async () => {
    const seeded = note({ title: 'Titre pré-chargé', visibility: 'PRIVATE' })
    // The GET hangs — if the editor blocked on it, we'd be stuck on « Chargement… ».
    let resolveGet: (r: Response) => void = () => {}
    stubFetch({
      '/api/auth/me': () => json(200, ME),
      [`/api/notes/${seeded.id}/lock`]: () => new Response(null, { status: 204 }),
      [`/api/notes/${seeded.id}`]: (init) => {
        if (init?.method === 'PATCH') return json(200, seeded)
        return new Promise<Response>((resolve) => {
          resolveGet = resolve
        })
      },
    })
    render(
      <MemoryRouter
        initialEntries={[{ pathname: `/note/${seeded.id}`, state: { from: '/', note: seeded } }]}
      >
        <App />
      </MemoryRouter>,
    )

    // Content from the seed shows and is editable; the loading fallback never appears.
    const title = await screen.findByDisplayValue('Titre pré-chargé')
    expect(title).toBeEnabled()
    expect(screen.queryByText('Chargement…')).not.toBeInTheDocument()

    // Settle the hung revalidation so its state update lands inside act().
    await act(async () => {
      resolveGet(json(200, seeded))
    })
  })

  it('autosaves ~1.5 s after the last keystroke with the consolidated payload', async () => {
    const patches = stubEditor(note())
    renderEditor()
    const title = await editorLoaded()

    vi.useFakeTimers()
    fireEvent.change(title, { target: { value: 'Repas de quartier — samedi' } })
    // Session state flips to « Modifié », nothing sent yet.
    expect(screen.getByText('Modifié')).toBeInTheDocument()
    expect(patches).toHaveLength(0)

    await act(async () => {
      vi.advanceTimersByTime(1600)
    })
    vi.useRealTimers()

    expect(await screen.findByText(/Enregistré · à l'instant/)).toBeInTheDocument()
    expect(patches).toEqual([
      {
        title: 'Repas de quartier — samedi',
        body: BODY,
        color: 'AVOCAT',
        visibility: 'PUBLIC',
      },
    ])
  })

  it('flushes immediately on blur, showing Enregistrement… while pending', async () => {
    let resolvePatch: ((r: Response) => void) | null = null
    const current = note()
    stubFetch({
      '/api/auth/me': () => json(200, ME),
      [`/api/notes/${current.id}/lock`]: grantLock(current),
      [`/api/notes/${current.id}`]: (init) => {
        if (init?.method === 'PATCH') {
          return new Promise<Response>((resolve) => {
            resolvePatch = resolve
          })
        }
        return json(200, current)
      },
    })
    renderEditor()
    const title = await editorLoaded()

    fireEvent.change(title, { target: { value: 'Sans attendre' } })
    fireEvent.blur(title)

    // No debounce wait: the request is already in flight.
    expect(await screen.findByText('Enregistrement…')).toBeInTheDocument()
    expect(resolvePatch).not.toBeNull()

    await act(async () => {
      resolvePatch!(
        json(200, { ...current, title: 'Sans attendre', updated_at: new Date().toISOString() }),
      )
    })
    expect(await screen.findByText(/Enregistré · à l'instant/)).toBeInTheDocument()
  })

  it('flushes the pending edit when closing with « Terminé » and returns to the board', async () => {
    const patches = stubEditor(note())
    renderEditor()
    const title = await editorLoaded()

    vi.useFakeTimers()
    fireEvent.change(title, { target: { value: 'Fermé avant l’autosave' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Terminé' }))
    })
    vi.useRealTimers()

    // Saved without waiting for the debounce, then back on the board.
    expect(patches).toHaveLength(1)
    expect(patches[0].title).toBe('Fermé avant l’autosave')
    expect(await screen.findByLabelText('Prends une note…')).toBeInTheDocument()
  })

  it('inserts a checkbox at the bottom and serializes it as a GFM task line', async () => {
    const patches = stubEditor(note())
    renderEditor()
    await editorLoaded()

    fireEvent.click(screen.getByRole('button', { name: /Insérer une case à cocher/ }))
    // Every box label carries the placeholder — the new (empty) one is last.
    const labels = screen.getAllByPlaceholderText('Nouvel élément')
    const label = labels[labels.length - 1]
    expect(label).toHaveValue('')
    fireEvent.change(label, { target: { value: 'Gobelets réutilisables' } })
    fireEvent.blur(label)

    await screen.findByText(/Enregistré · à l'instant/)
    expect(patches).toHaveLength(1)
    expect(patches[0].body).toBe(`${BODY}\n- [ ] Gobelets réutilisables`)
  })

  it('exits the checklist with two line breaks into a normal paragraph (E8-S10)', async () => {
    const patches = stubEditor(note())
    renderEditor()
    await editorLoaded()

    // First Enter on a non-empty box: the list continues with an empty box.
    const lastLabel = screen.getByDisplayValue('Tables & chaises')
    fireEvent.keyDown(lastLabel, { key: 'Enter' })
    const labels = screen.getAllByPlaceholderText('Nouvel élément')
    const emptyLabel = labels[labels.length - 1]
    expect(emptyLabel).toHaveValue('')

    // Second Enter (on the empty box): exit the checklist — the empty box is
    // gone, replaced by a focused normal paragraph.
    fireEvent.keyDown(emptyLabel, { key: 'Enter' })
    expect(screen.getAllByPlaceholderText('Nouvel élément')).toHaveLength(2)
    const paragraphs = screen.getAllByLabelText('Paragraphe')
    expect(paragraphs).toHaveLength(2)
    expect(paragraphs[1].textContent).toBe('')
    expect(paragraphs[1]).toHaveFocus()

    // The check → text flow round-trips with the blank-line separator.
    paragraphs[1].textContent = 'Texte sous la liste'
    fireEvent.input(paragraphs[1])
    fireEvent.blur(paragraphs[1])
    await screen.findByText(/Enregistré · à l'instant/)
    expect(patches).toHaveLength(1)
    expect(patches[0].body).toBe(`${BODY}\n\nTexte sous la liste`)
  })

  it('toggling a checkbox updates the [x] marker in the saved body', async () => {
    const patches = stubEditor(note())
    renderEditor()
    await editorLoaded()

    const box = screen.getByRole('checkbox', { name: 'Tables & chaises' })
    vi.useFakeTimers()
    fireEvent.click(box)
    expect(box).toBeChecked()
    await act(async () => {
      vi.advanceTimersByTime(1600)
    })
    vi.useRealTimers()

    await screen.findByText(/Enregistré · à l'instant/)
    expect(patches).toHaveLength(1)
    expect(patches[0].body).toContain('- [x] Tables & chaises')
  })

  it('changes the color from the picker and saves immediately', async () => {
    const patches = stubEditor(note())
    renderEditor()
    await editorLoaded()

    await act(async () => {
      fireEvent.click(screen.getByRole('radio', { name: 'Sarcelle' }))
    })

    expect(screen.getByRole('dialog')).toHaveClass('kp-editor--teal')
    await screen.findByText(/Enregistré · à l'instant/)
    expect(patches).toHaveLength(1)
    expect(patches[0].color).toBe('TEAL')
  })

  it('asks for confirmation before going public → private (exact frozen copy)', async () => {
    const patches = stubEditor(note())
    renderEditor()
    await editorLoaded()

    fireEvent.click(screen.getByRole('button', { name: 'Public' }))
    expect(screen.getByText('Cette note ne sera plus visible par les autres.')).toBeInTheDocument()

    // Annuler: nothing is sent, the note stays public.
    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }))
    expect(patches).toHaveLength(0)
    expect(screen.getByRole('button', { name: 'Public' })).toHaveAttribute('aria-pressed', 'true')

    // Confirmer: the flip is saved immediately.
    fireEvent.click(screen.getByRole('button', { name: 'Public' }))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Confirmer' }))
    })
    await screen.findByText(/Enregistré · à l'instant/)
    expect(patches).toHaveLength(1)
    expect(patches[0].visibility).toBe('PRIVATE')
  })

  it('applies private → public immediately (reversible, no confirmation)', async () => {
    const patches = stubEditor(note({ visibility: 'PRIVATE' }))
    renderEditor()
    await editorLoaded()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Public' }))
    })

    expect(screen.queryByText(/ne sera plus visible/)).not.toBeInTheDocument()
    await screen.findByText(/Enregistré · à l'instant/)
    expect(patches).toHaveLength(1)
    expect(patches[0].visibility).toBe('PUBLIC')
  })

  it('hides the visibility toggle from non-owners and never sends visibility', async () => {
    const patches = stubEditor(note({ owner_id: 'u-lea', author_name: 'Léa' }))
    renderEditor()
    const title = await editorLoaded()

    expect(screen.queryByRole('button', { name: 'Public' })).not.toBeInTheDocument()

    fireEvent.change(title, { target: { value: 'Édité par Marie' } })
    fireEvent.blur(title)
    await screen.findByText(/Enregistré · à l'instant/)
    expect(patches).toHaveLength(1)
    expect(patches[0]).not.toHaveProperty('visibility')
  })

  // --- E11: owner actions (pin / archive / hard delete) + Maj+Entrée ---

  it('archives the note from the owner menu and returns to the board (E11)', async () => {
    const patches = stubEditor(note())
    renderEditor()
    await editorLoaded()

    fireEvent.click(screen.getByRole('button', { name: 'Actions sur la note' }))
    await act(async () => {
      fireEvent.click(screen.getByRole('menuitem', { name: 'Archiver' }))
    })

    expect(patches).toContainEqual({ archived: true })
    expect(await screen.findByLabelText('Prends une note…')).toBeInTheDocument()
  })

  it('hard-deletes the note from the owner menu after confirmation (E11)', async () => {
    const current = note()
    let deleted = false
    stubEditor(current, {
      [`/api/notes/${current.id}`]: (init) => {
        if (init?.method === 'DELETE') {
          deleted = true
          return new Response(null, { status: 204 })
        }
        return json(200, current)
      },
    })
    renderEditor()
    await editorLoaded()

    fireEvent.click(screen.getByRole('button', { name: 'Actions sur la note' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Supprimer définitivement' }))
    // Irreversible → a confirmation before the DELETE.
    expect(deleted).toBe(false)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }))
    })

    await waitFor(() => expect(deleted).toBe(true))
    expect(await screen.findByLabelText('Prends une note…')).toBeInTheDocument()
  })

  it('hides the owner menu from non-owners (E11)', async () => {
    stubEditor(note({ owner_id: 'u-lea', author_name: 'Léa' }))
    renderEditor()
    await editorLoaded()
    expect(screen.queryByRole('button', { name: 'Actions sur la note' })).not.toBeInTheDocument()
  })

  it('saves and closes on Maj+Entrée without inserting a newline (E11)', async () => {
    const patches = stubEditor(note())
    renderEditor()
    const title = await editorLoaded()

    fireEvent.change(title, { target: { value: 'Enregistré au clavier' } })
    fireEvent.keyDown(title, { key: 'Enter', shiftKey: true })

    // Back on the board, and the latest title was flushed (not left as a newline).
    expect(await screen.findByLabelText('Prends une note…')).toBeInTheDocument()
    await waitFor(() => expect(patches).toHaveLength(1))
    expect(patches[0].title).toBe('Enregistré au clavier')
  })

  // --- E11-S6: clear all checked boxes ---

  it('offers the clear action only while at least one box is checked (E11-S6)', async () => {
    stubEditor(note())
    renderEditor()
    await editorLoaded()

    const name = 'Supprimer les cases cochées'
    // The note loads with one box already checked → the action is offered.
    expect(screen.getByRole('button', { name })).toBeInTheDocument()

    // Unchecking the only ticked box hides it again.
    await act(async () => {
      fireEvent.click(screen.getByRole('checkbox', { name: 'Réserver la salle' }))
    })
    expect(screen.queryByRole('button', { name })).not.toBeInTheDocument()
  })

  it('removes every checked box and saves the trimmed body immediately (E11-S6)', async () => {
    const patches = stubEditor(note())
    renderEditor()
    await editorLoaded()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Supprimer les cases cochées' }))
    })

    // The ticked box is gone, the unchecked one and the paragraph stay.
    expect(screen.queryByRole('checkbox', { name: 'Réserver la salle' })).not.toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'Tables & chaises' })).toBeInTheDocument()

    // Saved right away (like a checkbox toggle), no debounce wait.
    await screen.findByText(/Enregistré · à l'instant/)
    expect(patches).toHaveLength(1)
    expect(patches[0].body).toBe(
      'Pour le repas de quartier on se répartit les tâches.\n\n- [ ] Tables & chaises',
    )
  })

  it('keeps an empty paragraph when clearing removes the last block (E11-S6)', async () => {
    const patches = stubEditor(note({ body: '- [x] Fait\n- [x] Aussi fait' }))
    renderEditor()
    await editorLoaded()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Supprimer les cases cochées' }))
    })

    // No boxes left, but a normal paragraph remains to type into.
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Paragraphe')).toBeInTheDocument()
    await screen.findByText(/Enregistré · à l'instant/)
    expect(patches).toHaveLength(1)
    expect(patches[0].body).toBe('')
  })

  it('copies the whole note — title + serialized text — in one click (E11-S7)', async () => {
    const writeText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    })
    stubEditor(note())
    renderEditor()
    await editorLoaded()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copier la note' }))
    })

    expect(writeText).toHaveBeenCalledWith('Repas de quartier\n\n' + BODY)
    // Transient feedback: the icon flips to a checkmark and announces the copy.
    expect(screen.getByRole('button', { name: 'Note copiée' })).toBeInTheDocument()

    Reflect.deleteProperty(navigator, 'clipboard')
  })

  it('keeps the copy action available in read-only mode (E11-S7)', async () => {
    const writeText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    })
    const locked = note({
      owner_id: 'u-paul',
      locked_by: { id: 'u-paul', display_name: 'Paul' },
      lock_expires_at: new Date(Date.now() + 60_000).toISOString(),
    })
    stubFetch({
      '/api/auth/me': () => json(200, ME),
      [`/api/notes/${locked.id}`]: () => json(200, locked),
    })
    renderEditor()
    await screen.findByText(/est en cours d'édition/)

    // Every editing control is disabled, but the copy button still works.
    expect(screen.getByLabelText('Titre de la note')).toBeDisabled()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copier la note' }))
    })
    expect(writeText).toHaveBeenCalledWith('Repas de quartier\n\n' + BODY)

    Reflect.deleteProperty(navigator, 'clipboard')
  })

  it('shows « Note introuvable. » when the note cannot be loaded', async () => {
    stubFetch({
      '/api/auth/me': () => json(200, ME),
      '/api/notes/n-perdue': () => json(404, { detail: 'Note introuvable.' }),
    })
    renderEditor('n-perdue')

    expect(await screen.findByText('Note introuvable.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Retour au board' })).toBeInTheDocument()
  })
})
