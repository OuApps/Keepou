"""
Keepou data model (SQLModel).

Tables land story by story (E2: User + AllowlistEntry, E3: Note, E6:
NoteVersion). E8 adds the board-organization flags `Note.pinned` /
`Note.archived` (own migration) — feature-aligned, no dead columns before
their feature ships.

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


class Language(StrEnum):
    """UI language preference (E12). Stored server-side so it follows the member
    across devices; the front mirrors it in localStorage for a flash-free boot.
    The product is francophone-first, so FR is the default (design/claude.md)."""

    FR = "FR"
    EN = "EN"


class User(SQLModel, table=True):
    """A member of the instance. Emails are stored normalized (lowercase)."""

    id: str = Field(default_factory=_id, primary_key=True)
    email: str = Field(unique=True, index=True)
    display_name: str
    password_hash: str
    role: Role = Role.MEMBER
    status: UserStatus = UserStatus.ACTIVE
    # Preferred UI language (E12) — the source of truth is the server; the SPA
    # keeps a localStorage cache so it can render before /auth/me resolves.
    language: Language = Language.FR
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

    `NoteVersion` arrives in E6, the `pinned` / `archived` board flags in E8 —
    each with its own migration (feature-aligned).
    """

    id: str = Field(default_factory=_id, primary_key=True)
    title: str = ""
    body: str = ""  # Markdown (GFM task lists)
    color: NoteColor = NoteColor.GOLD
    visibility: Visibility = Visibility.PRIVATE
    owner_id: str = Field(foreign_key="user.id", index=True)
    # Board-organization flags (E8), owner-only metadata — no lock, no version:
    # `pinned` floats the note to the top of its board; `archived` hides it from
    # every board without deleting it (FR-N8).
    pinned: bool = False
    archived: bool = False
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
    """Append-only full snapshot of a note (E6) — 1 editing session = 1 version.

    One row per session end (lock release / editor close), plus the creation
    snapshot (the « Créée par X » history root). Restore appends a new row,
    nothing is ever overwritten (FR-H4); all versions are kept (ARCHITECTURE
    §6, no pruning in MVP).
    """

    __table_args__ = (
        # The history read path — a note's versions, newest first. The
        # composite index also covers plain note_id lookups (FK side).
        Index("ix_noteversion_note_id_created_at", "note_id", "created_at"),
    )

    id: str = Field(default_factory=_id, primary_key=True)
    note_id: str = Field(foreign_key="note.id")
    author_id: str = Field(foreign_key="user.id")
    title: str
    body: str  # Markdown snapshot
    color: NoteColor
    visibility: Visibility
    created_at: datetime = Field(default_factory=_utcnow)


class PersonalAccessToken(SQLModel, table=True):
    """A long-lived bearer token an agent uses to reach Keepou over MCP (E13).

    JWT access tokens live ~15 min — too short for an always-on agent — so a
    member mints a Personal Access Token instead, shown once at creation. Only
    its SHA-256 hash is stored (never the secret, like a password): resolving a
    presented token is a single indexed lookup on `token_hash`. `prefix` keeps a
    non-secret display label (« kpat_abcd… »); `revoked_at` disables it without
    deleting the row, so a revoked token can never be silently re-enabled.
    """

    id: str = Field(default_factory=_id, primary_key=True)
    user_id: str = Field(foreign_key="user.id", index=True)
    name: str  # member-chosen label, e.g. « Bot WhatsApp »
    token_hash: str = Field(unique=True, index=True)  # sha256 hex of the secret
    prefix: str  # first chars of the secret, for display only
    created_at: datetime = Field(default_factory=_utcnow)
    last_used_at: datetime | None = None
    revoked_at: datetime | None = None  # set = disabled (never deleted on revoke)
