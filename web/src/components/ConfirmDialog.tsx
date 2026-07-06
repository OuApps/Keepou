import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { COMMON_COPY } from '../lib/copy'

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
  confirmLabel = COMMON_COPY.confirm,
  cancelLabel = COMMON_COPY.cancel,
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
            {cancelLabel}
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
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
