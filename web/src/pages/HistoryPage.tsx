import { Link, useParams } from 'react-router-dom'

/**
 * History — placeholder (E6). Desktop side panel / mobile 2-screen flow, read-only
 * version preview and restore (a version is re-rendered as-is, no visual diff).
 * Implemented in E6.
 */
export default function HistoryPage() {
  const { id } = useParams()

  return (
    <div className="kp-center">
      <p className="kp-tag">E6 · Historique</p>
      <h1 className="kp-title" style={{ fontSize: 22 }}>
        Historique de la note
      </h1>
      <p className="kp-muted">
        Note <code>{id}</code> — la liste des versions (qui / quand), l’aperçu en lecture seule et
        la restauration sont implémentés en E6.
      </p>
      <div style={{ display: 'flex', gap: 14 }}>
        <Link to={`/note/${id}`} className="kp-link">
          Retour à l’éditeur
        </Link>
        <Link to="/" className="kp-link">
          Retour au board
        </Link>
      </div>
    </div>
  )
}
