import type { SaveState } from '../../hooks/useAutosave'
import { formatRelative } from '../../lib/time'

/**
 * Session save state (E4-S6, frozen copy HANDOFF §7 "Save"):
 * `Modifié` (gold dot) → `Enregistrement…` (light-green dot) →
 * `Enregistré · à l'instant` (deep-green check). Distinct from the
 * "last saved version" subtitle, which only moves on a successful persist.
 */
export function SaveStatus({ state, savedAt }: { state: SaveState; savedAt: string }) {
  return (
    <span className={`kp-save kp-save--${state}`} role="status">
      {state === 'saved' ? (
        <>
          <svg width="13" height="13" viewBox="0 0 16 16" aria-hidden="true">
            <path
              d="M3 8.5 L6.5 12 L13 4.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          Enregistré · {formatRelative(savedAt)}
        </>
      ) : (
        <>
          <span className="kp-save__dot" aria-hidden="true" />
          {state === 'saving' ? 'Enregistrement…' : 'Modifié'}
        </>
      )}
    </span>
  )
}
