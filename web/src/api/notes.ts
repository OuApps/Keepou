/**
 * Notes endpoints (E3). The server enforces visibility and permissions
 * (handoff §5); the board only renders what the API returns.
 */
import { api } from './client'

export type NoteColor = 'GOLD' | 'AVOCAT' | 'SALSA' | 'CLAY' | 'TEAL'
export type Visibility = 'PRIVATE' | 'PUBLIC'
export type BoardTab = 'all' | 'mine' | 'public'

export interface LockHolder {
  id: string
  display_name: string
}

export interface NoteOut {
  id: string
  title: string
  body: string
  color: NoteColor
  visibility: Visibility
  owner_id: string
  /** Board-organization flags (E8): pinned floats the card to the top; archived
   * hides it from every board (shown only in the archived view). Owner-only. */
  pinned: boolean
  archived: boolean
  author_name: string
  created_at: string
  updated_at: string
  /**
   * Single-editor lock state (E5) — the read-only short-poll source. A stale
   * lock (expiry in the past) is reported as-is so the reader can offer the
   * takeover; both are null when unlocked.
   */
  locked_by: LockHolder | null
  lock_expires_at: string | null
}

export interface NoteIn {
  title?: string
  body?: string
  color?: NoteColor
  visibility?: Visibility
}

/** Consolidated editor update (E4-S1) — only the provided fields change.
 * `pinned` / `archived` are owner-only board flags (E8): no lock, no version. */
export interface NotePatch {
  title?: string
  body?: string
  color?: NoteColor
  visibility?: Visibility
  pinned?: boolean
  archived?: boolean
}

/** `archived` = the caller's dedicated archived view (own notes only). */
export function listNotes(tab: BoardTab, archived = false): Promise<NoteOut[]> {
  return api.get<NoteOut[]>(`/api/notes?tab=${tab}${archived ? '&archived=true' : ''}`)
}

export function createNote(input: NoteIn): Promise<NoteOut> {
  return api.post<NoteOut>('/api/notes', input)
}

export function getNote(id: string): Promise<NoteOut> {
  return api.get<NoteOut>(`/api/notes/${id}`)
}

export function patchNote(id: string, patch: NotePatch): Promise<NoteOut> {
  return api.patch<NoteOut>(`/api/notes/${id}`, patch)
}

/** Permanent delete (owner or admin, E3/FR-N6) — removes the note and its history. */
export function deleteNote(id: string): Promise<void> {
  return api.delete<void>(`/api/notes/${id}`)
}
