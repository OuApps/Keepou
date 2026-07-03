"""
History & versioning service (E6-S2/S3).

The rule (handoff §3.4, ARCHITECTURE §6): **one editing session = one version**,
created when the session ends — never per keystroke. A version is a full snapshot
(title / body / color / visibility + author + timestamp); the history re-renders
it as-is (no diff). Restore appends a *new* version, never overwriting.

Two triggers feed `snapshot_if_changed`:
- **public** note → the lock release (`DELETE /api/notes/{id}/lock`) ends the session;
- **private** note → the editor-close signal (`POST /api/notes/{id}/versions`),
  since a private note carries no lock.

`snapshot_if_changed` guards against empty / no-op sessions so a mere open-and-close
leaves no version.
"""

from sqlmodel import Session, col, select

from app.models import Note, NoteVersion, _utcnow


def _same_content(version: NoteVersion, note: Note) -> bool:
    return (
        version.title == note.title
        and version.body == note.body
        and version.color == note.color
        and version.visibility == note.visibility
    )


def latest_version(session: Session, note_id: str) -> NoteVersion | None:
    """The most recent version of a note (the history's « actuelle » row)."""
    return session.exec(
        select(NoteVersion)
        .where(col(NoteVersion.note_id) == note_id)
        .order_by(col(NoteVersion.created_at).desc(), col(NoteVersion.id).desc())
    ).first()


def _snapshot(session: Session, note: Note, author_id: str) -> NoteVersion:
    version = NoteVersion(
        note_id=note.id,
        author_id=author_id,
        title=note.title,
        body=note.body,
        color=note.color,
        visibility=note.visibility,
    )
    session.add(version)
    session.commit()
    session.refresh(version)
    return version


def snapshot_if_changed(session: Session, note_id: str, author_id: str) -> NoteVersion | None:
    """Record the session's version, unless nothing changed (FR-H1).

    Skipped when the note is identical to its latest version (a no-op session), or
    when the note has never been edited since creation and has no version yet
    (`updated_at == created_at`, set equal by `create_note`). Otherwise a new
    snapshot is appended under `author_id`.
    """
    note = session.get(Note, note_id)
    if note is None:
        return None
    latest = latest_version(session, note_id)
    if latest is not None and _same_content(latest, note):
        return None
    if latest is None and note.updated_at <= note.created_at:
        return None
    return _snapshot(session, note, author_id)


def restore(
    session: Session,
    note: Note,
    version: NoteVersion,
    author_id: str,
    apply_visibility: bool = True,
) -> NoteVersion:
    """Restore a version: the note's content becomes the snapshot's, and a **new**
    version is appended so nothing is ever overwritten (FR-H4).

    The previously-current version stays untouched in the history; the appended
    version records who restored, and when. `apply_visibility` is False when the
    caller isn't the owner — flipping visibility is owner-only (ARCHITECTURE §4.2),
    so the note keeps its current visibility while the rest of the snapshot lands.
    """
    note.title = version.title
    note.body = version.body
    note.color = version.color
    if apply_visibility:
        note.visibility = version.visibility
    note.updated_at = _utcnow()
    session.add(note)
    session.commit()
    session.refresh(note)
    # Always append (no dedup): a restore is an explicit history event even when
    # the content already matched.
    return _snapshot(session, note, author_id)
