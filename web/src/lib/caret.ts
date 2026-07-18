/**
 * Caret helpers over a contenteditable's textContent (E8-S9): the editing
 * surface re-renders its highlighted HTML on every keystroke, so the caret is
 * tracked as a plain offset into `textContent` and restored by walking the
 * text nodes. Shared by MarkdownArea (restore after re-render) and BlockList
 * (place the caret after an insertion or a block merge).
 */

/** Caret position as an offset into the element's textContent, or null. */
export function caretOffset(root: HTMLElement): number | null {
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
export function selectionOffsets(root: HTMLElement): { start: number; end: number } | null {
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
export function setCaret(root: HTMLElement, offset: number) {
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
