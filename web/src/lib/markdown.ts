/**
 * Blocks ⇄ GFM Markdown (E4-S2) — grown from the mockups' `buildMd`
 * (`design/Keepou - Éditeur canonique.dc.html`): paragraphs as plain text,
 * checkboxes as GFM task-list lines, a blank line between a paragraph and a
 * group of boxes. The title lives in its own column and is never embedded in
 * the body — `'# ' + title + '\n\n' + serialize(blocks)` reproduces `buildMd`.
 *
 * Blank-line policy (field feedback round 3 — it relaxes HANDOFF §3.3's
 * « never more than one consecutive blank line »): what the user types is
 * preserved VERBATIM, including empty lines between two checkbox groups.
 * The only convention kept from `buildMd` is the single separator blank line
 * that `serialize` adds at a paragraph ⇄ box-group boundary and `parse`
 * removes again — so every previously stored body reads unchanged:
 *
 * - a *blank-only* text block (the user's empty lines) is emitted with NO
 *   surrounding separators — the blank lines ARE the separation;
 * - `parse` turns a run of blank lines BETWEEN two box lines back into that
 *   blank-only text block, and otherwise strips exactly ONE blank line
 *   adjacent to a box group (the separator), keeping the rest as content.
 */

export type Block =
  { type: 'text'; text: string } | { type: 'check'; checked: boolean; text: string }

const CHECKBOX_LINE = /^-\s\[([ xX])\]\s?(.*)$/

/** Serialize the ordered block flow into the stored Markdown body. */
export function serialize(blocks: Block[]): string {
  const lines: string[] = []
  // The last *structural* block emitted; blank-only text blocks don't count
  // (they are their own separation and must not attract separators).
  let prev: 'none' | 'text' | 'check' = 'none'
  for (const block of blocks) {
    if (block.type === 'check') {
      if (prev === 'text') lines.push('')
      lines.push((block.checked ? '- [x] ' : '- [ ] ') + block.text)
      prev = 'check'
    } else {
      const blockLines = block.text.split('\n')
      if (blockLines.every((line) => line.trim() === '')) {
        lines.push(...blockLines)
      } else {
        if (prev !== 'none') lines.push('')
        lines.push(...blockLines)
        prev = 'text'
      }
    }
  }
  // Blank lines at the body edges carry nothing — a note never starts or ends
  // with empty lines once stored.
  while (lines.length > 0 && lines[0].trim() === '') lines.shift()
  while (lines.length > 0 && lines[lines.length - 1].trim() === '') lines.pop()
  return lines.join('\n')
}

/** Parse a stored Markdown body back into blocks (tolerant of what we emit). */
export function parse(body: string): Block[] {
  const blocks: Block[] = []
  let run: string[] = []

  const flush = (beforeCheck: boolean) => {
    if (run.length === 0) return
    const afterCheck = blocks.length > 0 && blocks[blocks.length - 1].type === 'check'
    let lines = run
    run = []
    if (lines.every((line) => line.trim() === '')) {
      // Blank lines BETWEEN two box groups are the user's empty lines (kept);
      // at the body edges they are noise (serialize strips them anyway).
      if (afterCheck && beforeCheck) {
        blocks.push({ type: 'text', text: lines.map(() => '').join('\n') })
      }
      return
    }
    // Exactly one blank line adjacent to a box group is the serializer's
    // separator; any further blank lines are the user's own.
    if (afterCheck && lines[0].trim() === '') lines = lines.slice(1)
    if (beforeCheck && lines[lines.length - 1].trim() === '') lines = lines.slice(0, -1)
    // Body-edge blank lines are noise, as in serialize.
    if (!afterCheck) while (lines.length > 0 && lines[0].trim() === '') lines.shift()
    if (!beforeCheck) while (lines.length > 0 && lines[lines.length - 1].trim() === '') lines.pop()
    blocks.push({ type: 'text', text: lines.join('\n') })
  }

  for (const line of body.split('\n')) {
    const match = CHECKBOX_LINE.exec(line)
    if (match) {
      flush(true)
      blocks.push({ type: 'check', checked: match[1] !== ' ', text: match[2] })
    } else {
      run.push(line)
    }
  }
  flush(false)
  return blocks
}
