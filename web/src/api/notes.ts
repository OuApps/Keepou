/**
 * Notes endpoints (E3). The server enforces visibility and permissions
 * (handoff §5); the board only renders what the API returns.
 */
import { api } from './client'

export type NoteColor = 'GOLD' | 'AVOCAT' | 'SALSA' | 'CLAY' | 'TEAL'
export type Visibility = 'PRIVATE' | 'PUBLIC'
export type BoardTab = 'mine' | 'public'

export interface NoteOut {
  id: string
  title: string
  body: string
  color: NoteColor
  visibility: Visibility
  owner_id: string
  author_name: string
  created_at: string
  updated_at: string
}

export interface NoteIn {
  title?: string
  body?: string
  color?: NoteColor
  visibility?: Visibility
}

export function listNotes(tab: BoardTab): Promise<NoteOut[]> {
  return api.get<NoteOut[]>(`/api/notes?tab=${tab}`)
}

export function createNote(input: NoteIn): Promise<NoteOut> {
  return api.post<NoteOut>('/api/notes', input)
}
