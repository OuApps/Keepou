"""
Security: password hash, JWT bearer tokens, authz dependencies.

- `hash_password` / `verify_password` via passlib **bcrypt_sha256** (SHA-256
  pre-hash, then bcrypt) — FR-A3; long passphrases keep their full entropy
  instead of being silently truncated at bcrypt's 72-byte limit;
- signed JWT access + refresh tokens (`Authorization: Bearer <access>`),
  stateless flow per ARCHITECTURE §8 (no session table);
- `resolve_active_user` / `get_current_user` re-load the user and re-check
  `status == ACTIVE` on **every** request, so disabling takes effect
  immediately (FR-A5). The disabled 403 carries `code: "account_disabled"`
  so the client can tell it apart from a plain forbidden-resource 403;
- `require_admin` (403 if not admin) — real guard for /admin (claude.md §6).
"""

import hashlib
import secrets
from datetime import UTC, datetime, timedelta
from typing import Annotated

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from passlib.context import CryptContext
from sqlmodel import Session

from app.config import settings
from app.db import SessionDep
from app.models import Role, User, UserStatus

pwd_context = CryptContext(schemes=["bcrypt_sha256"], deprecated="auto")

JWT_ALGORITHM = "HS256"

# Personal Access Tokens (E13): high-entropy random secrets used as MCP bearer
# tokens. Being random (not user-chosen), a plain SHA-256 is safe to store and
# lets resolution be one indexed lookup — no per-candidate bcrypt pass.
PAT_PREFIX = "kpat_"
PAT_SECRET_BYTES = 32  # 256 bits of entropy


def generate_pat() -> tuple[str, str, str]:
    """Mint a new token: returns (secret, token_hash, display_prefix).

    Only the hash is persisted; the secret is shown to the member exactly once.
    """
    secret = PAT_PREFIX + secrets.token_urlsafe(PAT_SECRET_BYTES)
    return secret, hash_token(secret), secret[: len(PAT_PREFIX) + 6]


def hash_token(secret: str) -> str:
    return hashlib.sha256(secret.encode()).hexdigest()


# Agent-token resolution lives in services/bot.py: tokens now belong exclusively
# to the Botou identity (E13 rework), so resolving one is bot-scoped, not a plain
# owner lookup.

DETAIL_NOT_AUTHENTICATED = "Non authentifié."
DETAIL_INVALID_SESSION = "Session invalide ou expirée."
# Structured detail: the client logs the session out on `account_disabled`,
# while other 403s (e.g. E7's admin guard) stay in place.
DETAIL_ACCOUNT_DISABLED = {
    "code": "account_disabled",
    "message": "Ton accès a été suspendu. Contacte l'administrateur.",
}

# auto_error=False so a missing header raises our own 401 (not FastAPI's 403).
bearer_scheme = HTTPBearer(auto_error=False)


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    return pwd_context.verify(password, password_hash)


def _create_token(user_id: str, token_type: str, ttl: timedelta) -> str:
    now = datetime.now(UTC)
    payload = {"sub": user_id, "type": token_type, "iat": now, "exp": now + ttl}
    return jwt.encode(payload, settings.session_secret, algorithm=JWT_ALGORITHM)


def create_access_token(user_id: str) -> str:
    return _create_token(user_id, "access", timedelta(minutes=settings.access_token_ttl_minutes))


def create_refresh_token(user_id: str) -> str:
    return _create_token(user_id, "refresh", timedelta(days=settings.refresh_token_ttl_days))


def decode_token(token: str, expected_type: str) -> str:
    """Validate signature + expiry + token type; return the user id (`sub`).

    Raises ``ValueError`` on any invalid/expired/tampered token — callers map it
    to an HTTP 401.
    """
    try:
        payload = jwt.decode(token, settings.session_secret, algorithms=[JWT_ALGORITHM])
    except jwt.InvalidTokenError as exc:
        raise ValueError("invalid token") from exc
    if payload.get("type") != expected_type or not isinstance(payload.get("sub"), str):
        raise ValueError("invalid token")
    return payload["sub"]


def resolve_active_user(token: str, expected_type: str, session: Session) -> User:
    """Decode a token, load its user, and enforce `status == ACTIVE`.

    Shared by `get_current_user` (access token) and `POST /api/auth/refresh`
    (refresh token). Status is re-read from the DB on every call → deactivation
    is immediate (FR-A5).
    """
    try:
        user_id = decode_token(token, expected_type=expected_type)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail=DETAIL_INVALID_SESSION
        ) from None
    user = session.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=DETAIL_INVALID_SESSION)
    if user.status != UserStatus.ACTIVE:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=DETAIL_ACCOUNT_DISABLED)
    return user


def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
    session: SessionDep,
) -> User:
    """Resolve the bearer access token to an ACTIVE user (server-side, every request)."""
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail=DETAIL_NOT_AUTHENTICATED
        )
    return resolve_active_user(credentials.credentials, expected_type="access", session=session)


def require_admin(user: Annotated[User, Depends(get_current_user)]) -> User:
    if user.role != Role.ADMIN:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Accès réservé.")
    return user


# Reusable dependency aliases for routers (FastAPI Annotated idiom).
CurrentUser = Annotated[User, Depends(get_current_user)]
AdminUser = Annotated[User, Depends(require_admin)]
