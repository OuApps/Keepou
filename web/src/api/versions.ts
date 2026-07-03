/**
 * History & versions endpoints (E6). The server enforces visibility and the
 * single-editor lock; the front only lists and re-renders what it returns.
 */
import { api } from './client'
import type { NoteColor, NoteOut, Visibility } from './notes'

export interface VersionOut {
  id: string
  note_id: string
  author_id: string
  author_name: string
  title: string
  body: string
  color: NoteColor
  visibility: Visibility
  created_at: string
}

/** History of a note, newest-first, visibility-gated like the note itself. */
export function listVersions(noteId: string): Promise<VersionOut[]> {
  return api.get<VersionOut[]>(`/api/notes/${noteId}/versions`)
}

/**
 * Restore a version: the note's content becomes the chosen snapshot and a **new**
 * version is appended (nothing is overwritten). Returns the updated note.
 */
export function restoreVersion(noteId: string, versionId: string): Promise<NoteOut> {
  return api.post<NoteOut>(`/api/notes/${noteId}/restore/${versionId}`)
}

/**
 * Signal the end of a PRIVATE note's editing session so the server snapshots a
 * version (a private note carries no lock — public notes version on release).
 * Returns the new version, or `null` when nothing changed. Best-effort on close.
 */
export function endPrivateSession(noteId: string): Promise<VersionOut | null> {
  return api.post<VersionOut | null>(`/api/notes/${noteId}/versions`)
}
