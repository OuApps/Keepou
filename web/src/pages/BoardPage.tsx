import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  deleteNote,
  listNotes,
  patchNote,
  type BoardTab,
  type NoteOut,
  type NotePatch,
} from '../api/notes'
import { useAuth } from '../auth/AuthContext'
import { Composer } from '../components/Composer'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { DensitySelect, type Density } from '../components/DensitySelect'
import { NoteCard } from '../components/NoteCard'
import { NoteGrid } from '../components/NoteGrid'
import { SortSelect, type SortKey } from '../components/SortSelect'
import { TabSwitch } from '../components/TabSwitch'
import { Topbar } from '../components/Topbar'
import { useRenderWindow } from '../hooks/useRenderWindow'
import {
  boardKey,
  getCachedBoard,
  setCachedBoard,
  subscribeBoards,
  updateCachedBoard,
} from '../lib/boardCache'
import { useI18n } from '../i18n'

/**
 * Main board (E3): Topbar (search + tabs), quick composer, masonry of cards.
 * The active board is driven by `?tab=mine|public`; `?archived=1` (E8) swaps in
 * the dedicated archived view (own notes only).
 *
 * E11 adds board controls, all URL-driven so they survive an editor round-trip
 * (« retour garde la sélection »): `?sort=` orders the board (pinned first), a ✕
 * clears the search, the archived view offers multi-select + a bulk permanent
 * delete, and a render window (`useRenderWindow`) keeps a 300-note board
 * mounting instantly.
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

/** Pinned first, then the chosen key. Title sorts accent-insensitively, empty
 * titles last; « modifié »/« créé » are newest-first (matching the server). */
function sortNotes(list: NoteOut[], key: SortKey): NoteOut[] {
  const compare = (a: NoteOut, b: NoteOut): number => {
    if (key === 'title') {
      const at = a.title.trim()
      const bt = b.title.trim()
      if ((at === '') !== (bt === '')) return at === '' ? 1 : -1
      return at.localeCompare(bt, 'fr', { sensitivity: 'base' })
    }
    const field = key === 'created' ? 'created_at' : 'updated_at'
    return b[field].localeCompare(a[field])
  }
  return [...list].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
    return compare(a, b)
  })
}

function parseSort(value: string | null): SortKey {
  return value === 'created' || value === 'title' ? value : 'modified'
}

// « Aperçu » is the default (feedback round 2): whole boards of long notes were
// forcing a long scroll; « Notes entières » is the explicit opt-in.
function parseDensity(value: string | null): Density {
  return value === 'full' ? 'full' : 'compact'
}

export default function BoardPage() {
  const { BOARD_COPY, COMMON_COPY } = useI18n()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [params, setParams] = useSearchParams()
  const archived = params.get('archived') === '1'
  const tab: BoardTab = params.get('tab') === 'public' ? 'public' : 'mine'
  const sort = parseSort(params.get('sort'))
  const density = parseDensity(params.get('density'))
  const [failed, setFailed] = useState(false)
  const [organizeFailed, setOrganizeFailed] = useState(false)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [confirmingBulk, setConfirmingBulk] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)

  // The archived view is always the caller's own notes, regardless of tab.
  const listTab: BoardTab = archived ? 'mine' : tab

  // The notes live in a cross-navigation cache (E11 perf): returning from the
  // editor paints the cached list instantly instead of flashing « Chargement… »,
  // and the edit made in the editor is already merged in. Local state mirrors the
  // cache (the board's own optimistic writes and the editor's upserts both land
  // there and emit here) — plain setState, so React batches it normally.
  const key = boardKey(listTab, archived)
  const [notes, setNotes] = useState<NoteOut[] | null>(() => getCachedBoard(key) ?? null)

  useEffect(() => {
    setNotes(getCachedBoard(key) ?? null)
    return subscribeBoards(() => setNotes(getCachedBoard(key) ?? null))
  }, [key])

  // Stale-while-revalidate: the cached list (if any) is already on screen; fetch
  // in the background and reconcile so membership and other-device edits catch up.
  useEffect(() => {
    let cancelled = false
    setFailed(false)
    setSelected(new Set())
    listNotes(listTab, archived)
      .then((list) => {
        if (!cancelled) setCachedBoard(key, list)
      })
      .catch(() => {
        // Only a first visit (nothing cached) surfaces the error; a stale-but-
        // present list keeps showing rather than blanking on a transient failure.
        if (!cancelled && getCachedBoard(key) === undefined) setFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [listTab, archived, key])

  // Merge URL params so switching a control keeps the others (and the omitted
  // default keeps the URL clean).
  const updateParams = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params)
    for (const [key, value] of Object.entries(changes)) {
      if (value === null) next.delete(key)
      else next.set(key, value)
    }
    setParams(next, { replace: false })
  }

  const switchTab = (next: BoardTab) => updateParams({ tab: next === 'mine' ? null : 'public' })
  const setSort = (next: SortKey) => updateParams({ sort: next === 'modified' ? null : next })
  const setDensity = (next: Density) => updateParams({ density: next === 'compact' ? null : next })

  const returnTo = `/${params.toString() === '' ? '' : `?${params.toString()}`}`
  // A freshly created note opens straight in the editor; it carries the board's
  // URL (return to the same tab / sort, E11-S1) and the note itself so the editor
  // paints without a fetch (E11 perf).
  const onCreated = (note: NoteOut) =>
    navigate(`/note/${note.id}`, { state: { from: returnTo, note } })

  // Pin / archive (E8) — optimistic: a (un)archived note leaves the current
  // view, a (un)pinned note re-sorts. On failure we resync from the server.
  const onOrganize = (target: NoteOut, patch: NotePatch) => {
    setOrganizeFailed(false)
    updateCachedBoard(key, (current) => {
      const leaves = patch.archived !== undefined // archive toggles cross views
      return leaves
        ? current.filter((n) => n.id !== target.id)
        : current.map((n) => (n.id === target.id ? { ...n, ...patch } : n))
    })
    patchNote(target.id, patch).catch(() => {
      setOrganizeFailed(true)
      void resync()
    })
  }

  const resync = () =>
    listNotes(listTab, archived)
      .then((list) => setCachedBoard(key, list))
      .catch(() => setFailed(true))

  // Hard delete (E11) — optimistic removal, resync on failure. Works for a
  // single card and for the archive bulk selection.
  const onDelete = (ids: string[]) => {
    if (ids.length === 0) return
    setOrganizeFailed(false)
    const removing = new Set(ids)
    updateCachedBoard(key, (current) => current.filter((n) => !removing.has(n.id)))
    setSelected((current) => {
      const next = new Set(current)
      for (const id of ids) next.delete(id)
      return next
    })
    Promise.allSettled(ids.map((id) => deleteNote(id))).then((results) => {
      if (results.some((r) => r.status === 'rejected')) {
        setOrganizeFailed(true)
        void resync()
      }
    })
  }

  // Fold the query once, not once per note per keystroke.
  const needle = fold(query.trim())
  const visible = useMemo(() => {
    if (notes === null) return null
    const filtered = notes.filter((note) => matches(note, needle))
    return sortNotes(filtered, sort)
  }, [notes, needle, sort])

  const total = visible?.length ?? 0
  const resetKey = `${listTab}|${archived}|${sort}|${needle}`
  const { count, sentinelRef } = useRenderWindow(resetKey, total)
  const windowed = visible?.slice(0, count)

  const canOrganize = (note: NoteOut) => user !== null && note.owner_id === user.id

  // --- archive multi-select (E11-S2) ---
  const selectedCount = visible?.filter((n) => selected.has(n.id)).length ?? 0
  const allSelected = total > 0 && selectedCount === total
  const toggleSelect = (id: string) =>
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  const toggleSelectAll = () =>
    setSelected(allSelected ? new Set() : new Set(visible?.map((n) => n.id)))

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
              ref={searchRef}
              type="search"
              className="kp-search__input"
              placeholder={BOARD_COPY.searchPlaceholder}
              aria-label={BOARD_COPY.searchPlaceholder}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {query !== '' && (
              <button
                type="button"
                className="kp-search__clear"
                aria-label={BOARD_COPY.searchClear}
                onClick={() => {
                  setQuery('')
                  searchRef.current?.focus()
                }}
              >
                <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
                  <path
                    d="M3.5 3.5l7 7M10.5 3.5l-7 7"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            )}
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

        {/* Board toolbar: bulk actions (archive) + sort. */}
        <div className="kp-board__toolbar">
          <div className="kp-board__toolbar-left">
            {archived && (
              <>
                <button
                  type="button"
                  className="kp-board__selectall"
                  onClick={toggleSelectAll}
                  disabled={total === 0}
                >
                  {allSelected ? BOARD_COPY.deselectAll : BOARD_COPY.selectAll}
                </button>
                {selectedCount > 0 && (
                  <button
                    type="button"
                    className="kp-board__bulk-delete"
                    onClick={() => setConfirmingBulk(true)}
                  >
                    {BOARD_COPY.deleteSelected(selectedCount)}
                  </button>
                )}
              </>
            )}
          </div>
          <div className="kp-board__toolbar-right">
            <DensitySelect value={density} onChange={setDensity} />
            <SortSelect value={sort} onChange={setSort} />
          </div>
        </div>

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

        {windowed && windowed.length > 0 && (
          <NoteGrid>
            {windowed.map((note) => (
              <NoteCard
                key={note.id}
                note={note}
                showAuthor={!archived && tab === 'public'}
                compact={density === 'compact'}
                canOrganize={canOrganize(note)}
                archivedView={archived}
                selectable={archived}
                selected={selected.has(note.id)}
                onToggleSelect={() => toggleSelect(note.id)}
                onOrganize={(patch) => onOrganize(note, patch)}
                onDelete={() => onDelete([note.id])}
              />
            ))}
          </NoteGrid>
        )}

        {/* Reveal the next page when this sentinel scrolls into view (E11-S5). */}
        {windowed && count < total && (
          <div ref={sentinelRef} className="kp-grid__sentinel" aria-hidden="true" />
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

      {confirmingBulk && (
        <ConfirmDialog
          title={BOARD_COPY.bulkDeleteConfirmTitle(selectedCount)}
          text={BOARD_COPY.bulkDeleteConfirmText}
          confirmLabel={COMMON_COPY.delete}
          danger
          onConfirm={() => {
            setConfirmingBulk(false)
            onDelete(visible?.filter((n) => selected.has(n.id)).map((n) => n.id) ?? [])
          }}
          onCancel={() => setConfirmingBulk(false)}
        />
      )}
    </div>
  )
}
