"""
History & versioning invariants (E6-S6):
- one editing **session** = one version (FR-H1) — not per keystroke; a no-op
  session writes nothing; public versions on lock release, private on close;
- history list is newest-first, carries who + when, and is **visibility-gated**
  (private history is owner-only, FR-H2);
- **restore** makes the note equal the chosen version and appends a *new*
  version — nothing is ever overwritten (FR-H4).
"""

from tests.test_auth import TOM, bootstrap_admin
from tests.test_notes import LEA, auth, create_note, lock_note, member


def release(client, tokens, note_id):
    return client.delete(f"/api/notes/{note_id}/lock", headers=auth(tokens))


def patch(client, tokens, note_id, **fields):
    return client.patch(f"/api/notes/{note_id}", json=fields, headers=auth(tokens))


def versions(client, tokens, note_id):
    res = client.get(f"/api/notes/{note_id}/versions", headers=auth(tokens))
    assert res.status_code == 200
    return res.json()


def end_session(client, tokens, note_id):
    return client.post(f"/api/notes/{note_id}/versions", headers=auth(tokens))


# --- one session = one version (FR-H1) ---


def test_public_session_writes_one_version_on_release(client, session) -> None:
    # Several saves within one lock-held session collapse into a single version,
    # created when the lock is released — never one per keystroke.
    admin = bootstrap_admin(client)
    note = create_note(client, admin, title="Repas", visibility="PUBLIC")
    lock_note(client, admin, note["id"])
    patch(client, admin, note["id"], body="- [ ] Réserver la salle")
    patch(client, admin, note["id"], body="- [x] Réserver la salle")

    assert versions(client, admin, note["id"]) == []  # not yet — session still open
    assert release(client, admin, note["id"]).status_code == 204

    hist = versions(client, admin, note["id"])
    assert len(hist) == 1
    assert hist[0]["body"] == "- [x] Réserver la salle"
    assert hist[0]["author_name"] == "Marie"


def test_release_without_change_writes_no_version(client, session) -> None:
    # Open (acquire) then release without editing: a no-op session leaves no version.
    admin = bootstrap_admin(client)
    note = create_note(client, admin, title="Perso", visibility="PUBLIC")
    lock_note(client, admin, note["id"])
    assert release(client, admin, note["id"]).status_code == 204

    assert versions(client, admin, note["id"]) == []


def test_double_release_does_not_duplicate_the_version(client, session) -> None:
    admin = bootstrap_admin(client)
    note = create_note(client, admin, title="Note", visibility="PUBLIC")
    lock_note(client, admin, note["id"])
    patch(client, admin, note["id"], body="édité")
    release(client, admin, note["id"])
    release(client, admin, note["id"])  # idempotent, no lock dropped the 2nd time

    assert len(versions(client, admin, note["id"])) == 1


def test_two_sessions_write_two_versions(client, session) -> None:
    admin = bootstrap_admin(client)
    note = create_note(client, admin, title="Note", visibility="PUBLIC")

    lock_note(client, admin, note["id"])
    patch(client, admin, note["id"], body="v1")
    release(client, admin, note["id"])

    lock_note(client, admin, note["id"])
    patch(client, admin, note["id"], body="v2")
    release(client, admin, note["id"])

    hist = versions(client, admin, note["id"])
    assert [v["body"] for v in hist] == ["v2", "v1"]  # newest-first


# --- private notes: session end on close (no lock) ---


def test_private_end_session_writes_a_version(client, session) -> None:
    admin = bootstrap_admin(client)
    note = create_note(client, admin, title="Journal", visibility="PRIVATE")
    patch(client, admin, note["id"], body="ligne 1")  # lock-free edit

    res = end_session(client, admin, note["id"])
    assert res.status_code == 201
    assert res.json()["body"] == "ligne 1"
    assert len(versions(client, admin, note["id"])) == 1


def test_private_end_session_is_a_noop_when_unchanged(client, session) -> None:
    admin = bootstrap_admin(client)
    note = create_note(client, admin, title="Journal", visibility="PRIVATE")
    # Never edited since creation → open-and-close leaves no version.
    res = end_session(client, admin, note["id"])
    assert res.status_code == 201
    assert res.json() is None
    assert versions(client, admin, note["id"]) == []


def test_private_end_session_dedups_against_the_last_version(client, session) -> None:
    admin = bootstrap_admin(client)
    note = create_note(client, admin, title="Journal", visibility="PRIVATE")
    patch(client, admin, note["id"], body="contenu")
    assert end_session(client, admin, note["id"]).json()["body"] == "contenu"
    # A second close with no further edit adds nothing.
    assert end_session(client, admin, note["id"]).json() is None
    assert len(versions(client, admin, note["id"])) == 1


# --- history listing & visibility gating (FR-H2) ---


def test_public_history_is_visible_to_any_member(client, session) -> None:
    admin = bootstrap_admin(client)
    tom = member(client, session, TOM)
    note = create_note(client, admin, title="Quartier", visibility="PUBLIC")
    lock_note(client, admin, note["id"])
    patch(client, admin, note["id"], body="édité")
    release(client, admin, note["id"])

    assert len(versions(client, tom, note["id"])) == 1


def test_private_history_is_owner_only(client, session) -> None:
    admin = bootstrap_admin(client)
    tom = member(client, session, TOM)
    note = create_note(client, admin, title="Secret", visibility="PRIVATE")
    patch(client, admin, note["id"], body="perso")
    end_session(client, admin, note["id"])

    # A non-owner cannot even confirm the private note exists → 404 (not 403).
    res = client.get(f"/api/notes/{note['id']}/versions", headers=auth(tom))
    assert res.status_code == 404
    assert versions(client, admin, note["id"])  # the owner still sees it


# --- restore = new version, nothing overwritten (FR-H4) ---


def test_restore_makes_content_equal_and_appends_a_new_version(client, session) -> None:
    admin = bootstrap_admin(client)
    note = create_note(client, admin, title="Note", visibility="PRIVATE")

    patch(client, admin, note["id"], body="ancienne")
    end_session(client, admin, note["id"])
    old_version = versions(client, admin, note["id"])[0]

    patch(client, admin, note["id"], body="nouvelle")
    end_session(client, admin, note["id"])
    assert len(versions(client, admin, note["id"])) == 2

    res = client.post(
        f"/api/notes/{note['id']}/restore/{old_version['id']}", headers=auth(admin)
    )
    assert res.status_code == 200
    assert res.json()["body"] == "ancienne"  # content restored

    hist = versions(client, admin, note["id"])
    assert len(hist) == 3  # a NEW version was appended, nothing overwritten
    assert hist[0]["body"] == "ancienne"  # newest = the restore
    assert old_version["id"] in {v["id"] for v in hist}  # the chosen one survives


def test_restore_on_public_requires_no_other_holder(client, session) -> None:
    admin = bootstrap_admin(client)
    tom = member(client, session, TOM)
    note = create_note(client, admin, title="Partagé", visibility="PUBLIC")
    lock_note(client, admin, note["id"])
    patch(client, admin, note["id"], body="v1")
    release(client, admin, note["id"])
    v1 = versions(client, admin, note["id"])[0]

    # Tom holds the lock → admin's restore is refused (409), like any edit.
    lock_note(client, tom, note["id"])
    res = client.post(f"/api/notes/{note['id']}/restore/{v1['id']}", headers=auth(admin))
    assert res.status_code == 409
    assert res.json()["detail"]["code"] == "note_locked"

    # Once Tom releases, the restore goes through and grabs/releases the lock itself.
    release(client, tom, note["id"])
    res = client.post(f"/api/notes/{note['id']}/restore/{v1['id']}", headers=auth(admin))
    assert res.status_code == 200
    reread = client.get(f"/api/notes/{note['id']}", headers=auth(admin)).json()
    assert reread["locked_by"] is None  # the restore did not leave the note locked


def test_restore_unknown_version_is_404(client, session) -> None:
    admin = bootstrap_admin(client)
    note = create_note(client, admin, title="Note", visibility="PRIVATE")
    res = client.post(f"/api/notes/{note['id']}/restore/nope", headers=auth(admin))
    assert res.status_code == 404


def test_restore_rejects_a_version_from_another_note(client, session) -> None:
    admin = bootstrap_admin(client)
    a = create_note(client, admin, title="A", visibility="PRIVATE")
    b = create_note(client, admin, title="B", visibility="PRIVATE")
    patch(client, admin, b["id"], body="b")
    end_session(client, admin, b["id"])
    b_version = versions(client, admin, b["id"])[0]

    res = client.post(f"/api/notes/{a['id']}/restore/{b_version['id']}", headers=auth(admin))
    assert res.status_code == 404


def test_non_owner_restore_keeps_visibility(client, session) -> None:
    # A public note whose history holds a PRIVATE snapshot (from before it was
    # shared): a non-owner restoring it must not flip the note private (owner-only).
    admin = bootstrap_admin(client)
    lea = member(client, session, LEA)
    note = create_note(client, admin, title="Note", visibility="PRIVATE")
    patch(client, admin, note["id"], body="privée")
    private_version = end_session(client, admin, note["id"]).json()

    # Owner makes it public and records a public version.
    patch(client, admin, note["id"], visibility="PUBLIC")
    lock_note(client, admin, note["id"])
    patch(client, admin, note["id"], body="publique")
    release(client, admin, note["id"])

    # Léa (member, not owner) restores the old PRIVATE snapshot.
    res = client.post(
        f"/api/notes/{note['id']}/restore/{private_version['id']}", headers=auth(lea)
    )
    assert res.status_code == 200
    assert res.json()["visibility"] == "PUBLIC"  # content restored, visibility kept
    assert res.json()["body"] == "privée"
