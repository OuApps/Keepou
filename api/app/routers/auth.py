"""
Auth — register (server-side allowlist check), login, refresh, me.

Endpoints (handoff §5 / ARCHITECTURE §8):
  POST /api/auth/register   → 403 if email off-allowlist; 409 if already
                              registered; 201 + {access, refresh}. The FIRST
                              account ever created becomes ADMIN and bypasses
                              the allowlist (bootstrap, FR-A1).
  POST /api/auth/login      → 401 bad credentials; 403 if status=DISABLED
  POST /api/auth/refresh    → new access token; 401 if invalid/expired
  GET  /api/auth/me         → current user (role drives the /admin entry)

Logout is client-side (drop the tokens) — no endpoint.
"""

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, select

from app.db import SessionDep
from app.models import AllowlistEntry, Role, User, UserStatus
from app.schemas import AccessOut, LoginIn, RefreshIn, RegisterIn, TokenPair, UserOut
from app.security import (
    DETAIL_ACCOUNT_DISABLED,
    CurrentUser,
    create_access_token,
    create_refresh_token,
    hash_password,
    resolve_active_user,
    verify_password,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])

DETAIL_DUPLICATE_EMAIL = "Un compte existe déjà avec cette adresse e-mail."
DETAIL_BAD_CREDENTIALS = "E-mail ou mot de passe incorrect."

# Verified against when the email is unknown, so login costs one bcrypt pass
# either way — otherwise response latency would reveal which emails exist.
_TIMING_EQUALIZER_HASH = hash_password("keepou-timing-equalizer")


def _token_pair(user: User) -> TokenPair:
    return TokenPair(access=create_access_token(user.id), refresh=create_refresh_token(user.id))


def _is_bootstrap(session: Session) -> bool:
    return session.exec(select(User)).first() is None


@router.post("/register", status_code=status.HTTP_201_CREATED, response_model=TokenPair)
def register(data: RegisterIn, session: SessionDep) -> TokenPair:
    if session.exec(select(User).where(User.email == data.email)).first() is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=DETAIL_DUPLICATE_EMAIL)

    # Bootstrap: the first account ever created becomes ADMIN, bypassing the
    # allowlist (FR-A1). Every later sign-up is allowlist-gated (FR-A2).
    is_bootstrap = _is_bootstrap(session)
    if is_bootstrap and session.get_bind().dialect.name == "postgresql":
        # Serialize the bootstrap decision: without this, two concurrent first
        # registrations (different emails) could both see an empty table and
        # both become ADMIN. The advisory lock is held until commit/rollback.
        # SQLite (dev, single user) keeps the tiny theoretical window.
        session.connection().execute(
            text("SELECT pg_advisory_xact_lock(hashtext('keepou.bootstrap'))")
        )
        is_bootstrap = _is_bootstrap(session)
    if not is_bootstrap:
        allowed = session.exec(
            select(AllowlistEntry).where(AllowlistEntry.email == data.email)
        ).first()
        if allowed is None:
            # No account is created; the front shows the "Accès non autorisé" screen.
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=(
                    f"L'adresse {data.email} ne figure pas sur la liste des membres "
                    "autorisés de cette instance Keepou."
                ),
            )

    user = User(
        email=data.email,
        display_name=data.display_name.strip(),
        password_hash=hash_password(data.password),
        role=Role.ADMIN if is_bootstrap else Role.MEMBER,
    )
    session.add(user)
    try:
        session.commit()
    except IntegrityError:
        # A concurrent register with the same email slipped past the pre-check;
        # the unique index on user.email is the real gate → same 409 contract.
        session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail=DETAIL_DUPLICATE_EMAIL
        ) from None
    session.refresh(user)
    return _token_pair(user)


@router.post("/login", response_model=TokenPair)
def login(data: LoginIn, session: SessionDep) -> TokenPair:
    user = session.exec(select(User).where(User.email == data.email)).first()
    # Uniform 401 AND uniform cost: bcrypt runs against a dummy hash when the
    # email is unknown, so latency doesn't reveal which accounts exist.
    password_ok = verify_password(
        data.password, user.password_hash if user is not None else _TIMING_EQUALIZER_HASH
    )
    if user is None or not password_ok:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=DETAIL_BAD_CREDENTIALS)
    if user.status == UserStatus.DISABLED:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=DETAIL_ACCOUNT_DISABLED)
    return _token_pair(user)


@router.post("/refresh", response_model=AccessOut)
def refresh(data: RefreshIn, session: SessionDep) -> AccessOut:
    # Same decode → load → ACTIVE-check as the access-token path (FR-A5:
    # a disabled user cannot mint fresh access tokens).
    user = resolve_active_user(data.refresh, expected_type="refresh", session=session)
    return AccessOut(access=create_access_token(user.id))


@router.get("/me", response_model=UserOut)
def me(user: CurrentUser) -> User:
    return user
