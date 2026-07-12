import { useI18n } from '../../i18n'
import type { LockStatus } from '../../hooks/useNoteLock'

/**
 * The single-editor lock UI (E5-S5) — the 4 states of
 * `Keepou - Éditeur & verrou.dc.html`, frozen copy from HANDOFF §7 "Lock":
 * yours (avocado) / locked by another (terracotta) / expired-takeover (gold) /
 * conflict (sand). `LockBanner` is the status line of the editor's top strip
 * (the strip tint itself is the `kp-editor__bar--*` modifier); the companion
 * pieces (read-only note, takeover bar, conflict panel) live in the body.
 */

export function LockBanner({ status, holder }: { status: LockStatus; holder: string | null }) {
  const { LOCK_COPY } = useI18n()
  if (status === 'none' || status === 'pending') return null
  return (
    <span className={`kp-lock kp-lock--${status}`} role="status">
      {(status === 'mine' || status === 'available') && (
        <span className="kp-lock__dot" aria-hidden="true" />
      )}
      {status === 'mine' && LOCK_COPY.mine}
      {status === 'locked' && LOCK_COPY.locked(holder)}
      {status === 'available' && LOCK_COPY.available(holder)}
      {status === 'conflict' && LOCK_COPY.conflict(holder)}
    </span>
  )
}

/** Right-side « en direct » indicator while another member is editing. */
export function LockLiveDot() {
  const { LOCK_COPY } = useI18n()
  return (
    <span className="kp-lock__live" aria-hidden="true">
      <span className="kp-lock__live-dot" />
      {LOCK_COPY.live}
    </span>
  )
}

/** Read-only subtext under the content (locked state). */
export function LockReadOnlyNote({ holder }: { holder: string | null }) {
  const { LOCK_COPY } = useI18n()
  return <p className="kp-lock__note">{LOCK_COPY.readOnlyNote(holder)}</p>
}

/** Takeover action once the lock is released or expired (state 3). */
export function LockTakeoverBar({ onTakeover }: { onTakeover: () => void }) {
  const { LOCK_COPY } = useI18n()
  return (
    <div className="kp-lock__takeover">
      <button type="button" className="kp-lock__takeover-btn" onClick={onTakeover}>
        {LOCK_COPY.takeover}
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
  const { LOCK_COPY } = useI18n()
  return (
    <div className="kp-lock__conflict">
      <p className="kp-lock__conflict-text">{LOCK_COPY.conflictText(holder)}</p>
      <button type="button" className="kp-lock__conflict-btn" onClick={onGoReadOnly}>
        {LOCK_COPY.goReadOnly}
      </button>
    </div>
  )
}
