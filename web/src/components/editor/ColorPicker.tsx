import type { NoteColor } from '../../api/notes'
import { SWATCHES } from '../../lib/colors'

/**
 * Editor color picker (E4-S5): the 5 shades as round swatches, the active one
 * ringed in deep green (`Keepou - Éditeur canonique.dc.html`, footer).
 */
export function ColorPicker({
  value,
  onChange,
}: {
  value: NoteColor
  onChange: (color: NoteColor) => void
}) {
  return (
    <div className="kp-editor__colors" role="radiogroup" aria-label="Couleur de la note">
      {SWATCHES.map((s) => (
        <button
          key={s.color}
          type="button"
          role="radio"
          aria-checked={value === s.color}
          aria-label={s.label}
          className={`kp-editor__swatch${value === s.color ? ' kp-editor__swatch--active' : ''}`}
          style={{ background: s.bg, borderColor: value === s.color ? undefined : s.bd }}
          onClick={() => onChange(s.color)}
        />
      ))}
    </div>
  )
}
