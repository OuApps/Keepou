"""
Admin access-management rules (E7-S6): server-side /admin protection
(claude.md §6), members listing (registered vs pending, FR-U2), allowlist
add/remove (FR-U1, pending-only remove), role/status changes (FR-U3), disable
blocks login while keeping notes (FR-A5/FR-U4), and the last-admin guard (FR-U5).
"""

from sqlmodel import Session, select

from app.models import AllowlistEntry, Note, Role, User, UserStatus

ADMIN = {"email": "marie@famille-ou.fr", "password": "un mot de passe", "display_name": "Marie"}
TOM = {"email": "tom@famille-ou.fr", "password": "encore un autre", "display_name": "Tom"}


def register(client, payload):
    return client.post("/api/auth/register", json=payload)


def login(client, email, password):
    return client.post("/api/auth/login", json={"email": email, "password": password})


def bearer(tokens: dict) -> dict:
    return {"Authorization": f"Bearer {tokens['access']}"}


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


def register_member(client, session, payload=TOM) -> dict:
    allow(session, payload["email"])
    res = register(client, payload)
    assert res.status_code == 201
    return res.json()


def user_id_of(session: Session, email: str) -> str:
    user = session.exec(select(User).where(User.email == email)).first()
    assert user is not None
    return user.id


# --- server-side protection (claude.md §6) ---


def test_admin_routes_require_a_token(client) -> None:
    assert client.get("/api/admin/members").status_code == 401
    assert client.post("/api/admin/allowlist", json={"email": "x@y.fr"}).status_code == 401
    assert client.delete("/api/admin/allowlist/xyz").status_code == 401
    assert client.patch("/api/admin/users/xyz", json={"role": "ADMIN"}).status_code == 401


def test_admin_routes_refuse_a_member(client, session) -> None:
    bootstrap_admin(client)
    member = register_member(client, session)
    headers = bearer(member)
    assert client.get("/api/admin/members", headers=headers).status_code == 403
    assert (
        client.post(
            "/api/admin/allowlist", json={"email": "lea@famille-ou.fr"}, headers=headers
        ).status_code
        == 403
    )
    assert client.delete("/api/admin/allowlist/xyz", headers=headers).status_code == 403
    assert (
        client.patch("/api/admin/users/xyz", json={"role": "ADMIN"}, headers=headers).status_code
        == 403
    )


# --- GET /api/admin/members (E7-S1 / FR-U2) ---


def test_members_lists_registered_and_pending(client, session) -> None:
    tokens = bootstrap_admin(client)
    register_member(client, session)  # Tom: allowlisted then registered
    allow(session, "mamie@famille-ou.fr")  # allowlisted, no account yet

    res = client.get("/api/admin/members", headers=bearer(tokens))
    assert res.status_code == 200
    rows = res.json()

    registered = [r for r in rows if not r["pending"]]
    pending = [r for r in rows if r["pending"]]
    assert [r["email"] for r in registered] == [ADMIN["email"], TOM["email"]]
    assert [r["email"] for r in pending] == ["mamie@famille-ou.fr"]

    marie = registered[0]
    assert marie["role"] == "ADMIN"
    assert marie["status"] == "ACTIVE"
    assert marie["display_name"] == "Marie"
    assert marie["user_id"] and marie["registered_at"]

    mamie = pending[0]
    assert mamie["allowlist_id"] and mamie["allowed_at"]
    assert mamie["role"] is None and mamie["status"] is None


def test_registered_member_is_not_also_listed_as_pending(client, session) -> None:
    """Tom is allowlisted AND registered → one registered row, no pending row."""
    tokens = bootstrap_admin(client)
    register_member(client, session)
    rows = client.get("/api/admin/members", headers=bearer(tokens)).json()
    assert [r["email"] for r in rows].count(TOM["email"]) == 1
    assert not next(r for r in rows if r["email"] == TOM["email"])["pending"]


# --- POST /api/admin/allowlist (E7-S2 / FR-U1) ---


def test_add_email_appears_as_pending(client, session) -> None:
    tokens = bootstrap_admin(client)
    res = client.post(
        "/api/admin/allowlist", json={"email": "  Mamie@Famille-OU.fr "}, headers=bearer(tokens)
    )
    assert res.status_code == 201
    assert res.json()["pending"] is True
    assert res.json()["email"] == "mamie@famille-ou.fr"  # normalized

    rows = client.get("/api/admin/members", headers=bearer(tokens)).json()
    assert any(r["pending"] and r["email"] == "mamie@famille-ou.fr" for r in rows)


def test_add_duplicate_email_is_409(client, session) -> None:
    tokens = bootstrap_admin(client)
    payload = {"email": "mamie@famille-ou.fr"}
    assert (
        client.post("/api/admin/allowlist", json=payload, headers=bearer(tokens)).status_code == 201
    )
    res = client.post("/api/admin/allowlist", json=payload, headers=bearer(tokens))
    assert res.status_code == 409
    assert res.json()["detail"] == "Cette adresse est déjà dans la liste."


def test_add_email_of_registered_user_is_409(client, session) -> None:
    tokens = bootstrap_admin(client)
    res = client.post(
        "/api/admin/allowlist", json={"email": ADMIN["email"]}, headers=bearer(tokens)
    )
    assert res.status_code == 409


# --- DELETE /api/admin/allowlist/{id} (E7-S2: pending only) ---


def test_remove_pending_entry_works(client, session) -> None:
    tokens = bootstrap_admin(client)
    created = client.post(
        "/api/admin/allowlist", json={"email": "mamie@famille-ou.fr"}, headers=bearer(tokens)
    ).json()
    res = client.delete(f"/api/admin/allowlist/{created['allowlist_id']}", headers=bearer(tokens))
    assert res.status_code == 204
    rows = client.get("/api/admin/members", headers=bearer(tokens)).json()
    assert all(r["email"] != "mamie@famille-ou.fr" for r in rows)


def test_remove_entry_with_registered_user_is_409(client, session) -> None:
    tokens = bootstrap_admin(client)
    register_member(client, session)
    entry = session.exec(select(AllowlistEntry).where(AllowlistEntry.email == TOM["email"])).first()
    assert entry is not None
    res = client.delete(f"/api/admin/allowlist/{entry.id}", headers=bearer(tokens))
    assert res.status_code == 409
    assert session.get(AllowlistEntry, entry.id) is not None


def test_remove_unknown_entry_is_404(client, session) -> None:
    tokens = bootstrap_admin(client)
    assert client.delete("/api/admin/allowlist/inconnu", headers=bearer(tokens)).status_code == 404


# --- PATCH /api/admin/users/{id} (E7-S3 / FR-U3 / FR-U4) ---


def test_promote_then_demote_persists(client, session) -> None:
    tokens = bootstrap_admin(client)
    register_member(client, session)
    tom_id = user_id_of(session, TOM["email"])

    res = client.patch(f"/api/admin/users/{tom_id}", json={"role": "ADMIN"}, headers=bearer(tokens))
    assert res.status_code == 200
    assert res.json()["role"] == "ADMIN"

    res = client.patch(
        f"/api/admin/users/{tom_id}", json={"role": "MEMBER"}, headers=bearer(tokens)
    )
    assert res.status_code == 200
    assert res.json()["role"] == "MEMBER"


def test_disable_blocks_login_and_keeps_notes_and_is_reversible(client, session) -> None:
    tokens = bootstrap_admin(client)
    member = register_member(client, session)
    tom_id = user_id_of(session, TOM["email"])

    note = client.post("/api/notes", json={"title": "Courses"}, headers=bearer(member))
    assert note.status_code == 201

    res = client.patch(
        f"/api/admin/users/{tom_id}", json={"status": "DISABLED"}, headers=bearer(tokens)
    )
    assert res.status_code == 200

    # Login blocked, in-flight token refused (FR-A5)…
    assert login(client, TOM["email"], TOM["password"]).status_code == 403
    assert client.get("/api/auth/me", headers=bearer(member)).status_code == 403
    # …but the account and its notes are kept (FR-U4 / FR-A5).
    assert session.exec(select(Note).where(Note.owner_id == tom_id)).first() is not None
    assert session.get(User, tom_id) is not None

    # Reactivation restores access.
    res = client.patch(
        f"/api/admin/users/{tom_id}", json={"status": "ACTIVE"}, headers=bearer(tokens)
    )
    assert res.status_code == 200
    assert login(client, TOM["email"], TOM["password"]).status_code == 200


def test_patch_unknown_user_is_404(client, session) -> None:
    tokens = bootstrap_admin(client)
    res = client.patch("/api/admin/users/inconnu", json={"role": "ADMIN"}, headers=bearer(tokens))
    assert res.status_code == 404


def test_no_endpoint_deletes_a_user(client, session) -> None:
    """FR-U4: there is no user-delete route — DELETE on the resource is a 405."""
    tokens = bootstrap_admin(client)
    tom_id = "peu-importe"
    assert client.delete(f"/api/admin/users/{tom_id}", headers=bearer(tokens)).status_code == 405


# --- last-admin guard (FR-U5) ---


def test_last_admin_cannot_be_demoted_or_disabled(client, session) -> None:
    tokens = bootstrap_admin(client)
    marie_id = user_id_of(session, ADMIN["email"])

    for patch in ({"role": "MEMBER"}, {"status": "DISABLED"}):
        res = client.patch(f"/api/admin/users/{marie_id}", json=patch, headers=bearer(tokens))
        assert res.status_code == 409
        assert (
            res.json()["detail"]
            == "Impossible : l'instance doit conserver au moins un administrateur actif."
        )

    user = session.get(User, marie_id)
    assert user is not None
    assert user.role == Role.ADMIN and user.status == UserStatus.ACTIVE


def test_admin_can_step_down_once_another_active_admin_exists(client, session) -> None:
    tokens = bootstrap_admin(client)
    register_member(client, session)
    marie_id = user_id_of(session, ADMIN["email"])
    tom_id = user_id_of(session, TOM["email"])

    # Promote Tom → two active admins → Marie may now demote herself.
    assert (
        client.patch(
            f"/api/admin/users/{tom_id}", json={"role": "ADMIN"}, headers=bearer(tokens)
        ).status_code
        == 200
    )
    res = client.patch(
        f"/api/admin/users/{marie_id}", json={"role": "MEMBER"}, headers=bearer(tokens)
    )
    assert res.status_code == 200
    assert res.json()["role"] == "MEMBER"


def test_guard_counts_only_active_admins(client, session) -> None:
    """A DISABLED admin does not count: the remaining active one is the last."""
    tokens = bootstrap_admin(client)
    register_member(client, session)
    marie_id = user_id_of(session, ADMIN["email"])
    tom_id = user_id_of(session, TOM["email"])

    # Tom becomes admin, then is disabled (allowed: Marie stays active-admin).
    client.patch(f"/api/admin/users/{tom_id}", json={"role": "ADMIN"}, headers=bearer(tokens))
    res = client.patch(
        f"/api/admin/users/{tom_id}", json={"status": "DISABLED"}, headers=bearer(tokens)
    )
    assert res.status_code == 200

    # Marie is now the only ACTIVE admin → guarded again.
    res = client.patch(
        f"/api/admin/users/{marie_id}", json={"status": "DISABLED"}, headers=bearer(tokens)
    )
    assert res.status_code == 409
