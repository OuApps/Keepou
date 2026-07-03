"""
Notes — board CRUD (E3) + single-editor lock (E5) + history & versions (E6).

Endpoints (handoff §5):
  GET    /api/notes?tab=mine|public   mine = caller's notes; public = all members'
                                      PUBLIC notes (author + updated_at). Newest-first.
  POST   /api/notes                   create (owner = caller)
  GET    /api/notes/{id}              visibility-checked; carries the lock state
  PATCH  /api/notes/{id}              consolidated editor update (E4-S1);
                                      on a PUBLIC note requires a fresh lock (FR-L2)
  DELETE /api/notes/{id}              owner or admin only (FR-N6)
  POST   /api/notes/{id}/lock         acquire / renew (heartbeat) — 409 + holder if held
  DELETE /api/notes/{id}/lock         release (idempotent; a PUBLIC note versions here)
  POST   /api/notes/{id}/versions     PRIVATE note session-end → snapshot a version
  GET    /api/notes/{id}/versions     history, newest-first, visibility-gated (FR-H2)
  POST   /api/notes/{id}/restore/{v}  restore a version → appends a NEW version (FR-H4)

Permissions (server-side, ARCHITECTURE §4.2):
- A private note is invisible to non-owners — including admins — and answers 404
  (not 403) so its very existence stays shielded.
- A public note is readable by any member but mutating it requires holding the
  single-editor lock (409 otherwise); deletion stays owner/admin (403).
- Private notes edit lock-free (single owner, no contention). The lock endpoints
  still accept the owner's own private note — harmless and invisible to others —
  but the front never locks private notes (E5 key decisions).
"""

from enum import StrEnum

from fastapi import APIRouter, HTTPException, status
from sqlmodel import Session, col, select

from app.db import SessionDep
from app.models import Note, NoteVersion, Role, User, Visibility, _utcnow
from app.schemas import LockedBy, NoteIn, NoteOut, NotePatch, VersionOut
from app.security import CurrentUser
from app.services import locks, versions

router = APIRouter(prefix="/api/notes", tags=["notes"])

DETAIL_NOTE_NOT_FOUND = "Note introuvable."
DETAIL_DELETE_FORBIDDEN = "Seul l'auteur de la note ou un admin peut la supprimer."
DETAIL_VISIBILITY_FORBIDDEN = "Seul l'auteur de la note peut changer sa visibilité."
DETAIL_VERSION_NOT_FOUND = "Version introuvable."


class Tab(StrEnum):
    MINE = "mine"
    PUBLIC = "public"


def _note_out(note: Note, author: User, session: Session) -> NoteOut:
    locked_by = None
    if note.locked_by_id is not None:
        holder = session.get(User, note.locked_by_id)
        if holder is not None:
            locked_by = LockedBy(id=holder.id, display_name=holder.display_name)
    return NoteOut(
        id=note.id,
        title=note.title,
        body=note.body,
        color=note.color,
        visibility=note.visibility,
        owner_id=note.owner_id,
        author_name=author.display_name,
        created_at=note.created_at,
        updated_at=note.updated_at,
        # Stale locks are reported as-is: an expiry in the past is exactly what
        # lets a reader offer the takeover (E5-S3).
        locked_by=locked_by,
        lock_expires_at=note.lock_expires_at,
    )


def _version_out(version: NoteVersion, author: User) -> VersionOut:
    return VersionOut(
        id=version.id,
        note_id=version.note_id,
        author_id=version.author_id,
        author_name=author.display_name,
        title=version.title,
        body=version.body,
        color=version.color,
        visibility=version.visibility,
        created_at=version.created_at,
    )


def _lock_conflict_detail(note: Note, session: Session) -> dict:
    """The 409 body: who holds the lock (FR-L5), or that a lock is required.

    `code: "note_locked"` = someone else holds a fresh lock (carries the holder);
    `code: "lock_required"` = the note is free/stale but the caller saved without
    a valid lock — re-acquiring is enough. Timestamps are ISO strings (the
    exception body is JSON-encoded directly, not by pydantic).
    """
    holder = session.get(User, note.locked_by_id) if note.locked_by_id is not None else None
    if holder is not None and not locks.is_stale(note.lock_expires_at):
        return {
            "code": "note_locked",
            "message": f"{holder.display_name} est en cours d'édition.",
            "locked_by": {"id": holder.id, "display_name": holder.display_name},
            "lock_expires_at": (
                note.lock_expires_at.isoformat() if note.lock_expires_at is not None else None
            ),
        }
    return {
        "code": "lock_required",
        "message": "Un verrou actif est requis pour modifier une note publique.",
        "locked_by": None,
        "lock_expires_at": None,
    }


def _get_readable_note(note_id: str, user: User, session: SessionDep) -> Note:
    """Load a note the caller may read: their own, or any member's PUBLIC one.

    Unknown id and someone else's private note both answer the same 404 — the
    existence of a private note is not revealed (ARCHITECTURE §4.2).
    """
    note = session.get(Note, note_id)
    if note is None or (note.visibility != Visibility.PUBLIC and note.owner_id != user.id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=DETAIL_NOTE_NOT_FOUND)
    return note


@router.get("", response_model=list[NoteOut])
def list_notes(user: CurrentUser, session: SessionDep, tab: Tab = Tab.MINE) -> list[NoteOut]:
    query = select(Note, User).where(Note.owner_id == User.id)
    if tab is Tab.MINE:
        query = query.where(Note.owner_id == user.id)
    else:
        query = query.where(Note.visibility == Visibility.PUBLIC)
    rows = session.exec(query.order_by(col(Note.updated_at).desc())).all()
    return [_note_out(note, author, session) for note, author in rows]


@router.post("", status_code=status.HTTP_201_CREATED, response_model=NoteOut)
def create_note(data: NoteIn, user: CurrentUser, session: SessionDep) -> NoteOut:
    note = Note(
        title=data.title,
        body=data.body,
        color=data.color,
        visibility=data.visibility,
        owner_id=user.id,
    )
    # A brand-new note's "last saved version" == its creation: keeping the two
    # equal lets E6 tell an untouched note from an edited one (no first version
    # for a mere open-and-close, FR-H1).
    note.updated_at = note.created_at
    session.add(note)
    session.commit()
    session.refresh(note)
    return _note_out(note, user, session)


@router.get("/{note_id}", response_model=NoteOut)
def read_note(note_id: str, user: CurrentUser, session: SessionDep) -> NoteOut:
    note = _get_readable_note(note_id, user, session)
    author = session.get(User, note.owner_id)
    assert author is not None  # FK guarantees the owner exists
    return _note_out(note, author, session)


@router.patch("/{note_id}", response_model=NoteOut)
def patch_note(note_id: str, data: NotePatch, user: CurrentUser, session: SessionDep) -> NoteOut:
    # Readable ⇒ content-editable in E3: own notes, and any member's public note
    # (the single-editor lock takes over public mutations in E5 with a 409).
    note = _get_readable_note(note_id, user, session)
    # Drop explicit nulls: every Note column is NOT NULL, so `{"title": null}`
    # would otherwise reach the DB and 500. A null means "leave unchanged".
    changes = {k: v for k, v in data.model_dump(exclude_unset=True).items() if v is not None}
    # Visibility is owner-only (ARCHITECTURE §4.2: neither members nor admins may
    # flip it) — flipping a public note to private removes it from everyone's
    # board, which only its owner may decide.
    if (
        "visibility" in changes
        and changes["visibility"] != note.visibility
        and note.owner_id != user.id
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail=DETAIL_VISIBILITY_FORBIDDEN
        )
    # Single-editor enforcement (FR-L2): mutating a PUBLIC note requires holding
    # a fresh lock — the server decides, never the client. Private notes are
    # single-owner and edit lock-free.
    if (
        changes
        and note.visibility == Visibility.PUBLIC
        and not locks.holds_valid_lock(note, user.id)
    ):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail=_lock_conflict_detail(note, session)
        )
    for field, value in changes.items():
        setattr(note, field, value)
    if changes:
        note.updated_at = _utcnow()
    session.add(note)
    session.commit()
    session.refresh(note)
    author = session.get(User, note.owner_id)
    assert author is not None
    return _note_out(note, author, session)


@router.post("/{note_id}/lock", response_model=NoteOut)
def lock_note(note_id: str, user: CurrentUser, session: SessionDep) -> NoteOut:
    """Acquire or renew (heartbeat ~20 s) the single-editor lock.

    The grant is one atomic conditional UPDATE (ARCHITECTURE §5): two
    near-simultaneous acquisitions race on the row and exactly one wins — the
    loser gets a 409 naming the holder (FR-L1/FR-L5).
    """
    note = _get_readable_note(note_id, user, session)
    if not locks.acquire(session, note.id, user.id):
        session.refresh(note)  # re-read who won
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail=_lock_conflict_detail(note, session)
        )
    session.refresh(note)
    author = session.get(User, note.owner_id)
    assert author is not None
    return _note_out(note, author, session)


@router.delete("/{note_id}/lock", status_code=status.HTTP_204_NO_CONTENT)
def unlock_note(note_id: str, user: CurrentUser, session: SessionDep) -> None:
    """Release the caller's lock — idempotent, and never touches someone else's.

    Releasing ends a PUBLIC note's editing session, so a version is snapshotted
    here (one session = one version, E6-S2). A double-release (no lock actually
    dropped) stays version-free, and a no-op session is skipped by
    `snapshot_if_changed`.
    """
    note = _get_readable_note(note_id, user, session)
    if locks.release(session, note.id, user.id):
        versions.snapshot_if_changed(session, note.id, user.id)


@router.post(
    "/{note_id}/versions", status_code=status.HTTP_201_CREATED, response_model=VersionOut | None
)
def end_session(note_id: str, user: CurrentUser, session: SessionDep) -> VersionOut | None:
    """End a PRIVATE note's editing session → snapshot a version (E6-S2).

    A private note carries no lock, so the client signals the session end on
    editor close. Public notes version on lock release instead, so this is a
    no-op for them. Returns the new version, or `null` when nothing changed.
    """
    note = _get_readable_note(note_id, user, session)
    if note.visibility == Visibility.PUBLIC:
        return None
    version = versions.snapshot_if_changed(session, note.id, user.id)
    return _version_out(version, user) if version is not None else None


@router.get("/{note_id}/versions", response_model=list[VersionOut])
def list_versions(note_id: str, user: CurrentUser, session: SessionDep) -> list[VersionOut]:
    """History of a note, newest-first — visibility-gated exactly like the note
    (private-note history is owner-only, FR-H2). Each entry carries the author's
    display name for « Modifié par X » / « Créée par X »."""
    _get_readable_note(note_id, user, session)  # 404s a private note for non-owners
    rows = session.exec(
        select(NoteVersion, User)
        .where(NoteVersion.author_id == User.id)
        .where(NoteVersion.note_id == note_id)
        .order_by(col(NoteVersion.created_at).desc(), col(NoteVersion.id).desc())
    ).all()
    return [_version_out(version, author) for version, author in rows]


@router.post("/{note_id}/restore/{version_id}", response_model=NoteOut)
def restore_version(
    note_id: str, version_id: str, user: CurrentUser, session: SessionDep
) -> NoteOut:
    """Restore a version: the note's content becomes the chosen snapshot and a
    **new** version is appended — nothing is overwritten (FR-H4).

    Access mirrors editing: a PUBLIC note is lock-checked (the restore grabs the
    single-editor lock atomically, 409 if someone else holds it, then releases
    it); a PRIVATE note is owner-only (enforced by readability). Flipping
    visibility stays owner-only, so a non-owner restore keeps the current one.
    """
    note = _get_readable_note(note_id, user, session)
    version = session.get(NoteVersion, version_id)
    if version is None or version.note_id != note_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=DETAIL_VERSION_NOT_FOUND
        )
    grabbed_lock = False
    if note.visibility == Visibility.PUBLIC:
        if not locks.acquire(session, note.id, user.id):
            session.refresh(note)
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT, detail=_lock_conflict_detail(note, session)
            )
        grabbed_lock = True
        session.refresh(note)
    versions.restore(
        session, note, version, user.id, apply_visibility=(note.owner_id == user.id)
    )
    if grabbed_lock:
        locks.release(session, note.id, user.id)  # the restore already wrote the version
    session.refresh(note)
    author = session.get(User, note.owner_id)
    assert author is not None
    return _note_out(note, author, session)


@router.delete("/{note_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_note(note_id: str, user: CurrentUser, session: SessionDep) -> None:
    note = session.get(Note, note_id)
    if note is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=DETAIL_NOTE_NOT_FOUND)
    if note.owner_id != user.id and user.role != Role.ADMIN:
        # A member sees the public note they may not delete (403); a private note
        # they can't even see keeps answering 404.
        if note.visibility == Visibility.PUBLIC:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN, detail=DETAIL_DELETE_FORBIDDEN
            )
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=DETAIL_NOTE_NOT_FOUND)
    session.delete(note)
    session.commit()
