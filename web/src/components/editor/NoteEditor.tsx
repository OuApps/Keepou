import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { lockConflictOf, releaseLock } from '../../api/locks'
import { getNote, patchNote, type NoteColor, type NoteOut, type Visibility } from '../../api/notes'
import { endPrivateSession } from '../../api/versions'
import { useAuth } from '../../auth/AuthContext'
import { useAutosave } from '../../hooks/useAutosave'
import { useNoteLock, type LockStatus } from '../../hooks/useNoteLock'
import { parse, serialize } from '../../lib/markdown'
import { formatRelative } from '../../lib/time'
import { BlockList } from './BlockList'
import { blockId, withIds, type EditorBlock } from './blocks'
import { ColorPicker } from './ColorPicker'
import {
  LockBanner,
  LockConflictPanel,
  LockLiveDot,
  LockReadOnlyNote,
  LockTakeoverBar,
} from './LockBanner'
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
  const navigate = useNavigate()
  const { user } = useAuth()
  const [note, setNote] = useState<NoteOut | null>(null)
  const [failed, setFailed] = useState(false)
  const [draft, setDraft] = useState<Draft | null>(null)
  // "Last saved version" (HANDOFF §3.2) — moves only on a successful persist,
  // independently of the session state rendered by <SaveStatus>.
  const [lastSaved, setLastSaved] = useState<{ by: string; at: string } | null>(null)

  // The autosave callback reads through refs so a debounced/flushed save
  // always persists the latest keystrokes, never a stale closure.
  const draftRef = useRef<Draft | null>(null)
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
  }, [])

  const afterSave = (updated: NoteOut) => {
    // Server-confirmed state (visibility drives the lock lifecycle) — the
    // draft keeps the local keystrokes.
    setNote(updated)
    setLastSaved({ by: user?.display_name ?? updated.author_name, at: updated.updated_at })
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

  useEffect(() => {
    let cancelled = false
    getNote(noteId)
      .then((loaded) => {
        if (!cancelled) applyServer(loaded)
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [noteId, applyServer])

  const edit = (patch: Partial<Draft>, immediate = false) => {
    if (draftRef.current === null || !editableRef.current) return
    const next = { ...draftRef.current, ...patch }
    draftRef.current = next
    setDraft(next)
    queue()
    if (immediate) void flush()
  }

  // Leaving the editor ends the session. The pending edit is flushed *before*
  // leaving so the unmount lock release never overtakes the last save (which
  // would 409). A PUBLIC note versions on that lock release (E6); a PRIVATE note
  // has no lock, so we signal its session end here so the server can snapshot.
  const leave = async (to: string) => {
    await flush()
    // End the session *before* leaving so the version exists when we land (e.g.
    // on the history). A PRIVATE note has no lock → signal its close; a PUBLIC
    // note we hold → release now (the unmount release then no-ops, no double
    // version). Read-only viewers hold nothing and skip both.
    if (note?.visibility === 'PRIVATE') {
      await endPrivateSession(noteId).catch(() => {})
    } else if (lockStatusRef.current === 'mine') {
      await releaseLock(noteId).catch(() => {})
    }
    navigate(to)
  }
  const close = () => leave('/')
  const closeRef = useRef(close)
  closeRef.current = close

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') void closeRef.current()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (failed) {
    return (
      <div className="kp-editor-overlay">
        <div className="kp-editor__fallback">
          <p className="kp-muted">Note introuvable.</p>
          <Link to="/" className="kp-link">
            Retour au board
          </Link>
        </div>
      </div>
    )
  }

  if (note === null || draft === null || lastSaved === null) {
    return (
      <div className="kp-editor-overlay">
        <div className="kp-editor__fallback">
          <p className="kp-muted">Chargement…</p>
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
        aria-label={draft.title || 'Note sans titre'}
        onClick={(e) => e.stopPropagation()}
      >
        <header className={`kp-editor__bar${barModifier}`}>
          <button
            type="button"
            className="kp-editor__back"
            onClick={() => void close()}
            aria-label="Retour au board"
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
          <button type="button" className="kp-editor__ok" onClick={() => void close()}>
            OK
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
              placeholder={readOnly ? undefined : 'Titre'}
              aria-label="Titre de la note"
              maxLength={200}
              disabled={readOnly}
              onChange={(e) => edit({ title: e.target.value })}
              onBlur={() => void flush()}
            />
            <p className="kp-editor__sub">
              {readOnly ? (
                <>
                  Dernière édition par <b>{lastSaved.by}</b> · {formatRelative(lastSaved.at)}
                </>
              ) : (
                <>
                  Dernière version enregistrée par <b>{lastSaved.by}</b> ·{' '}
                  {formatRelative(lastSaved.at)}
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
            <span className="kp-editor__sep" aria-hidden="true" />
            <button
              type="button"
              className="kp-editor__history"
              onClick={() => void leave(`/note/${noteId}/history`)}
              aria-label="Historique des versions"
            >
              <svg width="16" height="16" viewBox="0 0 20 20" aria-hidden="true">
                <path
                  d="M10 5.5 L10 10 L13 12"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M3.5 8 A6.7 6.7 0 1 1 4 12.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M3.4 5 L3.4 8 L6.4 8"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <span>Historique</span>
            </button>
          </div>
          <button type="button" className="kp-editor__done" onClick={() => void close()}>
            Terminé
          </button>
        </footer>
      </section>
    </div>
  )
}
