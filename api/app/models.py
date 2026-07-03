"""
Keepou data model (SQLModel).

Tables land story by story (E2: User + AllowlistEntry, E3: Note, E6:
NoteVersion). The Note `archived` column is **specified** in
`design/HANDOFF.md` §4 and arrives with its epic (E8) — feature-aligned
migrations, no dead columns before their feature ships.

Structural points to respect during implementation:
- Lock carried by the Note (1 lock max) → atomic conditional update (E5).
- "Pending" = AllowlistEntry whose email has no User (LEFT JOIN on email).
- Note.updated_at = "last saved version"; NoteVersion.created_at = history timestamp.
- Disable, never delete (UserStatus.DISABLED).
"""

import uuid
from datetime import UTC, datetime
from enum import StrEnum

from sqlalchemy import Index
from sqlmodel import Field, SQLModel  # noqa: F401  (re-export for Alembic / metadata)


def _id() -> str:
    return uuid.uuid4().hex


def _utcnow() -> datetime:
    # Naive UTC, matching the naive DateTime() columns: every timestamp in the
    # app and the DB is UTC by convention. (datetime.utcnow is deprecated;
    # this is its tz-safe equivalent.)
    return datetime.now(UTC).replace(tzinfo=None)


class Role(StrEnum):
    MEMBER = "MEMBER"
    ADMIN = "ADMIN"


class UserStatus(StrEnum):
    ACTIVE = "ACTIVE"
    DISABLED = "DISABLED"  # never deleted (claude.md §5)


class User(SQLModel, table=True):
    """A member of the instance. Emails are stored normalized (lowercase)."""

    id: str = Field(default_factory=_id, primary_key=True)
    email: str = Field(unique=True, index=True)
    display_name: str
    password_hash: str
    role: Role = Role.MEMBER
    status: UserStatus = UserStatus.ACTIVE
    created_at: datetime = Field(default_factory=_utcnow)


class AllowlistEntry(SQLModel, table=True):
    """An email allowed to register. "Pending" = entry whose email has no User."""

    id: str = Field(default_factory=_id, primary_key=True)
    email: str = Field(unique=True, index=True)
    added_by_id: str = Field(foreign_key="user.id")
    added_at: datetime = Field(default_factory=_utcnow)


class NoteColor(StrEnum):
    """The 5 card shades — stored as identifiers, never hex (FR-N4, handoff §1)."""

    GOLD = "GOLD"
    AVOCAT = "AVOCAT"
    SALSA = "SALSA"
    CLAY = "CLAY"
    TEAL = "TEAL"


class Visibility(StrEnum):
    PRIVATE = "PRIVATE"
    PUBLIC = "PUBLIC"


class Note(SQLModel, table=True):
    """A note: Markdown body (GFM task lists), title in its own field (handoff §3.3).

    History lives in `NoteVersion` (E6); `archived` arrives in E8 with its own
    migration (feature-aligned).
    """

    id: str = Field(default_factory=_id, primary_key=True)
    title: str = ""
    body: str = ""  # Markdown (GFM task lists)
    color: NoteColor = NoteColor.GOLD
    visibility: Visibility = Visibility.PRIVATE
    owner_id: str = Field(foreign_key="user.id", index=True)
    created_at: datetime = Field(default_factory=_utcnow)
    updated_at: datetime = Field(default_factory=_utcnow)  # = "last saved version"
    # Single-editor lock (E5) — at most one active lock, carried by the note so
    # acquisition is an atomic conditional UPDATE (ARCHITECTURE §5). All three
    # are NULL when the note is unlocked; a lock past `lock_expires_at` is stale
    # and claimable by anyone.
    locked_by_id: str | None = Field(default=None, foreign_key="user.id")
    locked_at: datetime | None = None
    lock_expires_at: datetime | None = None


class NoteVersion(SQLModel, table=True):
    """One editing session = one version (E6, handoff §3.4).

    Append-only snapshot of the note (title/body/color/visibility) plus who and
    when — the history list re-renders a version *as-is*, there is no diff. A
    version is born when the session ends (public: lock release; private: editor
    close) and on restore (which appends a new version, never overwrites). All
    versions are kept — snapshots are small Markdown text (ARCHITECTURE §6).
    """

    __table_args__ = (Index("ix_noteversion_note_id_created_at", "note_id", "created_at"),)

    id: str = Field(default_factory=_id, primary_key=True)
    note_id: str = Field(foreign_key="note.id", index=True)
    author_id: str = Field(foreign_key="user.id")
    title: str
    body: str  # Markdown snapshot
    color: NoteColor
    visibility: Visibility
    created_at: datetime = Field(default_factory=_utcnow)  # history timestamp
