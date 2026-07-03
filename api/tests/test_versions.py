"""
Versioning invariants (E6-S6): one version per editing session (FR-H1),
newest-first visibility-gated history (FR-H2), restore appends a new version
and overwrites nothing (FR-H4), private history stays owner-only.
"""

from tests.test_auth import TOM, bootstrap_admin
from tests.test_locks import expire_lock, release
from tests.test_notes import LEA, auth, create_note, lock_note, member


def versions_of(client, tokens, note_id):
    res = client.get(f"/api/notes/{note_id}/versions", headers=auth(tokens))
    assert res.status_code == 200
    return res.json()


def patch(client, tokens, note_id, **fields):
    res = client.patch(f"/api/notes/{note_id}", json=fields, headers=auth(tokens))
    assert res.status_code == 200
    return res.json()


def restore(client, tokens, note_id, version_id):
    return client.post(f"/api/notes/{note_id}/restore/{version_id}", headers=auth(tokens))


# --- creation root: every note starts with its « Créée par X » version ---


def test_creating_a_note_writes_the_creation_version(client) -> None:
    admin = bootstrap_admin(client)
    note = create_note(client, admin, title="Repas de quartier", visibility="PUBLIC")

    history = versions_of(client, admin, note["id"])
    assert len(history) == 1
    root = history[0]
    assert root["author_name"] == "Marie"
    assert root["title"] == "Repas de quartier"
    # Stamped with the note's own created_at — the front's « Créée par » signal.
    assert root["created_at"] == note["created_at"]


# --- one session = one version (FR-H1) ---


def test_a_multi_save_public_session_yields_exactly_one_version(client, session) -> None:
    # Autosave PATCHes as you type; only the lock release records the version.
    admin = bootstrap_admin(client)
    tom = member(client, session, TOM)
    note = create_note(client, admin, title="Courses", visibility="PUBLIC")

    lock_note(client, tom, note["id"])
    patch(client, tom, note["id"], body="- [ ] Pain")
    patch(client, tom, note["id"], body="- [ ] Pain\n- [ ] Fromage")
    patch(client, tom, note["id"], body="- [x] Pain\n- [ ] Fromage")
    assert len(versions_of(client, tom, note["id"])) == 1  # still only the root

    assert release(client, tom, note["id"]).status_code == 204
    history = versions_of(client, tom, note["id"])
    assert len(history) == 2
    assert history[0]["body"] == "- [x] Pain\n- [ ] Fromage"
    assert history[0]["author_name"] == "Tom"
    # Newest-first: the session version precedes the creation root.
    assert history[0]["created_at"] > history[1]["created_at"]


def test_a_noop_session_records_no_version(client, session) -> None:
    admin = bootstrap_admin(client)
    note = create_note(client, admin, title="Note", visibility="PUBLIC")

    lock_note(client, admin, note["id"])
    assert release(client, admin, note["id"]).status_code == 204
    # Double release stays version-free too (idempotent end-of-session).
    assert release(client, admin, note["id"]).status_code == 204
    assert len(versions_of(client, admin, note["id"])) == 1


def test_release_by_a_non_holder_records_nothing(client, session) -> None:
    admin = bootstrap_admin(client)
    tom = member(client, session, TOM)
    note = create_note(client, admin, title="Note", visibility="PUBLIC")
    lock_note(client, admin, note["id"])
    patch(client, admin, note["id"], body="en cours")

    # Tom never held the lock: his release is a no-op, no version either.
    assert release(client, tom, note["id"]).status_code == 204
    assert len(versions_of(client, tom, note["id"])) == 1


def test_private_note_session_ends_on_the_close_signal(client) -> None:
    # No lock on private notes: the editor close calls DELETE /lock as the
    # end-of-session signal (E6-S2).
    admin = bootstrap_admin(client)
    note = create_note(client, admin, title="Perso")

    patch(client, admin, note["id"], body="Idée : repas de quartier.")
    res = release(client, admin, note["id"])
    assert res.status_code == 204
    history = versions_of(client, admin, note["id"])
    assert len(history) == 2
    assert history[0]["body"] == "Idée : repas de quartier."

    # Closing again without editing records nothing new.
    assert release(client, admin, note["id"]).status_code == 204
    assert len(versions_of(client, admin, note["id"])) == 2


# --- history listing & gating (FR-H2) ---


def test_history_is_visibility_gated_like_the_note(client, session) -> None:
    admin = bootstrap_admin(client)
    tom = member(client, session, TOM)
    private_note = create_note(client, admin, title="Perso")
    public_note = create_note(client, admin, title="Partagée", visibility="PUBLIC")

    # Private history: owner-only, same shielding 404 as the note itself.
    res = client.get(f"/api/notes/{private_note['id']}/versions", headers=auth(tom))
    assert res.status_code == 404
    # Public history: any member may read it.
    assert len(versions_of(client, tom, public_note["id"])) == 1


def test_history_lists_who_and_when_newest_first(client, session) -> None:
    admin = bootstrap_admin(client)
    tom = member(client, session, TOM)
    note = create_note(client, admin, title="Note", visibility="PUBLIC")

    lock_note(client, admin, note["id"])
    patch(client, admin, note["id"], body="v1")
    release(client, admin, note["id"])
    lock_note(client, tom, note["id"])
    patch(client, tom, note["id"], body="v2")
    release(client, tom, note["id"])

    history = versions_of(client, tom, note["id"])
    assert [v["author_name"] for v in history] == ["Tom", "Marie", "Marie"]
    assert [v["body"] for v in history] == ["v2", "v1", ""]


# --- restore: a NEW version, nothing overwritten (FR-H4) ---


def test_restore_reapplies_the_snapshot_and_appends_a_new_version(client, session) -> None:
    admin = bootstrap_admin(client)
    note = create_note(client, admin, title="Avant", color="GOLD", visibility="PUBLIC")
    lock_note(client, admin, note["id"])
    patch(client, admin, note["id"], title="Après", body="- [ ] Salle", color="TEAL")
    release(client, admin, note["id"])
    history = versions_of(client, admin, note["id"])
    root = history[-1]

    res = restore(client, admin, note["id"], root["id"])
    assert res.status_code == 200
    restored = res.json()
    assert (restored["title"], restored["body"], restored["color"]) == ("Avant", "", "GOLD")

    after = versions_of(client, admin, note["id"])
    assert len(after) == len(history) + 1  # appended, nothing overwritten
    assert after[0]["title"] == "Avant"
    assert after[0]["author_name"] == "Marie"
    # The previously-current version is still there, untouched.
    assert after[1] == history[0]
    # The restore did not leave a lock behind.
    assert restored["locked_by"] is None


def test_restore_is_blocked_while_someone_else_edits(client, session) -> None:
    admin = bootstrap_admin(client)
    tom = member(client, session, TOM)
    note = create_note(client, admin, title="Note", visibility="PUBLIC")
    root = versions_of(client, admin, note["id"])[0]
    lock_note(client, tom, note["id"])

    res = restore(client, admin, note["id"], root["id"])
    assert res.status_code == 409
    assert res.json()["detail"]["code"] == "note_locked"
    assert res.json()["detail"]["locked_by"]["display_name"] == "Tom"


def test_restore_reclaims_a_stale_lock(client, session) -> None:
    admin = bootstrap_admin(client)
    tom = member(client, session, TOM)
    note = create_note(client, admin, title="Note", visibility="PUBLIC")
    root = versions_of(client, admin, note["id"])[0]
    lock_note(client, tom, note["id"])
    expire_lock(session, note["id"])

    assert restore(client, admin, note["id"], root["id"]).status_code == 200


def test_member_restore_never_flips_visibility(client, session) -> None:
    # The creation snapshot of a note later made public says PRIVATE; a
    # member's restore re-applies the content but visibility is owner-only.
    admin = bootstrap_admin(client)
    tom = member(client, session, TOM)
    note = create_note(client, admin, title="Note")  # private root version
    lock_note(client, admin, note["id"])
    patch(client, admin, note["id"], body="publique", visibility="PUBLIC")
    release(client, admin, note["id"])
    root = versions_of(client, admin, note["id"])[-1]
    assert root["visibility"] == "PRIVATE"

    res = restore(client, tom, note["id"], root["id"])
    assert res.status_code == 200
    assert res.json()["visibility"] == "PUBLIC"  # untouched
    # The owner's restore, on the other hand, does re-apply visibility.
    res = restore(client, admin, note["id"], root["id"])
    assert res.status_code == 200
    assert res.json()["visibility"] == "PRIVATE"


def test_restore_of_an_unknown_or_foreign_version_is_404(client, session) -> None:
    admin = bootstrap_admin(client)
    lea = member(client, session, LEA)
    note = create_note(client, admin, title="Note", visibility="PUBLIC")
    other = create_note(client, lea, title="Autre", visibility="PUBLIC")
    foreign = versions_of(client, lea, other["id"])[0]

    assert restore(client, admin, note["id"], "v-inconnue").status_code == 404
    # A version id must belong to the note in the URL.
    assert restore(client, admin, note["id"], foreign["id"]).status_code == 404


# --- lifecycle: deleting a note takes its history along ---


def test_deleting_a_note_deletes_its_versions(client, session) -> None:
    from sqlmodel import select

    from app.models import NoteVersion

    admin = bootstrap_admin(client)
    note = create_note(client, admin, title="Éphémère", visibility="PUBLIC")
    lock_note(client, admin, note["id"])
    patch(client, admin, note["id"], body="contenu")
    release(client, admin, note["id"])

    res = client.delete(f"/api/notes/{note['id']}", headers=auth(admin))
    assert res.status_code == 204
    leftovers = session.exec(select(NoteVersion).where(NoteVersion.note_id == note["id"])).all()
    assert leftovers == []


# --- lock endpoint still behaves (E5 regression guard) ---


def test_acquire_after_release_starts_a_new_session(client, session) -> None:
    admin = bootstrap_admin(client)
    note = create_note(client, admin, title="Note", visibility="PUBLIC")

    lock_note(client, admin, note["id"])
    patch(client, admin, note["id"], body="session 1")
    release(client, admin, note["id"])
    lock_note(client, admin, note["id"])
    patch(client, admin, note["id"], body="session 2")
    release(client, admin, note["id"])

    bodies = [v["body"] for v in versions_of(client, admin, note["id"])]
    assert bodies == ["session 2", "session 1", ""]
