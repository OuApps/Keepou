"""
Agent access tokens (E13) — the long-lived bearer tokens the MCP agent (**Botou**)
uses to reach Keepou. Wiring an agent to the instance is an **admin** act, so
these endpoints are admin-only, and every token belongs to the single Botou
identity (services/bot.py), never to the admin who minted it.

Endpoints (all admin-guarded):
  GET    /api/admin/tokens          list Botou's active tokens (metadata only)
  POST   /api/admin/tokens {name}   mint a token → returns the secret ONCE (kpat_…)
  DELETE /api/admin/tokens/{id}     revoke (disable without deleting the row)

The secret is shown exactly once, at creation; afterwards only its SHA-256 hash
is stored (app/security.py), so a lost token is regenerated, never recovered.
"""

from fastapi import APIRouter, HTTPException, status
from sqlmodel import col, select

from app.db import SessionDep
from app.models import PersonalAccessToken, _utcnow
from app.schemas import PatCreatedOut, PatOut, TokenCreateIn
from app.security import AdminUser, generate_pat
from app.services.bot import ensure_bot, get_bot

router = APIRouter(prefix="/api/admin/tokens", tags=["tokens"])

DETAIL_TOKEN_NOT_FOUND = "Jeton introuvable."


@router.get("", response_model=list[PatOut])
def list_tokens(_: AdminUser, session: SessionDep) -> list[PersonalAccessToken]:
    """Botou's active (non-revoked) tokens, newest first. Empty until the first
    token is minted (Botou is created lazily on first mint)."""
    bot = get_bot(session)
    if bot is None:
        return []
    return list(
        session.exec(
            select(PersonalAccessToken)
            .where(
                PersonalAccessToken.user_id == bot.id,
                col(PersonalAccessToken.revoked_at).is_(None),
            )
            .order_by(col(PersonalAccessToken.created_at).desc())
        ).all()
    )


@router.post("", status_code=status.HTTP_201_CREATED, response_model=PatCreatedOut)
def create_token(data: TokenCreateIn, _: AdminUser, session: SessionDep) -> PatCreatedOut:
    """Mint a token for the Botou agent. The full secret is in the response body
    ONCE — the front shows it and tells the admin to copy it now."""
    bot = ensure_bot(session)
    secret, token_hash, prefix = generate_pat()
    pat = PersonalAccessToken(
        user_id=bot.id, name=data.name.strip(), token_hash=token_hash, prefix=prefix
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
def revoke_token(token_id: str, _: AdminUser, session: SessionDep) -> None:
    """Revoke one of Botou's tokens — idempotent. Revoking sets `revoked_at` (the
    row is kept so the token can never be re-enabled)."""
    bot = get_bot(session)
    pat = session.get(PersonalAccessToken, token_id)
    if pat is None or bot is None or pat.user_id != bot.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=DETAIL_TOKEN_NOT_FOUND)
    if pat.revoked_at is None:
        pat.revoked_at = _utcnow()
        session.add(pat)
        session.commit()
