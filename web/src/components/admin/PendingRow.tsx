import type { MemberOut } from '../../api/admin'
import { formatDayMonth } from '../../lib/time'

/**
 * A pending invitee (allowlisted e-mail, no account yet): dashed avatar with a
 * mail glyph, « Autorisé le <date> · pas encore de compte », the « En attente »
 * pill and the « Retirer » action (allowed on pending entries only, E7-S2).
 */
export function PendingRow({
  entry,
  onRemove,
  busy,
}: {
  entry: MemberOut
  onRemove: () => void
  busy: boolean
}) {
  return (
    <li className="kp-admin__row">
      <div className="kp-admin__avatar kp-admin__avatar--pending" aria-hidden="true">
        <svg width="16" height="16" viewBox="0 0 20 20">
          <rect
            x="2.5"
            y="4.5"
            width="15"
            height="11"
            rx="2"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
          />
          <path
            d="M3 5.5 L10 10.5 L17 5.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      <div className="kp-admin__id">
        <div className="kp-admin__name">{entry.email}</div>
        <div className="kp-admin__meta">
          {entry.allowed_at ? `Autorisé le ${formatDayMonth(entry.allowed_at)} · ` : ''}
          pas encore de compte
        </div>
      </div>
      <span className="kp-admin__status kp-admin__status--warn">En attente</span>
      <button type="button" className="kp-admin__remove" onClick={onRemove} disabled={busy}>
        Retirer
      </button>
    </li>
  )
}
