import { useEffect, useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { BASE_URL } from '../api/client'
import {
  createToken,
  listTokens,
  revokeToken,
  type PatCreatedOut,
  type PatOut,
} from '../api/tokens'
import { useI18n, useLocale } from '../i18n'
import { ConfirmDialog } from './ConfirmDialog'

/**
 * « Accès agent (MCP) » (E13): mint, list and revoke the Personal Access Tokens
 * an agent uses to reach Keepou over MCP. The freshly created secret is shown
 * exactly once (the server only ever stores its hash); the list carries metadata
 * only. Reuses the app-wide `.kp-dialog` shell (portal, Escape/backdrop close).
 */
export function TokenManager({ onClose }: { onClose: () => void }) {
  const { TOKEN_COPY, COMMON_COPY } = useI18n()
  const { locale } = useLocale()
  const dateLocale = locale === 'fr' ? 'fr-FR' : 'en-US'

  const [tokens, setTokens] = useState<PatOut[] | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [name, setName] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [created, setCreated] = useState<PatCreatedOut | null>(null)
  const [copied, setCopied] = useState(false)
  const [revoking, setRevoking] = useState<PatOut | null>(null)

  // The MCP endpoint the member points their agent at (API origin + /mcp).
  const mcpUrl = `${(BASE_URL || window.location.origin).replace(/\/+$/, '')}/mcp`

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const reload = () => {
    setLoadError(false)
    listTokens()
      .then(setTokens)
      .catch(() => setLoadError(true))
  }

  useEffect(reload, [])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const trimmed = name.trim()
    if (trimmed === '') {
      setError(TOKEN_COPY.emptyName)
      return
    }
    setCreating(true)
    setError(null)
    try {
      const token = await createToken(trimmed)
      setCreated(token)
      setName('')
      setCopied(false)
      reload()
    } catch {
      setError(TOKEN_COPY.createFailed)
    } finally {
      setCreating(false)
    }
  }

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      /* clipboard may be unavailable (insecure context) — the value stays selectable */
    }
  }

  const confirmRevoke = async () => {
    if (revoking === null) return
    const target = revoking
    setRevoking(null)
    try {
      await revokeToken(target.id)
      reload()
    } catch {
      setError(TOKEN_COPY.revokeFailed)
    }
  }

  const usageLabel = (pat: PatOut): string =>
    pat.last_used_at === null
      ? TOKEN_COPY.neverUsed
      : TOKEN_COPY.lastUsed(new Date(pat.last_used_at).toLocaleDateString(dateLocale))

  return createPortal(
    <div className="kp-dialog" role="presentation" onClick={onClose}>
      <div
        className="kp-dialog__card kp-dialog__card--wide"
        role="dialog"
        aria-modal="true"
        aria-label={TOKEN_COPY.title}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="kp-dialog__title">{TOKEN_COPY.title}</h2>
        <p className="kp-dialog__text">{TOKEN_COPY.intro}</p>

        <div className="kp-token__endpoint">
          <span className="kp-dialog__label">{TOKEN_COPY.endpointLabel}</span>
          <div className="kp-token__endpoint-row">
            <code className="kp-token__url">{mcpUrl}</code>
            <button type="button" className="kp-token__copy" onClick={() => copy(mcpUrl)}>
              {TOKEN_COPY.copyEndpoint}
            </button>
          </div>
        </div>

        {created !== null ? (
          <div className="kp-token__created" role="alert">
            <h3 className="kp-token__created-title">{TOKEN_COPY.createdTitle}</h3>
            <p className="kp-token__created-warning">{TOKEN_COPY.createdWarning}</p>
            <code className="kp-token__secret">{created.token}</code>
            <div className="kp-token__created-actions">
              <button type="button" className="kp-token__copy" onClick={() => copy(created.token)}>
                {copied ? TOKEN_COPY.copied : TOKEN_COPY.copyToken}
              </button>
              <button
                type="button"
                className="kp-dialog__ok"
                onClick={() => {
                  setCreated(null)
                  setCopied(false)
                }}
              >
                {TOKEN_COPY.doneCreating}
              </button>
            </div>
          </div>
        ) : (
          <form className="kp-token__create" onSubmit={submit}>
            <label className="kp-dialog__field">
              <span className="kp-dialog__label">{TOKEN_COPY.nameLabel}</span>
              <input
                className="kp-dialog__input"
                type="text"
                value={name}
                maxLength={80}
                placeholder={TOKEN_COPY.namePlaceholder}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <button type="submit" className="kp-dialog__ok" disabled={creating}>
              {creating ? TOKEN_COPY.generating : TOKEN_COPY.generate}
            </button>
          </form>
        )}

        {error !== null && (
          <p className="kp-dialog__error" role="alert">
            {error}
          </p>
        )}

        <div className="kp-token__list">
          <h3 className="kp-token__list-title">{TOKEN_COPY.listTitle}</h3>
          {loadError ? (
            <p className="kp-dialog__error">{TOKEN_COPY.loadFailed}</p>
          ) : tokens === null ? (
            <p className="kp-token__empty">{COMMON_COPY.loading}</p>
          ) : tokens.length === 0 ? (
            <p className="kp-token__empty">{TOKEN_COPY.empty}</p>
          ) : (
            <ul className="kp-token__rows">
              {tokens.map((pat) => (
                <li key={pat.id} className="kp-token__row">
                  <div className="kp-token__row-main">
                    <span className="kp-token__name">{pat.name}</span>
                    <span className="kp-token__meta">
                      <code className="kp-token__prefix">{pat.prefix}…</code>{' '}
                      {TOKEN_COPY.createdOn(
                        new Date(pat.created_at).toLocaleDateString(dateLocale),
                      )}{' '}
                      {usageLabel(pat)}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="kp-token__revoke"
                    onClick={() => setRevoking(pat)}
                  >
                    {TOKEN_COPY.revoke}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="kp-dialog__actions">
          <button type="button" className="kp-dialog__cancel" onClick={onClose}>
            {COMMON_COPY.close}
          </button>
        </div>
      </div>

      {revoking !== null && (
        <ConfirmDialog
          title={TOKEN_COPY.revokeConfirmTitle}
          text={TOKEN_COPY.revokeConfirmText}
          confirmLabel={TOKEN_COPY.revoke}
          danger
          onConfirm={confirmRevoke}
          onCancel={() => setRevoking(null)}
        />
      )}
    </div>,
    document.body,
  )
}
