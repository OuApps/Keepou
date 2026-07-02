import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Autosave (E4-S6, HANDOFF §3.2): debounce ~1.5 s after the last edit, with an
 * immediate flush on blur / editor close. The hook only drives the *session
 * state* (`Modifié` → `Enregistrement…` → `Enregistré`); the caller's `save`
 * persists the draft (it reads the latest values through a ref) and returns
 * whether the write succeeded. A failed save keeps the state on `Modifié`
 * and quietly retries — nothing is silently dropped.
 */

export type SaveState = 'saved' | 'dirty' | 'saving'

export const AUTOSAVE_DELAY_MS = 1500

export function useAutosave(save: () => Promise<boolean>) {
  const [state, setState] = useState<SaveState>('saved')
  // Always call the latest closure — the editor recreates `save` every render.
  const saveRef = useRef(save)
  saveRef.current = save
  const timerRef = useRef<number>()
  const dirtyRef = useRef(false)
  const savingRef = useRef(false)

  const run = useCallback(async () => {
    // A save already in flight will notice the new edits when it completes.
    if (savingRef.current) return
    window.clearTimeout(timerRef.current)
    if (!dirtyRef.current) return
    savingRef.current = true
    dirtyRef.current = false
    setState('saving')
    let ok = false
    try {
      ok = await saveRef.current()
    } catch {
      ok = false
    }
    savingRef.current = false
    if (dirtyRef.current || !ok) {
      // Edited while saving, or the write failed: still unsaved — re-arm.
      dirtyRef.current = true
      setState('dirty')
      timerRef.current = window.setTimeout(run, AUTOSAVE_DELAY_MS)
    } else {
      setState('saved')
    }
  }, [])

  /** Mark the draft dirty and (re)arm the ~1.5 s debounce. */
  const queue = useCallback(() => {
    dirtyRef.current = true
    setState((s) => (s === 'saving' ? s : 'dirty'))
    window.clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(run, AUTOSAVE_DELAY_MS)
  }, [run])

  /** Save now (blur / close) — no-op when there is nothing unsaved. The
   *  returned promise resolves once the write settles, so closing the editor
   *  can wait for it before releasing the lock (E5 — a release that overtakes
   *  the last save would 409 it). */
  const flush = useCallback(() => run(), [run])

  // Editor closed with a pending edit: fire the save; the request outlives
  // the component (an in-flight save already carries the latest draft).
  useEffect(
    () => () => {
      window.clearTimeout(timerRef.current)
      if (dirtyRef.current && !savingRef.current) void saveRef.current()
    },
    [],
  )

  return { state, queue, flush }
}
