/**
 * Import from Google Keep (E10-S3) — the two-step preview/confirm calls.
 *
 * Both endpoints take the Takeout ZIP as multipart form data; `index` is the
 * contract between them (deterministic file order server-side), so the confirm
 * call re-sends the same file plus the checked indices.
 */
import { api } from './client'
import type { NoteColor } from './notes'

export type ImportPreviewItem = {
  index: number
  title: string
  body: string
  color: NoteColor
  created_at: string
  updated_at: string
  is_trashed: boolean
}

export type ImportCounts = { total: number; trashed: number; parse_failed: number }

export type ImportFailure = { index: number; reason: string }

export type ImportPreviewOut = {
  items: ImportPreviewItem[]
  counts: ImportCounts
  failed: ImportFailure[]
}

export type ImportSummaryOut = {
  imported: number
  skipped_duplicate: number
  failed: ImportFailure[]
}

export function previewKeepImport(file: File): Promise<ImportPreviewOut> {
  const form = new FormData()
  form.append('file', file)
  return api.post<ImportPreviewOut>('/api/import/keep/preview', form)
}

export function importKeepNotes(file: File, selected: number[]): Promise<ImportSummaryOut> {
  const form = new FormData()
  form.append('file', file)
  for (const index of selected) form.append('selected', String(index))
  return api.post<ImportSummaryOut>('/api/import/keep', form)
}
