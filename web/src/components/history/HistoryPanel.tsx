import type { NoteOut } from '../../api/notes'
import type { NoteVersionOut } from '../../api/versions'
import { EDITOR_COPY, HISTORY_COPY } from '../../lib/copy'
import { formatDayMonth } from '../../lib/time'
import { VersionRow } from './VersionRow'

/**
 * The history list (E6): desktop side panel (« Historique » header, « N
 * versions · depuis le … » subtitle, timeline rows) — on mobile it is the
 * flow's first screen (chevron back to the editor, tappable rows).
 */
export function HistoryPanel({
  note,
  versions,
  selectedId,
  onSelect,
  onRestore,
  onClose,
}: {
  note: NoteOut
  versions: NoteVersionOut[]
  selectedId: string | null
  onSelect: (version: NoteVersionOut) => void
  onRestore: (version: NoteVersionOut) => void
  onClose: () => void
}) {
  const oldest = versions[versions.length - 1]
  return (
    <aside className="kp-history__panel" aria-label={HISTORY_COPY.dialogLabel}>
      <header className="kp-history__panel-head">
        <div className="kp-history__panel-top">
          <button
            type="button"
            className="kp-history__panel-back"
            onClick={onClose}
            aria-label={HISTORY_COPY.backToEditor}
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
          <h2 className="kp-history__panel-title">{HISTORY_COPY.panelTitle}</h2>
          <button
            type="button"
            className="kp-history__panel-close"
            onClick={onClose}
            aria-label={HISTORY_COPY.closePanel}
          >
            ×
          </button>
        </div>
        <p className="kp-history__panel-sub">
          <span className="kp-history__panel-sub--desktop">
            {HISTORY_COPY.versionCount(versions.length)}
            {oldest !== undefined && HISTORY_COPY.since(formatDayMonth(oldest.created_at))}
          </span>
          <span className="kp-history__panel-sub--mobile">
            {note.title || EDITOR_COPY.untitled} · {HISTORY_COPY.versionCount(versions.length)}
          </span>
        </p>
      </header>
      <ul className="kp-history__rows">
        {versions.map((version, i) => (
          <VersionRow
            key={version.id}
            version={version}
            isCurrent={i === 0}
            isCreation={version.created_at === note.created_at}
            selected={version.id === selectedId}
            isLast={i === versions.length - 1}
            onSelect={() => onSelect(version)}
            onRestore={() => onRestore(version)}
          />
        ))}
      </ul>
    </aside>
  )
}
