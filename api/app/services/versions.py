"""
Versioning service (E6) — claude.md §3: **1 editing session = 1 version**.

A version is a full snapshot (title / body / color / visibility) plus its
author and timestamp, appended:
- at note creation — the « Créée par X » history root;
- at session end — lock release for a public note, editor close for a private
  one (the client signals both through `DELETE /api/notes/{id}/lock`);
- at restore, which appends a new version instead of overwriting (FR-H4).

`record_session_version` guards against no-op sessions: a session that leaves
the note exactly as the latest version left it records nothing (FR-H1).
"""

from sqlmodel import Session, col, select

from app.models import Note, NoteVersion


def latest_version(session: Session, note_id: str) -> NoteVersion | None:
    return session.exec(
        select(NoteVersion)
        .where(NoteVersion.note_id == note_id)
        .order_by(col(NoteVersion.created_at).desc())
    ).first()


def _snapshot(note: Note, author_id: str) -> NoteVersion:
    return NoteVersion(
        note_id=note.id,
        author_id=author_id,
        title=note.title,
        body=note.body,
        color=note.color,
        visibility=note.visibility,
    )


def creation_snapshot(note: Note) -> NoteVersion:
    """The history root, stamped with the note's own `created_at` so the front
    can tell « Créée par X » from « Modifié par X ». Not persisted here — the
    Keep import (E10) batches many roots into one transaction."""
    version = _snapshot(note, note.owner_id)
    version.created_at = note.created_at
    return version


def record_creation(session: Session, note: Note) -> NoteVersion:
    version = creation_snapshot(note)
    session.add(version)
    session.commit()
    return version


def record_session_version(session: Session, note: Note, author_id: str) -> NoteVersion | None:
    """Append the session's version — skipped when nothing changed (FR-H1)."""
    latest = latest_version(session, note.id)
    if latest is not None and (
        latest.title == note.title
        and latest.body == note.body
        and latest.color == note.color
        and latest.visibility == note.visibility
    ):
        return None
    version = _snapshot(note, author_id)
    session.add(version)
    session.commit()
    return version
