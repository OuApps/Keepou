/**
 * Minimal Markdown → card-preview parser (E3-S6).
 *
 * Just enough GFM for the board card: `- [ ]` / `- [x]` lines become read-only
 * checklist rows, everything else stays text (blank lines split paragraphs).
 * The full round-trip serializer (`lib/markdown.ts`, mirror of `buildMd`)
 * arrives with the editor in E4.
 */

export type PreviewBlock =
  { type: 'text'; text: string } | { type: 'check'; checked: boolean; text: string }

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
    if (match) {
      flush()
      blocks.push({ type: 'check', checked: match[1] !== ' ', text: match[2] })
    } else if (line.trim() === '') {
      flush()
    } else {
      paragraph.push(line.trim())
    }
  }
  flush()
  return blocks
}
