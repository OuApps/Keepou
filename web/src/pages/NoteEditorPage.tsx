import { Link, useParams } from 'react-router-dom'

/**
 * Note editor — placeholder (E4/E5). Desktop modal / mobile full-screen shell,
 * text + checkboxes, GFM Markdown, autosave, color, visibility, and the
 * single-editor lock. Implemented in E4 (editor) and E5 (lock).
 */
export default function NoteEditorPage() {
  const { id } = useParams()

  return (
    <div className="kp-center">
      <p className="kp-tag">E4 · Éditeur</p>
      <h1 className="kp-title" style={{ fontSize: 22 }}>
        Éditeur de note
      </h1>
      <p className="kp-muted">
        Note <code>{id}</code> — l’éditeur canonique (texte + cases, Markdown, autosave, verrou
        mono-éditeur) est implémenté en E4/E5.
      </p>
      <div style={{ display: 'flex', gap: 14 }}>
        <Link to={`/note/${id}/history`} className="kp-link">
          Historique
        </Link>
        <Link to="/" className="kp-link">
          Retour au board
        </Link>
      </div>
    </div>
  )
}
