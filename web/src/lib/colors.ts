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

export const SWATCHES: Array<{ color: NoteColor; bg: string; bd: string; label: string }> = [
  { color: 'GOLD', bg: '#F7E2AE', bd: '#EFD79E', label: 'Or' },
  { color: 'AVOCAT', bg: '#DFEAAE', bd: '#D4E0A2', label: 'Avocat' },
  { color: 'SALSA', bg: '#F2C7B5', bd: '#EDC0AC', label: 'Salsa' },
  { color: 'CLAY', bg: '#ECD8BC', bd: '#E6CDA9', label: 'Argile' },
  { color: 'TEAL', bg: '#C7DED5', bd: '#BAD7CD', label: 'Sarcelle' },
]
