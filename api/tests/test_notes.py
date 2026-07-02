"""
Note business rules (E3-S8): CRUD echo, tab=mine vs tab=public filtering,
private-note shielding (404 for non-owners, admins included), and the delete
permission (owner or admin only — FR-N6).
"""

from sqlmodel import select

from app.models import Note, User
from tests.test_auth import ADMIN, TOM, allow, bootstrap_admin, register

LEA = {"email": "lea@famille-ou.fr", "password": "mot de passe lea", "display_name": "Léa"}


def auth(tokens: dict) -> dict:
    return {"Authorization": f"Bearer {tokens['access']}"}


def member(client, session, payload) -> dict:
    """Allowlist + register a member; returns its token pair."""
    allow(session, payload["email"])
    res = register(client, payload)
    assert res.status_code == 201
    return res.json()


def create_note(client, tokens, **fields):
    res = client.post("/api/notes", json=fields, headers=auth(tokens))
    assert res.status_code == 201
    return res.json()


# --- create / read / patch (echo + persistence) ---


def test_create_echoes_the_note_with_defaults(client) -> None:
    admin = bootstrap_admin(client)
    note = create_note(client, admin, title="Courses du week-end")
    assert note["title"] == "Courses du week-end"
    assert note["body"] == ""
    assert note["color"] == "GOLD"
    assert note["visibility"] == "PRIVATE"
    assert note["author_name"] == ADMIN["display_name"]


def test_create_applies_color_and_visibility(client) -> None:
    admin = bootstrap_admin(client)
    note = create_note(
        client, admin, title="Repas de quartier", color="AVOCAT", visibility="PUBLIC"
    )
    assert note["color"] == "AVOCAT"
    assert note["visibility"] == "PUBLIC"


def test_patch_persists_and_touches_updated_at(client) -> None:
    admin = bootstrap_admin(client)
    note = create_note(client, admin, title="Avant")
    res = client.patch(
        f"/api/notes/{note['id']}",
        json={"title": "Après", "body": "- [ ] Réserver la salle", "color": "TEAL"},
        headers=auth(admin),
    )
    assert res.status_code == 200
    patched = res.json()
    assert patched["title"] == "Après"
    assert patched["body"] == "- [ ] Réserver la salle"
    assert patched["color"] == "TEAL"
    assert patched["updated_at"] >= note["updated_at"]

    reread = client.get(f"/api/notes/{note['id']}", headers=auth(admin))
    assert reread.status_code == 200
    assert reread.json()["title"] == "Après"


def test_requires_authentication(client) -> None:
    assert client.get("/api/notes").status_code == 401
    assert client.post("/api/notes", json={"title": "x"}).status_code == 401


# --- tab filtering (FR-S2) ---


def test_tab_mine_returns_only_callers_notes(client, session) -> None:
    admin = bootstrap_admin(client)
    tom = member(client, session, TOM)
    create_note(client, admin, title="Note de Marie")
    create_note(client, tom, title="Note de Tom", visibility="PUBLIC")

    res = client.get("/api/notes?tab=mine", headers=auth(admin))
    assert res.status_code == 200
    assert [n["title"] for n in res.json()] == ["Note de Marie"]


def test_tab_public_returns_all_members_public_notes_with_author(client, session) -> None:
    admin = bootstrap_admin(client)
    tom = member(client, session, TOM)
    create_note(client, admin, title="Privée de Marie")  # must not appear
    create_note(client, admin, title="Publique de Marie", visibility="PUBLIC")
    create_note(client, tom, title="Publique de Tom", visibility="PUBLIC")

    res = client.get("/api/notes?tab=public", headers=auth(tom))
    assert res.status_code == 200
    notes = res.json()
    assert {n["title"] for n in notes} == {"Publique de Marie", "Publique de Tom"}
    by_title = {n["title"]: n for n in notes}
    assert by_title["Publique de Marie"]["author_name"] == "Marie"
    assert by_title["Publique de Tom"]["author_name"] == "Tom"


def test_lists_are_newest_first(client, session) -> None:
    admin = bootstrap_admin(client)
    first = create_note(client, admin, title="Première")
    create_note(client, admin, title="Seconde")
    # Touching the oldest note moves it back to the top (ordered by updated_at).
    client.patch(f"/api/notes/{first['id']}", json={"body": "hop"}, headers=auth(admin))

    res = client.get("/api/notes", headers=auth(admin))
    assert [n["title"] for n in res.json()] == ["Première", "Seconde"]


def test_invalid_tab_is_422(client) -> None:
    admin = bootstrap_admin(client)
    assert client.get("/api/notes?tab=all", headers=auth(admin)).status_code == 422


# --- visibility (private shielded, public readable by any member) ---


def test_private_note_is_404_for_non_owners_even_admin(client, session) -> None:
    admin = bootstrap_admin(client)
    tom = member(client, session, TOM)
    private = create_note(client, tom, title="Secrète")

    # Another member — and even the admin — get the same 404: the note's
    # existence stays shielded (ARCHITECTURE §4.2).
    assert client.get(f"/api/notes/{private['id']}", headers=auth(admin)).status_code == 404
    lea = member(client, session, LEA)
    assert client.get(f"/api/notes/{private['id']}", headers=auth(lea)).status_code == 404


def test_public_note_is_readable_by_any_member(client, session) -> None:
    admin = bootstrap_admin(client)
    tom = member(client, session, TOM)
    public = create_note(client, admin, title="Code Wifi maison", visibility="PUBLIC")

    res = client.get(f"/api/notes/{public['id']}", headers=auth(tom))
    assert res.status_code == 200
    assert res.json()["author_name"] == "Marie"


def test_public_note_is_editable_by_any_member(client, session) -> None:
    # The single-editor lock guards these mutations from E5 onward; in E3 any
    # member may patch a public note (shared board).
    admin = bootstrap_admin(client)
    tom = member(client, session, TOM)
    public = create_note(client, admin, title="Liste apéro", visibility="PUBLIC")

    res = client.patch(
        f"/api/notes/{public['id']}", json={"body": "- [ ] Citron vert"}, headers=auth(tom)
    )
    assert res.status_code == 200
    assert res.json()["body"] == "- [ ] Citron vert"


def test_visibility_change_is_refused_for_non_owner_member(client, session) -> None:
    # ARCHITECTURE §4.2: only the owner may change a note's visibility — a member
    # editing a public note's content must not be able to flip it to private
    # (which would remove it from everyone's board).
    admin = bootstrap_admin(client)
    tom = member(client, session, TOM)
    public = create_note(client, admin, title="Sorties ciné", visibility="PUBLIC")

    res = client.patch(
        f"/api/notes/{public['id']}", json={"visibility": "PRIVATE"}, headers=auth(tom)
    )
    assert res.status_code == 403
    # The note stays public and readable by the member.
    assert client.get(f"/api/notes/{public['id']}", headers=auth(tom)).status_code == 200


def test_visibility_change_is_refused_even_for_admin(client, session) -> None:
    # The matrix denies visibility changes to admins too (only the owner).
    admin = bootstrap_admin(client)
    tom = member(client, session, TOM)
    public = create_note(client, tom, title="Note de Tom", visibility="PUBLIC")

    res = client.patch(
        f"/api/notes/{public['id']}", json={"visibility": "PRIVATE"}, headers=auth(admin)
    )
    assert res.status_code == 403


def test_member_may_echo_current_visibility_while_editing_content(client, session) -> None:
    # Sending visibility=PUBLIC (unchanged) alongside a content edit is fine —
    # only an actual flip by a non-owner is refused.
    admin = bootstrap_admin(client)
    tom = member(client, session, TOM)
    public = create_note(client, admin, title="Liste apéro", visibility="PUBLIC")

    res = client.patch(
        f"/api/notes/{public['id']}",
        json={"body": "- [ ] Glaçons", "visibility": "PUBLIC"},
        headers=auth(tom),
    )
    assert res.status_code == 200
    assert res.json()["body"] == "- [ ] Glaçons"


def test_public_to_private_removes_from_others_public_tab(client, session) -> None:
    # FR-N5 / E4-S1: once the owner flips a public note back to private, it no
    # longer matches tab=public — it disappears from the other members' board.
    admin = bootstrap_admin(client)
    tom = member(client, session, TOM)
    note = create_note(client, admin, title="Fête des voisins", visibility="PUBLIC")
    before = client.get("/api/notes?tab=public", headers=auth(tom)).json()
    assert [n["title"] for n in before] == ["Fête des voisins"]

    res = client.patch(
        f"/api/notes/{note['id']}", json={"visibility": "PRIVATE"}, headers=auth(admin)
    )
    assert res.status_code == 200
    assert client.get("/api/notes?tab=public", headers=auth(tom)).json() == []
    # ...and the note itself is shielded again (404, ARCHITECTURE §4.2).
    assert client.get(f"/api/notes/{note['id']}", headers=auth(tom)).status_code == 404


def test_body_persists_markdown_verbatim(client) -> None:
    # E4-S1: the editor's GFM body round-trips through the API untouched —
    # blank lines, task-list markers and checked state included.
    admin = bootstrap_admin(client)
    note = create_note(client, admin, title="Repas de quartier")
    body = (
        "Pour le repas de quartier on se répartit les tâches.\n"
        "\n"
        "- [x] Réserver la salle\n"
        "- [ ] Liste des plats par famille\n"
        "- [ ] Tables & chaises\n"
        "\n"
        "Penser à ramener une rallonge et des gobelets réutilisables."
    )
    res = client.patch(f"/api/notes/{note['id']}", json={"body": body}, headers=auth(admin))
    assert res.status_code == 200
    assert res.json()["body"] == body
    assert client.get(f"/api/notes/{note['id']}", headers=auth(admin)).json()["body"] == body


def test_owner_can_change_visibility(client, session) -> None:
    admin = bootstrap_admin(client)
    public = create_note(client, admin, title="Note", visibility="PUBLIC")
    res = client.patch(
        f"/api/notes/{public['id']}", json={"visibility": "PRIVATE"}, headers=auth(admin)
    )
    assert res.status_code == 200
    assert res.json()["visibility"] == "PRIVATE"


def test_patch_with_explicit_null_is_ignored_not_500(client, session) -> None:
    # Every Note column is NOT NULL: an explicit null must be treated as
    # "leave unchanged", never written to the DB (which would 500).
    admin = bootstrap_admin(client)
    note = create_note(client, admin, title="Titre", body="Corps")
    res = client.patch(
        f"/api/notes/{note['id']}",
        json={"title": None, "body": "Nouveau corps"},
        headers=auth(admin),
    )
    assert res.status_code == 200
    assert res.json()["title"] == "Titre"  # untouched
    assert res.json()["body"] == "Nouveau corps"


def test_private_note_is_not_patchable_by_others(client, session) -> None:
    admin = bootstrap_admin(client)
    tom = member(client, session, TOM)
    private = create_note(client, tom, title="Secrète")

    res = client.patch(f"/api/notes/{private['id']}", json={"title": "Pwned"}, headers=auth(admin))
    assert res.status_code == 404


# --- delete permission (FR-N6) ---


def test_owner_can_delete(client, session) -> None:
    admin = bootstrap_admin(client)
    note = create_note(client, admin, title="À supprimer")
    assert client.delete(f"/api/notes/{note['id']}", headers=auth(admin)).status_code == 204
    assert session.exec(select(Note)).first() is None


def test_admin_can_delete_a_members_note(client, session) -> None:
    admin = bootstrap_admin(client)
    tom = member(client, session, TOM)
    note = create_note(client, tom, title="Publique de Tom", visibility="PUBLIC")
    assert client.delete(f"/api/notes/{note['id']}", headers=auth(admin)).status_code == 204


def test_member_cannot_delete_someone_elses_public_note(client, session) -> None:
    admin = bootstrap_admin(client)
    tom = member(client, session, TOM)
    note = create_note(client, admin, title="Publique de Marie", visibility="PUBLIC")

    res = client.delete(f"/api/notes/{note['id']}", headers=auth(tom))
    assert res.status_code == 403
    assert session.exec(select(Note)).first() is not None


def test_unknown_note_is_404(client) -> None:
    admin = bootstrap_admin(client)
    assert client.delete("/api/notes/inconnue", headers=auth(admin)).status_code == 404


def test_notes_endpoints_reject_anonymous_users(client, session) -> None:
    admin = bootstrap_admin(client)
    note = create_note(client, admin, title="Privée")
    assert client.get(f"/api/notes/{note['id']}").status_code == 401
    assert client.delete(f"/api/notes/{note['id']}").status_code == 401


def test_owner_relationship_survives_author_rename(client, session) -> None:
    # author_name always reflects the CURRENT display name (no denormalized copy).
    admin = bootstrap_admin(client)
    note = create_note(client, admin, title="Ma note", visibility="PUBLIC")
    user = session.exec(select(User)).first()
    assert user is not None
    user.display_name = "Marie O."
    session.add(user)
    session.commit()

    res = client.get(f"/api/notes/{note['id']}", headers=auth(admin))
    assert res.json()["author_name"] == "Marie O."
