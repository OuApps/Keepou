import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { lockConflictOf } from '../api/locks'
import { getNote, type NoteColor, type NoteOut } from '../api/notes'
import { listVersions, restoreVersion, type NoteVersionOut } from '../api/versions'
import { HistoryPanel } from '../components/history/HistoryPanel'
import { RestoreConfirm } from '../components/history/RestoreConfirm'
import { VersionPreview } from '../components/history/VersionPreview'
import { useI18n } from '../i18n'
import { formatVersionMoment, formatVersionWhen } from '../lib/time'

/**
 * `/note/:id/history` (E6) — desktop: side panel next to the read-only
 * preview; mobile: 2-screen flow (list → preview with the gold « Aperçu —
 * lecture seule » banner and the Fermer / Restaurer bar). Frozen decisions
 * from HANDOFF §2; visual source of truth `Keepou - Historique.dc.html`.
 * A version is re-rendered as-is — no visual diff (claude.md §3).
 */

const SHADE_CLASS: Record<NoteColor, string> = {
  GOLD: 'kp-history__stage--gold',
  AVOCAT: 'kp-history__stage--avocat',
  SALSA: 'kp-history__stage--salsa',
  CLAY: 'kp-history__stage--clay',
  TEAL: 'kp-history__stage--teal',
}

export default function HistoryPage() {
  const { COMMON_COPY, HISTORY_COPY } = useI18n()
  const { id } = useParams()
  const noteId = id!
  const navigate = useNavigate()
  const location = useLocation()
  // Carry the board return path back through the editor (E11-S1).
  const editorState = { from: (location.state as { from?: string } | null)?.from ?? '/' }
  const [note, setNote] = useState<NoteOut | null>(null)
  const [versions, setVersions] = useState<NoteVersionOut[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  // Mobile screen 2 — desktop ignores it (both panes always visible).
  const [previewOpen, setPreviewOpen] = useState(false)
  const [confirming, setConfirming] = useState<NoteVersionOut | null>(null)
  const [restoring, setRestoring] = useState(false)
  const [restoreError, setRestoreError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    Promise.all([getNote(noteId), listVersions(noteId)])
      .then(([loadedNote, loadedVersions]) => {
        if (cancelled) return
        setNote(loadedNote)
        setVersions(loadedVersions)
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [noteId])

  const backToEditor = () => navigate(`/note/${noteId}`, { state: editorState })

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') navigate(`/note/${noteId}`, { state: editorState })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // editorState is derived from location.state (stable across renders here).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate, noteId])

  if (failed) {
    return (
      <div className="kp-editor-overlay">
        <div className="kp-editor__fallback">
          <p className="kp-muted">{HISTORY_COPY.noteNotFound}</p>
          <Link to="/" className="kp-link">
            {COMMON_COPY.backToBoard}
          </Link>
        </div>
      </div>
    )
  }

  if (note === null || versions === null) {
    return (
      <div className="kp-editor-overlay">
        <div className="kp-editor__fallback">
          <p className="kp-muted">{COMMON_COPY.loading}</p>
        </div>
      </div>
    )
  }

  // Default selection = the newest version (« actuelle »).
  const selected = versions.find((v) => v.id === selectedId) ?? versions[0] ?? null
  const isCurrent = selected !== null && selected.id === versions[0]?.id

  const askRestore = (version: NoteVersionOut) => {
    setRestoreError(null)
    setConfirming(version)
  }

  const doRestore = async () => {
    if (confirming === null) return
    setRestoring(true)
    setRestoreError(null)
    try {
      await restoreVersion(noteId, confirming.id)
      // Back to the editor: it reloads the note and shows the restored content.
      navigate(`/note/${noteId}`, { state: editorState })
    } catch (error) {
      const conflict = lockConflictOf(error)
      setRestoreError(
        conflict?.locked_by
          ? HISTORY_COPY.restoreLocked(conflict.locked_by.display_name)
          : HISTORY_COPY.restoreFailed,
      )
      setRestoring(false)
    }
  }

  return (
    <div className="kp-editor-overlay" onClick={backToEditor}>
      <section
        className={`kp-history${previewOpen ? ' kp-history--preview' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={HISTORY_COPY.dialogLabel}
        onClick={(e) => e.stopPropagation()}
      >
        {selected !== null && (
          <div className={`kp-history__stage ${SHADE_CLASS[selected.color]}`}>
            <header className="kp-history__stage-bar">
              <button
                type="button"
                className="kp-history__stage-back kp-history__stage-back--desktop"
                onClick={backToEditor}
              >
                <span className="kp-history__stage-back-icon" aria-hidden="true">
                  <svg width="16" height="16" viewBox="0 0 20 20">
                    <path
                      d="M12.5 4 L6 10.5 L12.5 17"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
                {HISTORY_COPY.backToEditing}
              </button>
              <button
                type="button"
                className="kp-history__stage-back kp-history__stage-back--mobile"
                onClick={() => setPreviewOpen(false)}
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
                {HISTORY_COPY.panelTitle}
              </button>
              <span className="kp-history__viewing">
                {isCurrent
                  ? HISTORY_COPY.currentVersion
                  : HISTORY_COPY.previewOf(formatVersionWhen(selected.created_at))}
              </span>
            </header>
            <div className="kp-history__banner" role="status">
              <svg width="15" height="15" viewBox="0 0 20 20" aria-hidden="true">
                <circle
                  cx="10"
                  cy="10"
                  r="7.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                />
                <path
                  d="M10 6.5 L10 10.5"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
                <circle cx="10" cy="13.6" r="1" fill="currentColor" />
              </svg>
              <span>
                <b>{HISTORY_COPY.previewBanner}</b>
                <br />
                {HISTORY_COPY.versionOf(
                  selected.author_name,
                  formatVersionMoment(selected.created_at),
                )}
              </span>
            </div>
            <VersionPreview version={selected} isCurrent={isCurrent} />
            <div className="kp-history__actions">
              <button
                type="button"
                className="kp-history__close-btn"
                onClick={() => setPreviewOpen(false)}
              >
                {COMMON_COPY.close}
              </button>
              {!isCurrent && (
                <button
                  type="button"
                  className="kp-history__restore-btn"
                  onClick={() => askRestore(selected)}
                >
                  {HISTORY_COPY.restoreThis}
                </button>
              )}
            </div>
          </div>
        )}

        <HistoryPanel
          note={note}
          versions={versions}
          selectedId={selected?.id ?? null}
          onSelect={(version) => {
            setSelectedId(version.id)
            setPreviewOpen(true)
          }}
          onRestore={askRestore}
          onClose={backToEditor}
        />

        {versions.length === 0 && (
          <div className="kp-history__empty">
            <p className="kp-muted">{HISTORY_COPY.empty}</p>
          </div>
        )}

        {confirming !== null && (
          <RestoreConfirm
            version={confirming}
            busy={restoring}
            error={restoreError}
            onCancel={() => setConfirming(null)}
            onConfirm={() => void doRestore()}
          />
        )}
      </section>
    </div>
  )
}
