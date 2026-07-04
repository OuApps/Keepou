import { useId } from 'react'
import { IMPORT_COPY as COPY } from '../../lib/copy'

/**
 * Import step 1 (E10-S3) — the upload card, faithful to
 * `Keepou - Import Keep.dc.html`: the 3 Takeout steps, a `.zip` picker
 * (real `<input type=file>` behind the dropzone label), and « Continuer »
 * disabled until a file is chosen (« Analyse de l'archive… » while busy).
 */
export function ImportUpload({
  file,
  busy,
  error,
  onPick,
  onContinue,
  onCancel,
}: {
  file: File | null
  busy: boolean
  error: string | null
  onPick: (file: File | null) => void
  onContinue: () => void
  onCancel: () => void
}) {
  const inputId = useId()

  return (
    <div className="kp-imp__center">
      <section className="kp-imp__modal" aria-labelledby={`${inputId}-title`}>
        <h1 className="kp-imp__title" id={`${inputId}-title`}>
          {COPY.title}
        </h1>
        <p className="kp-imp__intro">{COPY.uploadIntro}</p>

        {COPY.uploadSteps.map((step, i) => (
          <div className="kp-imp__step" key={i}>
            <span className="kp-imp__stepnum" aria-hidden="true">
              {i + 1}
            </span>
            <span>
              {i === 0 ? (
                <>
                  Ouvre{' '}
                  <a className="kp-link" href={COPY.takeoutUrl} target="_blank" rel="noreferrer">
                    Google Takeout
                  </a>
                  , ne coche que Keep, et crée l’export (format .zip).
                </>
              ) : (
                step
              )}
            </span>
          </div>
        ))}

        <label className="kp-imp__dropzone" htmlFor={inputId}>
          <svg
            width="26"
            height="26"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--brand-gold-dark)"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M12 16V5" />
            <path d="m7 9 5-5 5 5" />
            <path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
          </svg>
          <span>
            <span className="kp-imp__droplabel">
              Dépose ton export ici, ou <u>parcourir…</u>
            </span>
            <span className="kp-imp__drophint" style={{ display: 'block' }}>
              {COPY.dropHint}
            </span>
          </span>
          {file !== null && <span className="kp-imp__filechip">{file.name}</span>}
          <input
            id={inputId}
            type="file"
            accept=".zip,application/zip"
            style={{ position: 'absolute', opacity: 0, width: 1, height: 1 }}
            onChange={(e) => onPick(e.target.files?.[0] ?? null)}
          />
        </label>

        <p className="kp-imp__note">{COPY.uploadNote}</p>
        {error !== null && (
          <p className="kp-imp__error" role="alert">
            {error}
          </p>
        )}

        <div className="kp-imp__actions">
          <button type="button" className="kp-imp__ghost" onClick={onCancel}>
            {COPY.cancel}
          </button>
          <button
            type="button"
            className="kp-btn"
            disabled={file === null || busy}
            onClick={onContinue}
          >
            {busy ? COPY.analyzing : COPY.continue}
          </button>
        </div>
      </section>
    </div>
  )
}
