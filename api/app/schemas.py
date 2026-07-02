"""
Pydantic input/output schemas for the API.

Conventions (handoff §5): explicit schemas in and out, error codes via
HTTPException (401, 403, 409); the front only displays what the API returns
(sensitive checks server-side). Filled story by story — E2 brings the auth set.
"""

from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, BeforeValidator, EmailStr, Field

from app.models import Role, UserStatus


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
