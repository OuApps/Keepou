"""
Pydantic input/output schemas for the API.

Conventions (handoff §5): explicit schemas in and out, error codes via
HTTPException (401, 403, 409); the front only displays what the API returns
(sensitive checks server-side). Filled story by story — E2 brings the auth set.
"""

from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, BeforeValidator, EmailStr, Field

from app.models import NoteColor, Role, UserStatus, Visibility


def _normalize_email(value: object) -> object:
    # Emails are compared and stored lowercase (server-side allowlist match).
    return value.strip().lower() if isinstance(value, str) else value


NormalizedEmail = Annotated[EmailStr, BeforeValidator(_normalize_email)]


class RegisterIn(BaseModel):
    email: NormalizedEmail
    # bcrypt_sha256 pre-hashes with SHA-256, so the whole 128 chars count
    # (no silent truncation at bcrypt's 72-byte limit).
    password: str = Field(min_length=8, max_length=128)
    display_name: str = Field(min_length=1, max_length=80)


class LoginIn(BaseModel):
    email: NormalizedEmail
    password: str


class RefreshIn(BaseModel):
    refresh: str


class TokenPair(BaseModel):
    access: str
    refresh: str


class AccessOut(BaseModel):
    access: str


class UserOut(BaseModel):
    id: str
    email: str
    display_name: str
    role: Role
    status: UserStatus
    created_at: datetime


class MemberOut(BaseModel):
    """One row of the admin listing (E7-S1): a registered member (has a `User`)
    or a pending invitee (allowlisted email, no account yet)."""

    email: str
    pending: bool
    # Registered members only (null while pending):
    user_id: str | None = None
    display_name: str | None = None
    role: Role | None = None
    status: UserStatus | None = None
    created_at: datetime | None = None
    # Allowlist side (a registered bootstrap admin has no entry):
    allowlist_id: str | None = None
    added_at: datetime | None = None


class AllowlistIn(BaseModel):
    email: NormalizedEmail


class AdminUserPatch(BaseModel):
    """Role/status change (E7-S3) — only the provided fields change; there is
    deliberately no way to delete a user (claude.md §5)."""

    role: Role | None = None
    status: UserStatus | None = None


class NoteIn(BaseModel):
    """Create payload — every field optional so the composer can send a title alone."""

    title: str = Field(default="", max_length=200)
    body: str = ""
    color: NoteColor = NoteColor.GOLD
    visibility: Visibility = Visibility.PRIVATE


class NotePatch(BaseModel):
    """Consolidated editor update (E4-S1): only the provided fields change."""

    title: str | None = Field(default=None, max_length=200)
    body: str | None = None
    color: NoteColor | None = None
    visibility: Visibility | None = None


class LockedBy(BaseModel):
    """Who holds the single-editor lock — enough for « Bob est en cours d'édition »."""

    id: str
    display_name: str


class NoteOut(BaseModel):
    id: str
    title: str
    body: str
    color: NoteColor
    visibility: Visibility
    owner_id: str
    # Display name of the owner — the Public tab shows « <auteur> · modifié <date> ».
    author_name: str
    created_at: datetime
    updated_at: datetime
    # Single-editor lock state (E5-S3) — the read-only short-poll source. A
    # stale lock (expiry in the past) is reported as-is so the front can offer
    # the takeover; both are null when unlocked.
    locked_by: LockedBy | None = None
    lock_expires_at: datetime | None = None


class VersionOut(BaseModel):
    """One history entry (E6): who + when + the full snapshot, re-rendered
    as-is by the front (no visual diff, claude.md §3)."""

    id: str
    note_id: str
    author_id: str
    # Display name behind « Modifié par X » / « Créée par X » (HANDOFF §7).
    author_name: str
    title: str
    body: str
    color: NoteColor
    visibility: Visibility
    created_at: datetime
