"""
Auth business rules (E2-S8): bootstrap admin (FR-A1), server-side allowlist
(FR-A2), hashed passwords (FR-A3), login KO / disabled (FR-A5), and the
per-request status re-check (immediate deactivation).
"""

import pytest
from fastapi import HTTPException
from sqlmodel import Session, select

from app.models import AllowlistEntry, Role, User, UserStatus
from app.security import create_access_token, require_admin

ADMIN = {"email": "marie@famille-ou.fr", "password": "un mot de passe", "display_name": "Marie"}
TOM = {"email": "tom@famille-ou.fr", "password": "encore un autre", "display_name": "Tom"}


def register(client, payload):
    return client.post("/api/auth/register", json=payload)


def login(client, email, password):
    return client.post("/api/auth/login", json={"email": email, "password": password})


def bootstrap_admin(client) -> dict:
    """First-ever register → ADMIN (bypasses the allowlist)."""
    res = register(client, ADMIN)
    assert res.status_code == 201
    return res.json()


def allow(session: Session, email: str) -> None:
    admin = session.exec(select(User).where(User.role == Role.ADMIN)).first()
    assert admin is not None
    session.add(AllowlistEntry(email=email, added_by_id=admin.id))
    session.commit()


# --- register: bootstrap + allowlist gate (FR-A1 / FR-A2 / FR-A3) ---


def test_first_register_bootstraps_admin(client) -> None:
    tokens = bootstrap_admin(client)
    assert set(tokens) == {"access", "refresh"}
    me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {tokens['access']}"})
    assert me.status_code == 200
    assert me.json()["role"] == "ADMIN"


def test_register_off_allowlist_is_403_and_creates_nothing(client, session) -> None:
    bootstrap_admin(client)
    res = register(client, {**TOM, "email": "inconnu@gmail.com"})
    assert res.status_code == 403
    assert "inconnu@gmail.com" in res.json()["detail"]
    assert session.exec(select(User).where(User.email == "inconnu@gmail.com")).first() is None


def test_register_on_allowlist_creates_member(client, session) -> None:
    bootstrap_admin(client)
    allow(session, TOM["email"])
    res = register(client, TOM)
    assert res.status_code == 201
    me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {res.json()['access']}"})
    assert me.json()["role"] == "MEMBER"
    assert me.json()["display_name"] == "Tom"


def test_register_duplicate_email_is_409(client, session) -> None:
    bootstrap_admin(client)
    res = register(client, ADMIN)
    assert res.status_code == 409


def test_password_stored_hashed_only(client, session) -> None:
    bootstrap_admin(client)
    user = session.exec(select(User)).first()
    assert user is not None
    assert user.password_hash != ADMIN["password"]
    assert ADMIN["password"] not in user.password_hash


def test_register_normalizes_email(client, session) -> None:
    bootstrap_admin(client)
    allow(session, TOM["email"])
    res = register(client, {**TOM, "email": "  Tom@Famille-OU.fr "})
    assert res.status_code == 201
    assert login(client, TOM["email"], TOM["password"]).status_code == 200


# --- login (FR-A5) ---


def test_login_ok_returns_tokens(client) -> None:
    bootstrap_admin(client)
    res = login(client, ADMIN["email"], ADMIN["password"])
    assert res.status_code == 200
    assert set(res.json()) == {"access", "refresh"}


@pytest.mark.parametrize(
    ("email", "password"),
    [
        ("marie@famille-ou.fr", "mauvais mot de passe"),
        ("personne@famille-ou.fr", "un mot de passe"),
    ],
)
def test_login_bad_credentials_is_401(client, email, password) -> None:
    bootstrap_admin(client)
    res = login(client, email, password)
    assert res.status_code == 401
    assert res.json()["detail"] == "E-mail ou mot de passe incorrect."


def test_login_disabled_account_is_403(client, session) -> None:
    bootstrap_admin(client)
    user = session.exec(select(User)).first()
    assert user is not None
    user.status = UserStatus.DISABLED
    session.add(user)
    session.commit()
    res = login(client, ADMIN["email"], ADMIN["password"])
    assert res.status_code == 403
    detail = res.json()["detail"]
    assert detail["code"] == "account_disabled"
    assert detail["message"] == "Ton accès a été suspendu. Contacte l'administrateur."


# --- refresh ---


def test_refresh_swaps_refresh_for_new_access(client) -> None:
    tokens = bootstrap_admin(client)
    res = client.post("/api/auth/refresh", json={"refresh": tokens["refresh"]})
    assert res.status_code == 200
    access = res.json()["access"]
    me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {access}"})
    assert me.status_code == 200


def test_refresh_rejects_invalid_and_access_tokens(client) -> None:
    tokens = bootstrap_admin(client)
    assert client.post("/api/auth/refresh", json={"refresh": "n-importe-quoi"}).status_code == 401
    # An access token is not a refresh token (type check).
    assert client.post("/api/auth/refresh", json={"refresh": tokens["access"]}).status_code == 401


def test_refresh_rejected_for_disabled_user(client, session) -> None:
    tokens = bootstrap_admin(client)
    user = session.exec(select(User)).first()
    assert user is not None
    user.status = UserStatus.DISABLED
    session.add(user)
    session.commit()
    res = client.post("/api/auth/refresh", json={"refresh": tokens["refresh"]})
    assert res.status_code == 403


# --- me / bearer dependency ---


def test_me_requires_a_token(client) -> None:
    assert client.get("/api/auth/me").status_code == 401


def test_me_rejects_tampered_token(client) -> None:
    tokens = bootstrap_admin(client)
    assert (
        client.get(
            "/api/auth/me", headers={"Authorization": f"Bearer {tokens['access']}x"}
        ).status_code
        == 401
    )
    # A refresh token cannot be used as an access token (type check).
    assert (
        client.get(
            "/api/auth/me", headers={"Authorization": f"Bearer {tokens['refresh']}"}
        ).status_code
        == 401
    )


def test_deactivation_is_immediate_even_with_valid_token(client, session) -> None:
    """Status is re-read from the DB on every request (ARCHITECTURE §8)."""
    tokens = bootstrap_admin(client)
    headers = {"Authorization": f"Bearer {tokens['access']}"}
    assert client.get("/api/auth/me", headers=headers).status_code == 200

    user = session.exec(select(User)).first()
    assert user is not None
    user.status = UserStatus.DISABLED
    session.add(user)
    session.commit()

    res = client.get("/api/auth/me", headers=headers)
    assert res.status_code == 403
    # Structured detail: lets the client log out on this specific 403.
    assert res.json()["detail"]["code"] == "account_disabled"


def test_token_for_deleted_user_is_401(client) -> None:
    bootstrap_admin(client)
    ghost = create_access_token("id-inexistant")
    assert (
        client.get("/api/auth/me", headers={"Authorization": f"Bearer {ghost}"}).status_code == 401
    )


# --- password hashing (bcrypt_sha256: no 72-byte truncation) ---


def test_long_passphrases_keep_their_entropy(client, session) -> None:
    """bcrypt alone silently truncates at 72 bytes; the SHA-256 pre-hash must not."""
    long_password = "x" * 72 + "-la-fin-compte-aussi"
    res = register(
        client,
        {"email": ADMIN["email"], "password": long_password, "display_name": "Marie"},
    )
    assert res.status_code == 201
    # Same 72-byte prefix, different tail → must NOT authenticate.
    assert login(client, ADMIN["email"], "x" * 72 + "-autre-fin").status_code == 401
    assert login(client, ADMIN["email"], long_password).status_code == 200


# --- require_admin (guard used by /admin in E7) ---


def test_require_admin_refuses_a_member() -> None:
    member = User(
        email="tom@famille-ou.fr",
        display_name="Tom",
        password_hash="x",
        role=Role.MEMBER,
    )
    with pytest.raises(HTTPException) as exc:
        require_admin(user=member)
    assert exc.value.status_code == 403


def test_require_admin_accepts_an_admin() -> None:
    admin = User(
        email="marie@famille-ou.fr",
        display_name="Marie",
        password_hash="x",
        role=Role.ADMIN,
    )
    assert require_admin(user=admin) is admin
