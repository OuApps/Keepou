import { BOARD_COPY } from '../lib/copy'

/**
 * « Tout / Public / Privé » segmented filter (E11-S1) — shown on the Mes notes
 * board only. Presentational: the page owns the value (driven by `?vis=`) and
 * filters the already-loaded own notes client-side. « Tout » is the default.
 */
export type VisFilter = 'all' | 'public' | 'private'

const OPTIONS: [VisFilter, string][] = [
  ['all', BOARD_COPY.filterAll],
  ['public', BOARD_COPY.filterPublic],
  ['private', BOARD_COPY.filterPrivate],
]

export function VisibilityFilter({
  value,
  onChange,
}: {
  value: VisFilter
  onChange: (value: VisFilter) => void
}) {
  return (
    <div className="kp-segmented" role="radiogroup" aria-label={BOARD_COPY.filterLabel}>
      {OPTIONS.map(([id, label]) => (
        <button
          key={id}
          type="button"
          role="radio"
          aria-checked={value === id}
          className={`kp-segmented__opt${value === id ? ' kp-segmented__opt--active' : ''}`}
          onClick={() => onChange(id)}
        >
          {label}
        </button>
      ))}
    </div>
  )
}
