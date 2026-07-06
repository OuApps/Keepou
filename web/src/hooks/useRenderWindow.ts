import { useEffect, useRef, useState } from 'react'

/**
 * Incremental render window (E11-S5). A large board (a 300-note Keep import)
 * mounts slowly if every card renders at once, so we render a growing slice:
 * the first `page` cards, then `page` more each time a bottom sentinel scrolls
 * into view. Filtering / sorting / searching change `resetKey`, which snaps the
 * window back to the top.
 *
 * The API still returns the full set (300 rows is cheap) — the cost was the DOM.
 * Where `IntersectionObserver` is absent (SSR / jsdom tests) we simply render
 * everything, so nothing depends on the observer existing.
 */

const PAGE = 48

export function useRenderWindow(resetKey: string, total: number, page = PAGE) {
  const [count, setCount] = useState(page)
  const sentinelRef = useRef<HTMLDivElement>(null)

  // Snap back to the first page whenever the effective list changes.
  useEffect(() => {
    setCount(page)
  }, [resetKey, page])

  useEffect(() => {
    if (count >= total) return
    const el = sentinelRef.current
    if (el === null || typeof IntersectionObserver === 'undefined') {
      // No observer (tests / SSR): reveal the whole list rather than truncate it.
      setCount(total)
      return
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setCount((current) => Math.min(total, current + page))
        }
      },
      { rootMargin: '600px' },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [count, total, page])

  return { count: Math.min(count, total), sentinelRef }
}
