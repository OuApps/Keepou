import type { NoteVersionOut } from '../../api/versions'
import { formatVersionWhen } from '../../lib/time'

/**
 * One history entry (E6-S4/S5, `Keepou - Historique.dc.html`): timeline dot
 * (desktop), « Aujourd'hui · 14:32 »-style timestamp, « actuelle » badge on
 * the newest version, avatar + « Modifié par X » / « Créée par X » line, and
 * the « Restaurer cette version » button on the selected (non-current) row.
 * On mobile the row becomes a tappable card with a chevron (2-screen flow).
 */

// Per-author avatar shade — the mockup rotates the brand palette (green /
// salsa / gold / teal); gold keeps dark ink for contrast.
const AVATAR_SHADES = [
  { bg: '#3a5132', ink: '#fff' },
  { bg: '#c75d43', ink: '#fff' },
  { bg: '#eab64c', ink: '#2e2a20' },
  { bg: '#5fa39a', ink: '#fff' },
]

function avatarShadeOf(authorId: string): { bg: string; ink: string } {
  let hash = 0
  for (const char of authorId) hash = (hash * 31 + char.charCodeAt(0)) % 997
  return AVATAR_SHADES[hash % AVATAR_SHADES.length]
}

interface VersionRowProps {
  version: NoteVersionOut
  /** Newest version — carries the « actuelle » badge, no restore button. */
  isCurrent: boolean
  /** The history root: « Créée par X » instead of « Modifié par X ». */
  isCreation: boolean
  selected: boolean
  /** Last row: the desktop timeline rail stops at its dot. */
  isLast: boolean
  onSelect: () => void
  onRestore: () => void
}

export function VersionRow({
  version,
  isCurrent,
  isCreation,
  selected,
  isLast,
  onSelect,
  onRestore,
}: VersionRowProps) {
  const shade = avatarShadeOf(version.author_id)
  return (
    <li className={`kp-vrow${selected ? ' kp-vrow--selected' : ''}`}>
      <button type="button" className="kp-vrow__main" onClick={onSelect} aria-current={selected}>
        <span className="kp-vrow__rail" aria-hidden="true">
          <span className="kp-vrow__dot" />
          {!isLast && <span className="kp-vrow__line" />}
        </span>
        <span className="kp-vrow__info">
          <span className="kp-vrow__top">
            <span className="kp-vrow__when">{formatVersionWhen(version.created_at)}</span>
            {isCurrent && <span className="kp-vrow__badge">actuelle</span>}
          </span>
          <span className="kp-vrow__author">
            <span
              className="kp-vrow__avatar"
              style={{ background: shade.bg, color: shade.ink }}
              aria-hidden="true"
            >
              {version.author_name.charAt(0).toUpperCase()}
            </span>
            {isCreation ? 'Créée par' : 'Modifié par'} {version.author_name}
          </span>
        </span>
        <svg
          className="kp-vrow__chevron"
          width="16"
          height="16"
          viewBox="0 0 20 20"
          aria-hidden="true"
        >
          <path
            d="M7.5 4 L14 10.5 L7.5 17"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      {selected && !isCurrent && (
        <button type="button" className="kp-vrow__restore" onClick={onRestore}>
          Restaurer cette version
        </button>
      )}
    </li>
  )
}
