import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ImportPreviewOut, ImportSummaryOut } from '../api/importKeep'
import App from '../App'

/**
 * E10-S3 (front): the import flow — upload gating, review grid with trashed
 * pre-unchecked, check/uncheck + « Tout cocher / décocher » + live count,
 * import sends only the checked indices (multipart), summary + errors.
 * Parsing and guarantees are server-side (tested in api/tests).
 */

const ME = {
  id: 'u-marie',
  email: 'marie@famille-ou.fr',
  display_name: 'Marie',
  role: 'MEMBER',
  status: 'ACTIVE',
  created_at: '2026-07-01T10:00:00',
}

const PREVIEW: ImportPreviewOut = {
  items: [
    {
      index: 0,
      title: 'Courses',
      body: 'Pour le week-end\n\n- [ ] Café\n- [x] Pain',
      color: 'TEAL',
      created_at: '2020-09-13T12:26:40',
      updated_at: '2020-09-13T12:35:00',
      is_trashed: false,
    },
    {
      index: 1,
      title: 'Vieux code wifi',
      body: 'Livebox-A3F2',
      color: 'SALSA',
      created_at: '2019-01-05T08:00:00',
      updated_at: '2019-01-05T08:00:00',
      is_trashed: true,
    },
    {
      index: 3,
      title: 'Idées cadeaux Mamie',
      body: 'Un châle en laine.',
      color: 'GOLD',
      created_at: '2021-03-02T09:00:00',
      updated_at: '2021-03-02T09:00:00',
      is_trashed: false,
    },
  ],
  counts: { total: 4, trashed: 1, parse_failed: 1 },
  failed: [{ index: 2, reason: 'Note illisible (JSON invalide).' }],
}

const SUMMARY: ImportSummaryOut = { imported: 2, skipped_duplicate: 1, failed: [] }

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

function renderImport(extra: Record<string, (init?: RequestInit) => Response> = {}) {
  stubFetch({
    '/api/auth/me': () => json(200, ME),
    ...extra,
  })
  render(
    <MemoryRouter initialEntries={['/import']}>
      <App />
    </MemoryRouter>,
  )
}

function pickZip() {
  const file = new File(['PK-fake'], 'takeout-20260704.zip', { type: 'application/zip' })
  const input = document.querySelector<HTMLInputElement>('input[type="file"]')
  expect(input).not.toBeNull()
  fireEvent.change(input as HTMLInputElement, { target: { files: [file] } })
  return file
}

async function goToReview(extra: Record<string, (init?: RequestInit) => Response> = {}) {
  renderImport({
    '/api/import/keep/preview': () => json(200, PREVIEW),
    ...extra,
  })
  await screen.findByText(/Récupère d'abord tes notes/)
  pickZip()
  fireEvent.click(screen.getByRole('button', { name: 'Continuer' }))
  await screen.findByText(/notes trouvées/)
}

beforeEach(() => {
  localStorage.setItem('keepou.access', 'token-access')
  localStorage.setItem('keepou.refresh', 'token-refresh')
})

afterEach(() => {
  vi.unstubAllGlobals()
  localStorage.clear()
})

describe('import — upload screen', () => {
  it('disables « Continuer » until a .zip is picked', async () => {
    renderImport()
    const btn = await screen.findByRole('button', { name: 'Continuer' })
    expect(btn).toBeDisabled()
    pickZip()
    expect(btn).toBeEnabled()
    expect(screen.getByText('takeout-20260704.zip')).toBeInTheDocument()
  })

  it('shows the server error inline (non-ZIP payload)', async () => {
    renderImport({
      '/api/import/keep/preview': () =>
        json(400, { detail: "Le fichier n'est pas une archive ZIP valide." }),
    })
    await screen.findByRole('button', { name: 'Continuer' })
    pickZip()
    fireEvent.click(screen.getByRole('button', { name: 'Continuer' }))
    expect(
      await screen.findByText("Le fichier n'est pas une archive ZIP valide."),
    ).toBeInTheDocument()
    // Still on the upload screen.
    expect(screen.getByRole('button', { name: 'Continuer' })).toBeInTheDocument()
  })
})

describe('import — review / selection (« mode tunnel »)', () => {
  it('lists the parsed notes, trashed pre-unchecked with a « Corbeille » chip', async () => {
    await goToReview()
    expect(screen.getByText('3 notes trouvées')).toBeInTheDocument()
    expect(screen.getByText(/1 fichier illisible sera ignoré/)).toBeInTheDocument()

    const trashed = screen.getByRole('checkbox', { name: 'Vieux code wifi' })
    expect(trashed).not.toBeChecked()
    expect(screen.getByText('Corbeille')).toBeInTheDocument()

    expect(screen.getByRole('checkbox', { name: 'Courses' })).toBeChecked()
    expect(screen.getByText('2 sélectionnées sur 3')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Importer les 2 notes' })).toBeInTheDocument()
  })

  it('updates the live count on toggle and via « Tout cocher / décocher »', async () => {
    await goToReview()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Courses' }))
    expect(screen.getByText('1 sélectionnée sur 3')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Tout cocher' }))
    expect(screen.getByText('3 sélectionnées sur 3')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Tout décocher' }))
    expect(screen.getByText('0 sélectionnées sur 3')).toBeInTheDocument()
    // Nothing selected → import disabled.
    const importBtn = screen.getByRole('button', { name: 'Importer les 0 notes' })
    expect(importBtn).toBeDisabled()
  })

  it('sends only the checked indices as multipart form data', async () => {
    let importBody: FormData | null = null
    await goToReview({
      '/api/import/keep': (init) => {
        importBody = init?.body as FormData
        return json(200, SUMMARY)
      },
    })
    // Uncheck « Idées cadeaux Mamie » → only index 0 stays selected.
    fireEvent.click(screen.getByRole('checkbox', { name: 'Idées cadeaux Mamie' }))
    fireEvent.click(screen.getByRole('button', { name: 'Importer la note' }))
    await screen.findByText('2 notes importées')

    expect(importBody).toBeInstanceOf(FormData)
    const form = importBody as unknown as FormData
    expect(form.getAll('selected')).toEqual(['0'])
    expect(form.get('file')).toBeInstanceOf(File)
  })

  it('shows the summary details and returns to the board', async () => {
    await goToReview({
      '/api/import/keep': () => json(200, SUMMARY),
      '/api/notes?tab=mine': () => json(200, []),
    })
    fireEvent.click(screen.getByRole('button', { name: 'Importer les 2 notes' }))
    await screen.findByText('2 notes importées')
    expect(screen.getByText(/1 doublon ignoré/)).toBeInTheDocument()
    expect(screen.getByText(/gardent leur date d'origine/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Voir mes notes' }))
    await waitFor(() => expect(screen.getByPlaceholderText(/Rechercher/)).toBeInTheDocument())
  })
})

describe('import — entry point', () => {
  it('opens from the avatar menu for every member', async () => {
    stubFetch({
      '/api/auth/me': () => json(200, ME),
      '/api/notes?tab=mine': () => json(200, []),
    })
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>,
    )
    fireEvent.click(await screen.findByRole('button', { name: 'Menu du compte' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Importer depuis Google Keep' }))
    expect(await screen.findByText(/Récupère d'abord tes notes/)).toBeInTheDocument()
  })
})
