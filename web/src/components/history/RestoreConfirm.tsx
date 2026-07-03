import type { VersionOut } from '../../api/versions'
import { formatVersionWhen } from '../../lib/time'

/**
 * Restore confirmation (E6-S4), frozen copy from HANDOFF §7 "History":
 * « La version actuelle sera conservée dans l'historique — rien n'est perdu. »
 * Restoring appends a new version — nothing is overwritten (FR-H4).
 */
export function RestoreConfirm({
  version,
  busy,
  onCancel,
  onConfirm,
}: {
  version: VersionOut
  busy: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  const when = formatVersionWhen(version.created_at)

  return (
    <div className="kp-history__confirm-overlay" onClick={onCancel}>
      <div
        className="kp-history__confirm"
        role="dialog"
        aria-modal="true"
        aria-label="Confirmer la restauration"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="kp-history__confirm-icon" aria-hidden="true">
          <svg width="22" height="22" viewBox="0 0 24 24">
            <path
              d="M5 12a7 7 0 1 1 2 5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
            <path
              d="M5 8.5 L5 12 L8.5 12"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <h2 className="kp-history__confirm-title">Restaurer la version du {when} ?</h2>
        <p className="kp-history__confirm-text">
          La version actuelle sera <b>conservée dans l'historique</b> — rien n'est perdu. Le contenu
          de cette note redevient celui de {version.author_name} du {when}.
        </p>
        <div className="kp-history__confirm-actions">
          <button
            type="button"
            className="kp-history__confirm-cancel"
            onClick={onCancel}
            disabled={busy}
          >
            Annuler
          </button>
          <button
            type="button"
            className="kp-history__confirm-ok"
            onClick={onConfirm}
            disabled={busy}
          >
            Restaurer cette version
          </button>
        </div>
      </div>
    </div>
  )
}
