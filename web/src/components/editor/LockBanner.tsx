import type { LockStatus } from '../../hooks/useNoteLock'

/**
 * The single-editor lock UI (E5-S5) — the 4 states of
 * `Keepou - Éditeur & verrou.dc.html`, frozen copy from HANDOFF §7 "Lock":
 * yours (avocado) / locked by another (terracotta) / expired-takeover (gold) /
 * conflict (sand). `LockBanner` is the status line of the editor's top strip
 * (the strip tint itself is the `kp-editor__bar--*` modifier); the companion
 * pieces (read-only note, takeover bar, conflict panel) live in the body.
 */

/** « Quelqu'un » only ever shows on degraded payloads — the 409 names the holder. */
const someone = (holder: string | null) => holder ?? 'Quelqu’un'

export function LockBanner({ status, holder }: { status: LockStatus; holder: string | null }) {
  if (status === 'none' || status === 'pending') return null
  return (
    <span className={`kp-lock kp-lock--${status}`} role="status">
      {(status === 'mine' || status === 'available') && (
        <span className="kp-lock__dot" aria-hidden="true" />
      )}
      {status === 'mine' && 'Tu modifies cette note'}
      {status === 'locked' && `🔒 ${someone(holder)} est en cours d'édition — lecture seule`}
      {status === 'available' &&
        (holder === null ? 'Note disponible' : `${holder} a fini de modifier — note disponible`)}
      {status === 'conflict' && `${someone(holder)} modifie cette note`}
    </span>
  )
}

/** Right-side « en direct » indicator while another member is editing. */
export function LockLiveDot() {
  return (
    <span className="kp-lock__live" aria-hidden="true">
      <span className="kp-lock__live-dot" />
      en direct
    </span>
  )
}

/** Read-only subtext under the content (locked state). */
export function LockReadOnlyNote({ holder }: { holder: string | null }) {
  return (
    <p className="kp-lock__note">
      Édition indisponible tant que {someone(holder)} modifie la note. L'affichage se met à jour en
      temps réel.
    </p>
  )
}

/** Takeover action once the lock is released or expired (state 3). */
export function LockTakeoverBar({ onTakeover }: { onTakeover: () => void }) {
  return (
    <div className="kp-lock__takeover">
      <button type="button" className="kp-lock__takeover-btn" onClick={onTakeover}>
        Modifier la note
      </button>
    </div>
  )
}

/** Conflict panel (state 4): the note was taken over during your absence. */
export function LockConflictPanel({
  holder,
  onGoReadOnly,
}: {
  holder: string | null
  onGoReadOnly: () => void
}) {
  return (
    <div className="kp-lock__conflict">
      <p className="kp-lock__conflict-text">
        {someone(holder)} a commencé à modifier cette note pendant ton absence. Tes dernières
        modifications n'ont pas pu être enregistrées.
      </p>
      <button type="button" className="kp-lock__conflict-btn" onClick={onGoReadOnly}>
        Passer en lecture seule
      </button>
    </div>
  )
}
