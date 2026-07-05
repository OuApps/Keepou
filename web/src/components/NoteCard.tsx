import { useNavigate } from 'react-router-dom'
import type { NoteOut } from '../api/notes'
import { SHADE_CLASS } from '../lib/colors'
import { parsePreview } from '../lib/preview'
import { formatRelative } from '../lib/time'
import { BOARD_COPY } from '../lib/copy'
import { InlineText } from './RichText'

/**
 * Board card (E3-S6), faithful to `Keepou - Board.dc.html`: one of the 5 shades
 * (gradient + border tokens), Fredoka title, read-only checklist rendered from
 * the Markdown body, meta line (visibility, or author badge on the Public tab).
 * Click opens the editor (`/note/:id`, E4).
 */

// Author-badge backgrounds, picked deterministically (Board mockup shows
// terracotta / gold / green / teal chips depending on the member).
const BADGE_COLORS = ['#C75D43', '#EAB64C', '#3A5132', '#5FA39A', '#9DB84E']

function badgeColor(name: string): string {
  let sum = 0
  for (const char of name) sum += char.codePointAt(0) ?? 0
  return BADGE_COLORS[sum % BADGE_COLORS.length]
}

function CheckIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
      <path
        d="M2 5.2 L4 7.2 L8 2.6"
        fill="none"
        stroke="#fff"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function GlobeIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="8" cy="8" r="6.2" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <line x1="1.8" y1="8" x2="14.2" y2="8" stroke="currentColor" strokeWidth="1.3" />
      <ellipse cx="8" cy="8" rx="3" ry="6.2" fill="none" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  )
}

export function NoteCard({ note, showAuthor }: { note: NoteOut; showAuthor: boolean }) {
  const navigate = useNavigate()
  const blocks = parsePreview(note.body)
  const badge = badgeColor(note.author_name)

  return (
    <article
      className={`kp-card kp-note ${SHADE_CLASS[note.color]}`}
      role="button"
      tabIndex={0}
      aria-label={note.title || BOARD_COPY.untitled}
      onClick={() => navigate(`/note/${note.id}`)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          navigate(`/note/${note.id}`)
        }
      }}
    >
      {note.title !== '' && <h2 className="kp-note__title">{note.title}</h2>}

      {blocks.length > 0 && (
        <div className="kp-note__body">
          {blocks.map((block, i) =>
            block.type === 'check' ? (
              <div key={i} className="kp-note__check">
                <span
                  className={`kp-note__box${block.checked ? ' kp-note__box--checked' : ''}`}
                  aria-hidden="true"
                >
                  {block.checked && <CheckIcon />}
                </span>
                <span className={block.checked ? 'kp-note__done' : undefined}>{block.text}</span>
              </div>
            ) : block.type === 'heading' ? (
              // Visual heading only: a preview must not add document headings
              // above the card's own <h2> title (E8-S9).
              <p key={i} className={`kp-note__text kp-rich__h kp-rich__h${block.level}`}>
                <InlineText text={block.text} />
              </p>
            ) : (
              <p key={i} className="kp-note__text">
                <InlineText text={block.text} />
              </p>
            ),
          )}
        </div>
      )}

      {showAuthor ? (
        <div className="kp-note__meta kp-note__meta--author">
          <span className="kp-note__badge" style={{ background: badge }} aria-hidden="true">
            {note.author_name.trim().charAt(0).toUpperCase()}
          </span>
          <span className="kp-note__author">
            {BOARD_COPY.authorMeta(note.author_name, formatRelative(note.updated_at))}
          </span>
        </div>
      ) : (
        <div className="kp-note__meta">
          {note.visibility === 'PUBLIC' ? (
            <>
              <GlobeIcon />
              <span>{BOARD_COPY.publicByYou}</span>
            </>
          ) : (
            <span>{BOARD_COPY.privateMeta(formatRelative(note.updated_at))}</span>
          )}
        </div>
      )}
    </article>
  )
}
