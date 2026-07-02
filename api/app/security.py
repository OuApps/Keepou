"""
Security: password hash, JWT bearer tokens, authz dependencies.

- `hash_password` / `verify_password` via passlib (bcrypt) — FR-A3;
- signed JWT access + refresh tokens (`Authorization: Bearer <access>`),
  stateless flow per ARCHITECTURE §8 (no session table);
- `get_current_user` re-loads the user and re-checks `status == ACTIVE` on
  **every** request, so disabling takes effect immediately (FR-A5);
- `require_admin` (403 if not admin) — real guard for /admin (claude.md §6).
"""

from datetime import UTC, datetime, timedelta
from typing import Annotated

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from passlib.context import CryptContext
from sqlmodel import Session

from app.config import settings
from app.db import get_session
from app.models import Role, User, UserStatus

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

JWT_ALGORITHM = "HS256"

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


def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
    session: Annotated[Session, Depends(get_session)],
) -> User:
    """Resolve the bearer access token to an ACTIVE user (server-side, every request)."""
    if credentials is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Non authentifié.")
    try:
        user_id = decode_token(credentials.credentials, expected_type="access")
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Session invalide ou expirée."
        ) from None
    user = session.get(User, user_id)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Session invalide ou expirée."
        )
    if user.status != UserStatus.ACTIVE:
        # Status re-read from the DB on every request → deactivation is immediate.
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Ton accès a été suspendu. Contacte l'administrateur.",
        )
    return user


def require_admin(user: Annotated[User, Depends(get_current_user)]) -> User:
    if user.role != Role.ADMIN:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Accès réservé.")
    return user


# Reusable dependency aliases for routers (FastAPI Annotated idiom).
CurrentUser = Annotated[User, Depends(get_current_user)]
AdminUser = Annotated[User, Depends(require_admin)]
