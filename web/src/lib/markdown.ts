/**
 * Blocks ⇄ GFM Markdown (E4-S2) — faithful mirror of the mockups' `buildMd`
 * (`design/Keepou - Éditeur canonique.dc.html`): paragraphs as plain text,
 * checkboxes as GFM task-list lines, a blank line between a paragraph and a
 * group of boxes, never more than one consecutive blank line (HANDOFF §3.3).
 * The title lives in its own column and is never embedded in the body —
 * `'# ' + title + '\n\n' + serialize(blocks)` reproduces `buildMd` exactly.
 */

export type Block =
  { type: 'text'; text: string } | { type: 'check'; checked: boolean; text: string }

const CHECKBOX_LINE = /^-\s\[([ xX])\]\s?(.*)$/

/** Serialize the ordered block flow into the stored Markdown body. */
export function serialize(blocks: Block[]): string {
  const lines: string[] = []
  let prevCheck = false
  blocks.forEach((block, i) => {
    if (block.type === 'check') {
      if (i > 0 && !prevCheck) lines.push('')
      lines.push((block.checked ? '- [x] ' : '- [ ] ') + block.text)
      prevCheck = true
    } else {
      if (i > 0) lines.push('')
      lines.push(block.text)
      prevCheck = false
    }
  })
  return lines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\n+|\n+$/g, '')
}

/** Parse a stored Markdown body back into blocks (tolerant of what we emit). */
export function parse(body: string): Block[] {
  const blocks: Block[] = []
  let paragraph: string[] = []

  const flush = () => {
    if (paragraph.length > 0) {
      blocks.push({ type: 'text', text: paragraph.join('\n') })
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
      paragraph.push(line)
    }
  }
  flush()
  return blocks
}
