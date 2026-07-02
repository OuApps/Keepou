import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { listNotes, type BoardTab, type NoteOut } from '../api/notes'
import { Composer } from '../components/Composer'
import { NoteCard } from '../components/NoteCard'
import { NoteGrid } from '../components/NoteGrid'
import { TabSwitch } from '../components/TabSwitch'
import { Topbar } from '../components/Topbar'

/**
 * Main board (E3): Topbar (search + tabs), quick composer, masonry of cards.
 * The active board is driven by `?tab=mine|public` (deep-linkable, E3-S4);
 * search is a client-side filter over the loaded set (E3-S7 / ARCHITECTURE §7).
 */

/** Case- and accent-insensitive match (French titles: « déco », « Léa »…). */
function fold(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function matches(note: NoteOut, needle: string): boolean {
  if (needle === '') return true
  return fold(`${note.title}\n${note.body}`).includes(needle)
}

export default function BoardPage() {
  const [params, setParams] = useSearchParams()
  const tab: BoardTab = params.get('tab') === 'public' ? 'public' : 'mine'
  const [notes, setNotes] = useState<NoteOut[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [query, setQuery] = useState('')

  useEffect(() => {
    let cancelled = false
    setNotes(null)
    setFailed(false)
    listNotes(tab)
      .then((list) => {
        if (!cancelled) setNotes(list)
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [tab])

  const switchTab = (next: BoardTab) => {
    setParams(next === 'mine' ? {} : { tab: next }, { replace: false })
  }

  const onCreated = (note: NoteOut) => {
    // Prepend when the new card belongs on the visible board (own notes always
    // do on « Mes notes »; only public ones show up on « Public »).
    if (tab === 'mine' || note.visibility === 'PUBLIC') {
      setNotes((current) => (current === null ? [note] : [note, ...current]))
    }
  }

  // Fold the query once, not once per note per keystroke.
  const needle = fold(query.trim())
  const visible = notes?.filter((note) => matches(note, needle))

  return (
    <div className="kp-app">
      <Topbar
        center={
          <div className="kp-search">
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
              <circle cx="7" cy="7" r="5" fill="none" stroke="var(--ink-mute)" strokeWidth="1.6" />
              <line
                x1="11"
                y1="11"
                x2="14.5"
                y2="14.5"
                stroke="var(--ink-mute)"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
            </svg>
            <input
              type="search"
              className="kp-search__input"
              placeholder="Rechercher dans mes notes…"
              aria-label="Rechercher dans mes notes…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        }
        tabs={<TabSwitch tab={tab} onChange={switchTab} />}
      />

      <main className="kp-container">
        <Composer onCreated={onCreated} />

        {failed && (
          <p className="kp-board__status" role="alert">
            Impossible de charger les notes. Réessaie dans un instant.
          </p>
        )}
        {!failed && notes === null && <p className="kp-board__status">Chargement…</p>}

        {visible && visible.length > 0 && (
          <NoteGrid>
            {visible.map((note) => (
              <NoteCard key={note.id} note={note} showAuthor={tab === 'public'} />
            ))}
          </NoteGrid>
        )}

        {visible && visible.length === 0 && notes !== null && (
          <p className="kp-board__status">
            {query.trim() !== ''
              ? 'Aucune note ne correspond à ta recherche.'
              : tab === 'mine'
                ? 'Aucune note pour l’instant — écris ta première note ci-dessus.'
                : 'Aucune note publique pour l’instant.'}
          </p>
        )}
      </main>
    </div>
  )
}
