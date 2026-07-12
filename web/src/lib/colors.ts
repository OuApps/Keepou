/**
 * The 5 card shades as picker swatches (E3 composer + E4 editor) — the solid
 * end-color of each light gradient, straight from `Keepou - Board.dc.html`.
 * The stored value is always the identifier, never the hex (FR-N4).
 */
import type { NoteColor } from '../api/notes'

/** Shade → card CSS class (board cards E3, import review cards E10). */
export const SHADE_CLASS: Record<NoteColor, string> = {
  GOLD: 'kp-note--gold',
  AVOCAT: 'kp-note--avocat',
  SALSA: 'kp-note--salsa',
  CLAY: 'kp-note--clay',
  TEAL: 'kp-note--teal',
}

// Swatch geometry only — the accessible label is resolved at render time from
// the active locale (`COLOR_LABELS[color]`, E12), never baked in here.
export const SWATCHES: Array<{ color: NoteColor; bg: string; bd: string }> = [
  { color: 'GOLD', bg: '#F7E2AE', bd: '#EFD79E' },
  { color: 'AVOCAT', bg: '#DFEAAE', bd: '#D4E0A2' },
  { color: 'SALSA', bg: '#F2C7B5', bd: '#EDC0AC' },
  { color: 'CLAY', bg: '#ECD8BC', bd: '#E6CDA9' },
  { color: 'TEAL', bg: '#C7DED5', bd: '#BAD7CD' },
]
