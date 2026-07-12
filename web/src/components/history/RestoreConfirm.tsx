import type { NoteVersionOut } from '../../api/versions'
import { useI18n } from '../../i18n'
import { formatVersionAt, formatVersionDay } from '../../lib/time'

/**
 * Restore confirmation (E6, frozen copy HANDOFF §7): « La version actuelle
 * sera conservée dans l'historique — rien n'est perdu. » — the mockup's card
 * with the ↺ icon and the gold « Restaurer cette version » action.
 */
export function RestoreConfirm({
  version,
  busy,
  error,
  onCancel,
  onConfirm,
}: {
  version: NoteVersionOut
  busy: boolean
  error: string | null
  onCancel: () => void
  onConfirm: () => void
}) {
  const { COMMON_COPY, HISTORY_COPY } = useI18n()
  return (
    <div className="kp-confirm" role="alertdialog" aria-label={HISTORY_COPY.restoreConfirmLabel}>
      <div className="kp-confirm__card kp-restore">
        <span className="kp-restore__icon" aria-hidden="true">
          <svg width="22" height="22" viewBox="0 0 24 24">
            <path
              d="M5 12a7 7 0 1 1 2 5"
              fill="none"
              stroke="#b58a2e"
              strokeWidth="2"
              strokeLinecap="round"
            />
            <path
              d="M5 8.5 L5 12 L8.5 12"
              fill="none"
              stroke="#b58a2e"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
        <h3 className="kp-restore__title">
          {HISTORY_COPY.restoreTitleBefore}
          {formatVersionDay(version.created_at)}&nbsp;?
        </h3>
        <p className="kp-confirm__text">
          {HISTORY_COPY.restoreKeptBefore}
          <b>{HISTORY_COPY.restoreKeptBold}</b>
          {HISTORY_COPY.restoreKeptAfter(version.author_name, formatVersionAt(version.created_at))}
        </p>
        {error !== null && (
          <p className="kp-restore__error" role="alert">
            {error}
          </p>
        )}
        <div className="kp-confirm__actions">
          <button type="button" className="kp-confirm__cancel" onClick={onCancel} disabled={busy}>
            {COMMON_COPY.cancel}
          </button>
          <button type="button" className="kp-restore__ok" onClick={onConfirm} disabled={busy}>
            {HISTORY_COPY.restoreThis}
          </button>
        </div>
      </div>
    </div>
  )
}
