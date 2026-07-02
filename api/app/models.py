"""
Keepou data model (SQLModel).

Tables land story by story (E2: User + AllowlistEntry). The remaining tables
(Note + lock, NoteVersion) and enums (NoteColor, Visibility) are **specified**
in `design/HANDOFF.md` §4 and arrive with their epics (E3/E5/E6).

Structural points to respect during implementation:
- Lock carried by the Note (1 lock max) → atomic conditional update (E5).
- "Pending" = AllowlistEntry whose email has no User (LEFT JOIN on email).
- Note.updated_at = « dernière version enregistrée » ;
  NoteVersion.created_at = history timestamp.
- Disable, never delete (UserStatus.DISABLED).
"""

import uuid
from datetime import UTC, datetime
from enum import StrEnum

from sqlmodel import Field, SQLModel  # noqa: F401  (re-export for Alembic / metadata)


def _id() -> str:
    return uuid.uuid4().hex


def _utcnow() -> datetime:
    # Timezone-aware UTC (datetime.utcnow is deprecated); stored naive-UTC in the DB.
    return datetime.now(UTC)


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
