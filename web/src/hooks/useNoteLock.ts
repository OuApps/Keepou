import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError } from '../api/client'
import { acquireLock, lockConflictOf, releaseLock, releaseLockOnUnload } from '../api/locks'
import { getNote, type NoteOut } from '../api/notes'
import { parseApiDate } from '../lib/time'

/**
 * Single-editor lock lifecycle (E5-S4, HANDOFF §3.1). Public notes only —
 * a private note is single-owner (no contention) and edits lock-free.
 *
 * - opening a public note: acquire; on 409 open in read-only with the holder;
 * - heartbeat ~20 s while the lock is yours (renews the ~60 s server TTL);
 * - read-only: short-poll the note ~every 12 s to refresh the banner (and the
 *   content) in near real-time — the validated MVP transport, no SSE;
 * - release on leaving the editor, and on `beforeunload` via `keepalive`;
 * - states: none / pending / mine / locked / available / conflict.
 *
 * The conflict is decided server-side (atomic conditional update); this hook
 * only reacts to 200 / 409. The heartbeat is independent of content autosave.
 */

export const LOCK_HEARTBEAT_MS = 20_000
export const LOCK_POLL_MS = 12_000

export type LockStatus =
  | 'none' // private note — editing always allowed, no banner
  | 'pending' // public note, first acquisition in flight (fields held read-only)
  | 'mine' // you hold the lock (banner « Tu modifies cette note »)
  | 'locked' // someone else holds a fresh lock — read-only
  | 'available' // lock released/expired — takeover offered
  | 'conflict' // you lost the lock mid-session — your last edits were not saved

/** A lock past its TTL no longer blocks anyone (FR-L4). */
export function isLockStale(expiresAt: string | null): boolean {
  return expiresAt === null || parseApiDate(expiresAt).getTime() < Date.now()
}

interface UseNoteLockInput {
  noteId: string
  /** Server-confirmed note (null while loading) — its visibility drives the lifecycle. */
  note: NoteOut | null
  /** The signed-in user's id (a leftover own lock is re-acquired, not read-only). */
  myId: string | undefined
  /** Fresh server data, delivered while read-only (short-poll) and on (re)acquisition. */
  onRefresh: (fresh: NoteOut) => void
}

export function useNoteLock({ noteId, note, myId, onRefresh }: UseNoteLockInput) {
  const [status, setStatus] = useState<LockStatus>('pending')
  /** Display name of the current (or last known) holder — feeds the banner copy. */
  const [holder, setHolder] = useState<string | null>(null)

  // Timers and async callbacks read state through refs so a tick never acts on
  // a stale closure; `statusRef` is written synchronously on every transition.
  const statusRef = useRef(status)
  const heldRef = useRef(false) // do we hold the server-side lock right now?
  const heartbeatRef = useRef<number>()
  const pollRef = useRef<number>()
  const onRefreshRef = useRef(onRefresh)
  onRefreshRef.current = onRefresh
  const noteRef = useRef(note)
  noteRef.current = note
  const myIdRef = useRef(myId)
  myIdRef.current = myId

  const transition = useCallback((next: LockStatus) => {
    statusRef.current = next
    setStatus(next)
  }, [])

  const stopTimers = useCallback(() => {
    window.clearInterval(heartbeatRef.current)
    window.clearInterval(pollRef.current)
  }, [])

  /** Read-only classification from a fresh payload: fresh other-held lock ⇒ locked. */
  const classifyReadOnly = useCallback(
    (fresh: NoteOut) => {
      if (fresh.locked_by !== null) setHolder(fresh.locked_by.display_name)
      const heldByOther = fresh.locked_by !== null && fresh.locked_by.id !== myIdRef.current
      transition(heldByOther && !isLockStale(fresh.lock_expires_at) ? 'locked' : 'available')
    },
    [transition],
  )

  const pollTick = useCallback(async () => {
    if (statusRef.current !== 'locked' && statusRef.current !== 'available') return
    try {
      const fresh = await getNote(noteId)
      onRefreshRef.current(fresh)
      classifyReadOnly(fresh)
    } catch (error) {
      // Gone (deleted, or flipped private): stop asking. Transient errors retry
      // on the next tick.
      if (error instanceof ApiError && error.status === 404) stopTimers()
    }
  }, [noteId, classifyReadOnly, stopTimers])

  const startPolling = useCallback(() => {
    window.clearInterval(pollRef.current)
    pollRef.current = window.setInterval(() => void pollTick(), LOCK_POLL_MS)
  }, [pollTick])

  const enterConflict = useCallback(
    (holderName: string | null) => {
      heldRef.current = false
      stopTimers()
      if (holderName !== null) setHolder(holderName)
      transition('conflict')
    },
    [stopTimers, transition],
  )

  const heartbeatTick = useCallback(async () => {
    if (statusRef.current !== 'mine') return
    try {
      await acquireLock(noteId)
    } catch (error) {
      const conflict = lockConflictOf(error)
      // Someone took over while we were silent (laptop asleep…) — state 4.
      // On a plain network hiccup, stay `mine`: the next tick retries and the
      // server TTL remains the only authority.
      if (conflict !== null) enterConflict(conflict.locked_by?.display_name ?? null)
    }
  }, [noteId, enterConflict])

  /**
   * Acquire (or re-acquire) the lock — the mount attempt, the « Modifier la
   * note » takeover, and the save-retry path all land here. Returns whether
   * the lock is now yours; on a lost race the state becomes `onLose`.
   */
  const tryAcquire = useCallback(
    async (onLose: 'locked' | 'conflict' = 'locked'): Promise<boolean> => {
      try {
        const fresh = await acquireLock(noteId)
        onRefreshRef.current(fresh) // sync content before editing starts
        heldRef.current = true
        stopTimers()
        setHolder(null)
        transition('mine')
        heartbeatRef.current = window.setInterval(() => void heartbeatTick(), LOCK_HEARTBEAT_MS)
        return true
      } catch (error) {
        heldRef.current = false
        const conflict = lockConflictOf(error)
        if (onLose === 'conflict') {
          enterConflict(conflict?.locked_by?.display_name ?? null)
        } else {
          if (conflict?.locked_by) setHolder(conflict.locked_by.display_name)
          transition(conflict?.locked_by ? 'locked' : 'available')
          startPolling()
        }
        return false
      }
    },
    [noteId, stopTimers, transition, heartbeatTick, enterConflict, startPolling],
  )

  /** A lock-checked save answered 409 with a holder: your edits were not saved. */
  const notifyConflict = useCallback(
    (holderName: string | null) => enterConflict(holderName),
    [enterConflict],
  )

  /** « Passer en lecture seule » — leave the conflict state and follow along. */
  const goReadOnly = useCallback(() => {
    transition('locked')
    startPolling()
    void pollTick() // classify (and refresh the content) right away
  }, [transition, startPolling, pollTick])

  const loaded = note !== null
  const isPublic = note?.visibility === 'PUBLIC'

  useEffect(() => {
    if (!loaded) return
    if (!isPublic) {
      // Private: no lock at all. (A public→private flip lands here after the
      // PATCH is confirmed; the previous run's cleanup released the lock.)
      transition('none')
      setHolder(null)
      return
    }
    const current = noteRef.current
    const heldByOther =
      current !== null && current.locked_by !== null && current.locked_by.id !== myIdRef.current
    if (current !== null && heldByOther && !isLockStale(current.lock_expires_at)) {
      // Already locked when the editor opened: read-only, no acquire round-trip.
      setHolder(current.locked_by!.display_name)
      transition('locked')
      startPolling()
    } else {
      transition('pending')
      void tryAcquire('locked')
    }
    return () => {
      stopTimers()
      if (heldRef.current) {
        heldRef.current = false
        // Leaving the editor releases promptly (E6 writes the version here).
        releaseLock(noteId).catch(() => {})
      }
    }
  }, [noteId, loaded, isPublic, transition, startPolling, tryAcquire, stopTimers])

  // Closed tab / hard navigation: `keepalive` lets the release outlive the page.
  useEffect(() => {
    const onBeforeUnload = () => {
      if (heldRef.current) releaseLockOnUnload(noteId)
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [noteId])

  return { status, holder, tryAcquire, goReadOnly, notifyConflict }
}
