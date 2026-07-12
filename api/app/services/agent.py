"""
Agent-facing note operations (E13) — the business logic behind the MCP tools.

This module is the single home of the note actions an agent can perform, kept
**separate from the transport** (app/mcp_server.py) so the rules can be unit
tested by calling the functions directly with a session + user. Every operation
mirrors the REST router's server-side rules (ARCHITECTURE §4.2):

- visibility gating: a private note is invisible to non-owners (NoteNotFound,
  never leaked);
- the single-editor lock still governs PUBLIC content edits — the agent briefly
  borrows the lock around an edit (like a restore) and yields to a live editor;
- versioning stays consistent: create writes the « Créée par X » root, and each
  agent content edit records the session's version (1 edit = 1 version, FR-H1
  no-op guard included);
- pin / archive / visibility stay owner-only, lock-free metadata.

Messages raised here are read by the agent (English, technical), not shown as
product UI copy.
"""

from sqlmodel import Session, col, or_, select

from app.models import Note, NoteColor, NoteVersion, Role, User, Visibility, _utcnow
from app.services import locks, versions


class AgentError(Exception):
    """A tool-level failure whose message is safe to relay to the agent."""


class NoteNotFound(AgentError):
    def __init__(self) -> None:
        super().__init__("Note not found (or not accessible to you).")


class NoteLocked(AgentError):
    def __init__(self, holder: str) -> None:
        super().__init__(f"{holder} is currently editing this note — try again later.")


class PermissionDenied(AgentError):
    pass


def _readable(session: Session, user: User, note_id: str) -> Note:
    """A note the caller may read: their own, or any member's PUBLIC one.

    Unknown id and someone else's private note answer the same NoteNotFound —
    the existence of a private note is never revealed."""
    note = session.get(Note, note_id)
    if note is None or (note.visibility != Visibility.PUBLIC and note.owner_id != user.id):
        raise NoteNotFound()
    return note


def note_payload(session: Session, note: Note) -> dict:
    """A JSON-friendly view of a note for tool output — includes the author name
    and whether someone else currently holds the editing lock."""
    author = session.get(User, note.owner_id)
    holder = None
    if note.locked_by_id is not None and not locks.is_stale(note.lock_expires_at):
        lock_owner = session.get(User, note.locked_by_id)
        holder = lock_owner.display_name if lock_owner is not None else None
    return {
        "id": note.id,
        "title": note.title,
        "body": note.body,
        "color": note.color.value,
        "visibility": note.visibility.value,
        "pinned": note.pinned,
        "archived": note.archived,
        "owner_id": note.owner_id,
        "author": author.display_name if author is not None else "",
        "locked_by": holder,
        "created_at": note.created_at.isoformat(),
        "updated_at": note.updated_at.isoformat(),
    }


def list_notes(
    session: Session, user: User, tab: str = "mine", archived: bool = False
) -> list[dict]:
    """List notes, newest first (pinned first). tab=mine → the caller's own notes
    (respecting the archived filter); tab=public → every member's public notes."""
    query = select(Note)
    if tab == "public":
        query = query.where(Note.visibility == Visibility.PUBLIC, col(Note.archived).is_(False))
    else:
        query = query.where(Note.owner_id == user.id, col(Note.archived).is_(archived))
    rows = session.exec(query.order_by(col(Note.pinned).desc(), col(Note.updated_at).desc())).all()
    return [note_payload(session, note) for note in rows]


def search_notes(session: Session, user: User, query_text: str, tab: str = "mine") -> list[dict]:
    """Substring match (case-insensitive) on title or body, within the tab's scope."""
    like = f"%{query_text.strip()}%"
    query = select(Note).where(or_(col(Note.title).ilike(like), col(Note.body).ilike(like)))
    if tab == "public":
        query = query.where(Note.visibility == Visibility.PUBLIC, col(Note.archived).is_(False))
    else:
        query = query.where(Note.owner_id == user.id, col(Note.archived).is_(False))
    rows = session.exec(query.order_by(col(Note.pinned).desc(), col(Note.updated_at).desc())).all()
    return [note_payload(session, note) for note in rows]


def get_note(session: Session, user: User, note_id: str) -> dict:
    return note_payload(session, _readable(session, user, note_id))


def create_note(
    session: Session,
    user: User,
    title: str = "",
    body: str = "",
    color: str = "GOLD",
    visibility: str = "PRIVATE",
) -> dict:
    """Create a note owned by the caller, with its « Créée par X » history root."""
    note = Note(
        title=title,
        body=body,
        color=NoteColor(color),
        visibility=Visibility(visibility),
        owner_id=user.id,
    )
    session.add(note)
    session.commit()
    session.refresh(note)
    versions.record_creation(session, note)
    return note_payload(session, note)


def update_note(
    session: Session,
    user: User,
    note_id: str,
    title: str | None = None,
    body: str | None = None,
    color: str | None = None,
    visibility: str | None = None,
) -> dict:
    """Edit a note's content (title / body / color) and, owner-only, its
    visibility. On a PUBLIC note the agent borrows the single-editor lock around
    the edit and yields to a live editor; each edit records one version."""
    note = _readable(session, user, note_id)
    changes: dict = {}
    if title is not None:
        changes["title"] = title
    if body is not None:
        changes["body"] = body
    if color is not None:
        changes["color"] = NoteColor(color)
    if visibility is not None:
        if note.owner_id != user.id:
            raise PermissionDenied("Only the note's author can change its visibility.")
        changes["visibility"] = Visibility(visibility)
    if not changes:
        return note_payload(session, note)

    # Public content edits go through the lock, exactly like a REST edit / restore.
    borrowed = note.visibility == Visibility.PUBLIC and not locks.holds_valid_lock(note, user.id)
    if borrowed and not locks.acquire(session, note.id, user.id):
        session.refresh(note)
        holder = session.get(User, note.locked_by_id) if note.locked_by_id else None
        raise NoteLocked(holder.display_name if holder is not None else "Someone")
    try:
        for field, value in changes.items():
            setattr(note, field, value)
        note.updated_at = _utcnow()
        session.add(note)
        session.commit()
        # 1 agent edit = 1 version (no-op guarded), author = the caller.
        versions.record_session_version(session, note, user.id)
    finally:
        if borrowed:
            locks.release(session, note.id, user.id)
    session.refresh(note)
    return note_payload(session, note)


def set_flags(
    session: Session,
    user: User,
    note_id: str,
    pinned: bool | None = None,
    archived: bool | None = None,
) -> dict:
    """Pin / archive a note — owner-only, lock-free metadata (no version, no
    `updated_at` bump), mirroring the REST board-organization rules."""
    note = _readable(session, user, note_id)
    if note.owner_id != user.id:
        raise PermissionDenied("Only the note's author can pin or archive it.")
    if pinned is not None:
        note.pinned = pinned
    if archived is not None:
        note.archived = archived
    session.add(note)
    session.commit()
    session.refresh(note)
    return note_payload(session, note)


def delete_note(session: Session, user: User, note_id: str) -> None:
    """Permanently delete a note and its history — owner or admin only (FR-N6)."""
    note = session.get(Note, note_id)
    if note is None:
        raise NoteNotFound()
    if note.owner_id != user.id and user.role != Role.ADMIN:
        if note.visibility == Visibility.PUBLIC:
            raise PermissionDenied("Only the note's author or an admin can delete it.")
        raise NoteNotFound()
    from sqlalchemy import delete as sa_delete

    session.connection().execute(sa_delete(NoteVersion).where(col(NoteVersion.note_id) == note.id))
    session.delete(note)
    session.commit()
