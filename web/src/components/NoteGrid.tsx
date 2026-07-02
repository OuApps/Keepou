import type { ReactNode } from 'react'

/**
 * Board masonry (E3-S7): CSS `column-count` 4 → 2 below ~640px, faithful to
 * the Board mockup (`column-gap` 18px, cards `break-inside: avoid`).
 */
export function NoteGrid({ children }: { children: ReactNode }) {
  return <div className="kp-grid">{children}</div>
}
