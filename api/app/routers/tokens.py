"""
Personal Access Tokens (E13) — self-service management of the long-lived bearer
tokens an agent uses to reach Keepou over MCP.

Endpoints (all scoped to the caller — a member only ever sees their own tokens):
  GET    /api/tokens          list my tokens (metadata only, never the secret)
  POST   /api/tokens {name}   mint a token → returns the secret ONCE (kpat_…)
  DELETE /api/tokens/{id}     revoke (disable without deleting the row)

The secret is shown exactly once, at creation; afterwards only its SHA-256 hash
is stored (app/security.py), so a lost token is regenerated, never recovered.
"""

from fastapi import APIRouter, HTTPException, status
from sqlmodel import col, select

from app.db import SessionDep
from app.models import PersonalAccessToken, _utcnow
from app.schemas import PatCreatedOut, PatOut, TokenCreateIn
from app.security import CurrentUser, generate_pat

router = APIRouter(prefix="/api/tokens", tags=["tokens"])

DETAIL_TOKEN_NOT_FOUND = "Jeton introuvable."


@router.get("", response_model=list[PatOut])
def list_tokens(user: CurrentUser, session: SessionDep) -> list[PersonalAccessToken]:
    """The caller's active (non-revoked) tokens, newest first."""
    return list(
        session.exec(
            select(PersonalAccessToken)
            .where(
                PersonalAccessToken.user_id == user.id,
                col(PersonalAccessToken.revoked_at).is_(None),
            )
            .order_by(col(PersonalAccessToken.created_at).desc())
        ).all()
    )


@router.post("", status_code=status.HTTP_201_CREATED, response_model=PatCreatedOut)
def create_token(data: TokenCreateIn, user: CurrentUser, session: SessionDep) -> PatCreatedOut:
    """Mint a token for this member. The full secret is in the response body ONCE
    — the front shows it and tells the user to copy it now."""
    secret, token_hash, prefix = generate_pat()
    pat = PersonalAccessToken(
        user_id=user.id, name=data.name.strip(), token_hash=token_hash, prefix=prefix
    )
    session.add(pat)
    session.commit()
    session.refresh(pat)
    return PatCreatedOut(
        id=pat.id,
        name=pat.name,
        prefix=pat.prefix,
        created_at=pat.created_at,
        last_used_at=pat.last_used_at,
        token=secret,
    )


@router.delete("/{token_id}", status_code=status.HTTP_204_NO_CONTENT)
def revoke_token(token_id: str, user: CurrentUser, session: SessionDep) -> None:
    """Revoke one of the caller's tokens — idempotent, owner-scoped. Revoking
    sets `revoked_at` (the row is kept so the token can never be re-enabled)."""
    pat = session.get(PersonalAccessToken, token_id)
    if pat is None or pat.user_id != user.id:
        # Someone else's token id is shielded as not-found (never 403).
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=DETAIL_TOKEN_NOT_FOUND)
    if pat.revoked_at is None:
        pat.revoked_at = _utcnow()
        session.add(pat)
        session.commit()
