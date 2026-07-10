import { Children, useEffect, useState, type ReactNode } from 'react'

const DESKTOP_COLUMNS = 4
const MOBILE_COLUMNS = 2
const MOBILE_QUERY = '(max-width: 640px)'

/**
 * Board masonry (E3-S7): notes flow in **reading order** — left→right, then top→
 * bottom — rather than the column-by-column fill of CSS `column-count` (which ran
 * the whole left column top-to-bottom before starting the right one). We spread
 * the cards round-robin across flex columns (card N → column N % cols), so
 * sweeping the top row left-to-right walks the note order, then wraps one row
 * down. Column count follows the Board breakpoints: 4 columns, 2 below ~640px.
 */
export function NoteGrid({ children }: { children: ReactNode }) {
  const columnCount = useColumnCount()
  const items = Children.toArray(children)
  const columns: ReactNode[][] = Array.from({ length: columnCount }, () => [])
  items.forEach((item, index) => {
    columns[index % columnCount].push(item)
  })

  return (
    <div className="kp-grid">
      {columns.map((column, index) => (
        <div className="kp-grid__col" key={index}>
          {column}
        </div>
      ))}
    </div>
  )
}

/** 2 columns below ~640px (matching the Board breakpoint), 4 above. */
function useColumnCount(): number {
  const [mobile, setMobile] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(MOBILE_QUERY).matches,
  )
  useEffect(() => {
    const mql = window.matchMedia(MOBILE_QUERY)
    const onChange = () => setMobile(mql.matches)
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [])
  return mobile ? MOBILE_COLUMNS : DESKTOP_COLUMNS
}
