import type { NoteOut } from '../api/notes'

/**
 * Cross-navigation board cache (E11 follow-up — perceived latency).
 *
 * The editor lives on its own route (`/note/:id`), so BoardPage unmounts while a
 * note is open and its local `notes` state dies; returning always re-fetched the
 * whole list behind a blank « Chargement… ». This module-level store keeps the
 * last-fetched lists alive across that round-trip so the board is instant on
 * return (stale-while-revalidate): the board paints the cached list immediately
 * and reconciles with a background `listNotes()`.
 *
 * The editor writes the note it just saved back here (`upsertCachedNote`), so the
 * edit shows on the board without waiting for the revalidation — the optimistic
 * update. Membership changes (archive / delete / a new note) that the upsert
 * cannot infer are picked up by the background refetch.
 *
 * State is per-tab (`tab|active|archived`) and lives only for the tab session; it
 * is cleared on sign-out / session expiry so one member never sees another's
 * cache.
 */

export type BoardKey = string

const lists = new Map<BoardKey, NoteOut[]>()
const listeners = new Set<() => void>()

export function boardKey(tab: string, archived: boolean): BoardKey {
  return `${tab}|${archived ? 'archived' : 'active'}`
}

export function subscribeBoards(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function emit(): void {
  for (const listener of listeners) listener()
}

/** getSnapshot for useSyncExternalStore — a stable reference until replaced. */
export function getCachedBoard(key: BoardKey): NoteOut[] | undefined {
  return lists.get(key)
}

export function setCachedBoard(key: BoardKey, list: NoteOut[]): void {
  lists.set(key, list)
  emit()
}

/** Apply an in-place transform to a cached list (optimistic pin / archive / delete). */
export function updateCachedBoard(key: BoardKey, updater: (list: NoteOut[]) => NoteOut[]): void {
  lists.set(key, updater(lists.get(key) ?? []))
  emit()
}

/**
 * Replace a note wherever it is already cached (edited content from the editor).
 * It does not insert into lists that don't hold it — that membership decision is
 * left to the next revalidation.
 */
export function upsertCachedNote(note: NoteOut): void {
  let changed = false
  for (const [key, list] of lists) {
    const index = list.findIndex((n) => n.id === note.id)
    if (index !== -1) {
      const next = list.slice()
      next[index] = note
      lists.set(key, next)
      changed = true
    }
  }
  if (changed) emit()
}

/** Drop a note from every cached list (hard delete, or archive leaving a board). */
export function removeCachedNote(id: string): void {
  let changed = false
  for (const [key, list] of lists) {
    if (list.some((n) => n.id === id)) {
      lists.set(
        key,
        list.filter((n) => n.id !== id),
      )
      changed = true
    }
  }
  if (changed) emit()
}

/** Sign-out / session-expiry: no member should ever read another's cache. */
export function clearBoardCache(): void {
  if (lists.size === 0) return
  lists.clear()
  emit()
}
