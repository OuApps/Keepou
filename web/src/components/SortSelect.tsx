import { useI18n } from '../i18n'

/**
 * Board sort selector (E11-S1): last modification (default), creation date, or
 * title. Client-side sort over the loaded set (pinned always first). « Modifié »
 * matches the server's default order; the Keep import preserves real dates
 * (E10), so sorting an imported board is meaningful.
 */
export type SortKey = 'modified' | 'created' | 'title'

export function SortSelect({
  value,
  onChange,
}: {
  value: SortKey
  onChange: (value: SortKey) => void
}) {
  const { BOARD_COPY } = useI18n()
  return (
    <label className="kp-sort">
      <svg className="kp-sort__icon" width="15" height="15" viewBox="0 0 16 16" aria-hidden="true">
        <path
          d="M4.5 2.5v11M4.5 13.5 2.3 11M4.5 13.5 6.7 11M11.5 13.5v-11M11.5 2.5 9.3 5M11.5 2.5 13.7 5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <select
        className="kp-sort__select"
        aria-label={BOARD_COPY.sortLabel}
        value={value}
        onChange={(e) => onChange(e.target.value as SortKey)}
      >
        <option value="modified">{BOARD_COPY.sortModified}</option>
        <option value="created">{BOARD_COPY.sortCreated}</option>
        <option value="title">{BOARD_COPY.sortTitle}</option>
      </select>
    </label>
  )
}
