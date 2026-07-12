import type { NoteVersionOut } from '../../api/versions'
import { parse } from '../../lib/markdown'
import { useI18n } from '../../i18n'
import { formatVersionMoment } from '../../lib/time'
import { RichBlockText } from '../RichText'

/**
 * Read-only re-render of a version snapshot (E6): the exact content — title,
 * paragraphs, checkboxes — as it was, with NO visual diff (claude.md §3).
 * Checkboxes are drawn (not interactive): the preview is never editable.
 */
export function VersionPreview({
  version,
  isCurrent,
}: {
  version: NoteVersionOut
  isCurrent: boolean
}) {
  const { EDITOR_COPY, HISTORY_COPY } = useI18n()
  const blocks = parse(version.body)
  return (
    <div className="kp-vpreview">
      <h2 className="kp-vpreview__title">{version.title || EDITOR_COPY.untitled}</h2>
      <p className="kp-vpreview__meta">
        {isCurrent
          ? HISTORY_COPY.currentMeta(version.author_name)
          : HISTORY_COPY.versionMeta(version.author_name)}{' '}
        · {formatVersionMoment(version.created_at)}
      </p>
      <div className="kp-vpreview__blocks">
        {blocks.map((block, i) =>
          block.type === 'text' ? (
            <div key={i} className="kp-vpreview__rich">
              <RichBlockText text={block.text} paragraphClass="kp-vpreview__text" />
            </div>
          ) : (
            <div key={i} className="kp-vpreview__row">
              <span
                className={`kp-vpreview__box${block.checked ? ' kp-vpreview__box--done' : ''}`}
                aria-hidden="true"
              />
              <span
                className={`kp-vpreview__label${block.checked ? ' kp-vpreview__label--done' : ''}`}
              >
                {block.text}
              </span>
            </div>
          ),
        )}
      </div>
    </div>
  )
}
