import { useEffect, useRef, useState, type FormEvent } from 'react'
import { createNote, type NoteColor, type NoteOut } from '../api/notes'
import { useI18n } from '../i18n'
import { SWATCHES } from '../lib/colors'

/**
 * Quick composer (E3-S5) — the fastest path in the app: an input, the 5 card
 * shades and a public toggle, faithful to `Keepou - Board.dc.html`. It only
 * creates (POST /api/notes); full editing (blocks, autosave) is E4.
 *
 * `defaultPublic` (E3-S9) pre-selects the visibility toggle from the active
 * board tab: opening the composer on « Public » starts the note public, on
 * « Mes notes » it starts private — so a note created from the Public tab
 * lands where you expect it.
 */

export function Composer({
  onCreated,
  defaultPublic = false,
}: {
  onCreated: (note: NoteOut) => void
  defaultPublic?: boolean
}) {
  const { BOARD_COPY, COLOR_LABELS } = useI18n()
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [color, setColor] = useState<NoteColor>('GOLD')
  const [isPublic, setIsPublic] = useState(defaultPublic)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Follow the active tab while the composer is idle (closed) — switching to
  // « Public » pre-arms Public — without clobbering a toggle set mid-edit.
  useEffect(() => {
    if (!open) setIsPublic(defaultPublic)
  }, [defaultPublic, open])

  const close = () => {
    setOpen(false)
    setTitle('')
    setColor('GOLD')
    setIsPublic(defaultPublic)
    setError(false)
  }

  // A note can be created without a title; the editor opens right after so the
  // body is written there (the composer is only the launch pad).
  const submit = async (e?: FormEvent) => {
    e?.preventDefault()
    if (saving) return
    setSaving(true)
    setError(false)
    try {
      const note = await createNote({
        title: title.trim(),
        color,
        visibility: isPublic ? 'PUBLIC' : 'PRIVATE',
      })
      close()
      onCreated(note)
    } catch {
      setError(true)
    } finally {
      setSaving(false)
    }
  }

  return (
    // Clicking anywhere on the composer opens it (mockup behavior) — a plain
    // onFocus isn't enough after a create, when the input kept the focus.
    <form
      className="kp-composer"
      onSubmit={submit}
      onClick={() => {
        setOpen(true)
        inputRef.current?.focus()
      }}
    >
      <div className="kp-composer__row">
        <input
          ref={inputRef}
          className="kp-composer__input"
          type="text"
          placeholder={BOARD_COPY.composerPlaceholder}
          aria-label={BOARD_COPY.composerPlaceholder}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onFocus={() => setOpen(true)}
        />
        <button type="submit" className="kp-composer__add" disabled={saving}>
          {BOARD_COPY.composerAdd}
        </button>
      </div>

      {open && (
        <div className="kp-composer__options">
          <div className="kp-composer__pickers">
            <div
              className="kp-composer__colors"
              role="radiogroup"
              aria-label={BOARD_COPY.composerColorLabel}
            >
              {SWATCHES.map((s) => (
                <button
                  key={s.color}
                  type="button"
                  role="radio"
                  aria-checked={color === s.color}
                  aria-label={COLOR_LABELS[s.color]}
                  className={`kp-composer__swatch${color === s.color ? ' kp-composer__swatch--active' : ''}`}
                  style={{ background: s.bg, borderColor: s.bd }}
                  onClick={() => setColor(s.color)}
                />
              ))}
            </div>
            <button
              type="button"
              className="kp-composer__visibility"
              aria-pressed={isPublic}
              onClick={() => setIsPublic((v) => !v)}
            >
              <span
                className={`kp-composer__toggle${isPublic ? ' kp-composer__toggle--on' : ''}`}
                aria-hidden="true"
              >
                <span className="kp-composer__knob" />
              </span>
              {BOARD_COPY.composerPublic}
            </button>
          </div>
          <button
            type="button"
            className="kp-composer__close"
            onClick={(e) => {
              e.stopPropagation()
              close()
            }}
          >
            {BOARD_COPY.composerClose}
          </button>
        </div>
      )}

      {error && (
        <p className="kp-composer__error" role="alert">
          {BOARD_COPY.composerFailed}
        </p>
      )}
    </form>
  )
}
