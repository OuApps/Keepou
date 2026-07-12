import { useI18n } from '../i18n'

/**
 * Board display-density selector (E11 follow-up): « Notes entières » shows each
 * card in full, « Aperçu » caps the card body so more notes fit on one screen
 * (long imported notes stop forcing a long scroll). Display-only — it never
 * changes which notes show or their order, only how much of each is rendered.
 * Sits next to the sort selector and mirrors its native-`<select>` styling.
 */
export type Density = 'full' | 'compact'

export function DensitySelect({
  value,
  onChange,
}: {
  value: Density
  onChange: (value: Density) => void
}) {
  const { BOARD_COPY } = useI18n()
  return (
    <label className="kp-density">
      <svg
        className="kp-density__icon"
        width="15"
        height="15"
        viewBox="0 0 16 16"
        aria-hidden="true"
      >
        <path
          d="M2.5 3.5h11M2.5 6.5h11M2.5 9.5h11M2.5 12.5h11"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
        />
      </svg>
      <select
        className="kp-density__select"
        aria-label={BOARD_COPY.densityLabel}
        value={value}
        onChange={(e) => onChange(e.target.value as Density)}
      >
        <option value="full">{BOARD_COPY.densityFull}</option>
        <option value="compact">{BOARD_COPY.densityCompact}</option>
      </select>
    </label>
  )
}
