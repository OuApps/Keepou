import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { listNotes, patchNote, type BoardTab, type NoteOut, type NotePatch } from '../api/notes'
import { useAuth } from '../auth/AuthContext'
import { Composer } from '../components/Composer'
import { NoteCard } from '../components/NoteCard'
import { NoteGrid } from '../components/NoteGrid'
import { TabSwitch } from '../components/TabSwitch'
import { Topbar } from '../components/Topbar'
import { BOARD_COPY, COMMON_COPY } from '../lib/copy'

/**
 * Main board (E3): Topbar (search + tabs), quick composer, masonry of cards.
 * The active board is driven by `?tab=mine|public` (deep-linkable, E3-S4);
 * search is a client-side filter over the loaded set (E3-S7 / ARCHITECTURE §7).
 * `?archived=1` (E8) swaps in the dedicated archived view (own notes only).
 */

/** Case- and accent-insensitive match (French titles: « déco », « Léa »…). */
function fold(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function matches(note: NoteOut, needle: string): boolean {
  if (needle === '') return true
  return fold(`${note.title}\n${note.body}`).includes(needle)
}

/** Pinned first, then newest-first — mirrors the server order after a local toggle. */
function sortNotes(list: NoteOut[]): NoteOut[] {
  return [...list].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
    return b.updated_at.localeCompare(a.updated_at)
  })
}

export default function BoardPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [params, setParams] = useSearchParams()
  const archived = params.get('archived') === '1'
  const tab: BoardTab = params.get('tab') === 'public' ? 'public' : 'mine'
  const [notes, setNotes] = useState<NoteOut[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [organizeFailed, setOrganizeFailed] = useState(false)
  const [query, setQuery] = useState('')

  // The archived view is always the caller's own notes, regardless of tab.
  const listTab: BoardTab = archived ? 'mine' : tab

  useEffect(() => {
    let cancelled = false
    setNotes(null)
    setFailed(false)
    listNotes(listTab, archived)
      .then((list) => {
        if (!cancelled) setNotes(list)
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [listTab, archived])

  const switchTab = (next: BoardTab) => {
    setParams(next === 'mine' ? {} : { tab: next }, { replace: false })
  }

  // A freshly created note opens straight in the editor to write its body; the
  // board refetches (and shows the new card) when the editor is closed.
  const onCreated = (note: NoteOut) => navigate(`/note/${note.id}`)

  // Pin / archive (E8) — optimistic: a (un)archived note leaves the current
  // view, a (un)pinned note re-sorts. On failure we resync from the server.
  const onOrganize = (target: NoteOut, patch: NotePatch) => {
    setOrganizeFailed(false)
    setNotes((current) => {
      if (current === null) return current
      const leaves = patch.archived !== undefined // archive toggles cross views
      const next = leaves
        ? current.filter((n) => n.id !== target.id)
        : current.map((n) => (n.id === target.id ? { ...n, ...patch } : n))
      return sortNotes(next)
    })
    patchNote(target.id, patch).catch(() => {
      setOrganizeFailed(true)
      listNotes(listTab, archived)
        .then(setNotes)
        .catch(() => setFailed(true))
    })
  }

  // Fold the query once, not once per note per keystroke.
  const needle = fold(query.trim())
  const visible = notes?.filter((note) => matches(note, needle))
  const canOrganize = (note: NoteOut) => user !== null && note.owner_id === user.id

  return (
    <div className="kp-app">
      <Topbar
        center={
          <div className="kp-search">
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
              <circle cx="7" cy="7" r="5" fill="none" stroke="var(--ink-mute)" strokeWidth="1.6" />
              <line
                x1="11"
                y1="11"
                x2="14.5"
                y2="14.5"
                stroke="var(--ink-mute)"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
            </svg>
            <input
              type="search"
              className="kp-search__input"
              placeholder={BOARD_COPY.searchPlaceholder}
              aria-label={BOARD_COPY.searchPlaceholder}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        }
        tabs={archived ? undefined : <TabSwitch tab={tab} onChange={switchTab} />}
      />

      <main className="kp-container">
        {archived ? (
          <div className="kp-board__archived-head">
            <h1 className="kp-board__archived-title">{BOARD_COPY.archivedTitle}</h1>
            <button type="button" className="kp-board__archived-back" onClick={() => navigate('/')}>
              {BOARD_COPY.archivedBack}
            </button>
          </div>
        ) : (
          <Composer onCreated={onCreated} defaultPublic={tab === 'public'} />
        )}

        {organizeFailed && (
          <p className="kp-board__status" role="alert">
            {BOARD_COPY.organizeFailed}
          </p>
        )}
        {failed && (
          <p className="kp-board__status" role="alert">
            {BOARD_COPY.loadFailed}
          </p>
        )}
        {!failed && notes === null && <p className="kp-board__status">{COMMON_COPY.loading}</p>}

        {visible && visible.length > 0 && (
          <NoteGrid>
            {visible.map((note) => (
              <NoteCard
                key={note.id}
                note={note}
                showAuthor={!archived && tab === 'public'}
                canOrganize={canOrganize(note)}
                archivedView={archived}
                onOrganize={(patch) => onOrganize(note, patch)}
              />
            ))}
          </NoteGrid>
        )}

        {visible && visible.length === 0 && notes !== null && (
          <p className="kp-board__status">
            {query.trim() !== ''
              ? BOARD_COPY.emptySearch
              : archived
                ? BOARD_COPY.emptyArchived
                : tab === 'mine'
                  ? BOARD_COPY.emptyMine
                  : BOARD_COPY.emptyPublic}
          </p>
        )}
      </main>
    </div>
  )
}
