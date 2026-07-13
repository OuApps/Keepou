"""
The MCP agent identity — **Botou** (E13 rework).

Originally the agent acted *as the member* who minted the token, over both
private and public notes. The model is now different:

- the agent has its **own identity**, Botou — a real but **non-login** User
  (a random password hash no sign-in can match), hidden from the admin member
  list, that **owns every note created over MCP** (« Créée par Botou ») and
  holds the agent tokens;
- Botou only ever reads and writes **PUBLIC** content (enforced in
  services/agent.py) — it can never see or create a private note;
- **only admins** mint / revoke Botou's tokens (routers/tokens.py), so wiring an
  MCP agent to the instance is an administration act.

Botou is created lazily on first token mint (`ensure_bot`); token resolution
(`resolve_bot_token`) accepts a `kpat_…` secret only when it belongs to Botou,
so any legacy member-scoped token stops working under the new model.
"""

import secrets

from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, select

from app.models import (
    BOT_DISPLAY_NAME,
    BOT_EMAIL,
    PersonalAccessToken,
    User,
    UserStatus,
    _utcnow,
)
from app.security import hash_password, hash_token


def get_bot(session: Session) -> User | None:
    """The Botou account, or None if it has not been created yet."""
    return session.exec(select(User).where(User.email == BOT_EMAIL)).first()


def ensure_bot(session: Session) -> User:
    """Return the Botou account, creating it on first use.

    Botou is non-login: its password hash is a random secret no sign-in attempt
    can reproduce (Botou never logs in — it only acts over MCP). Concurrent first
    mints race on the unique email; the loser rolls back and re-reads the winner.
    """
    bot = get_bot(session)
    if bot is not None:
        return bot
    bot = User(
        email=BOT_EMAIL,
        display_name=BOT_DISPLAY_NAME,
        password_hash=hash_password(secrets.token_urlsafe(32)),
        status=UserStatus.ACTIVE,
    )
    session.add(bot)
    try:
        session.commit()
    except IntegrityError:
        session.rollback()
        existing = get_bot(session)
        if existing is None:  # pragma: no cover - the unique index is the real gate
            raise
        return existing
    session.refresh(bot)
    return bot


def resolve_bot_token(token: str, session: Session) -> User | None:
    """Resolve an agent token to Botou, or None.

    Personal Access Tokens now belong exclusively to Botou, so resolution both
    validates the secret (known, not revoked) and enforces the identity: a token
    owned by anyone other than an ACTIVE Botou resolves to None (this is what
    retires any legacy member-scoped token). Stamps `last_used_at` on success.
    """
    pat = session.exec(
        select(PersonalAccessToken).where(PersonalAccessToken.token_hash == hash_token(token))
    ).first()
    if pat is None or pat.revoked_at is not None:
        return None
    bot = session.get(User, pat.user_id)
    if bot is None or bot.email != BOT_EMAIL or bot.status != UserStatus.ACTIVE:
        return None
    pat.last_used_at = _utcnow()
    session.add(pat)
    session.commit()
    return bot
