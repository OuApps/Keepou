import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import type { NoteOut, NotePatch } from '../api/notes'
import { SHADE_CLASS } from '../lib/colors'
import { parsePreview } from '../lib/preview'
import { formatRelative } from '../lib/time'
import { BOARD_COPY, COMMON_COPY } from '../lib/copy'
import { ConfirmDialog } from './ConfirmDialog'
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

function PinIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M6 1.6h4l-.7 3.3 2.1 2.3H4.6l2.1-2.3z"
        fill="currentColor"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinejoin="round"
      />
      <line
        x1="8"
        y1="7.2"
        x2="8"
        y2="13.4"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function NoteCard({
  note,
  showAuthor,
  compact = false,
  canOrganize = false,
  archivedView = false,
  selectable = false,
  selected = false,
  onOrganize,
  onDelete,
  onToggleSelect,
}: {
  note: NoteOut
  showAuthor: boolean
  /** Compact density (E11 follow-up): cap the card body to a short preview. */
  compact?: boolean
  /** Owner-only pin/archive/delete affordance (E8/E11). */
  canOrganize?: boolean
  /** In the archived view the actions are « Désarchiver » + « Supprimer ». */
  archivedView?: boolean
  /** Archive multi-select (E11): show a selection checkbox on the card. */
  selectable?: boolean
  selected?: boolean
  onOrganize?: (patch: NotePatch) => void
  /** Permanent delete of this note (E11) — the board owns the API call. */
  onDelete?: () => void
  onToggleSelect?: () => void
}) {
  const navigate = useNavigate()
  const location = useLocation()
  const blocks = parsePreview(note.body)
  const badge = badgeColor(note.author_name)
  const [menuOpen, setMenuOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  // Carry the board's current URL so the editor can return exactly here — same
  // tab and sort (E11-S1, « garde la sélection ») — plus the already-loaded note
  // so the editor paints instantly instead of blocking on a fetch (E11 perf).
  const openNote = () =>
    navigate(`/note/${note.id}`, {
      state: { from: location.pathname + location.search, note },
    })

  useEffect(() => {
    if (!menuOpen) return
    const onPointerDown = (e: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [menuOpen])

  const organize = (patch: NotePatch) => {
    setMenuOpen(false)
    onOrganize?.(patch)
  }

  return (
    <article
      className={`kp-card kp-note ${SHADE_CLASS[note.color]}${selectable ? ' kp-note--selectable' : ''}${selected ? ' kp-note--selected' : ''}`}
      role="button"
      tabIndex={0}
      aria-label={note.title || BOARD_COPY.untitled}
      onClick={openNote}
      onKeyDown={(e) => {
        // Keys on the actions button (a child) must not also open the note.
        if (e.target !== e.currentTarget) return
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          openNote()
        }
      }}
    >
      {selectable && (
        <label className="kp-note__select" onClick={(e) => e.stopPropagation()}>
          <input
            type="checkbox"
            checked={selected}
            aria-label={BOARD_COPY.selectNote(note.title)}
            onChange={() => onToggleSelect?.()}
          />
        </label>
      )}

      {(note.pinned || canOrganize) && (
        <div className="kp-note__organize" ref={menuRef} onClick={(e) => e.stopPropagation()}>
          {note.pinned && (
            <span
              className="kp-note__pin"
              title={BOARD_COPY.pinnedBadge}
              aria-label={BOARD_COPY.pinnedBadge}
            >
              <PinIcon />
            </span>
          )}
          {canOrganize && (
            <>
              <button
                type="button"
                className="kp-note__more"
                onClick={() => setMenuOpen((open) => !open)}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                aria-label={BOARD_COPY.cardActions(note.title)}
              >
                ⋯
              </button>
              {menuOpen && (
                <div className="kp-menu kp-note__menu" role="menu">
                  {archivedView ? (
                    <button
                      type="button"
                      className="kp-menu__item"
                      role="menuitem"
                      onClick={() => organize({ archived: false })}
                    >
                      {BOARD_COPY.unarchive}
                    </button>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="kp-menu__item"
                        role="menuitem"
                        onClick={() => organize({ pinned: !note.pinned })}
                      >
                        {note.pinned ? BOARD_COPY.unpin : BOARD_COPY.pin}
                      </button>
                      <button
                        type="button"
                        className="kp-menu__item"
                        role="menuitem"
                        onClick={() => organize({ archived: true })}
                      >
                        {BOARD_COPY.archive}
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    className="kp-menu__item kp-menu__item--danger"
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false)
                      setConfirmDelete(true)
                    }}
                  >
                    {BOARD_COPY.deleteAction}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {note.title !== '' && <h2 className="kp-note__title">{note.title}</h2>}

      {blocks.length > 0 && (
        <div className={`kp-note__body${compact ? ' kp-note__body--compact' : ''}`}>
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

      {confirmDelete && (
        <ConfirmDialog
          title={BOARD_COPY.deleteConfirmTitle}
          text={BOARD_COPY.deleteConfirmText}
          confirmLabel={COMMON_COPY.delete}
          danger
          onConfirm={() => {
            setConfirmDelete(false)
            onDelete?.()
          }}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </article>
  )
}
