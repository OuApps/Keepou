import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { lockConflictOf } from '../api/locks'
import { getNote, type NoteColor, type NoteOut } from '../api/notes'
import { listVersions, restoreVersion, type NoteVersionOut } from '../api/versions'
import { HistoryPanel } from '../components/history/HistoryPanel'
import { RestoreConfirm } from '../components/history/RestoreConfirm'
import { VersionPreview } from '../components/history/VersionPreview'
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

const RESTORE_FAILED = 'La restauration a échoué. Réessaie.'

export default function HistoryPage() {
  const { id } = useParams()
  const noteId = id!
  const navigate = useNavigate()
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

  const backToEditor = () => navigate(`/note/${noteId}`)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') navigate(`/note/${noteId}`)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [navigate, noteId])

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

  if (note === null || versions === null) {
    return (
      <div className="kp-editor-overlay">
        <div className="kp-editor__fallback">
          <p className="kp-muted">Chargement…</p>
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
      navigate(`/note/${noteId}`)
    } catch (error) {
      const conflict = lockConflictOf(error)
      setRestoreError(
        conflict?.locked_by
          ? `${conflict.locked_by.display_name} est en cours d'édition — réessaie plus tard.`
          : RESTORE_FAILED,
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
        aria-label="Historique des versions"
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
                Retour à l'édition
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
                Historique
              </button>
              <span className="kp-history__viewing">
                {isCurrent
                  ? 'Version actuelle'
                  : `Aperçu — ${formatVersionWhen(selected.created_at)}`}
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
                <b>Aperçu — lecture seule</b>
                <br />
                Version de {selected.author_name} · {formatVersionMoment(selected.created_at)}
              </span>
            </div>
            <VersionPreview version={selected} isCurrent={isCurrent} />
            <div className="kp-history__actions">
              <button
                type="button"
                className="kp-history__close-btn"
                onClick={() => setPreviewOpen(false)}
              >
                Fermer
              </button>
              {!isCurrent && (
                <button
                  type="button"
                  className="kp-history__restore-btn"
                  onClick={() => askRestore(selected)}
                >
                  Restaurer cette version
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
            <p className="kp-muted">Aucune version enregistrée pour l'instant.</p>
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
