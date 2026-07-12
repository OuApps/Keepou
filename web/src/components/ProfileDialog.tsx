import { useEffect, useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { useAuth } from '../auth/AuthContext'
import { useI18n } from '../i18n'

/**
 * « Modifier mon nom » (E11-S4): a small modal to change the current user's
 * display name. On success the auth context updates, so the avatar initial,
 * the menu header and future « Modifié par » reflect the new name at once.
 */
export function ProfileDialog({ onClose }: { onClose: () => void }) {
  const { COMMON_COPY, PROFILE_COPY } = useI18n()
  const { user, changeDisplayName } = useAuth()
  const [name, setName] = useState(user?.display_name ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const trimmed = name.trim()
    if (trimmed === '') {
      setError(PROFILE_COPY.emptyName)
      return
    }
    setSaving(true)
    setError(null)
    try {
      await changeDisplayName(trimmed)
      onClose()
    } catch {
      setError(PROFILE_COPY.failed)
      setSaving(false)
    }
  }

  return createPortal(
    <div className="kp-dialog" role="presentation" onClick={onClose}>
      <form
        className="kp-dialog__card"
        role="dialog"
        aria-modal="true"
        aria-label={PROFILE_COPY.title}
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
      >
        <h2 className="kp-dialog__title">{PROFILE_COPY.title}</h2>
        <label className="kp-dialog__field">
          <span className="kp-dialog__label">{PROFILE_COPY.label}</span>
          <input
            className="kp-dialog__input"
            type="text"
            value={name}
            maxLength={80}
            autoFocus
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        {error !== null && (
          <p className="kp-dialog__error" role="alert">
            {error}
          </p>
        )}
        <div className="kp-dialog__actions">
          <button type="button" className="kp-dialog__cancel" onClick={onClose}>
            {COMMON_COPY.cancel}
          </button>
          <button type="submit" className="kp-dialog__ok" disabled={saving}>
            {PROFILE_COPY.save}
          </button>
        </div>
      </form>
    </div>,
    document.body,
  )
}
