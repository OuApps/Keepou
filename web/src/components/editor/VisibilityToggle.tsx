import { useState } from 'react'
import type { Visibility } from '../../api/notes'
import { COMMON_COPY, EDITOR_COPY } from '../../lib/copy'

/**
 * Private/public switch (E4-S5, FR-N5 — owner only, enforced server-side).
 * Private → public applies immediately (reversible); public → private first
 * asks for confirmation with the frozen copy (HANDOFF §7 "Visibility"),
 * because the note will leave the other members' public board.
 */
export function VisibilityToggle({
  visibility,
  onChange,
  disabled = false,
}: {
  visibility: Visibility
  onChange: (visibility: Visibility) => void
  /** Read-only mode (E5): the switch is visible but inert. */
  disabled?: boolean
}) {
  const [confirming, setConfirming] = useState(false)
  const isPublic = visibility === 'PUBLIC'

  const toggle = () => {
    if (isPublic) setConfirming(true)
    else onChange('PUBLIC')
  }

  return (
    <>
      <button
        type="button"
        className="kp-visibility"
        aria-pressed={isPublic}
        disabled={disabled}
        onClick={toggle}
      >
        <span
          className={`kp-visibility__toggle${isPublic ? ' kp-visibility__toggle--on' : ''}`}
          aria-hidden="true"
        >
          <span className="kp-visibility__knob" />
        </span>
        {EDITOR_COPY.visibilityPublic}
      </button>

      {confirming && (
        <div className="kp-confirm" role="alertdialog" aria-label={EDITOR_COPY.confirmPrivateLabel}>
          <div className="kp-confirm__card">
            <p className="kp-confirm__text">{EDITOR_COPY.confirmPrivateText}</p>
            <div className="kp-confirm__actions">
              <button
                type="button"
                className="kp-confirm__cancel"
                onClick={() => setConfirming(false)}
              >
                {COMMON_COPY.cancel}
              </button>
              <button
                type="button"
                className="kp-confirm__ok"
                onClick={() => {
                  setConfirming(false)
                  onChange('PRIVATE')
                }}
              >
                {COMMON_COPY.confirm}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
