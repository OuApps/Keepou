/**
 * History & versions endpoints (E6). Versions are written server-side —
 * creation, then one per editing session (lock release / editor close);
 * restore appends a new version, nothing is ever overwritten (FR-H4).
 */
import { api } from './client'
import type { NoteColor, NoteOut, Visibility } from './notes'

export interface NoteVersionOut {
  id: string
  note_id: string
  author_id: string
  /** Display name behind « Modifié par X » / « Créée par X ». */
  author_name: string
  title: string
  body: string
  color: NoteColor
  visibility: Visibility
  created_at: string
}

/** Newest-first, gated by the note's visibility (FR-H2). */
export function listVersions(noteId: string): Promise<NoteVersionOut[]> {
  return api.get<NoteVersionOut[]>(`/api/notes/${noteId}/versions`)
}

/** 409 with the lock detail while someone else edits the (public) note. */
export function restoreVersion(noteId: string, versionId: string): Promise<NoteOut> {
  return api.post<NoteOut>(`/api/notes/${noteId}/restore/${versionId}`)
}
