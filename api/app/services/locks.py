"""
Single-editor lock service (E5-S2).

Deliberately simple model (no CRDT/OT) — handoff §3.1:
- acquisition / renewal (heartbeat ~20s) / release;
- expiration ~60s without heartbeat: a stale lock is claimable by anyone;
- ATOMIC acquisition: a single conditional
  `UPDATE ... WHERE locked_by_id IS NULL OR lock_expires_at < now OR locked_by_id = me`
  → 0 affected rows = conflict (the server decides, the loser goes read-only).

The lock lives on the `Note` row itself (≤ 1 active lock), so the conditional
UPDATE is the whole concurrency story: two near-simultaneous acquisitions race
on the same row and exactly one statement matches.
"""

from datetime import datetime, timedelta

from sqlalchemy import case, update
from sqlmodel import Session, and_, col, or_

from app.models import Note, _utcnow

HEARTBEAT_SECONDS = 20
LOCK_TTL_SECONDS = 60


def is_stale(lock_expires_at: datetime | None, now: datetime | None = None) -> bool:
    """A lock past its TTL no longer counts — claimable, and not save-worthy."""
    return lock_expires_at is None or lock_expires_at < (now or _utcnow())


def holds_valid_lock(note: Note, user_id: str) -> bool:
    """True when `user_id` holds a fresh (non-stale) lock on `note` (FR-L2)."""
    return note.locked_by_id == user_id and not is_stale(note.lock_expires_at)


def acquire(session: Session, note_id: str, user_id: str) -> bool:
    """Acquire or renew (heartbeat) the lock; returns whether the caller won.

    One atomic conditional UPDATE — grantable iff the note is unlocked, the
    existing lock is stale, or the caller already holds it (renewal). A renewal
    keeps `locked_at` (the editing-session start, which E6 turns into a
    version); winning a fresh/stale acquisition restamps it.
    """
    now = _utcnow()
    renewing = and_(col(Note.locked_by_id) == user_id, col(Note.lock_expires_at) >= now)
    statement = (
        update(Note)
        .where(col(Note.id) == note_id)
        .where(
            or_(
                col(Note.locked_by_id).is_(None),
                col(Note.lock_expires_at) < now,
                col(Note.locked_by_id) == user_id,
            )
        )
        .values(
            locked_by_id=user_id,
            locked_at=case((renewing, col(Note.locked_at)), else_=now),
            lock_expires_at=now + timedelta(seconds=LOCK_TTL_SECONDS),
        )
    )
    # Through the session's connection: an UPDATE has no ORM result, and the
    # cursor's rowcount is the atomic won/lost signal.
    result = session.connection().execute(statement)
    session.commit()
    return result.rowcount == 1


def release(session: Session, note_id: str, user_id: str) -> bool:
    """Release the caller's lock; idempotent (never touches someone else's).

    Returns whether a lock was actually released — E6 creates the session's
    version exactly then, so double-releases stay version-free.
    """
    statement = (
        update(Note)
        .where(col(Note.id) == note_id, col(Note.locked_by_id) == user_id)
        .values(locked_by_id=None, locked_at=None, lock_expires_at=None)
    )
    result = session.connection().execute(statement)
    session.commit()
    return result.rowcount == 1
