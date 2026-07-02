/**
 * Single-editor lock endpoints (E5). The conflict is always decided
 * server-side (atomic conditional update); the client only reacts to the
 * 200 / 409 answers.
 */
import { getAccessToken } from '../auth/storage'
import { ApiError, BASE_URL, api } from './client'
import type { LockHolder, NoteOut } from './notes'

/** Structured 409 body from POST /lock and from a lock-checked PATCH. */
export interface LockConflictDetail {
  /** `note_locked` = someone else holds a fresh lock; `lock_required` = the
   *  caller saved without a valid lock while the note is free/stale. */
  code: 'note_locked' | 'lock_required'
  message: string
  locked_by: LockHolder | null
  lock_expires_at: string | null
}

/** Acquire or renew (heartbeat) the lock; 409 (with the holder) if held. */
export function acquireLock(noteId: string): Promise<NoteOut> {
  return api.post<NoteOut>(`/api/notes/${noteId}/lock`)
}

/** Release the caller's lock — idempotent on the server. */
export function releaseLock(noteId: string): Promise<void> {
  return api.delete<void>(`/api/notes/${noteId}/lock`)
}

/**
 * Release on `beforeunload`: fire-and-forget with `keepalive` so the request
 * outlives the page (HANDOFF §3.1 — a closed tab must not block others 60 s).
 */
export function releaseLockOnUnload(noteId: string): void {
  const token = getAccessToken()
  void fetch(`${BASE_URL}/api/notes/${noteId}/lock`, {
    method: 'DELETE',
    keepalive: true,
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  }).catch(() => {})
}

/** The structured lock detail of a 409, or null for any other error. */
export function lockConflictOf(error: unknown): LockConflictDetail | null {
  if (!(error instanceof ApiError) || error.status !== 409) return null
  const payload = error.payload as { detail?: unknown } | null
  const detail = payload?.detail
  if (detail !== null && typeof detail === 'object' && detail !== undefined && 'code' in detail) {
    return detail as LockConflictDetail
  }
  return null
}
