import { useEffect, useRef } from 'react'
import { RichBlockText } from '../RichText'
import { blockId, type EditorBlock } from './blocks'
import { MarkdownArea } from './MarkdownArea'

/**
 * The mixed editing surface (E4-S4): an ordered flow of paragraphs and
 * checkboxes, faithful to `Keepou - Éditeur canonique.dc.html`. Boxes are real
 * `<input type=checkbox>` (HANDOFF §8); the « Insérer une case à cocher »
 * affordance sits at the BOTTOM of the flow (§3.3, never in the middle).
 * Enter in a non-empty box inserts the next one; Enter in an EMPTY box (the
 * second consecutive line break) exits the checklist into a normal text
 * paragraph (E8-S10, Keep-like); Backspace in an empty box removes it.
 * Paragraphs are Markdown-aware (E8-S9): bold / italic / headings take
 * effect as typed, and render formatted (markers hidden) in read-only mode.
 */

interface BlockListProps {
  blocks: EditorBlock[]
  onChange: (blocks: EditorBlock[]) => void
  /** Immediate save on blur (E4-S6). */
  onFlush: () => void
  /** Read-only mode (E5): fields disabled, no checkbox insertion. */
  readOnly?: boolean
}

export function BlockList({ blocks, onChange, onFlush, readOnly = false }: BlockListProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  // Focus follows a freshly inserted box (or the neighbor of a removed one).
  const pendingFocus = useRef<string | null>(null)

  useEffect(() => {
    if (pendingFocus.current === null) return
    rootRef.current?.querySelector<HTMLElement>(`[data-block="${pendingFocus.current}"]`)?.focus()
    pendingFocus.current = null
  })

  const replace = (index: number, next: EditorBlock) => {
    onChange(blocks.map((block, i) => (i === index ? next : block)))
  }

  const insertCheckAt = (index: number) => {
    const id = blockId()
    pendingFocus.current = id
    onChange([
      ...blocks.slice(0, index),
      { id, type: 'check', checked: false, text: '' },
      ...blocks.slice(index),
    ])
  }

  const removeAt = (index: number) => {
    pendingFocus.current = blocks[index - 1]?.id ?? null
    onChange(blocks.filter((_, i) => i !== index))
  }

  // Two line breaks exit the checklist (E8-S10): the empty box becomes a
  // normal paragraph, focus moves into it.
  const exitChecklistAt = (index: number) => {
    const id = blockId()
    pendingFocus.current = id
    onChange(blocks.map((block, i) => (i === index ? { id, type: 'text', text: '' } : block)))
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
              placeholder={blocks.length === 1 && block.text === '' ? 'Écris ta note…' : undefined}
              onChange={(text) => replace(i, { ...block, text })}
              onFlush={onFlush}
            />
          )
        ) : (
          <div key={block.id} className="kp-blocks__row">
            <input
              type="checkbox"
              className="kp-blocks__box"
              checked={block.checked}
              aria-label={block.text === '' ? 'Case à cocher' : block.text}
              disabled={readOnly}
              onChange={(e) => replace(i, { ...block, checked: e.target.checked })}
              onBlur={onFlush}
            />
            <input
              type="text"
              data-block={block.id}
              className={`kp-blocks__label${block.checked ? ' kp-blocks__label--done' : ''}`}
              value={block.text}
              placeholder={readOnly ? undefined : 'Nouvel élément'}
              aria-label="Intitulé de la case"
              disabled={readOnly}
              onChange={(e) => replace(i, { ...block, text: e.target.value })}
              onBlur={onFlush}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  if (block.text === '') exitChecklistAt(i)
                  else insertCheckAt(i + 1)
                } else if (e.key === 'Backspace' && block.text === '') {
                  e.preventDefault()
                  removeAt(i)
                }
              }}
            />
          </div>
        ),
      )}

      {!readOnly && (
        <button
          type="button"
          className="kp-blocks__insert"
          onClick={() => insertCheckAt(blocks.length)}
        >
          <span className="kp-blocks__insert-box" aria-hidden="true">
            +
          </span>
          Insérer une case à cocher
        </button>
      )}
    </div>
  )
}
