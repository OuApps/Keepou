/**
 * Minimal Markdown → card-preview parser (E3-S6, E8-S9).
 *
 * Just enough GFM for the board card: `- [ ]` / `- [x]` lines become read-only
 * checklist rows, `# ` / `## ` / `### ` lines become heading blocks (E8-S9's
 * bounded subset), everything else stays text (blank lines split paragraphs).
 * The full round-trip serializer is `lib/markdown.ts` (mirror of `buildMd`, E4);
 * this lighter parser keeps the card render cheap. Inline bold/italic runs are
 * resolved at render time (`components/RichText.tsx`).
 */

import { parseHeading } from './inline'

export type PreviewBlock =
  | { type: 'text'; text: string }
  | { type: 'heading'; level: 1 | 2 | 3; text: string }
  | { type: 'check'; checked: boolean; text: string }

const CHECKBOX_LINE = /^-\s\[([ xX])\]\s?(.*)$/

export function parsePreview(body: string): PreviewBlock[] {
  const blocks: PreviewBlock[] = []
  let paragraph: string[] = []

  const flush = () => {
    if (paragraph.length > 0) {
      blocks.push({ type: 'text', text: paragraph.join(' ') })
      paragraph = []
    }
  }

  for (const line of body.split('\n')) {
    const match = CHECKBOX_LINE.exec(line)
    const heading = match === null ? parseHeading(line) : null
    if (match) {
      flush()
      blocks.push({ type: 'check', checked: match[1] !== ' ', text: match[2] })
    } else if (heading !== null) {
      flush()
      blocks.push({ type: 'heading', level: heading.level, text: heading.text })
    } else if (line.trim() === '') {
      flush()
    } else {
      paragraph.push(line.trim())
    }
  }
  flush()
  return blocks
}
