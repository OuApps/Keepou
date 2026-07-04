import type { MemberOut } from '../../api/admin'
import { formatDayMonth } from '../../lib/time'

/**
 * One pending invitee (`Keepou - Admin.dc.html`): allowlisted email with no
 * account yet — dashed avatar, « En attente » pill and the « Retirer » action
 * (allowed precisely because no account exists, FR-U4).
 */
export function PendingRow({
  entry,
  onRemove,
}: {
  entry: MemberOut
  onRemove: (entryId: string) => void
}) {
  return (
    <li className="kp-row">
      <span className="kp-row__avatar kp-row__avatar--pending" aria-hidden="true">
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
      </span>
      <div className="kp-row__main">
        <div className="kp-row__name">{entry.email}</div>
        <div className="kp-row__meta">
          {entry.added_at && <>Autorisé le {formatDayMonth(entry.added_at)} · </>}
          pas encore de compte
        </div>
      </div>
      <span className="kp-pill kp-pill--gold">En attente</span>
      <button
        type="button"
        className="kp-row__remove"
        onClick={() => entry.allowlist_id && onRemove(entry.allowlist_id)}
      >
        Retirer
      </button>
    </li>
  )
}
