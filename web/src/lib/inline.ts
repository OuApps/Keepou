/**
 * Inline Markdown subset (E8-S9) — deliberately bounded, per the story:
 * bold `**texte**`, italic `*texte*`, and heading lines `# ` / `## ` / `### `.
 * Everything else (links, code, `_underscore_`, tables…) stays literal text —
 * this is NOT full GFM. Checkbox lines (`- [ ]` / `- [x]`) are handled by the
 * block layer (`lib/markdown.ts`, `lib/preview.ts`) and never reach here.
 *
 * Parsing is pure and lossless: a segment's `raw` slice always concatenates
 * back to the input, so the editing surface can show the markers (dimmed)
 * while the read-only surfaces hide them — the stored body stays plain GFM.
 */

export type InlineSegment =
  | { kind: 'plain'; text: string; raw: string }
  | { kind: 'bold'; text: string; raw: string }
  | { kind: 'italic'; text: string; raw: string }

export interface HeadingLine {
  level: 1 | 2 | 3
  /** The `#`/`##`/`###` prefix including its trailing space. */
  marker: string
  text: string
}

// `**…**` first (so `**` is never read as two italic stars), then `*…*`.
// Content must be non-empty and star-free — anything unmatched stays literal.
const BOLD = /\*\*([^*]+)\*\*/
const ITALIC = /\*([^*]+)\*/
const HEADING = /^(#{1,3}) (.*)$/

/** Split one line of text into plain / bold / italic segments. */
export function parseInline(line: string): InlineSegment[] {
  const segments: InlineSegment[] = []

  const emitPlainOrItalic = (chunk: string) => {
    let rest = chunk
    for (;;) {
      const match = ITALIC.exec(rest)
      if (match === null) break
      if (match.index > 0) {
        const before = rest.slice(0, match.index)
        segments.push({ kind: 'plain', text: before, raw: before })
      }
      segments.push({ kind: 'italic', text: match[1], raw: match[0] })
      rest = rest.slice(match.index + match[0].length)
    }
    if (rest !== '') segments.push({ kind: 'plain', text: rest, raw: rest })
  }

  let rest = line
  for (;;) {
    const match = BOLD.exec(rest)
    if (match === null) break
    if (match.index > 0) emitPlainOrItalic(rest.slice(0, match.index))
    segments.push({ kind: 'bold', text: match[1], raw: match[0] })
    rest = rest.slice(match.index + match[0].length)
  }
  if (rest !== '') emitPlainOrItalic(rest)
  return segments
}

/** Recognize a `# ` / `## ` / `### ` heading line (levels 1–3 only). */
export function parseHeading(line: string): HeadingLine | null {
  const match = HEADING.exec(line)
  if (match === null) return null
  return {
    level: match[1].length as 1 | 2 | 3,
    marker: `${match[1]} `,
    text: match[2],
  }
}
