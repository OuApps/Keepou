import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useI18n } from '../i18n'

/**
 * App-wide, centered confirmation modal (E11). Unlike the editor-scoped
 * `.kp-confirm` (absolute, fills its overlay), this one is a fixed viewport
 * dialog rendered through a portal, so it works from a board card, the editor
 * header or an archive toolbar. `danger` paints the primary action red for
 * irreversible actions (hard delete). Escape and backdrop click cancel.
 *
 * The click handlers stop propagation: portals bubble React events through the
 * component tree, so without this a click would also reach a card's onClick.
 */
export function ConfirmDialog({
  title,
  text,
  confirmLabel,
  cancelLabel,
  danger = false,
  onConfirm,
  onCancel,
}: {
  title: string
  text?: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  const { COMMON_COPY } = useI18n()
  // Defaults resolve here (a hook can't run in a default parameter value).
  const confirm = confirmLabel ?? COMMON_COPY.confirm
  const cancel = cancelLabel ?? COMMON_COPY.cancel
  const confirmRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    confirmRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onCancel])

  return createPortal(
    <div
      className="kp-dialog"
      role="presentation"
      onClick={(e) => {
        e.stopPropagation()
        onCancel()
      }}
    >
      <div
        className="kp-dialog__card"
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="kp-dialog__title">{title}</h2>
        {text !== undefined && <p className="kp-dialog__text">{text}</p>}
        <div className="kp-dialog__actions">
          <button
            type="button"
            className="kp-dialog__cancel"
            onClick={(e) => {
              e.stopPropagation()
              onCancel()
            }}
          >
            {cancel}
          </button>
          <button
            ref={confirmRef}
            type="button"
            className={`kp-dialog__ok${danger ? ' kp-dialog__ok--danger' : ''}`}
            onClick={(e) => {
              e.stopPropagation()
              onConfirm()
            }}
          >
            {confirm}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
