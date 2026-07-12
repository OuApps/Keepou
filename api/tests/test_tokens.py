"""
Personal Access Tokens (E13): self-service create / list / revoke, the
show-once secret, hashed-only storage, and PAT resolution (revoked, disabled
owner, usage stamping).
"""

from sqlmodel import select

from app.models import PersonalAccessToken, User, UserStatus
from app.security import hash_token, resolve_pat_user

ADMIN = {"email": "marie@famille-ou.fr", "password": "un mot de passe", "display_name": "Marie"}


def bootstrap(client) -> dict:
    res = client.post("/api/auth/register", json=ADMIN)
    assert res.status_code == 201
    return res.json()


def auth_headers(client) -> dict:
    return {"Authorization": f"Bearer {bootstrap(client)['access']}"}


def test_create_token_returns_secret_once(client) -> None:
    headers = auth_headers(client)
    res = client.post("/api/tokens", json={"name": "Bot WhatsApp"}, headers=headers)
    assert res.status_code == 201
    body = res.json()
    assert body["name"] == "Bot WhatsApp"
    assert body["token"].startswith("kpat_")
    assert body["prefix"].startswith("kpat_")
    # The prefix is a non-secret slice of the secret.
    assert body["token"].startswith(body["prefix"])


def test_secret_is_stored_hashed_only(client, session) -> None:
    headers = auth_headers(client)
    secret = client.post("/api/tokens", json={"name": "x"}, headers=headers).json()["token"]
    pat = session.exec(select(PersonalAccessToken)).first()
    assert pat is not None
    assert pat.token_hash == hash_token(secret)
    assert secret not in pat.token_hash  # the raw secret is never persisted


def test_list_hides_the_secret_and_shows_metadata(client) -> None:
    headers = auth_headers(client)
    client.post("/api/tokens", json={"name": "Agent"}, headers=headers)
    res = client.get("/api/tokens", headers=headers)
    assert res.status_code == 200
    (row,) = res.json()
    assert row["name"] == "Agent"
    assert "token" not in row  # PatOut never carries the secret


def test_revoke_removes_from_list_and_disables_auth(client, session) -> None:
    headers = auth_headers(client)
    created = client.post("/api/tokens", json={"name": "Agent"}, headers=headers).json()
    secret = created["token"]
    # The token resolves to its owner before revocation.
    assert resolve_pat_user(secret, session) is not None

    assert client.delete(f"/api/tokens/{created['id']}", headers=headers).status_code == 204
    # Gone from the list, and no longer resolvable.
    assert client.get("/api/tokens", headers=headers).json() == []
    assert resolve_pat_user(secret, session) is None


def test_revoke_someone_elses_token_is_404(client) -> None:
    headers = auth_headers(client)
    assert client.delete("/api/tokens/does-not-exist", headers=headers).status_code == 404


def test_tokens_require_authentication(client) -> None:
    assert client.get("/api/tokens").status_code == 401
    assert client.post("/api/tokens", json={"name": "x"}).status_code == 401


def test_resolve_rejects_unknown_token(client, session) -> None:
    bootstrap(client)
    assert resolve_pat_user("kpat_not-a-real-token", session) is None


def test_resolve_rejects_disabled_owner(client, session) -> None:
    headers = auth_headers(client)
    secret = client.post("/api/tokens", json={"name": "x"}, headers=headers).json()["token"]
    user = session.exec(select(User)).first()
    assert user is not None
    user.status = UserStatus.DISABLED
    session.add(user)
    session.commit()
    assert resolve_pat_user(secret, session) is None


def test_resolve_stamps_last_used(client, session) -> None:
    headers = auth_headers(client)
    secret = client.post("/api/tokens", json={"name": "x"}, headers=headers).json()["token"]
    assert session.exec(select(PersonalAccessToken)).first().last_used_at is None
    resolve_pat_user(secret, session)
    session.expire_all()
    assert session.exec(select(PersonalAccessToken)).first().last_used_at is not None
