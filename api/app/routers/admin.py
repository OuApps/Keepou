"""
Admin — access management (E7). Every route depends on `require_admin`, so the
real `/admin` guard is server-side (claude.md §6); the front only hides the entry.

  GET    /api/admin/members            registered members + pending invitees
  POST   /api/admin/allowlist          {email} → new pending entry
  DELETE /api/admin/allowlist/{id}     pending entries only
  PATCH  /api/admin/users/{id}         {role|status} — never delete (FR-U4)

Rules carried by this router:
- "Pending" = allowlisted email with no User row yet (HANDOFF §4).
- Disable, never delete: no endpoint removes a User; removing an allowlist
  entry is only allowed while it is still pending (claude.md §5).
- Last-admin guard (FR-U5): the instance always keeps ≥ 1 ACTIVE admin — an
  admin cannot demote or disable the last one, including themselves.
"""

from fastapi import APIRouter, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, col, select

from app.db import SessionDep
from app.models import BOT_EMAIL, AllowlistEntry, Role, User, UserStatus
from app.schemas import AllowlistIn, MemberOut, UserAdminPatch, UserOut
from app.security import AdminUser

router = APIRouter(prefix="/api/admin", tags=["admin"])

DETAIL_ALREADY_ALLOWED = "Cette adresse est déjà dans la liste."
DETAIL_ALREADY_REGISTERED = "Un compte existe déjà avec cette adresse e-mail."
DETAIL_ENTRY_NOT_FOUND = "Entrée introuvable."
DETAIL_ENTRY_NOT_PENDING = (
    "Un compte existe déjà pour cette adresse — désactive le compte au lieu de retirer l'e-mail."
)
DETAIL_USER_NOT_FOUND = "Membre introuvable."
DETAIL_LAST_ADMIN = "Impossible : l'instance doit conserver au moins un administrateur actif."


def _registered(user: User) -> MemberOut:
    return MemberOut(
        email=user.email,
        pending=False,
        user_id=user.id,
        display_name=user.display_name,
        role=user.role,
        status=user.status,
        registered_at=user.created_at,
    )


def _pending(entry: AllowlistEntry) -> MemberOut:
    return MemberOut(
        email=entry.email, pending=True, allowlist_id=entry.id, allowed_at=entry.added_at
    )


@router.get("/members", response_model=list[MemberOut])
def list_members(_: AdminUser, session: SessionDep) -> list[MemberOut]:
    """Registered members first (oldest first — the bootstrap admin leads),
    then pending invitees. Same semantics as the HANDOFF §4 LEFT JOIN: an
    allowlist entry whose email has a User is shown as that registered user."""
    # Botou (the MCP agent identity) is a system account, not a human member —
    # keep it out of the access list.
    users = session.exec(
        select(User).where(User.email != BOT_EMAIL).order_by(col(User.created_at))
    ).all()
    entries = session.exec(select(AllowlistEntry).order_by(col(AllowlistEntry.added_at))).all()
    registered_emails = {user.email for user in users}
    return [_registered(user) for user in users] + [
        _pending(entry) for entry in entries if entry.email not in registered_emails
    ]


@router.post("/allowlist", status_code=status.HTTP_201_CREATED, response_model=MemberOut)
def add_allowlist_entry(data: AllowlistIn, admin: AdminUser, session: SessionDep) -> MemberOut:
    if session.exec(select(User).where(User.email == data.email)).first() is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=DETAIL_ALREADY_REGISTERED)
    if session.exec(select(AllowlistEntry).where(AllowlistEntry.email == data.email)).first():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=DETAIL_ALREADY_ALLOWED)

    entry = AllowlistEntry(email=data.email, added_by_id=admin.id)
    session.add(entry)
    try:
        session.commit()
    except IntegrityError:
        # Concurrent add of the same email: the unique index on
        # allowlistentry.email is the real gate → same 409 contract.
        session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail=DETAIL_ALREADY_ALLOWED
        ) from None
    session.refresh(entry)
    return _pending(entry)


@router.delete("/allowlist/{entry_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_allowlist_entry(entry_id: str, _: AdminUser, session: SessionDep) -> None:
    entry = session.get(AllowlistEntry, entry_id)
    if entry is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=DETAIL_ENTRY_NOT_FOUND)
    # Pending entries only: once the account exists, the lever is "disable the
    # user", never a removal that would strand a live account (E7-S2).
    if session.exec(select(User).where(User.email == entry.email)).first() is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=DETAIL_ENTRY_NOT_PENDING)
    session.delete(entry)
    session.commit()


def _active_admin_count(session: Session) -> int:
    return len(
        session.exec(
            select(User).where(User.role == Role.ADMIN, User.status == UserStatus.ACTIVE)
        ).all()
    )


@router.patch("/users/{user_id}", response_model=UserOut)
def patch_user(user_id: str, data: UserAdminPatch, _: AdminUser, session: SessionDep) -> User:
    user = session.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=DETAIL_USER_NOT_FOUND)

    new_role = data.role if data.role is not None else user.role
    new_status = data.status if data.status is not None else user.status

    # Last-admin guard (FR-U5): refuse any change that would leave the instance
    # without an ACTIVE admin — demotion or deactivation, self included.
    was_active_admin = user.role == Role.ADMIN and user.status == UserStatus.ACTIVE
    stays_active_admin = new_role == Role.ADMIN and new_status == UserStatus.ACTIVE
    if was_active_admin and not stays_active_admin and _active_admin_count(session) <= 1:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=DETAIL_LAST_ADMIN)

    user.role = new_role
    user.status = new_status
    session.add(user)
    session.commit()
    session.refresh(user)
    return user
