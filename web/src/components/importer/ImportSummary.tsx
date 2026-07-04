import type { ImportSummaryOut } from '../../api/importKeep'
import { IMPORT_COPY as COPY } from '../../lib/copy'

/**
 * Import step 3 (E10-S3) — the summary card: what was created, what was
 * skipped (duplicates / unreadable files), and back to the board.
 */
export function ImportSummary({
  summary,
  onDone,
}: {
  summary: ImportSummaryOut
  onDone: () => void
}) {
  const details = [
    summary.skipped_duplicate > 0 ? COPY.duplicates(summary.skipped_duplicate) : null,
    summary.failed.length > 0 ? COPY.failedFiles(summary.failed.length) : null,
  ].filter((part): part is string => part !== null)

  return (
    <div className="kp-imp__center">
      <section className="kp-imp__sumcard">
        <img src="/keepou-mascot.png" alt="" className="kp-imp__summascot" width={52} height={52} />
        <div className="kp-imp__sumnum">{COPY.imported(summary.imported)}</div>
        <p className="kp-imp__sumline">
          {details.length > 0 && (
            <>
              {details.join(' · ')}
              <br />
            </>
          )}
          {COPY.summaryNote}
        </p>
        <div className="kp-imp__sumactions">
          <button type="button" className="kp-btn" onClick={onDone}>
            {COPY.seeMyNotes}
          </button>
        </div>
      </section>
    </div>
  )
}
