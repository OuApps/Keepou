import { useEffect, useRef } from 'react'
import { useI18n } from '../../i18n'
import { caretOffset, setCaret } from '../../lib/caret'
import { RichBlockText } from '../RichText'
import { blockId, type EditorBlock } from './blocks'
import { MarkdownArea } from './MarkdownArea'

/**
 * The mixed editing surface (E4-S4): an ordered flow of paragraphs and
 * checkboxes, faithful to `Keepou - Éditeur canonique.dc.html`. Boxes are real
 * `<input type=checkbox>` (HANDOFF §8); the « Insérer une case à cocher »
 * affordance sits at the BOTTOM of the flow (§3.3) but inserts at the caret,
 * so a box can land between two lines of an existing paragraph. Typing `[]`,
 * `[x]` or `- [ ]` at the start of a line converts it into a real box in
 * place. Enter in a non-empty box inserts the next one; Enter in an EMPTY box
 * (the second consecutive line break) exits the checklist into a normal text
 * paragraph (E8-S10, Keep-like). Backspace at the start of a block and Suppr
 * at its end merge with the neighboring block (they used to do nothing).
 * Paragraphs are Markdown-aware (E8-S9): bold / italic / headings take
 * effect as typed, and render formatted (markers hidden) in read-only mode.
 */

/** A typed checkbox line: `- [ ] x`, `- [x] x`, or the `[]` / `[x]` shorthand. */
const CHECKBOX_TYPED = /^(?:-\s?)?\[([ xX]?)\]\s?(.*)$/

type Piece = { type: 'text'; text: string } | { type: 'check'; checked: boolean; text: string }

/**
 * Split a paragraph whose lines contain typed checkbox syntax into
 * text/check pieces, or return null when there is nothing to convert.
 * Blank lines around a converted box are separators, not content.
 */
function explodeChecks(text: string): Piece[] | null {
  const lines = text.split('\n')
  if (!lines.some((line) => CHECKBOX_TYPED.test(line))) return null
  const pieces: Piece[] = []
  let run: string[] = []
  const flushRun = () => {
    while (run.length > 0 && run[0].trim() === '') run.shift()
    while (run.length > 0 && run[run.length - 1].trim() === '') run.pop()
    if (run.length > 0) pieces.push({ type: 'text', text: run.join('\n') })
    run = []
  }
  for (const line of lines) {
    const match = CHECKBOX_TYPED.exec(line)
    if (match !== null) {
      flushRun()
      pieces.push({ type: 'check', checked: match[1].toLowerCase() === 'x', text: match[2] })
    } else {
      run.push(line)
    }
  }
  flushRun()
  return pieces
}

/** Focus request: a block plus where the caret should land inside it. */
interface FocusTarget {
  id: string
  caret?: number | 'end'
}

interface BlockListProps {
  blocks: EditorBlock[]
  onChange: (blocks: EditorBlock[]) => void
  /** Immediate save on blur (E4-S6). */
  onFlush: () => void
  /** Read-only mode (E5): fields disabled, no checkbox insertion. */
  readOnly?: boolean
}

export function BlockList({ blocks, onChange, onFlush, readOnly = false }: BlockListProps) {
  const { EDITOR_COPY } = useI18n()
  const rootRef = useRef<HTMLDivElement>(null)
  // Focus follows a freshly inserted box (or the surviving side of a merge).
  const pendingFocus = useRef<FocusTarget | null>(null)
  // The block (and caret) that was focused when the insert button was pressed —
  // captured on pointerdown, before the button steals the focus.
  const insertOrigin = useRef<{ id: string; caret: number | null } | null>(null)

  useEffect(() => {
    const target = pendingFocus.current
    if (target === null) return
    pendingFocus.current = null
    const el = rootRef.current?.querySelector<HTMLElement>(`[data-block="${target.id}"]`)
    if (el === undefined || el === null) return
    el.focus()
    if (target.caret === undefined) return
    if (el instanceof HTMLInputElement) {
      const at = target.caret === 'end' ? el.value.length : Math.min(target.caret, el.value.length)
      el.setSelectionRange(at, at)
    } else {
      const length = (el.textContent ?? '').length
      setCaret(el, target.caret === 'end' ? length : Math.min(target.caret, length))
    }
  })

  const replace = (index: number, next: EditorBlock) => {
    onChange(blocks.map((block, i) => (i === index ? next : block)))
  }

  const splice = (index: number, remove: number, ...pieces: EditorBlock[]) => {
    const next = [...blocks.slice(0, index), ...pieces, ...blocks.slice(index + remove)]
    // Never leave the note without a surface to type into (mirrors `draftOf`).
    onChange(next.length > 0 ? next : [{ id: blockId(), type: 'text', text: '' }])
  }

  /**
   * A paragraph edit: if one of its lines is now a typed checkbox (`[]`,
   * `[x]`, `- [ ]`…), convert it into a real box right where the line is —
   * the reported blocker was « impossible d'ajouter une case entre deux
   * lignes de texte ».
   */
  const changeText = (index: number, text: string) => {
    const block = blocks[index]
    if (block.type !== 'text') return
    const pieces = explodeChecks(text)
    if (pieces === null) {
      replace(index, { ...block, text })
      return
    }
    let focus: FocusTarget | null = null
    const withIds: EditorBlock[] = pieces.map((piece, i) => {
      // The leading text piece keeps the block's id (its surface stays mounted).
      const id = i === 0 && piece.type === 'text' ? block.id : blockId()
      if (piece.type === 'check') focus = { id, caret: 'end' }
      return { ...piece, id }
    })
    pendingFocus.current = focus
    splice(index, 1, ...withIds)
  }

  const insertCheckAt = (index: number) => {
    const id = blockId()
    pendingFocus.current = { id }
    splice(index, 0, { id, type: 'check', checked: false, text: '' })
  }

  /** Where the insert button should act: remembered before the click blurs the field. */
  const captureInsertOrigin = () => {
    const active = document.activeElement
    const id = active instanceof HTMLElement ? active.getAttribute('data-block') : null
    if (id === null || active === null) {
      insertOrigin.current = null
      return
    }
    const caret =
      active instanceof HTMLInputElement
        ? active.selectionStart
        : caretOffset(active as HTMLElement)
    insertOrigin.current = { id, caret }
  }

  /**
   * « Insérer une case à cocher »: at the caret when a block was focused —
   * splitting the paragraph in two around the new box — at the bottom
   * otherwise (the affordance itself stays at the bottom, HANDOFF §3.3).
   */
  const insertCheck = () => {
    const origin = insertOrigin.current
    insertOrigin.current = null
    const index = origin === null ? -1 : blocks.findIndex((block) => block.id === origin.id)
    if (origin === null || index === -1) {
      insertCheckAt(blocks.length)
      return
    }
    const block = blocks[index]
    if (block.type === 'check') {
      insertCheckAt(index + 1)
      return
    }
    const caret = origin.caret ?? block.text.length
    // The newline(s) around the split point separated the halves; the new box
    // takes that role.
    const before = block.text.slice(0, caret).replace(/\n+$/, '')
    const after = block.text.slice(caret).replace(/^\n+/, '')
    const id = blockId()
    pendingFocus.current = { id }
    const pieces: EditorBlock[] = []
    if (before !== '') pieces.push({ ...block, text: before })
    pieces.push({ id, type: 'check', checked: false, text: '' })
    if (after !== '') pieces.push({ id: blockId(), type: 'text', text: after })
    splice(index, 1, ...pieces)
  }

  /**
   * Enter inside a box label (Keep-like): the text after the caret moves into
   * a fresh box below (a selection is dropped); the ticked state stays with
   * the top half.
   */
  const splitCheckAt = (index: number, start: number, end: number) => {
    const block = blocks[index]
    if (block.type !== 'check') return
    const id = blockId()
    pendingFocus.current = { id, caret: 0 }
    splice(
      index,
      1,
      { ...block, text: block.text.slice(0, start) },
      { id, type: 'check', checked: false, text: block.text.slice(end) },
    )
  }

  const removeAt = (index: number) => {
    const prev = blocks[index - 1]
    pendingFocus.current = prev !== undefined ? { id: prev.id, caret: 'end' } : null
    splice(index, 1)
  }

  // Two line breaks exit the checklist (E8-S10): the empty box becomes a
  // normal paragraph, focus moves into it.
  const exitChecklistAt = (index: number) => {
    const id = blockId()
    pendingFocus.current = { id }
    onChange(blocks.map((block, i) => (i === index ? { id, type: 'text', text: '' } : block)))
  }

  /**
   * Move the caret into the block above/below (arrow keys at a block's edge).
   * `column` keeps the horizontal position on up/down, Keep-like; left/right
   * land at the end/start of the neighbor. Returns false when there is no
   * neighbor — the caller then keeps the native key behavior.
   */
  const navigateFrom = (
    index: number,
    dir: 'up' | 'down' | 'left' | 'right',
    column: number,
  ): boolean => {
    const target = blocks[index + (dir === 'up' || dir === 'left' ? -1 : 1)]
    if (target === undefined) return false
    const el = rootRef.current?.querySelector<HTMLElement>(`[data-block="${target.id}"]`)
    if (el === undefined || el === null) return false
    el.focus()
    if (el instanceof HTMLInputElement) {
      const at =
        dir === 'left' ? el.value.length : dir === 'right' ? 0 : Math.min(column, el.value.length)
      el.setSelectionRange(at, at)
      return true
    }
    const text = target.type === 'text' ? target.text : ''
    let at: number
    if (dir === 'left') at = text.length
    else if (dir === 'right') at = 0
    else if (dir === 'up') {
      // Entering from below: land on the LAST line, same column.
      const base = text.lastIndexOf('\n') + 1
      at = Math.min(base + column, text.length)
    } else {
      // Entering from above: land on the FIRST line, same column.
      const firstBreak = text.indexOf('\n')
      at = Math.min(column, firstBreak === -1 ? text.length : firstBreak)
    }
    setCaret(el, at)
    return true
  }

  /** Backspace at the very start of paragraph `index`: merge into the previous block. */
  const mergeTextBack = (index: number) => {
    const cur = blocks[index]
    const prev = blocks[index - 1]
    if (cur.type !== 'text' || prev === undefined) return
    if (cur.text === '') {
      removeAt(index)
      return
    }
    if (prev.type === 'text') {
      if (prev.text === '') {
        pendingFocus.current = { id: cur.id, caret: 0 }
        splice(index - 1, 1)
        return
      }
      pendingFocus.current = { id: prev.id, caret: prev.text.length + 1 }
      splice(index - 1, 2, { ...prev, text: `${prev.text}\n${cur.text}` })
      return
    }
    // Previous block is a checkbox: its label absorbs the paragraph's first line.
    const [first, ...rest] = cur.text.split('\n')
    while (rest.length > 0 && rest[0].trim() === '') rest.shift()
    pendingFocus.current = { id: prev.id, caret: prev.text.length }
    const merged: EditorBlock = { ...prev, text: prev.text + first }
    if (rest.length > 0) splice(index - 1, 2, merged, { ...cur, text: rest.join('\n') })
    else splice(index - 1, 2, merged)
  }

  /** Suppr at the very end of paragraph `index`: pull the next block in. */
  const mergeTextForward = (index: number) => {
    const cur = blocks[index]
    const next = blocks[index + 1]
    if (cur.type !== 'text' || next === undefined) return
    if (next.type === 'text') {
      const text = cur.text === '' ? next.text : `${cur.text}\n${next.text}`
      pendingFocus.current = { id: cur.id, caret: cur.text.length }
      splice(index, 2, { ...cur, text })
      return
    }
    // Next block is a checkbox: its label joins the paragraph's last line.
    pendingFocus.current = { id: cur.id, caret: cur.text.length }
    splice(index, 2, { ...cur, text: cur.text + next.text })
  }

  /** Backspace at position 0 of checkbox label `index`. */
  const mergeLabelBack = (index: number) => {
    const cur = blocks[index]
    if (cur.type !== 'check') return
    if (cur.text === '') {
      removeAt(index)
      return
    }
    const prev = blocks[index - 1]
    if (prev === undefined) {
      // No block above: the box disappears, its label becomes a paragraph.
      const id = blockId()
      pendingFocus.current = { id, caret: 0 }
      splice(index, 1, { id, type: 'text', text: cur.text })
      return
    }
    if (prev.type === 'check') {
      pendingFocus.current = { id: prev.id, caret: prev.text.length }
      splice(index - 1, 2, { ...prev, text: prev.text + cur.text })
      return
    }
    const text = prev.text === '' ? cur.text : `${prev.text}\n${cur.text}`
    pendingFocus.current = { id: prev.id, caret: prev.text === '' ? 0 : prev.text.length + 1 }
    splice(index - 1, 2, { ...prev, text })
  }

  /** Suppr at the end of checkbox label `index`: pull the next block in. */
  const mergeLabelForward = (index: number) => {
    const cur = blocks[index]
    const next = blocks[index + 1]
    if (cur.type !== 'check' || next === undefined) return
    if (next.type === 'check') {
      pendingFocus.current = { id: cur.id, caret: cur.text.length }
      splice(index, 2, { ...cur, text: cur.text + next.text })
      return
    }
    const [first, ...rest] = next.text.split('\n')
    while (rest.length > 0 && rest[0].trim() === '') rest.shift()
    pendingFocus.current = { id: cur.id, caret: cur.text.length }
    const merged: EditorBlock = { ...cur, text: cur.text + first }
    if (rest.length > 0) splice(index, 2, merged, { ...next, text: rest.join('\n') })
    else splice(index, 2, merged)
  }

  // Bulk-clear every ticked box (E11-S6): once at least one item is done, a
  // single action drops them all. Recoverable via history (the pre-clear state
  // stays in the previous version), so no confirmation — Keep-like. Save right
  // away (like a checkbox toggle) instead of waiting for the debounce. If the
  // note ends up empty, keep an empty paragraph so there is still a surface to
  // type into (mirrors `draftOf`). The button stays mounted as long as the
  // note has boxes (disabled when none is ticked) — it used to appear/vanish,
  // read as « le bouton est parfois absent ».
  const hasCheck = blocks.some((block) => block.type === 'check')
  const hasChecked = blocks.some((block) => block.type === 'check' && block.checked)

  const clearChecked = () => {
    const kept = blocks.filter((block) => !(block.type === 'check' && block.checked))
    onChange(kept.length > 0 ? kept : [{ id: blockId(), type: 'text', text: '' }])
    onFlush()
  }

  return (
    <div className="kp-blocks" ref={rootRef}>
      {blocks.map((block, i) =>
        block.type === 'text' ? (
          readOnly ? (
            <div key={block.id} className="kp-blocks__text kp-blocks__text--static">
              <RichBlockText text={block.text} />
            </div>
          ) : (
            <MarkdownArea
              key={block.id}
              blockKey={block.id}
              value={block.text}
              placeholder={
                blocks.length === 1 && block.text === ''
                  ? EDITOR_COPY.paragraphPlaceholder
                  : undefined
              }
              onChange={(text) => changeText(i, text)}
              onFlush={onFlush}
              onMergeBack={() => mergeTextBack(i)}
              onMergeForward={() => mergeTextForward(i)}
              onNavigate={(dir, column) => navigateFrom(i, dir, column)}
            />
          )
        ) : (
          <div key={block.id} className="kp-blocks__row">
            <input
              type="checkbox"
              className="kp-blocks__box"
              checked={block.checked}
              aria-label={block.text === '' ? EDITOR_COPY.checkboxLabel : block.text}
              disabled={readOnly}
              onChange={(e) => replace(i, { ...block, checked: e.target.checked })}
              onBlur={onFlush}
            />
            <input
              type="text"
              data-block={block.id}
              className={`kp-blocks__label${block.checked ? ' kp-blocks__label--done' : ''}`}
              value={block.text}
              placeholder={readOnly ? undefined : EDITOR_COPY.checkboxItemPlaceholder}
              aria-label={EDITOR_COPY.checkboxItemLabel}
              disabled={readOnly}
              onChange={(e) => replace(i, { ...block, text: e.target.value })}
              onBlur={onFlush}
              onKeyDown={(e) => {
                const input = e.currentTarget
                // Shift+Enter is the editor's save shortcut (E11-S3), not a
                // new checkbox — leave it for the editor's capture handler.
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  const at = input.selectionStart ?? block.text.length
                  const end = input.selectionEnd ?? at
                  if (block.text === '') exitChecklistAt(i)
                  else if (at === block.text.length && end === at) insertCheckAt(i + 1)
                  else splitCheckAt(i, at, end)
                  return
                }
                if (e.shiftKey || e.altKey || e.ctrlKey || e.metaKey) return
                const caret = input.selectionStart ?? 0
                const collapsed = input.selectionEnd === input.selectionStart
                if (e.key === 'Backspace' && collapsed && caret === 0) {
                  e.preventDefault()
                  mergeLabelBack(i)
                } else if (e.key === 'Delete' && collapsed && caret === block.text.length) {
                  e.preventDefault()
                  mergeLabelForward(i)
                } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                  // Single-line inputs ignore ↑/↓ — walk the block flow instead
                  // (the reported dead arrow navigation between two boxes).
                  if (navigateFrom(i, e.key === 'ArrowUp' ? 'up' : 'down', caret))
                    e.preventDefault()
                } else if (e.key === 'ArrowLeft' && collapsed && caret === 0) {
                  if (navigateFrom(i, 'left', 0)) e.preventDefault()
                } else if (e.key === 'ArrowRight' && collapsed && caret === block.text.length) {
                  if (navigateFrom(i, 'right', 0)) e.preventDefault()
                }
              }}
            />
          </div>
        ),
      )}

      {!readOnly && (
        <div className="kp-blocks__foot">
          <button
            type="button"
            className="kp-blocks__insert"
            onPointerDown={captureInsertOrigin}
            onClick={insertCheck}
          >
            <span className="kp-blocks__insert-box" aria-hidden="true">
              +
            </span>
            {EDITOR_COPY.insertCheckbox}
          </button>
          {hasCheck && (
            <button
              type="button"
              className="kp-blocks__clear"
              disabled={!hasChecked}
              onClick={clearChecked}
            >
              <svg width="16" height="16" viewBox="0 0 20 20" aria-hidden="true">
                <path
                  d="M4 6 H16 M8 6 V4.5 H12 V6 M6.5 6 L7.2 16.5 H12.8 L13.5 6"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              {EDITOR_COPY.clearChecked}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
