import { useState } from 'react'
import type { Visibility } from '../../api/notes'

/**
 * Private/public switch (E4-S5, FR-N5 — owner only, enforced server-side).
 * Private → public applies immediately (reversible); public → private first
 * asks for confirmation with the frozen copy (HANDOFF §7 "Visibility"),
 * because the note will leave the other members' public board.
 */
export function VisibilityToggle({
  visibility,
  onChange,
}: {
  visibility: Visibility
  onChange: (visibility: Visibility) => void
}) {
  const [confirming, setConfirming] = useState(false)
  const isPublic = visibility === 'PUBLIC'

  const toggle = () => {
    if (isPublic) setConfirming(true)
    else onChange('PUBLIC')
  }

  return (
    <>
      <button type="button" className="kp-visibility" aria-pressed={isPublic} onClick={toggle}>
        <span
          className={`kp-visibility__toggle${isPublic ? ' kp-visibility__toggle--on' : ''}`}
          aria-hidden="true"
        >
          <span className="kp-visibility__knob" />
        </span>
        Public
      </button>

      {confirming && (
        <div className="kp-confirm" role="alertdialog" aria-label="Confirmer le passage en privé">
          <div className="kp-confirm__card">
            <p className="kp-confirm__text">Cette note ne sera plus visible par les autres.</p>
            <div className="kp-confirm__actions">
              <button
                type="button"
                className="kp-confirm__cancel"
                onClick={() => setConfirming(false)}
              >
                Annuler
              </button>
              <button
                type="button"
                className="kp-confirm__ok"
                onClick={() => {
                  setConfirming(false)
                  onChange('PRIVATE')
                }}
              >
                Confirmer
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
