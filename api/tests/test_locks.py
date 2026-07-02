"""
Single-editor lock rules (E5-S6): server-decided single winner (FR-L1),
heartbeat renewal (FR-L3), stale-lock reclaim (FR-L4), public-save enforcement
(FR-L2), holder identity in the 409 (FR-L5), idempotent release, and the lock
state carried by the note payload (short-poll source, E5-S3).
"""

from datetime import timedelta

from sqlmodel import select

from app.models import Note, _utcnow
from app.services.locks import LOCK_TTL_SECONDS
from tests.test_auth import TOM, bootstrap_admin
from tests.test_notes import LEA, auth, create_note, lock_note, member


def acquire(client, tokens, note_id):
    return client.post(f"/api/notes/{note_id}/lock", headers=auth(tokens))


def release(client, tokens, note_id):
    return client.delete(f"/api/notes/{note_id}/lock", headers=auth(tokens))


def expire_lock(session, note_id) -> None:
    """Age the lock past its TTL — simulates an editor gone silent (no heartbeat)."""
    note = session.exec(select(Note).where(Note.id == note_id)).one()
    note.lock_expires_at = _utcnow() - timedelta(seconds=1)
    session.add(note)
    session.commit()


# --- acquisition: single winner, holder identity (FR-L1 / FR-L5) ---


def test_acquire_grants_the_lock_and_echoes_the_holder(client, session) -> None:
    admin = bootstrap_admin(client)
    tom = member(client, session, TOM)
    note = create_note(client, admin, title="Liste apéro", visibility="PUBLIC")

    res = acquire(client, tom, note["id"])
    assert res.status_code == 200
    body = res.json()
    assert body["locked_by"]["display_name"] == "Tom"
    assert body["lock_expires_at"] is not None


def test_second_acquisition_loses_with_409_naming_the_holder(client, session) -> None:
    # Two acquisitions on the same note: exactly one wins, the server decides.
    admin = bootstrap_admin(client)
    tom = member(client, session, TOM)
    lea = member(client, session, LEA)
    note = create_note(client, admin, title="Repas de quartier", visibility="PUBLIC")

    assert acquire(client, tom, note["id"]).status_code == 200
    res = acquire(client, lea, note["id"])
    assert res.status_code == 409
    detail = res.json()["detail"]
    assert detail["code"] == "note_locked"
    assert detail["locked_by"]["display_name"] == "Tom"
    assert "Tom" in detail["message"]
    assert detail["lock_expires_at"] is not None


def test_atomic_conditional_update_lets_exactly_one_writer_win(client, session) -> None:
    # The grant is a single conditional UPDATE on the note row (ARCHITECTURE §5):
    # replaying the same statement for a second user affects 0 rows.
    from app.services import locks

    admin = bootstrap_admin(client)
    tom = member(client, session, TOM)
    note = create_note(client, admin, title="Course", visibility="PUBLIC")
    tom_id = client.get("/api/auth/me", headers=auth(tom)).json()["id"]
    admin_id = client.get("/api/auth/me", headers=auth(admin)).json()["id"]

    results = [
        locks.acquire(session, note["id"], tom_id),
        locks.acquire(session, note["id"], admin_id),
    ]
    assert results == [True, False]


# --- heartbeat & expiry (FR-L3 / FR-L4) ---


def test_reacquire_by_the_holder_renews_expiry_and_keeps_session_start(client, session) -> None:
    admin = bootstrap_admin(client)
    note = create_note(client, admin, title="Note", visibility="PUBLIC")

    first = acquire(client, admin, note["id"]).json()
    row = session.exec(select(Note).where(Note.id == note["id"])).one()
    started_at = row.locked_at
    # Nudge the expiry back so the renewal visibly extends it.
    row.lock_expires_at = _utcnow() + timedelta(seconds=LOCK_TTL_SECONDS - 10)
    session.add(row)
    session.commit()

    second = acquire(client, admin, note["id"]).json()
    assert second["lock_expires_at"] > first["lock_expires_at"] or second["lock_expires_at"]
    session.expire_all()
    renewed = session.exec(select(Note).where(Note.id == note["id"])).one()
    assert renewed.lock_expires_at is not None
    assert renewed.lock_expires_at > _utcnow() + timedelta(seconds=LOCK_TTL_SECONDS - 10)
    # `locked_at` marks the editing-session start (E6's version): renewal keeps it.
    assert renewed.locked_at == started_at


def test_stale_lock_is_claimable_by_anyone(client, session) -> None:
    admin = bootstrap_admin(client)
    tom = member(client, session, TOM)
    note = create_note(client, admin, title="Note", visibility="PUBLIC")

    assert acquire(client, admin, note["id"]).status_code == 200
    expire_lock(session, note["id"])

    res = acquire(client, tom, note["id"])
    assert res.status_code == 200
    assert res.json()["locked_by"]["display_name"] == "Tom"


# --- release: idempotent, never someone else's (E5-S2) ---


def test_release_is_idempotent(client, session) -> None:
    admin = bootstrap_admin(client)
    note = create_note(client, admin, title="Note", visibility="PUBLIC")
    assert acquire(client, admin, note["id"]).status_code == 200

    assert release(client, admin, note["id"]).status_code == 204
    assert release(client, admin, note["id"]).status_code == 204
    reread = client.get(f"/api/notes/{note['id']}", headers=auth(admin)).json()
    assert reread["locked_by"] is None
    assert reread["lock_expires_at"] is None


def test_release_never_drops_someone_elses_lock(client, session) -> None:
    admin = bootstrap_admin(client)
    tom = member(client, session, TOM)
    note = create_note(client, admin, title="Note", visibility="PUBLIC")
    assert acquire(client, admin, note["id"]).status_code == 200

    assert release(client, tom, note["id"]).status_code == 204  # no-op, still 204
    reread = client.get(f"/api/notes/{note['id']}", headers=auth(tom)).json()
    assert reread["locked_by"]["display_name"] == "Marie"


# --- save enforcement on PUBLIC notes (FR-L2) ---


def test_public_patch_without_lock_is_409(client, session) -> None:
    admin = bootstrap_admin(client)
    tom = member(client, session, TOM)
    note = create_note(client, admin, title="Liste", visibility="PUBLIC")

    res = client.patch(f"/api/notes/{note['id']}", json={"body": "volé"}, headers=auth(tom))
    assert res.status_code == 409
    assert res.json()["detail"]["code"] == "lock_required"
    # Nothing was written.
    assert client.get(f"/api/notes/{note['id']}", headers=auth(tom)).json()["body"] == ""


def test_public_patch_against_another_holder_is_409_with_holder(client, session) -> None:
    admin = bootstrap_admin(client)
    tom = member(client, session, TOM)
    note = create_note(client, admin, title="Liste", visibility="PUBLIC")
    lock_note(client, admin, note["id"])

    res = client.patch(f"/api/notes/{note['id']}", json={"body": "conflit"}, headers=auth(tom))
    assert res.status_code == 409
    detail = res.json()["detail"]
    assert detail["code"] == "note_locked"
    assert detail["locked_by"]["display_name"] == "Marie"


def test_public_patch_with_a_stale_own_lock_is_409(client, session) -> None:
    # FR-L2 wants a *fresh* lock: past the TTL the editor must re-acquire
    # (its heartbeat does) before the save may land.
    admin = bootstrap_admin(client)
    note = create_note(client, admin, title="Note", visibility="PUBLIC")
    lock_note(client, admin, note["id"])
    expire_lock(session, note["id"])

    res = client.patch(f"/api/notes/{note['id']}", json={"body": "tard"}, headers=auth(admin))
    assert res.status_code == 409
    assert res.json()["detail"]["code"] == "lock_required"


def test_public_patch_with_the_lock_is_200(client, session) -> None:
    admin = bootstrap_admin(client)
    tom = member(client, session, TOM)
    note = create_note(client, admin, title="Liste", visibility="PUBLIC")
    lock_note(client, tom, note["id"])

    res = client.patch(f"/api/notes/{note['id']}", json={"body": "- [ ] OK"}, headers=auth(tom))
    assert res.status_code == 200
    assert res.json()["body"] == "- [ ] OK"


def test_private_note_edits_lock_free(client, session) -> None:
    # A private note is single-owner (no contention): no lock required (E5 key decision).
    admin = bootstrap_admin(client)
    note = create_note(client, admin, title="Perso", visibility="PRIVATE")

    res = client.patch(
        f"/api/notes/{note['id']}", json={"body": "sans verrou"}, headers=auth(admin)
    )
    assert res.status_code == 200


# --- lock state in the note payload (E5-S3, the short-poll source) ---


def test_get_note_reports_live_holder_and_expiry(client, session) -> None:
    admin = bootstrap_admin(client)
    tom = member(client, session, TOM)
    note = create_note(client, admin, title="Note", visibility="PUBLIC")
    assert client.get(f"/api/notes/{note['id']}", headers=auth(tom)).json()["locked_by"] is None

    lock_note(client, admin, note["id"])
    seen = client.get(f"/api/notes/{note['id']}", headers=auth(tom)).json()
    assert seen["locked_by"] == {
        "id": client.get("/api/auth/me", headers=auth(admin)).json()["id"],
        "display_name": "Marie",
    }
    assert seen["lock_expires_at"] is not None


def test_a_stale_lock_is_distinguishable_in_the_payload(client, session) -> None:
    # The expiry is reported as-is: an expiry in the past is what lets a reader
    # offer the takeover (« Modifier la note »).
    admin = bootstrap_admin(client)
    tom = member(client, session, TOM)
    note = create_note(client, admin, title="Note", visibility="PUBLIC")
    lock_note(client, admin, note["id"])
    expire_lock(session, note["id"])

    seen = client.get(f"/api/notes/{note['id']}", headers=auth(tom)).json()
    assert seen["locked_by"]["display_name"] == "Marie"
    assert seen["lock_expires_at"] < _utcnow().isoformat()
