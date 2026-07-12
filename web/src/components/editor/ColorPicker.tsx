import type { NoteColor } from '../../api/notes'
import { useI18n } from '../../i18n'
import { SWATCHES } from '../../lib/colors'

/**
 * Editor color picker (E4-S5): the 5 shades as round swatches, the active one
 * ringed in deep green (`Keepou - Éditeur canonique.dc.html`, footer).
 */
export function ColorPicker({
  value,
  onChange,
  disabled = false,
}: {
  value: NoteColor
  onChange: (color: NoteColor) => void
  /** Read-only mode (E5): the swatches are visible but inert. */
  disabled?: boolean
}) {
  const { EDITOR_COPY, COLOR_LABELS } = useI18n()
  return (
    <div className="kp-editor__colors" role="radiogroup" aria-label={EDITOR_COPY.colorLabel}>
      {SWATCHES.map((s) => (
        <button
          key={s.color}
          type="button"
          role="radio"
          aria-checked={value === s.color}
          aria-label={COLOR_LABELS[s.color]}
          disabled={disabled}
          className={`kp-editor__swatch${value === s.color ? ' kp-editor__swatch--active' : ''}`}
          style={{ background: s.bg, borderColor: value === s.color ? undefined : s.bd }}
          onClick={() => onChange(s.color)}
        />
      ))}
    </div>
  )
}
