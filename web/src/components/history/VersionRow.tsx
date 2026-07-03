import type { VersionOut } from '../../api/versions'
import { formatVersionWhen } from '../../lib/time'

/**
 * One history entry (E6-S4/S5), faithful to `Keepou - Historique.dc.html`:
 * « when » + author avatar + « Modifié par X » (« Créée par X » for the first
 * version), an « actuelle » badge on the newest one. Desktop = timeline row
 * (selected → inline « Restaurer cette version »); mobile = tappable card with
 * a chevron. Selecting re-renders the snapshot read-only — no diff.
 */

// Author-avatar backgrounds, deterministic per member (mirrors the Board card).
const AVATAR_COLORS = ['#C75D43', '#EAB64C', '#3A5132', '#5FA39A', '#9DB84E']

function avatarColor(name: string): string {
  let sum = 0
  for (const char of name) sum += char.codePointAt(0) ?? 0
  return AVATAR_COLORS[sum % AVATAR_COLORS.length]
}

function Chevron() {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" aria-hidden="true" className="kp-history__chev">
      <path
        d="M7.5 4 L14 10.5 L7.5 17"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

interface VersionRowProps {
  version: VersionOut
  variant: 'desktop' | 'mobile'
  /** Newest version = the note's current content (« actuelle » badge). */
  current: boolean
  /** Oldest version = note creation (« Créée par » instead of « Modifié par »). */
  first: boolean
  selected: boolean
  onSelect: () => void
  /** Desktop only: the inline « Restaurer cette version » on the selected row. */
  onRestore?: () => void
}

export function VersionRow({
  version,
  variant,
  current,
  first,
  selected,
  onSelect,
  onRestore,
}: VersionRowProps) {
  const initial = version.author_name.trim().charAt(0).toUpperCase()
  const authorLine = `${first ? 'Créée' : 'Modifié'} par ${version.author_name}`

  const meta = (
    <>
      <div className="kp-history__row-head">
        <span className="kp-history__when">{formatVersionWhen(version.created_at)}</span>
        {current && <span className="kp-history__badge">actuelle</span>}
      </div>
      <div className="kp-history__author">
        <span
          className="kp-history__avatar"
          style={{ background: avatarColor(version.author_name) }}
        >
          {initial}
        </span>
        <span>{authorLine}</span>
      </div>
    </>
  )

  if (variant === 'mobile') {
    return (
      <button
        type="button"
        className={`kp-history__mrow${current ? ' kp-history__mrow--current' : ''}${
          selected ? ' kp-history__mrow--selected' : ''
        }`}
        onClick={onSelect}
        aria-current={current ? 'true' : undefined}
      >
        <div>{meta}</div>
        {!current && <Chevron />}
      </button>
    )
  }

  return (
    <div
      className={`kp-history__row${selected ? ' kp-history__row--selected' : ''}`}
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onSelect()
        }
      }}
    >
      <div className="kp-history__timeline" aria-hidden="true">
        <span className={`kp-history__dot${selected ? ' kp-history__dot--on' : ''}`} />
        {!first && <span className="kp-history__line" />}
      </div>
      <div className="kp-history__row-body">
        {meta}
        {selected && onRestore && (
          <button type="button" className="kp-history__restore" onClick={onRestore}>
            Restaurer cette version
          </button>
        )}
      </div>
    </div>
  )
}
