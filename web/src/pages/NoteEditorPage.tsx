import { useParams } from 'react-router-dom'
import { NoteEditor } from '../components/editor/NoteEditor'

/**
 * `/note/:id` — the canonical editor (E4): desktop modal / mobile full screen.
 * The `key` resets the editing session when navigating between notes.
 */
export default function NoteEditorPage() {
  const { id } = useParams()
  return <NoteEditor key={id} noteId={id!} />
}
