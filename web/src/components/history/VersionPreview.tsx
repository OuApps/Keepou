import type { VersionOut } from '../../api/versions'
import { parsePreview } from '../../lib/preview'

/**
 * Read-only re-render of a version, exactly as-is — **no visual diff** (claude.md
 * §3). Shared by the desktop preview pane and the mobile preview screen; the
 * chrome (banners, action bar) is added by `HistoryPage` around it.
 */

function CheckIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 10 10" aria-hidden="true">
      <path
        d="M2 5.2 L4 7.2 L8 2.6"
        fill="none"
        stroke="#fff"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function VersionPreview({ version }: { version: VersionOut }) {
  const blocks = parsePreview(version.body)

  return (
    <article className="kp-history__preview" aria-label="Aperçu de la version">
      <h1 className="kp-history__preview-title">{version.title || 'Note sans titre'}</h1>
      {blocks.length > 0 && (
        <div className="kp-history__preview-body">
          {blocks.map((block, i) =>
            block.type === 'check' ? (
              <div key={i} className="kp-history__check">
                <span
                  className={`kp-history__box${block.checked ? ' kp-history__box--checked' : ''}`}
                  aria-hidden="true"
                >
                  {block.checked && <CheckIcon />}
                </span>
                <span className={block.checked ? 'kp-history__done' : undefined}>{block.text}</span>
              </div>
            ) : (
              <p key={i} className="kp-history__text">
                {block.text}
              </p>
            ),
          )}
        </div>
      )}
    </article>
  )
}
