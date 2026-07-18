import { useLayoutEffect, useRef } from 'react'
import { useI18n } from '../../i18n'
import { caretOffset, selectionOffsets, setCaret } from '../../lib/caret'
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

interface MarkdownAreaProps {
  value: string
  onChange: (next: string) => void
  /** Immediate save on blur (E4-S6). */
  onFlush: () => void
  placeholder?: string
  /** Focus anchor for BlockList (`[data-block]`). */
  blockKey: string
  /** Backspace with a collapsed caret at offset 0 — merge into the previous block. */
  onMergeBack?: () => void
  /** Delete (Suppr) with a collapsed caret at the end — merge the next block in. */
  onMergeForward?: () => void
}

export function MarkdownArea({
  value,
  onChange,
  onFlush,
  placeholder,
  blockKey,
  onMergeBack,
  onMergeForward,
}: MarkdownAreaProps) {
  const { EDITOR_COPY } = useI18n()
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
          return
        }
        // At the block's edges the browser has nothing to delete — hand the
        // key to BlockList so it merges with the neighboring block instead of
        // silently doing nothing (the reported dead Backspace/Suppr).
        if (e.key !== 'Backspace' && e.key !== 'Delete') return
        const el = ref.current
        if (el === null) return
        const range = selectionOffsets(el)
        if (range === null || range.start !== range.end) return
        if (e.key === 'Backspace' && range.start === 0 && onMergeBack !== undefined) {
          e.preventDefault()
          onMergeBack()
        } else if (
          e.key === 'Delete' &&
          range.start === value.length &&
          onMergeForward !== undefined
        ) {
          e.preventDefault()
          onMergeForward()
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
