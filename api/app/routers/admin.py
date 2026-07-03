"""
Admin — access management (E7). Every route depends on `require_admin`
(claude.md §6: /admin is protected server-side; non-admins get 403).

Endpoints (handoff §5):
  GET    /api/admin/members              registered members + pending invitees
  POST   /api/admin/allowlist            {email} → appears as "En attente"
  DELETE /api/admin/allowlist/{id}       pending entries only (disable users instead)
  PATCH  /api/admin/users/{id}           {role|status} — never delete (FR-U4)

Rules enforced here:
- "Pending" = AllowlistEntry whose email has no User (LEFT JOIN on email).
- Disable, never delete: no route removes a User; DISABLED blocks the next
  request (status re-checked by get_current_user) and keeps the notes.
- Last-admin guard (FR-U5): the instance always keeps ≥ 1 ACTIVE admin — the
  last one cannot be demoted nor disabled, including by themselves.
"""

from fastapi import APIRouter, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlmodel import col, func, select

from app.db import SessionDep
from app.models import AllowlistEntry, Role, User, UserStatus
from app.schemas import AdminUserPatch, AllowlistIn, MemberOut, UserOut
from app.security import AdminUser

router = APIRouter(prefix="/api/admin", tags=["admin"])

DETAIL_ALREADY_ALLOWED = "Cette adresse est déjà dans la liste des membres autorisés."
DETAIL_ALREADY_REGISTERED = "Un compte existe déjà avec cette adresse e-mail."
DETAIL_ENTRY_NOT_FOUND = "Entrée introuvable."
DETAIL_ENTRY_HAS_ACCOUNT = (
    "Ce membre a déjà créé son compte — désactive le compte au lieu de retirer l'adresse."
)
DETAIL_USER_NOT_FOUND = "Membre introuvable."
DETAIL_LAST_ADMIN = "Impossible : l'instance doit toujours garder au moins un admin actif."


def _member_out(user: User, entry: AllowlistEntry | None) -> MemberOut:
    return MemberOut(
        email=user.email,
        pending=False,
        user_id=user.id,
        display_name=user.display_name,
        role=user.role,
        status=user.status,
        created_at=user.created_at,
        allowlist_id=entry.id if entry is not None else None,
        added_at=entry.added_at if entry is not None else None,
    )


def _pending_out(entry: AllowlistEntry) -> MemberOut:
    return MemberOut(
        email=entry.email,
        pending=True,
        allowlist_id=entry.id,
        added_at=entry.added_at,
    )


@router.get("/members", response_model=list[MemberOut])
def list_members(admin: AdminUser, session: SessionDep) -> list[MemberOut]:
    """The single admin listing (E7-S1): registered members first (oldest first,
    the bootstrap admin on top), then pending invitees — the front splits the
    two tabs on `pending`.

    Registered = every User (the bootstrap admin has no allowlist entry);
    pending = AllowlistEntry whose email has no User (LEFT JOIN on email).
    """
    users = session.exec(
        select(User, AllowlistEntry)
        .join(AllowlistEntry, col(AllowlistEntry.email) == col(User.email), isouter=True)
        .order_by(col(User.created_at).asc())
    ).all()
    pending = session.exec(
        select(AllowlistEntry)
        .join(User, col(User.email) == col(AllowlistEntry.email), isouter=True)
        .where(col(User.id).is_(None))
        .order_by(col(AllowlistEntry.added_at).asc())
    ).all()
    return [_member_out(user, entry) for user, entry in users] + [
        _pending_out(entry) for entry in pending
    ]


@router.post("/allowlist", status_code=status.HTTP_201_CREATED, response_model=MemberOut)
def add_allowlist_entry(data: AllowlistIn, admin: AdminUser, session: SessionDep) -> MemberOut:
    """Authorize one email (FR-U1) — it shows up as « En attente » until sign-up.

    Duplicates get a clear 409: already-allowlisted, or already registered (the
    bootstrap admin has an account without an entry — adding it back is useless).
    """
    if session.exec(select(User).where(User.email == data.email)).first() is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=DETAIL_ALREADY_REGISTERED)
    entry = AllowlistEntry(email=data.email, added_by_id=admin.id)
    session.add(entry)
    try:
        session.commit()
    except IntegrityError:
        # The unique index on allowlistentry.email is the real gate (covers a
        # concurrent add racing past the pre-check below as well).
        session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail=DETAIL_ALREADY_ALLOWED
        ) from None
    session.refresh(entry)
    return _pending_out(entry)


@router.delete("/allowlist/{entry_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_allowlist_entry(entry_id: str, admin: AdminUser, session: SessionDep) -> None:
    """Un-invite a **pending** email. Once the account exists the entry is
    frozen: accounts are disabled, never deleted (claude.md §5)."""
    entry = session.get(AllowlistEntry, entry_id)
    if entry is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=DETAIL_ENTRY_NOT_FOUND)
    if session.exec(select(User).where(User.email == entry.email)).first() is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=DETAIL_ENTRY_HAS_ACCOUNT)
    session.delete(entry)
    session.commit()


@router.patch("/users/{user_id}", response_model=UserOut)
def patch_user(user_id: str, data: AdminUserPatch, admin: AdminUser, session: SessionDep) -> User:
    """Promote/demote (MEMBER⇄ADMIN) and enable/disable — never delete (FR-U4).

    Last-admin guard (FR-U5): a change that would leave the instance without a
    single ACTIVE admin — demoting or disabling the last one, self included —
    is refused with a 409.
    """
    user = session.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=DETAIL_USER_NOT_FOUND)

    changes = data.model_dump(exclude_unset=True, exclude_none=True)
    role_after = changes.get("role", user.role)
    status_after = changes.get("status", user.status)
    loses_active_admin = (
        user.role == Role.ADMIN
        and user.status == UserStatus.ACTIVE
        and (role_after != Role.ADMIN or status_after != UserStatus.ACTIVE)
    )
    if loses_active_admin:
        other_active_admins = session.exec(
            select(func.count())
            .select_from(User)
            .where(
                User.role == Role.ADMIN,
                User.status == UserStatus.ACTIVE,
                User.id != user.id,
            )
        ).one()
        if other_active_admins == 0:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=DETAIL_LAST_ADMIN)

    for field, value in changes.items():
        setattr(user, field, value)
    session.add(user)
    session.commit()
    session.refresh(user)
    return user
