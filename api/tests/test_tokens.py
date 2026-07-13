"""
Agent access tokens (E13 rework): admin-only create / list / revoke, the
show-once secret, hashed-only storage, and token resolution to the **Botou**
identity (revoked, disabled bot, usage stamping, legacy tokens retired).
"""

from sqlmodel import select

from app.models import BOT_EMAIL, PersonalAccessToken, User, UserStatus
from app.security import hash_token
from app.services.bot import get_bot, resolve_bot_token

ADMIN = {"email": "marie@famille-ou.fr", "password": "un mot de passe", "display_name": "Marie"}
MEMBER = {"email": "tom@famille-ou.fr", "password": "un autre mot", "display_name": "Tom"}


def admin_headers(client) -> dict:
    res = client.post("/api/auth/register", json=ADMIN)
    assert res.status_code == 201  # the first account bootstraps as ADMIN
    return {"Authorization": f"Bearer {res.json()['access']}"}


def member_headers(client, admin) -> dict:
    """Allowlist + register a plain MEMBER, return its auth headers."""
    client.post("/api/admin/allowlist", json={"email": MEMBER["email"]}, headers=admin)
    res = client.post("/api/auth/register", json=MEMBER)
    assert res.status_code == 201
    return {"Authorization": f"Bearer {res.json()['access']}"}


def test_create_token_returns_secret_once(client) -> None:
    headers = admin_headers(client)
    res = client.post("/api/admin/tokens", json={"name": "Bot WhatsApp"}, headers=headers)
    assert res.status_code == 201
    body = res.json()
    assert body["name"] == "Bot WhatsApp"
    assert body["token"].startswith("kpat_")
    assert body["prefix"].startswith("kpat_")
    # The prefix is a non-secret slice of the secret.
    assert body["token"].startswith(body["prefix"])


def test_token_belongs_to_a_hidden_botou_account(client, session) -> None:
    headers = admin_headers(client)
    client.post("/api/admin/tokens", json={"name": "x"}, headers=headers)
    bot = get_bot(session)
    assert bot is not None
    assert bot.display_name == "Botou"
    pat = session.exec(select(PersonalAccessToken)).first()
    assert pat.user_id == bot.id  # owned by Botou, not by the admin who minted it
    # Botou is a system account, kept out of the admin members list.
    emails = {m["email"] for m in client.get("/api/admin/members", headers=headers).json()}
    assert BOT_EMAIL not in emails


def test_secret_is_stored_hashed_only(client, session) -> None:
    headers = admin_headers(client)
    secret = client.post("/api/admin/tokens", json={"name": "x"}, headers=headers).json()["token"]
    pat = session.exec(select(PersonalAccessToken)).first()
    assert pat is not None
    assert pat.token_hash == hash_token(secret)
    assert secret not in pat.token_hash  # the raw secret is never persisted


def test_list_hides_the_secret_and_shows_metadata(client) -> None:
    headers = admin_headers(client)
    client.post("/api/admin/tokens", json={"name": "Agent"}, headers=headers)
    res = client.get("/api/admin/tokens", headers=headers)
    assert res.status_code == 200
    (row,) = res.json()
    assert row["name"] == "Agent"
    assert "token" not in row  # PatOut never carries the secret


def test_revoke_removes_from_list_and_disables_auth(client, session) -> None:
    headers = admin_headers(client)
    created = client.post("/api/admin/tokens", json={"name": "Agent"}, headers=headers).json()
    secret = created["token"]
    # The token resolves to Botou before revocation.
    assert resolve_bot_token(secret, session) is not None

    assert client.delete(f"/api/admin/tokens/{created['id']}", headers=headers).status_code == 204
    # Gone from the list, and no longer resolvable.
    assert client.get("/api/admin/tokens", headers=headers).json() == []
    assert resolve_bot_token(secret, session) is None


def test_revoke_unknown_token_is_404(client) -> None:
    headers = admin_headers(client)
    assert client.delete("/api/admin/tokens/does-not-exist", headers=headers).status_code == 404


def test_tokens_require_admin(client) -> None:
    admin = admin_headers(client)
    member = member_headers(client, admin)
    # Unauthenticated → 401.
    assert client.get("/api/admin/tokens").status_code == 401
    assert client.post("/api/admin/tokens", json={"name": "x"}).status_code == 401
    # A plain member → 403 (agent wiring is an admin act).
    assert client.get("/api/admin/tokens", headers=member).status_code == 403
    assert client.post("/api/admin/tokens", json={"name": "x"}, headers=member).status_code == 403


def test_resolve_rejects_unknown_token(client, session) -> None:
    admin_headers(client)
    assert resolve_bot_token("kpat_not-a-real-token", session) is None


def test_resolve_rejects_disabled_bot(client, session) -> None:
    headers = admin_headers(client)
    secret = client.post("/api/admin/tokens", json={"name": "x"}, headers=headers).json()["token"]
    bot = get_bot(session)
    bot.status = UserStatus.DISABLED
    session.add(bot)
    session.commit()
    assert resolve_bot_token(secret, session) is None


def test_resolve_rejects_a_legacy_member_scoped_token(client, session) -> None:
    """A token owned by a human (the pre-rework model) no longer resolves — the
    agent identity is Botou only."""
    headers = admin_headers(client)
    created = client.post("/api/admin/tokens", json={"name": "x"}, headers=headers).json()
    secret = created["token"]
    # Simulate a legacy token by repointing it at a human account.
    human = session.exec(select(User).where(User.email == ADMIN["email"])).first()
    pat = session.get(PersonalAccessToken, created["id"])
    pat.user_id = human.id
    session.add(pat)
    session.commit()
    assert resolve_bot_token(secret, session) is None


def test_resolve_stamps_last_used(client, session) -> None:
    headers = admin_headers(client)
    secret = client.post("/api/admin/tokens", json={"name": "x"}, headers=headers).json()["token"]
    assert session.exec(select(PersonalAccessToken)).first().last_used_at is None
    resolve_bot_token(secret, session)
    session.expire_all()
    assert session.exec(select(PersonalAccessToken)).first().last_used_at is not None
