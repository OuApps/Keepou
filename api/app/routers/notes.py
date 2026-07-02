"""
Notes — board CRUD (E3). Lock lands in E5, versions/restore in E6.

Endpoints (handoff §5):
  GET    /api/notes?tab=mine|public   mine = caller's notes; public = all members'
                                      PUBLIC notes (author + updated_at). Newest-first.
  POST   /api/notes                   create (owner = caller)
  GET    /api/notes/{id}              visibility-checked
  PATCH  /api/notes/{id}              base update (title, body, color, visibility)
  DELETE /api/notes/{id}              owner or admin only (FR-N6)

Permissions (server-side, ARCHITECTURE §4.2):
- A private note is invisible to non-owners — including admins — and answers 404
  (not 403) so its very existence stays shielded.
- A public note is readable and editable by any member (the single-editor lock
  guarding those mutations arrives in E5); deletion stays owner/admin (403).
"""

from enum import StrEnum

from fastapi import APIRouter, HTTPException, status
from sqlmodel import col, select

from app.db import SessionDep
from app.models import Note, Role, User, Visibility, _utcnow
from app.schemas import NoteIn, NoteOut, NotePatch
from app.security import CurrentUser

router = APIRouter(prefix="/api/notes", tags=["notes"])

DETAIL_NOTE_NOT_FOUND = "Note introuvable."
DETAIL_DELETE_FORBIDDEN = "Seul l'auteur de la note ou un admin peut la supprimer."
DETAIL_VISIBILITY_FORBIDDEN = "Seul l'auteur de la note peut changer sa visibilité."


class Tab(StrEnum):
    MINE = "mine"
    PUBLIC = "public"


def _note_out(note: Note, author: User) -> NoteOut:
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
    )


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
    return [_note_out(note, author) for note, author in rows]


@router.post("", status_code=status.HTTP_201_CREATED, response_model=NoteOut)
def create_note(data: NoteIn, user: CurrentUser, session: SessionDep) -> NoteOut:
    note = Note(
        title=data.title,
        body=data.body,
        color=data.color,
        visibility=data.visibility,
        owner_id=user.id,
    )
    session.add(note)
    session.commit()
    session.refresh(note)
    return _note_out(note, user)


@router.get("/{note_id}", response_model=NoteOut)
def read_note(note_id: str, user: CurrentUser, session: SessionDep) -> NoteOut:
    note = _get_readable_note(note_id, user, session)
    author = session.get(User, note.owner_id)
    assert author is not None  # FK guarantees the owner exists
    return _note_out(note, author)


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
    for field, value in changes.items():
        setattr(note, field, value)
    if changes:
        note.updated_at = _utcnow()
    session.add(note)
    session.commit()
    session.refresh(note)
    author = session.get(User, note.owner_id)
    assert author is not None
    return _note_out(note, author)


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
