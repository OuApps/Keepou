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
  /**
   * Arrow key at the block's edge (up on the first line, down on the last,
   * left at offset 0, right at the end): move the caret into the neighboring
   * block. `column` is the caret's column on the current line (for up/down).
   * Return true when the move was handled — the default is then prevented.
   */
  onNavigate?: (dir: 'up' | 'down' | 'left' | 'right', column: number) => boolean
}

const ARROW_DIRS = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
} as const

export function MarkdownArea({
  value,
  onChange,
  onFlush,
  placeholder,
  blockKey,
  onMergeBack,
  onMergeForward,
  onNavigate,
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
        // The remaining handlers act on a collapsed caret at the block's
        // edges only; a real selection or a modifier keeps native behavior.
        if (e.shiftKey || e.altKey || e.ctrlKey || e.metaKey) return
        const el = ref.current
        if (el === null) return
        const range = selectionOffsets(el)
        if (range === null || range.start !== range.end) return
        const offset = range.start

        // At the edges the browser has nothing to delete — hand the key to
        // BlockList so it merges with the neighboring block instead of
        // silently doing nothing (the reported dead Backspace/Suppr).
        if (e.key === 'Backspace' && offset === 0 && onMergeBack !== undefined) {
          e.preventDefault()
          onMergeBack()
          return
        }
        if (e.key === 'Delete' && offset === value.length && onMergeForward !== undefined) {
          e.preventDefault()
          onMergeForward()
          return
        }

        // Arrow keys at the edges walk into the neighboring block (they used
        // to do nothing — the reported dead ↑/↓ between two boxes).
        const dir = ARROW_DIRS[e.key as keyof typeof ARROW_DIRS]
        if (dir === undefined || onNavigate === undefined) return
        if (dir === 'up') {
          const firstBreak = value.indexOf('\n')
          if ((firstBreak === -1 || offset <= firstBreak) && onNavigate('up', offset))
            e.preventDefault()
        } else if (dir === 'down') {
          const lastBreak = value.lastIndexOf('\n')
          if (
            (lastBreak === -1 || offset > lastBreak) &&
            onNavigate('down', offset - lastBreak - 1)
          )
            e.preventDefault()
        } else if (dir === 'left') {
          if (offset === 0 && onNavigate('left', 0)) e.preventDefault()
        } else if (offset === value.length && onNavigate('right', 0)) {
          e.preventDefault()
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
