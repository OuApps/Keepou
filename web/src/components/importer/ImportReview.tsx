import type { ImportCounts, ImportPreviewItem } from '../../api/importKeep'
import { SHADE_CLASS } from '../../lib/colors'
import { useI18n } from '../../i18n'
import { parsePreview } from '../../lib/preview'
import { formatImportDate } from '../../lib/time'

/**
 * Import step 2 (E10-S3) — the review/selection grid (« mode tunnel »),
 * faithful to `Keepou - Import Keep.dc.html`: every parsed note is a checkable
 * card in its mapped shade (real `<input type=checkbox>` — a11y), unchecked
 * cards dim to ~40%, trashed ones arrive pre-unchecked with a « Corbeille »
 * chip, and the sticky bottom bar carries the live count + the import action.
 */

function TickIcon({ stroke }: { stroke: string }) {
  return (
    <svg width="13" height="13" viewBox="0 0 20 20" aria-hidden="true">
      <path
        d="M4 10.5 8.5 15 16 6"
        fill="none"
        stroke={stroke}
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function ReviewCard({
  item,
  checked,
  onToggle,
}: {
  item: ImportPreviewItem
  checked: boolean
  onToggle: (index: number, checked: boolean) => void
}) {
  const { IMPORT_COPY: COPY } = useI18n()
  const blocks = parsePreview(item.body)

  return (
    <label className="kp-imp__card">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onToggle(item.index, e.target.checked)}
        aria-label={item.title || COPY.untitled}
      />
      <span className={`kp-imp__face ${SHADE_CLASS[item.color]}`}>
        <span className="kp-imp__tick" aria-hidden="true">
          <TickIcon stroke="var(--surface)" />
        </span>
        {item.title !== '' && <span className="kp-imp__cardtitle">{item.title}</span>}
        {blocks.length > 0 && (
          <span className="kp-note__body" style={{ display: 'block' }}>
            {blocks.map((block, i) =>
              block.type === 'check' ? (
                <span key={i} className="kp-note__check">
                  <span
                    className={`kp-note__box${block.checked ? ' kp-note__box--checked' : ''}`}
                    aria-hidden="true"
                  />
                  <span className={block.checked ? 'kp-note__done' : undefined}>{block.text}</span>
                </span>
              ) : (
                <span key={i} className="kp-note__text" style={{ display: 'block' }}>
                  {block.text}
                </span>
              ),
            )}
          </span>
        )}
        <span className="kp-imp__meta">
          <span className="kp-imp__date">{formatImportDate(item.created_at)}</span>
          {item.is_trashed && <span className="kp-imp__chip">{COPY.trashChip}</span>}
        </span>
      </span>
    </label>
  )
}

export function ImportReview({
  items,
  counts,
  selected,
  busy,
  error,
  onToggle,
  onImport,
  onCancel,
}: {
  items: ImportPreviewItem[]
  counts: ImportCounts
  selected: ReadonlySet<number>
  busy: boolean
  error: string | null
  onToggle: (index: number, checked: boolean) => void
  onImport: () => void
  onCancel: () => void
}) {
  const { IMPORT_COPY: COPY } = useI18n()
  const count = selected.size

  return (
    <>
      <p className="kp-imp__info">
        <b>{COPY.found(items.length)}</b> {COPY.foundSuffix}
        {counts.parse_failed > 0 && <> · {COPY.unreadable(counts.parse_failed)}</>}.{' '}
        {COPY.privateNote}
      </p>

      <div className="kp-imp__grid">
        {items.map((item) => (
          <ReviewCard
            key={item.index}
            item={item}
            checked={selected.has(item.index)}
            onToggle={onToggle}
          />
        ))}
      </div>

      {error !== null && (
        <p className="kp-imp__error kp-imp__info" role="alert">
          {error}
        </p>
      )}

      <div className="kp-imp__foot">
        <span className="kp-imp__count" role="status">
          {COPY.selectedCount(count, items.length)}
        </span>
        <div className="kp-imp__footactions">
          <button type="button" className="kp-imp__ghost" onClick={onCancel}>
            {COPY.cancel}
          </button>
          <button
            type="button"
            className="kp-btn"
            disabled={count === 0 || busy}
            onClick={onImport}
          >
            {busy ? COPY.importing : COPY.importN(count)}
          </button>
        </div>
      </div>
    </>
  )
}
