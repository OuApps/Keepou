import { useLayoutEffect, useRef } from 'react'
import { EDITOR_COPY } from '../../lib/copy'
import { highlightMarkdown } from '../../lib/highlight'

/**
 * The formatting-aware paragraph surface (E8-S9). A `<textarea>` cannot show
 * styled runs, so a paragraph block is a `contenteditable` view over its raw
 * Markdown: `**gras**`, `*italique*` and `# Titre` take effect AS TYPED (no
 * toolbar, no selection step), with the markers kept visible but dimmed.
 *
 * Invariant: the DOM's `textContent` is exactly the block's Markdown text —
 * highlighting only wraps slices in styling `<span>`s — so autosave
 * serialization (E4-S6) and the stored GFM body are untouched. Enter and
 * paste are intercepted and spliced into the string (plain text only), which
 * keeps the DOM free of `<br>`/nested nodes the browser would otherwise add.
 */

/** Caret position as an offset into the element's textContent, or null. */
function caretOffset(root: HTMLElement): number | null {
  const selection = window.getSelection()
  if (selection === null || selection.rangeCount === 0) return null
  const { focusNode, focusOffset } = selection
  if (focusNode === null || !root.contains(focusNode)) return null
  const range = document.createRange()
  range.selectNodeContents(root)
  range.setEnd(focusNode, focusOffset)
  return range.toString().length
}

/** The current selection as [start, end] offsets into textContent. */
function selectionOffsets(root: HTMLElement): { start: number; end: number } | null {
  const selection = window.getSelection()
  if (selection === null || selection.rangeCount === 0) return null
  const range = selection.getRangeAt(0)
  if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return null
  const pre = document.createRange()
  pre.selectNodeContents(root)
  pre.setEnd(range.startContainer, range.startOffset)
  const start = pre.toString().length
  pre.setEnd(range.endContainer, range.endOffset)
  return { start, end: pre.toString().length }
}

/** Place a collapsed caret at a textContent offset. */
function setCaret(root: HTMLElement, offset: number) {
  const selection = window.getSelection()
  if (selection === null) return
  const range = document.createRange()
  let remaining = offset
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    const length = (node as Text).data.length
    if (remaining <= length) {
      range.setStart(node, remaining)
      range.collapse(true)
      selection.removeAllRanges()
      selection.addRange(range)
      return
    }
    remaining -= length
  }
  range.selectNodeContents(root)
  range.collapse(false)
  selection.removeAllRanges()
  selection.addRange(range)
}

interface MarkdownAreaProps {
  value: string
  onChange: (next: string) => void
  /** Immediate save on blur (E4-S6). */
  onFlush: () => void
  placeholder?: string
  /** Focus anchor for BlockList (`[data-block]`). */
  blockKey: string
}

export function MarkdownArea({
  value,
  onChange,
  onFlush,
  placeholder,
  blockKey,
}: MarkdownAreaProps) {
  const ref = useRef<HTMLDivElement>(null)
  // Caret target for the re-render that follows a programmatic splice.
  const pendingCaret = useRef<number | null>(null)

  useLayoutEffect(() => {
    const el = ref.current
    if (el === null) return
    const hasFocus = document.activeElement === el
    const caret = pendingCaret.current ?? (hasFocus ? caretOffset(el) : null)
    pendingCaret.current = null
    el.innerHTML = highlightMarkdown(value)
    el.dataset.empty = value === '' ? 'true' : 'false'
    if (hasFocus && caret !== null) setCaret(el, Math.min(caret, value.length))
  }, [value])

  // Browser-driven edits (typing, deletions): the DOM is the source of truth.
  const emit = () => {
    const el = ref.current
    if (el === null) return
    pendingCaret.current = caretOffset(el)
    onChange(el.textContent ?? '')
  }

  // Programmatic splice for Enter/paste, replacing the current selection.
  const insertText = (text: string) => {
    const el = ref.current
    if (el === null) return
    const current = el.textContent ?? ''
    const range = selectionOffsets(el) ?? { start: current.length, end: current.length }
    pendingCaret.current = range.start + text.length
    onChange(current.slice(0, range.start) + text + current.slice(range.end))
  }

  return (
    <div
      ref={ref}
      className="kp-blocks__text kp-blocks__text--edit"
      contentEditable
      suppressContentEditableWarning
      role="textbox"
      aria-multiline="true"
      aria-label={EDITOR_COPY.paragraphLabel}
      tabIndex={0}
      data-block={blockKey}
      data-placeholder={placeholder}
      spellCheck
      onInput={emit}
      onKeyDown={(e) => {
        // Plain Enter = newline; Shift+Enter is left for the editor's save
        // shortcut (E11-S3), handled in its capture phase.
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault()
          insertText('\n')
        }
      }}
      onPaste={(e) => {
        e.preventDefault()
        insertText(e.clipboardData.getData('text/plain'))
      }}
      onBlur={onFlush}
    />
  )
}
