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

/**
 * Parse a stored Markdown body back into blocks (tolerant of what we emit).
 *
 * Blank lines between two text lines stay INSIDE a single text block: the
 * editing surface then shows the user's empty lines exactly as typed (they
 * used to be re-split into separate blocks, whose smaller visual gap read as
 * « mes sauts de ligne ont disparu »), and a selection can span the whole
 * run of paragraphs. Blank lines adjacent to a checkbox group remain the
 * separator `serialize` re-emits, so the round-trip is unchanged.
 */
export function parse(body: string): Block[] {
  const blocks: Block[] = []
  let paragraph: string[] = []

  const flush = () => {
    // Leading/trailing blank lines are group separators, not paragraph content.
    while (paragraph.length > 0 && paragraph[0].trim() === '') paragraph.shift()
    while (paragraph.length > 0 && paragraph[paragraph.length - 1].trim() === '') paragraph.pop()
    if (paragraph.length > 0) {
      // Storage never holds 2+ consecutive blank lines (serialize collapses
      // them); normalize hand-written/imported bodies the same way.
      const text = paragraph.join('\n').replace(/\n{3,}/g, '\n\n')
      blocks.push({ type: 'text', text })
      paragraph = []
    }
  }

  for (const line of body.split('\n')) {
    const match = CHECKBOX_LINE.exec(line)
    if (match) {
      flush()
      blocks.push({ type: 'check', checked: match[1] !== ' ', text: match[2] })
    } else {
      paragraph.push(line)
    }
  }
  flush()
  return blocks
}
