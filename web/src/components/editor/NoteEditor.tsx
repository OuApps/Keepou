import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { lockConflictOf } from '../../api/locks'
import {
  deleteNote,
  getNote,
  patchNote,
  type NoteColor,
  type NoteOut,
  type Visibility,
} from '../../api/notes'
import { useAuth } from '../../auth/AuthContext'
import { removeCachedNote, upsertCachedNote } from '../../lib/boardCache'
import { useAutosave } from '../../hooks/useAutosave'
import { useNoteLock, type LockStatus } from '../../hooks/useNoteLock'
import { parse, serialize } from '../../lib/markdown'
import { formatRelative } from '../../lib/time'
import { BlockList } from './BlockList'
import { blockId, withIds, type EditorBlock } from './blocks'
import { ColorPicker } from './ColorPicker'
import { ConfirmDialog } from '../ConfirmDialog'
import {
  LockBanner,
  LockConflictPanel,
  LockLiveDot,
  LockReadOnlyNote,
  LockTakeoverBar,
} from './LockBanner'
import { useI18n } from '../../i18n'
import { SaveStatus } from './SaveStatus'
import { VisibilityToggle } from './VisibilityToggle'

/**
 * The canonical editor (E4-S3): desktop modal / mobile full screen — the
 * frozen format from `Keepou - Éditeur canonique.dc.html` (HANDOFF §2).
 * Title + block flow + color + visibility, autosaved (~1.5 s debounce,
 * immediate flush on blur/close).
 *
 * E5 adds the single-editor lock on public notes: the top strip becomes the
 * LockBanner (4 states), read-only mode disables every control, and the
 * short-poll refreshes the content in near real-time while someone else
 * edits. A version is born on session end in E6.
 */

/**
 * Put plain text on the clipboard; falls back to `execCommand` where the
 * Clipboard API is unavailable (a self-hosted deployment over plain HTTP).
 */
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    const area = document.createElement('textarea')
    area.value = text
    area.setAttribute('readonly', '')
    area.style.position = 'fixed'
    area.style.opacity = '0'
    document.body.appendChild(area)
    area.select()
    let done = false
    try {
      done = document.execCommand('copy')
    } catch {
      done = false
    }
    area.remove()
    return done
  }
}

const SHADE_CLASS: Record<NoteColor, string> = {
  GOLD: 'kp-editor--gold',
  AVOCAT: 'kp-editor--avocat',
  SALSA: 'kp-editor--salsa',
  CLAY: 'kp-editor--clay',
  TEAL: 'kp-editor--teal',
}

interface Draft {
  title: string
  blocks: EditorBlock[]
  color: NoteColor
  visibility: Visibility
}

function draftOf(note: NoteOut): Draft {
  const parsed = withIds(parse(note.body))
  return {
    title: note.title,
    // An empty note still shows a paragraph to type into.
    blocks: parsed.length > 0 ? parsed : [{ id: blockId(), type: 'text', text: '' }],
    color: note.color,
    visibility: note.visibility,
  }
}

export function NoteEditor({ noteId }: { noteId: string }) {
  const { BOARD_COPY, COMMON_COPY, EDITOR_COPY } = useI18n()
  const navigate = useNavigate()
  const location = useLocation()
  const navState = location.state as { from?: string; note?: NoteOut } | null
  // Where « back » goes (E11-S1): the board URL the note was opened from — same
  // tab / sort — falling back to the board root on a deep link.
  const returnTo = navState?.from ?? '/'
  // The board already holds the full note (body included); opening a card passes
  // it along so the editor paints immediately instead of blocking on getNote
  // behind a « Chargement… » (E11 perf). A deep link has no seed and still loads.
  const seeded = navState?.note ?? null
  const { user } = useAuth()
  const [note, setNote] = useState<NoteOut | null>(seeded)
  const [failed, setFailed] = useState(false)
  const [draft, setDraft] = useState<Draft | null>(() => (seeded ? draftOf(seeded) : null))
  // Owner actions menu (E11-S3): pin / archive / hard delete.
  const [menuOpen, setMenuOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  // Whole-note copy (E11-S7): the block flow is separate form fields, so a
  // selection can never span the note — one click copies title + text instead.
  const [copied, setCopied] = useState(false)
  const copiedTimer = useRef<number | null>(null)
  // "Last saved version" (HANDOFF §3.2) — moves only on a successful persist,
  // independently of the session state rendered by <SaveStatus>.
  const [lastSaved, setLastSaved] = useState<{ by: string; at: string } | null>(() =>
    seeded ? { by: seeded.author_name, at: seeded.updated_at } : null,
  )

  // The autosave callback reads through refs so a debounced/flushed save
  // always persists the latest keystrokes, never a stale closure.
  const draftRef = useRef<Draft | null>(draft)
  // A seed is already on screen; the mount revalidation must not overwrite it
  // once the user has started typing (`touchedRef`), and a transient fetch
  // failure on a seeded open is tolerated rather than surfaced (`seededRef`).
  const touchedRef = useRef(false)
  const seededRef = useRef(seeded !== null)
  const isOwner = note !== null && user !== null && note.owner_id === user.id
  const isOwnerRef = useRef(isOwner)
  isOwnerRef.current = isOwner

  // Lock plumbing: the hook is created below (it needs `note`), while the
  // autosave callback and the refresh callback need it — refs bridge the gap.
  const lockRef = useRef<ReturnType<typeof useNoteLock> | null>(null)
  const lockStatusRef = useRef<LockStatus>('pending')

  const applyServer = useCallback((fresh: NoteOut) => {
    setNote(fresh)
    const next = draftOf(fresh)
    draftRef.current = next
    setDraft(next)
    setLastSaved({ by: fresh.author_name, at: fresh.updated_at })
    // Keep the board cache fresh so a return doesn't need to refetch (E11 perf).
    upsertCachedNote(fresh)
  }, [])

  const afterSave = (updated: NoteOut) => {
    // Server-confirmed state (visibility drives the lock lifecycle) — the
    // draft keeps the local keystrokes.
    setNote(updated)
    setLastSaved({ by: user?.display_name ?? updated.author_name, at: updated.updated_at })
    // The board reflects this edit optimistically on return, no refetch needed.
    upsertCachedNote(updated)
  }

  const editableRef = useRef(false)

  const { state, queue, flush } = useAutosave(async () => {
    const current = draftRef.current
    if (current === null || !editableRef.current) return true
    const payload = {
      title: current.title,
      body: serialize(current.blocks),
      color: current.color,
      // Only the owner may flip visibility (FR-N5) — a member editing a
      // shared note must not even echo it, in case the owner just changed it.
      ...(isOwnerRef.current ? { visibility: current.visibility } : {}),
    }
    try {
      afterSave(await patchNote(noteId, payload))
      return true
    } catch (error) {
      const conflict = lockConflictOf(error)
      if (conflict === null) return false // transient: useAutosave re-arms
      if (conflict.code === 'lock_required' && lockRef.current !== null) {
        // Our lock silently went stale (laptop asleep…) but nobody took it:
        // one re-acquire + retry. Losing that race is the conflict state.
        if (await lockRef.current.tryAcquire('conflict')) {
          try {
            const latest = draftRef.current ?? current
            afterSave(
              await patchNote(noteId, {
                ...payload,
                title: latest.title,
                body: serialize(latest.blocks),
                color: latest.color,
              }),
            )
            return true
          } catch (retryError) {
            const again = lockConflictOf(retryError)
            if (again === null) return false
            lockRef.current.notifyConflict(again.locked_by?.display_name ?? null)
          }
        }
        return true
      }
      // Someone else holds the lock: server-decided conflict — we inform that
      // the latest edits could not be saved (HANDOFF §3.1), never a hard error.
      lockRef.current?.notifyConflict(conflict.locked_by?.display_name ?? null)
      return true
    }
  })

  const lock = useNoteLock({
    noteId,
    note,
    myId: user?.id,
    onRefresh: (fresh) => {
      // Fresh server data (short-poll or acquisition). Never clobber the local
      // draft while we are the editor — the save-retry path lands here too.
      if (lockStatusRef.current !== 'mine') applyServer(fresh)
    },
  })
  lockRef.current = lock
  lockStatusRef.current = lock.status

  const editable = lock.status === 'none' || lock.status === 'mine'
  editableRef.current = editable
  const readOnly = !editable

  // Load (deep link) or silently revalidate (seeded open) the note on mount.
  // With a seed the content is already painted, so this refresh never blocks and
  // never clobbers edits in progress, and a transient failure is swallowed.
  useEffect(() => {
    let cancelled = false
    getNote(noteId)
      .then((loaded) => {
        if (cancelled) return
        if (!touchedRef.current && lockStatusRef.current !== 'mine') applyServer(loaded)
      })
      .catch(() => {
        if (!cancelled && !seededRef.current) setFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [noteId, applyServer])

  const edit = (patch: Partial<Draft>, immediate = false) => {
    if (draftRef.current === null || !editableRef.current) return
    touchedRef.current = true
    const next = { ...draftRef.current, ...patch }
    draftRef.current = next
    setDraft(next)
    queue()
    if (immediate) void flush()
  }

  // Close = back to the board (the tab/filter/sort it was opened from, E11-S1).
  // The pending edit is flushed *before* leaving so the unmount lock release
  // never overtakes the last save (which would 409).
  const close = async () => {
    await flush()
    navigate(returnTo)
  }

  // « Historique » (E6): same flush-first discipline; the unmount then ends
  // the editing session (lock release / close signal), so the history the
  // user lands on already contains this session's version. Carry `from` so
  // the whole board → editor → history → editor chain keeps its place.
  const openHistory = async () => {
    await flush()
    navigate(`/note/${noteId}/history`, { state: { from: returnTo } })
  }
  const closeRef = useRef(close)
  closeRef.current = close

  // Owner board actions from inside the editor (E11-S3): pin toggles in place;
  // archive and delete leave for the board. Lock-free owner metadata (E8) — the
  // server allows them even while another member edits a shared note.
  const togglePin = () => {
    setMenuOpen(false)
    if (note === null) return
    const pinned = !note.pinned
    const updated = { ...note, pinned }
    setNote(updated)
    upsertCachedNote(updated)
    patchNote(noteId, { pinned }).catch(() => {
      // Revert on failure (the board would show the truthful state on return).
      const reverted = { ...updated, pinned: !pinned }
      setNote(reverted)
      upsertCachedNote(reverted)
    })
  }

  const archiveNote = async () => {
    setMenuOpen(false)
    await flush()
    try {
      await patchNote(noteId, { archived: true })
      removeCachedNote(noteId) // leaves every board; the archived view refetches
      navigate(returnTo)
    } catch {
      // Stay in the editor; nothing was archived.
    }
  }

  // Copy the whole note (E11-S7): title + serialized text, from the current
  // draft (unsaved keystrokes included). Works in read-only too — copying a
  // note someone else is editing is precisely the frequent case.
  const copyAll = async () => {
    const current = draftRef.current
    if (current === null) return
    const body = serialize(current.blocks)
    const text = current.title.trim() === '' ? body : `${current.title}\n\n${body}`
    if (!(await copyText(text))) return
    setCopied(true)
    if (copiedTimer.current !== null) window.clearTimeout(copiedTimer.current)
    copiedTimer.current = window.setTimeout(() => setCopied(false), 2000)
  }

  useEffect(
    () => () => {
      if (copiedTimer.current !== null) window.clearTimeout(copiedTimer.current)
    },
    [],
  )

  const removeNote = async () => {
    setConfirmDelete(false)
    try {
      await deleteNote(noteId)
      removeCachedNote(noteId)
      navigate(returnTo)
    } catch {
      // Stay in the editor; nothing was deleted.
    }
  }

  // Escape closes an open overlay (owner menu / delete confirm) first, and only
  // then the editor. A ref keeps the window listener from re-subscribing.
  const overlayOpen = menuOpen || confirmDelete
  const overlayOpenRef = useRef(overlayOpen)
  overlayOpenRef.current = overlayOpen

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (overlayOpenRef.current) {
        setMenuOpen(false)
        setConfirmDelete(false)
        return
      }
      void closeRef.current()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Dismiss the owner menu on an outside click.
  useEffect(() => {
    if (!menuOpen) return
    const onPointerDown = (e: PointerEvent) => {
      if (menuRef.current !== null && !menuRef.current.contains(e.target as Node))
        setMenuOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [menuOpen])

  if (failed) {
    return (
      <div className="kp-editor-overlay">
        <div className="kp-editor__fallback">
          <p className="kp-muted">{EDITOR_COPY.notFound}</p>
          <Link to="/" className="kp-link">
            {COMMON_COPY.backToBoard}
          </Link>
        </div>
      </div>
    )
  }

  if (note === null || draft === null || lastSaved === null) {
    return (
      <div className="kp-editor-overlay">
        <div className="kp-editor__fallback">
          <p className="kp-muted">{COMMON_COPY.loading}</p>
        </div>
      </div>
    )
  }

  const barModifier =
    lock.status === 'mine' ||
    lock.status === 'locked' ||
    lock.status === 'available' ||
    lock.status === 'conflict'
      ? ` kp-editor__bar--${lock.status}`
      : ''

  return (
    <div className="kp-editor-overlay" onClick={() => void close()}>
      <section
        className={`kp-editor ${SHADE_CLASS[draft.color]}`}
        role="dialog"
        aria-modal="true"
        aria-label={draft.title || EDITOR_COPY.untitled}
        onClick={(e) => e.stopPropagation()}
        // Maj+Entrée saves & closes (E11-S3). Capture phase + preventDefault so
        // it never lands as a newline in a paragraph or checkbox line; plain
        // Enter (handled below) keeps its paragraph / checklist behavior.
        onKeyDownCapture={(e) => {
          if (e.key === 'Enter' && e.shiftKey) {
            e.preventDefault()
            void close()
          }
        }}
      >
        <header className={`kp-editor__bar${barModifier}`}>
          <button
            type="button"
            className="kp-editor__back"
            onClick={() => void close()}
            aria-label={COMMON_COPY.backToBoard}
          >
            <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden="true">
              <path
                d="M12.5 4 L6 10.5 L12.5 17"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          <LockBanner status={lock.status} holder={lock.holder} />
          {editable || lock.status === 'pending' ? (
            <SaveStatus state={state} savedAt={lastSaved.at} />
          ) : lock.status === 'locked' ? (
            <LockLiveDot />
          ) : null}
          <button
            type="button"
            className={`kp-editor__copy${copied ? ' kp-editor__copy--done' : ''}`}
            onClick={() => void copyAll()}
            aria-label={copied ? EDITOR_COPY.copyNoteDone : EDITOR_COPY.copyNote}
            title={copied ? EDITOR_COPY.copyNoteDone : EDITOR_COPY.copyNote}
          >
            {copied ? (
              <svg width="16" height="16" viewBox="0 0 20 20" aria-hidden="true">
                <path
                  d="M4.5 10.5 L8.5 14.5 L15.5 6"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 20 20" aria-hidden="true">
                <rect
                  x="7"
                  y="7"
                  width="9.5"
                  height="9.5"
                  rx="2"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                />
                <path
                  d="M13 5v-.5A1.5 1.5 0 0 0 11.5 3H5a2 2 0 0 0-2 2v6.5A1.5 1.5 0 0 0 4.5 13H5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                />
              </svg>
            )}
          </button>
          {isOwner && (
            <div className="kp-editor__more-wrap" ref={menuRef}>
              <button
                type="button"
                className="kp-editor__more"
                onClick={() => setMenuOpen((open) => !open)}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                aria-label={EDITOR_COPY.moreActions}
              >
                ⋯
              </button>
              {menuOpen && (
                <div className="kp-menu kp-editor__menu" role="menu">
                  <button
                    type="button"
                    className="kp-menu__item"
                    role="menuitem"
                    onClick={togglePin}
                  >
                    {note.pinned ? BOARD_COPY.unpin : BOARD_COPY.pin}
                  </button>
                  <button
                    type="button"
                    className="kp-menu__item"
                    role="menuitem"
                    onClick={() => void archiveNote()}
                  >
                    {BOARD_COPY.archive}
                  </button>
                  <button
                    type="button"
                    className="kp-menu__item kp-menu__item--danger"
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false)
                      setConfirmDelete(true)
                    }}
                  >
                    {BOARD_COPY.deleteAction}
                  </button>
                </div>
              )}
            </div>
          )}
          <button type="button" className="kp-editor__ok" onClick={() => void close()}>
            {EDITOR_COPY.ok}
          </button>
        </header>

        {lock.status === 'conflict' ? (
          <LockConflictPanel holder={lock.holder} onGoReadOnly={lock.goReadOnly} />
        ) : (
          <div className={`kp-editor__body${readOnly ? ' kp-editor__body--readonly' : ''}`}>
            <input
              className="kp-editor__title"
              type="text"
              value={draft.title}
              placeholder={readOnly ? undefined : EDITOR_COPY.titlePlaceholder}
              aria-label={EDITOR_COPY.titleLabel}
              maxLength={200}
              disabled={readOnly}
              onChange={(e) => edit({ title: e.target.value })}
              onBlur={() => void flush()}
            />
            <p className="kp-editor__sub">
              {readOnly ? (
                <>
                  {EDITOR_COPY.lastEditedBy} <b>{lastSaved.by}</b> · {formatRelative(lastSaved.at)}
                </>
              ) : (
                <>
                  {EDITOR_COPY.lastSavedBy} <b>{lastSaved.by}</b> · {formatRelative(lastSaved.at)}
                </>
              )}
            </p>
            <BlockList
              blocks={draft.blocks}
              onChange={(blocks) => edit({ blocks })}
              onFlush={() => void flush()}
              readOnly={readOnly}
            />
            {lock.status === 'locked' && <LockReadOnlyNote holder={lock.holder} />}
            {lock.status === 'available' && (
              <LockTakeoverBar onTakeover={() => void lock.tryAcquire()} />
            )}
          </div>
        )}

        <footer className="kp-editor__footer">
          <div className="kp-editor__tools">
            <ColorPicker
              value={draft.color}
              onChange={(color) => edit({ color }, true)}
              disabled={readOnly}
            />
            {isOwner && (
              <>
                <span className="kp-editor__sep" aria-hidden="true" />
                <VisibilityToggle
                  visibility={draft.visibility}
                  onChange={(visibility) => edit({ visibility }, true)}
                  disabled={readOnly}
                />
              </>
            )}
          </div>
          <div className="kp-editor__actions">
            <button type="button" className="kp-editor__history" onClick={() => void openHistory()}>
              {EDITOR_COPY.history}
            </button>
            <button type="button" className="kp-editor__done" onClick={() => void close()}>
              {EDITOR_COPY.done}
            </button>
          </div>
        </footer>

        {confirmDelete && (
          <ConfirmDialog
            title={BOARD_COPY.deleteConfirmTitle}
            text={BOARD_COPY.deleteConfirmText}
            confirmLabel={COMMON_COPY.delete}
            danger
            onConfirm={() => void removeNote()}
            onCancel={() => setConfirmDelete(false)}
          />
        )}
      </section>
    </div>
  )
}
