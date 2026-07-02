"""
Auth — register (server-side allowlist check), login, refresh, me.

Endpoints (handoff §5 / ARCHITECTURE §8):
  POST /api/auth/register   → 403 if email off-allowlist; 201 + {access, refresh}.
                              The FIRST account ever created becomes ADMIN and
                              bypasses the allowlist (bootstrap, FR-A1).
  POST /api/auth/login      → 401 bad credentials; 403 if status=DISABLED
  POST /api/auth/refresh    → new access token; 401 if invalid/expired
  GET  /api/auth/me         → current user (role drives the /admin entry)

Logout is client-side (drop the tokens) — no endpoint.
"""

from fastapi import APIRouter, HTTPException, status
from sqlmodel import select

from app.db import SessionDep
from app.models import AllowlistEntry, Role, User, UserStatus
from app.schemas import AccessOut, LoginIn, RefreshIn, RegisterIn, TokenPair, UserOut
from app.security import (
    CurrentUser,
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _normalize_email(email: str) -> str:
    # Emails are compared and stored lowercase (allowlist match is server-side).
    return email.strip().lower()


def _token_pair(user: User) -> TokenPair:
    return TokenPair(access=create_access_token(user.id), refresh=create_refresh_token(user.id))


@router.post("/register", status_code=status.HTTP_201_CREATED, response_model=TokenPair)
def register(data: RegisterIn, session: SessionDep) -> TokenPair:
    email = _normalize_email(data.email)

    if session.exec(select(User).where(User.email == email)).first() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Un compte existe déjà avec cette adresse e-mail.",
        )

    # Bootstrap: the first account ever created becomes ADMIN, bypassing the
    # allowlist (FR-A1). Every later sign-up is allowlist-gated (FR-A2).
    is_bootstrap = session.exec(select(User)).first() is None
    if not is_bootstrap:
        allowed = session.exec(select(AllowlistEntry).where(AllowlistEntry.email == email)).first()
        if allowed is None:
            # No account is created; the front shows the "Accès non autorisé" screen.
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=(
                    f"L'adresse {email} ne figure pas sur la liste des membres "
                    "autorisés de cette instance Keepou."
                ),
            )

    user = User(
        email=email,
        display_name=data.display_name.strip(),
        password_hash=hash_password(data.password),
        role=Role.ADMIN if is_bootstrap else Role.MEMBER,
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    return _token_pair(user)


@router.post("/login", response_model=TokenPair)
def login(data: LoginIn, session: SessionDep) -> TokenPair:
    email = _normalize_email(data.email)
    user = session.exec(select(User).where(User.email == email)).first()
    # Same 401 for unknown email and wrong password (no account enumeration).
    if user is None or not verify_password(data.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="E-mail ou mot de passe incorrect.",
        )
    if user.status == UserStatus.DISABLED:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Ton accès a été suspendu. Contacte l'administrateur.",
        )
    return _token_pair(user)


@router.post("/refresh", response_model=AccessOut)
def refresh(data: RefreshIn, session: SessionDep) -> AccessOut:
    try:
        user_id = decode_token(data.refresh, expected_type="refresh")
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
        # A disabled user cannot mint fresh access tokens (FR-A5).
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Ton accès a été suspendu. Contacte l'administrateur.",
        )
    return AccessOut(access=create_access_token(user.id))


@router.get("/me", response_model=UserOut)
def me(user: CurrentUser) -> User:
    return user
