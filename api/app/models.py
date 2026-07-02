"""
Keepou data model (SQLModel).

⚠️ Scaffold: the real tables are defined story by story.
The full model (User, AllowlistEntry, Note + lock, NoteVersion) and the enums
(Role, UserStatus, NoteColor, Visibility) are **specified** in `design/HANDOFF.md` §4.

Structural points to respect during implementation:
- Lock carried by the Note (1 lock max) → atomic conditional update (E5).
- "Pending" = AllowlistEntry whose email has no User (LEFT JOIN on email).
- Note.updated_at = « dernière version enregistrée » ;
  NoteVersion.created_at = history timestamp.
- Disable, never delete (UserStatus.DISABLED).
"""

from sqlmodel import SQLModel  # noqa: F401  (re-export for Alembic / metadata)
