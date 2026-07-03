import type { VersionOut } from '../../api/versions'
import { VersionRow } from './VersionRow'

/**
 * Desktop history side panel (E6-S4) — opens to the right of the editor
 * preview: header + the newest-first list of versions (`Keepou - Historique`).
 */
export function HistoryPanel({
  versions,
  subtitle,
  selectedId,
  onSelect,
  onRestore,
  onClose,
}: {
  versions: VersionOut[]
  subtitle: string
  selectedId: string | null
  onSelect: (id: string) => void
  onRestore: (version: VersionOut) => void
  onClose: () => void
}) {
  return (
    <aside className="kp-history__panel">
      <header className="kp-history__panel-head">
        <div className="kp-history__panel-top">
          <span className="kp-history__panel-title">Historique</span>
          <button
            type="button"
            className="kp-history__close"
            onClick={onClose}
            aria-label="Fermer l'historique"
          >
            ×
          </button>
        </div>
        <span className="kp-history__panel-sub">{subtitle}</span>
      </header>
      <div className="kp-history__list">
        {versions.map((version, i) => (
          <VersionRow
            key={version.id}
            version={version}
            variant="desktop"
            current={i === 0}
            first={i === versions.length - 1}
            selected={version.id === selectedId}
            onSelect={() => onSelect(version.id)}
            onRestore={() => onRestore(version)}
          />
        ))}
      </div>
    </aside>
  )
}
