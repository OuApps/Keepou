import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import type { NoteColor, NoteOut } from '../api/notes'
import { getNote } from '../api/notes'
import { listVersions, restoreVersion, type VersionOut } from '../api/versions'
import { HistoryPanel } from '../components/history/HistoryPanel'
import { RestoreConfirm } from '../components/history/RestoreConfirm'
import { VersionPreview } from '../components/history/VersionPreview'
import { VersionRow } from '../components/history/VersionRow'
import { useMediaQuery } from '../hooks/useMediaQuery'
import { parseApiDate, formatVersionWhen } from '../lib/time'

/**
 * History (E6-S4/S5) — `/note/:id/history`. One editing session = one version;
 * selecting a version re-renders it read-only (no diff), and restore appends a
 * new version (nothing overwritten). Desktop = editor preview + side panel;
 * mobile = 2-screen flow (list → read-only preview → Fermer / Restaurer).
 */

const SHADE_CLASS: Record<NoteColor, string> = {
  GOLD: 'kp-hist--gold',
  AVOCAT: 'kp-hist--avocat',
  SALSA: 'kp-hist--salsa',
  CLAY: 'kp-hist--clay',
  TEAL: 'kp-hist--teal',
}

function BackArrow() {
  return (
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
  )
}

export default function HistoryPage() {
  const { id } = useParams()
  const noteId = id!
  const navigate = useNavigate()
  const isMobile = useMediaQuery('(max-width: 640px)')

  const [note, setNote] = useState<NoteOut | null>(null)
  const [versions, setVersions] = useState<VersionOut[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  // Mobile only: the list is screen 1, a selected version opens screen 2.
  const [mobileOpen, setMobileOpen] = useState(false)
  const [pendingRestore, setPendingRestore] = useState<VersionOut | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const [freshNote, freshVersions] = await Promise.all([getNote(noteId), listVersions(noteId)])
    setNote(freshNote)
    setVersions(freshVersions)
    setSelectedId(freshVersions[0]?.id ?? null)
  }, [noteId])

  useEffect(() => {
    load().catch(() => setFailed(true))
  }, [load])

  const backToEditor = () => navigate(`/note/${noteId}`)

  const selectDesktop = (versionId: string) => setSelectedId(versionId)
  const openMobile = (versionId: string) => {
    setSelectedId(versionId)
    setMobileOpen(true)
  }

  const confirmRestore = async () => {
    if (pendingRestore === null) return
    setBusy(true)
    try {
      await restoreVersion(noteId, pendingRestore.id)
      const fresh = await listVersions(noteId)
      setVersions(fresh)
      setSelectedId(fresh[0]?.id ?? null)
      setPendingRestore(null)
      setMobileOpen(false)
    } finally {
      setBusy(false)
    }
  }

  if (failed) {
    return (
      <div className="kp-center">
        <p className="kp-muted">Historique indisponible.</p>
        <Link to="/" className="kp-link">
          Retour au board
        </Link>
      </div>
    )
  }

  if (note === null || versions === null) {
    return (
      <div className="kp-center">
        <p className="kp-muted">Chargement…</p>
      </div>
    )
  }

  const selected = versions.find((v) => v.id === selectedId) ?? null
  const isCurrent = selected !== null && selected.id === versions[0]?.id
  const oldest = versions[versions.length - 1]
  const sinceDate = oldest
    ? parseApiDate(oldest.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })
    : ''
  const subtitle =
    versions.length === 0
      ? 'Aucune version'
      : `${versions.length} version${versions.length > 1 ? 's' : ''} · depuis le ${sinceDate}`

  const previewMeta = (v: VersionOut) =>
    v.id === versions[0]?.id
      ? `Version actuelle · ${v.author_name} · ${formatVersionWhen(v.created_at)}`
      : `Version de ${v.author_name} · ${formatVersionWhen(v.created_at)}`

  const shade = SHADE_CLASS[note.color]

  // ---- Mobile: 2-screen flow (list → read-only preview) ----
  if (isMobile) {
    if (mobileOpen && selected !== null) {
      return (
        <div className={`kp-history-mobile ${shade}`}>
          <header className="kp-history-mobile__bar">
            <button
              type="button"
              className="kp-history-mobile__back"
              onClick={() => setMobileOpen(false)}
              aria-label="Retour à la liste"
            >
              <BackArrow />
            </button>
            <span className="kp-history-mobile__bar-title">Historique</span>
          </header>
          <div className="kp-history-mobile__banner" role="status">
            <svg width="15" height="15" viewBox="0 0 20 20" aria-hidden="true">
              <circle cx="10" cy="10" r="7.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
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
              Version de {selected.author_name} · {formatVersionWhen(selected.created_at)}
            </span>
          </div>
          <div className="kp-history-mobile__content">
            <VersionPreview version={selected} />
          </div>
          <div className="kp-history-mobile__actions">
            <button
              type="button"
              className="kp-history-mobile__close"
              onClick={() => setMobileOpen(false)}
            >
              Fermer
            </button>
            <button
              type="button"
              className="kp-history-mobile__restore"
              onClick={() => setPendingRestore(selected)}
            >
              Restaurer cette version
            </button>
          </div>
          {pendingRestore !== null && (
            <RestoreConfirm
              version={pendingRestore}
              busy={busy}
              onCancel={() => setPendingRestore(null)}
              onConfirm={confirmRestore}
            />
          )}
        </div>
      )
    }

    return (
      <div className="kp-history-mobile">
        <header className="kp-history-mobile__bar">
          <button
            type="button"
            className="kp-history-mobile__back"
            onClick={backToEditor}
            aria-label="Retour à l'éditeur"
          >
            <BackArrow />
          </button>
          <div>
            <div className="kp-history-mobile__bar-title">Historique</div>
            <div className="kp-history-mobile__bar-sub">
              {note.title || 'Note sans titre'} · {subtitle}
            </div>
          </div>
        </header>
        {versions.length === 0 ? (
          <p className="kp-history__empty">Aucune version pour le moment.</p>
        ) : (
          <div className="kp-history-mobile__list">
            {versions.map((version, i) => (
              <VersionRow
                key={version.id}
                version={version}
                variant="mobile"
                current={i === 0}
                first={i === versions.length - 1}
                selected={version.id === selectedId}
                onSelect={() => openMobile(version.id)}
              />
            ))}
          </div>
        )}
      </div>
    )
  }

  // ---- Desktop: preview pane + side panel ----
  return (
    <div className="kp-history-overlay">
      <section className="kp-history" role="dialog" aria-label="Historique de la note">
        <div className={`kp-history__stage ${shade}`}>
          <header className="kp-history__stage-bar">
            <button
              type="button"
              className="kp-history__return"
              onClick={backToEditor}
              aria-label="Retour à l'édition"
            >
              <BackArrow />
              <span>Retour à l'édition</span>
            </button>
            {selected !== null && (
              <span className="kp-history__viewing">
                {isCurrent
                  ? 'Version actuelle'
                  : `Aperçu — ${formatVersionWhen(selected.created_at)}`}
              </span>
            )}
          </header>
          <div className="kp-history__stage-body">
            {selected !== null ? (
              <>
                <p className="kp-history__meta">{previewMeta(selected)}</p>
                <VersionPreview version={selected} />
              </>
            ) : (
              <p className="kp-history__empty">Aucune version pour le moment.</p>
            )}
          </div>
        </div>
        <HistoryPanel
          versions={versions}
          subtitle={subtitle}
          selectedId={selectedId}
          onSelect={selectDesktop}
          onRestore={(v) => setPendingRestore(v)}
          onClose={backToEditor}
        />
      </section>
      {pendingRestore !== null && (
        <RestoreConfirm
          version={pendingRestore}
          busy={busy}
          onCancel={() => setPendingRestore(null)}
          onConfirm={confirmRestore}
        />
      )}
    </div>
  )
}
