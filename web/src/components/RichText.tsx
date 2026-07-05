import { Fragment, type ReactNode } from 'react'
import { parseHeading, parseInline } from '../lib/inline'

/**
 * Read-only rendering of the inline Markdown subset (E8-S9): bold / italic /
 * headings, shown WITHOUT their markers — the formatted note looks the same
 * on the board card, in a version preview, and in the locked read-only
 * editor. Semantic elements (`<strong>`, `<em>`, `<h1>`–`<h3>`) for a11y.
 */

/** One line of text with `**bold**` / `*italic*` runs resolved. */
export function InlineText({ text }: { text: string }) {
  return (
    <>
      {parseInline(text).map((segment, i) =>
        segment.kind === 'bold' ? (
          <strong key={i}>{segment.text}</strong>
        ) : segment.kind === 'italic' ? (
          <em key={i}>{segment.text}</em>
        ) : (
          <Fragment key={i}>{segment.text}</Fragment>
        ),
      )}
    </>
  )
}

interface RichBlockTextProps {
  /** A paragraph block's raw text (may span several lines). */
  text: string
  /** Class applied to each plain paragraph run. */
  paragraphClass?: string
  /**
   * `semantic` emits real `<h1>`–`<h3>` (version preview, read-only editor);
   * `visual` keeps headings as styled `<p>` so a card preview doesn't inject
   * document headings above its own `<h2>` title.
   */
  headings?: 'semantic' | 'visual'
}

/** A paragraph block rendered rich: heading lines split out, inline runs resolved. */
export function RichBlockText({ text, paragraphClass, headings = 'semantic' }: RichBlockTextProps) {
  const out: ReactNode[] = []
  let run: string[] = []

  const flushRun = () => {
    if (run.length === 0) return
    out.push(
      <p key={out.length} className={paragraphClass}>
        {run.map((line, i) => (
          <Fragment key={i}>
            {i > 0 && '\n'}
            <InlineText text={line} />
          </Fragment>
        ))}
      </p>,
    )
    run = []
  }

  for (const line of text.split('\n')) {
    const heading = parseHeading(line)
    if (heading === null) {
      run.push(line)
      continue
    }
    flushRun()
    const headingClass = `kp-rich__h kp-rich__h${heading.level}`
    if (headings === 'semantic') {
      const Tag = `h${heading.level}` as 'h1' | 'h2' | 'h3'
      out.push(
        <Tag key={out.length} className={headingClass}>
          <InlineText text={heading.text} />
        </Tag>,
      )
    } else {
      out.push(
        <p key={out.length} className={`${paragraphClass ?? ''} ${headingClass}`.trim()}>
          <InlineText text={heading.text} />
        </p>,
      )
    }
  }
  flushRun()
  return <>{out}</>
}
