import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  importKeepNotes,
  previewKeepImport,
  type ImportPreviewOut,
  type ImportSummaryOut,
} from '../api/importKeep'
import { ApiError } from '../api/client'
import { IMPORT_COPY as COPY } from '../lib/copy'
import { ImportReview } from '../components/importer/ImportReview'
import { ImportSummary } from '../components/importer/ImportSummary'
import { ImportUpload } from '../components/importer/ImportUpload'

/**
 * /import — the Google Keep import flow (E10-S3), 3 screens in one route:
 * upload → review/selection (« mode tunnel ») → summary, faithful to
 * `Keepou - Import Keep.dc.html`. The page owns the selection state and the
 * two API calls; parsing and every guarantee (forced private, Keep dates,
 * trashed never imported, dedup) are server-side (E10-S2).
 */

type Step =
  | { name: 'upload' }
  | { name: 'review'; preview: ImportPreviewOut }
  | { name: 'summary'; summary: ImportSummaryOut }

function errorMessage(err: unknown): string {
  return err instanceof ApiError ? err.message : 'Erreur réseau'
}

export default function ImportKeepPage() {
  const navigate = useNavigate()
  const [step, setStep] = useState<Step>({ name: 'upload' })
  const [file, setFile] = useState<File | null>(null)
  const [selected, setSelected] = useState<ReadonlySet<number>>(new Set())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleContinue = async () => {
    if (file === null) return
    setBusy(true)
    setError(null)
    try {
      const preview = await previewKeepImport(file)
      // Trashed notes arrive pre-unchecked — cleanup is the default.
      setSelected(new Set(preview.items.filter((i) => !i.is_trashed).map((i) => i.index)))
      setStep({ name: 'review', preview })
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const handleToggle = (index: number, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (checked) next.add(index)
      else next.delete(index)
      return next
    })
  }

  const handleSelectAll = (checked: boolean) => {
    if (step.name !== 'review') return
    setSelected(checked ? new Set(step.preview.items.map((i) => i.index)) : new Set())
  }

  const handleImport = async () => {
    if (file === null || step.name !== 'review') return
    setBusy(true)
    setError(null)
    try {
      const summary = await importKeepNotes(
        file,
        [...selected].sort((a, b) => a - b),
      )
      setStep({ name: 'summary', summary })
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="kp-imp">
      <header className="kp-imp__bar">
        <div className="kp-imp__brand">
          <img src="/keepou-mascot.png" alt="" className="kp-imp__logo" width={30} height={30} />
          {COPY.title}
        </div>
        {step.name === 'review' && (
          <div>
            <button type="button" className="kp-imp__linkbtn" onClick={() => handleSelectAll(true)}>
              {COPY.checkAll}
            </button>
            <span className="kp-imp__bardot" aria-hidden="true">
              ·
            </span>
            <button
              type="button"
              className="kp-imp__linkbtn"
              onClick={() => handleSelectAll(false)}
            >
              {COPY.uncheckAll}
            </button>
          </div>
        )}
      </header>

      {step.name === 'upload' && (
        <ImportUpload
          file={file}
          busy={busy}
          error={error}
          onPick={(picked) => {
            setFile(picked)
            setError(null)
          }}
          onContinue={handleContinue}
          onCancel={() => navigate('/')}
        />
      )}

      {step.name === 'review' && (
        <ImportReview
          items={step.preview.items}
          counts={step.preview.counts}
          selected={selected}
          busy={busy}
          error={error}
          onToggle={handleToggle}
          onImport={handleImport}
          onCancel={() => {
            setError(null)
            setStep({ name: 'upload' })
          }}
        />
      )}

      {step.name === 'summary' && (
        <ImportSummary summary={step.summary} onDone={() => navigate('/')} />
      )}
    </div>
  )
}
