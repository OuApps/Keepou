"""
Admin access-management rules (E7-S6): server-side /admin protection
(claude.md §6), members listing registered vs pending (FR-U2), allowlist
add/remove (FR-U1, pending-only remove), promote/demote + enable/disable
(FR-U3/U4 — disable blocks immediately and keeps notes), and the last-admin
guard (FR-U5).
"""

from sqlmodel import Session, select

from app.models import Note, User

ADMIN = {"email": "marie@famille-ou.fr", "password": "un mot de passe", "display_name": "Marie"}
TOM = {"email": "tom@famille-ou.fr", "password": "encore un autre", "display_name": "Tom"}


def register(client, payload) -> dict:
    res = client.post("/api/auth/register", json=payload)
    assert res.status_code == 201
    return res.json()


def auth(tokens: dict) -> dict:
    return {"Authorization": f"Bearer {tokens['access']}"}


def bootstrap_admin(client) -> dict:
    """First-ever register → ADMIN (bypasses the allowlist)."""
    return register(client, ADMIN)


def add_member(client, admin_tokens: dict, payload=TOM) -> dict:
    """Allowlist an email through the admin API, then register the member."""
    res = client.post(
        "/api/admin/allowlist", json={"email": payload["email"]}, headers=auth(admin_tokens)
    )
    assert res.status_code == 201
    return register(client, payload)


def user_id_of(session: Session, email: str) -> str:
    user = session.exec(select(User).where(User.email == email)).first()
    assert user is not None
    return user.id


# --- server-side protection (claude.md §6) ---


def test_admin_routes_refuse_anonymous_and_members(client, session) -> None:
    admin_tokens = bootstrap_admin(client)
    member_tokens = add_member(client, admin_tokens)
    member_id = user_id_of(session, TOM["email"])

    calls = [
        ("GET", "/api/admin/members", None),
        ("POST", "/api/admin/allowlist", {"email": "mamie@famille-ou.fr"}),
        ("DELETE", "/api/admin/allowlist/whatever", None),
        ("PATCH", f"/api/admin/users/{member_id}", {"role": "ADMIN"}),
    ]
    for method, url, body in calls:
        assert client.request(method, url, json=body).status_code == 401
        res = client.request(method, url, json=body, headers=auth(member_tokens))
        assert res.status_code == 403, f"{method} {url} should be admin-only"
        assert res.json()["detail"] == "Accès réservé."


# --- E7-S1: members listing (registered vs pending) ---


def test_members_lists_registered_and_pending(client) -> None:
    admin_tokens = bootstrap_admin(client)
    add_member(client, admin_tokens)
    res = client.post(
        "/api/admin/allowlist", json={"email": "mamie@famille-ou.fr"}, headers=auth(admin_tokens)
    )
    assert res.status_code == 201
    assert res.json()["pending"] is True

    members = client.get("/api/admin/members", headers=auth(admin_tokens)).json()
    by_email = {m["email"]: m for m in members}
    assert len(members) == 3

    marie = by_email["marie@famille-ou.fr"]  # bootstrap admin: no allowlist entry
    assert marie["pending"] is False
    assert marie["role"] == "ADMIN"
    assert marie["status"] == "ACTIVE"
    assert marie["allowlist_id"] is None

    tom = by_email["tom@famille-ou.fr"]  # allowlisted + registered
    assert tom["pending"] is False
    assert tom["role"] == "MEMBER"
    assert tom["display_name"] == "Tom"
    assert tom["allowlist_id"] is not None

    mamie = by_email["mamie@famille-ou.fr"]  # allowlisted, no account yet (FR-U2)
    assert mamie["pending"] is True
    assert mamie["user_id"] is None
    assert mamie["role"] is None

    # Registered first (oldest first), pending after.
    assert [m["email"] for m in members] == [
        "marie@famille-ou.fr",
        "tom@famille-ou.fr",
        "mamie@famille-ou.fr",
    ]


# --- E7-S2: allowlist add / remove ---


def test_allowlist_add_normalizes_and_refuses_duplicates(client) -> None:
    admin_tokens = bootstrap_admin(client)
    res = client.post(
        "/api/admin/allowlist", json={"email": "  Mamie@Famille-OU.fr "}, headers=auth(admin_tokens)
    )
    assert res.status_code == 201
    assert res.json()["email"] == "mamie@famille-ou.fr"

    dup = client.post(
        "/api/admin/allowlist", json={"email": "mamie@famille-ou.fr"}, headers=auth(admin_tokens)
    )
    assert dup.status_code == 409

    # An email that already has an account (even off-allowlist, like the
    # bootstrap admin) is refused with the registered-account message.
    registered = client.post(
        "/api/admin/allowlist", json={"email": ADMIN["email"]}, headers=auth(admin_tokens)
    )
    assert registered.status_code == 409
    assert "compte existe déjà" in registered.json()["detail"]


def test_allowlist_remove_pending_only(client, session) -> None:
    admin_tokens = bootstrap_admin(client)
    add_member(client, admin_tokens)  # Tom: allowlisted AND registered

    members = client.get("/api/admin/members", headers=auth(admin_tokens)).json()
    tom_entry = next(m["allowlist_id"] for m in members if m["email"] == TOM["email"])

    # Registered → the entry is frozen: disable the account instead (FR-U4).
    res = client.delete(f"/api/admin/allowlist/{tom_entry}", headers=auth(admin_tokens))
    assert res.status_code == 409

    pending = client.post(
        "/api/admin/allowlist", json={"email": "mamie@famille-ou.fr"}, headers=auth(admin_tokens)
    ).json()
    res = client.delete(
        f"/api/admin/allowlist/{pending['allowlist_id']}", headers=auth(admin_tokens)
    )
    assert res.status_code == 204
    members = client.get("/api/admin/members", headers=auth(admin_tokens)).json()
    assert "mamie@famille-ou.fr" not in [m["email"] for m in members]

    missing = client.delete("/api/admin/allowlist/inconnue", headers=auth(admin_tokens))
    assert missing.status_code == 404


# --- E7-S3: role/status PATCH ---


def test_promote_then_demote_member(client, session) -> None:
    admin_tokens = bootstrap_admin(client)
    add_member(client, admin_tokens)
    member_id = user_id_of(session, TOM["email"])

    res = client.patch(
        f"/api/admin/users/{member_id}", json={"role": "ADMIN"}, headers=auth(admin_tokens)
    )
    assert res.status_code == 200
    assert res.json()["role"] == "ADMIN"

    res = client.patch(
        f"/api/admin/users/{member_id}", json={"role": "MEMBER"}, headers=auth(admin_tokens)
    )
    assert res.status_code == 200
    assert res.json()["role"] == "MEMBER"

    assert (
        client.patch(
            "/api/admin/users/inconnu", json={"role": "ADMIN"}, headers=auth(admin_tokens)
        ).status_code
        == 404
    )


def test_disable_blocks_immediately_keeps_notes_and_is_reversible(client, session) -> None:
    admin_tokens = bootstrap_admin(client)
    member_tokens = add_member(client, admin_tokens)
    member_id = user_id_of(session, TOM["email"])

    created = client.post("/api/notes", json={"title": "Courses"}, headers=auth(member_tokens))
    assert created.status_code == 201

    res = client.patch(
        f"/api/admin/users/{member_id}", json={"status": "DISABLED"}, headers=auth(admin_tokens)
    )
    assert res.status_code == 200

    # The very next request is blocked (status re-checked per request, FR-A5)…
    blocked = client.get("/api/auth/me", headers=auth(member_tokens))
    assert blocked.status_code == 403
    assert blocked.json()["detail"]["code"] == "account_disabled"
    # …login too, and the notes are kept (disable ≠ delete, FR-A5/claude.md §5).
    login = client.post(
        "/api/auth/login", json={"email": TOM["email"], "password": TOM["password"]}
    )
    assert login.status_code == 403
    assert session.exec(select(Note).where(Note.owner_id == member_id)).first() is not None

    # Reactivation restores access.
    res = client.patch(
        f"/api/admin/users/{member_id}", json={"status": "ACTIVE"}, headers=auth(admin_tokens)
    )
    assert res.status_code == 200
    assert client.get("/api/auth/me", headers=auth(member_tokens)).status_code == 200


def test_no_user_delete_endpoint(client, session) -> None:
    admin_tokens = bootstrap_admin(client)
    add_member(client, admin_tokens)
    member_id = user_id_of(session, TOM["email"])
    res = client.delete(f"/api/admin/users/{member_id}", headers=auth(admin_tokens))
    assert res.status_code == 405  # method not allowed — deletion does not exist (FR-U4)


# --- FR-U5: last-admin guard ---


def test_last_admin_cannot_be_demoted_nor_disabled(client, session) -> None:
    admin_tokens = bootstrap_admin(client)
    admin_id = user_id_of(session, ADMIN["email"])

    for change in ({"role": "MEMBER"}, {"status": "DISABLED"}):
        res = client.patch(f"/api/admin/users/{admin_id}", json=change, headers=auth(admin_tokens))
        assert res.status_code == 409
        assert "au moins un admin actif" in res.json()["detail"]

    me = client.get("/api/auth/me", headers=auth(admin_tokens)).json()
    assert me["role"] == "ADMIN"
    assert me["status"] == "ACTIVE"


def test_admin_change_allowed_when_another_active_admin_remains(client, session) -> None:
    admin_tokens = bootstrap_admin(client)
    add_member(client, admin_tokens)
    member_id = user_id_of(session, TOM["email"])
    admin_id = user_id_of(session, ADMIN["email"])

    promoted = client.patch(
        f"/api/admin/users/{member_id}", json={"role": "ADMIN"}, headers=auth(admin_tokens)
    )
    assert promoted.status_code == 200

    # Two active admins → demoting the bootstrap admin (self) is now allowed…
    res = client.patch(
        f"/api/admin/users/{admin_id}", json={"role": "MEMBER"}, headers=auth(admin_tokens)
    )
    assert res.status_code == 200
    assert res.json()["role"] == "MEMBER"

    # …and Tom, back to being the only active admin, is protected again.
    tom_tokens = client.post(
        "/api/auth/login", json={"email": TOM["email"], "password": TOM["password"]}
    ).json()
    res = client.patch(
        f"/api/admin/users/{member_id}", json={"status": "DISABLED"}, headers=auth(tom_tokens)
    )
    assert res.status_code == 409


def test_disabled_admin_does_not_count_as_active(client, session) -> None:
    admin_tokens = bootstrap_admin(client)
    add_member(client, admin_tokens)
    member_id = user_id_of(session, TOM["email"])
    admin_id = user_id_of(session, ADMIN["email"])

    # Tom becomes an admin but disabled — he must NOT count as an active admin.
    res = client.patch(
        f"/api/admin/users/{member_id}",
        json={"role": "ADMIN", "status": "DISABLED"},
        headers=auth(admin_tokens),
    )
    assert res.status_code == 200

    res = client.patch(
        f"/api/admin/users/{admin_id}", json={"role": "MEMBER"}, headers=auth(admin_tokens)
    )
    assert res.status_code == 409
