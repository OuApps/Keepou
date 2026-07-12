"""
Agent-facing note operations (E13, app/services/agent.py) — the MCP tools'
business logic, tested transport-free: CRUD, visibility gating, the public-note
lock borrow, owner-only metadata/visibility, and version recording.
"""

import pytest
from sqlmodel import select

from app.models import Note, NoteVersion, Role, User, UserStatus
from app.services import agent, locks


def make_user(session, name="Marie", role=Role.MEMBER) -> User:
    user = User(
        email=f"{name.lower()}@famille-ou.fr",
        display_name=name,
        password_hash="x",
        role=role,
        status=UserStatus.ACTIVE,
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


def versions_of(session, note_id) -> list[NoteVersion]:
    return list(session.exec(select(NoteVersion).where(NoteVersion.note_id == note_id)).all())


# --- create ---


def test_create_note_writes_creation_version(session) -> None:
    marie = make_user(session)
    note = agent.create_note(session, marie, title="Courses", body="- [ ] Pain")
    assert note["title"] == "Courses"
    assert note["visibility"] == "PRIVATE"
    assert note["author"] == "Marie"
    (version,) = versions_of(session, note["id"])
    assert version.author_id == marie.id  # « Créée par Marie »


# --- list / search ---


def test_list_mine_excludes_others_and_archived(session) -> None:
    marie, tom = make_user(session, "Marie"), make_user(session, "Tom")
    agent.create_note(session, marie, title="A")
    archived = agent.create_note(session, marie, title="Old")
    agent.set_flags(session, marie, archived["id"], archived=True)
    agent.create_note(session, tom, title="Tom's")

    titles = [n["title"] for n in agent.list_notes(session, marie, tab="mine")]
    assert titles == ["A"]  # Tom's note and the archived one are excluded
    assert [n["title"] for n in agent.list_notes(session, marie, tab="mine", archived=True)] == [
        "Old"
    ]


def test_list_public_spans_all_members(session) -> None:
    marie, tom = make_user(session, "Marie"), make_user(session, "Tom")
    agent.create_note(session, tom, title="Fête", visibility="PUBLIC")
    agent.create_note(session, marie, title="Privée")
    titles = [n["title"] for n in agent.list_notes(session, marie, tab="public")]
    assert titles == ["Fête"]


def test_search_matches_title_and_body_case_insensitively(session) -> None:
    marie = make_user(session)
    agent.create_note(session, marie, title="Recette", body="tomates et basilic")
    agent.create_note(session, marie, title="Bricolage", body="perceuse")
    assert [n["title"] for n in agent.search_notes(session, marie, "TOMATES")] == ["Recette"]
    assert [n["title"] for n in agent.search_notes(session, marie, "brico")] == ["Bricolage"]


# --- visibility gating ---


def test_get_others_private_note_is_not_found(session) -> None:
    marie, tom = make_user(session, "Marie"), make_user(session, "Tom")
    tom_note = agent.create_note(session, tom, title="Secret")
    with pytest.raises(agent.NoteNotFound):
        agent.get_note(session, marie, tom_note["id"])


# --- update: versioning + lock ---


def test_update_private_note_records_a_version(session) -> None:
    marie = make_user(session)
    note = agent.create_note(session, marie, title="Liste")
    agent.update_note(session, marie, note["id"], body="- [x] Fait")
    # Creation root + the edit = 2 versions.
    assert len(versions_of(session, note["id"])) == 2


def test_update_public_note_borrows_and_releases_the_lock(session) -> None:
    marie = make_user(session)
    note = agent.create_note(session, marie, title="Repas", visibility="PUBLIC")
    agent.update_note(session, marie, note["id"], title="Repas de quartier")
    fresh = session.get(Note, note["id"])
    assert fresh.title == "Repas de quartier"
    assert fresh.locked_by_id is None  # the borrowed lock was released


def test_update_public_note_held_by_another_raises(session) -> None:
    marie, tom = make_user(session, "Marie"), make_user(session, "Tom")
    note = agent.create_note(session, marie, title="Repas", visibility="PUBLIC")
    locks.acquire(session, note["id"], tom.id)  # Tom is editing live
    with pytest.raises(agent.NoteLocked):
        agent.update_note(session, marie, note["id"], title="X")


def test_update_visibility_is_owner_only(session) -> None:
    marie, tom = make_user(session, "Marie"), make_user(session, "Tom")
    note = agent.create_note(session, marie, title="Repas", visibility="PUBLIC")
    with pytest.raises(agent.PermissionDenied):
        agent.update_note(session, tom, note["id"], visibility="PRIVATE")


def test_update_rejects_bad_color(session) -> None:
    marie = make_user(session)
    note = agent.create_note(session, marie, title="X")
    with pytest.raises(ValueError):
        agent.update_note(session, marie, note["id"], color="MAUVE")


# --- organize / delete permissions ---


def test_set_flags_is_owner_only(session) -> None:
    marie, tom = make_user(session, "Marie"), make_user(session, "Tom")
    note = agent.create_note(session, marie, title="Repas", visibility="PUBLIC")
    with pytest.raises(agent.PermissionDenied):
        agent.set_flags(session, tom, note["id"], pinned=True)


def test_delete_by_owner_removes_note_and_history(session) -> None:
    marie = make_user(session)
    note = agent.create_note(session, marie, title="X")
    agent.delete_note(session, marie, note["id"])
    assert session.get(Note, note["id"]) is None
    assert versions_of(session, note["id"]) == []


def test_delete_others_public_note_forbidden_but_admin_can(session) -> None:
    marie = make_user(session, "Marie")
    tom = make_user(session, "Tom")
    admin = make_user(session, "Chef", role=Role.ADMIN)
    note = agent.create_note(session, marie, title="Repas", visibility="PUBLIC")
    with pytest.raises(agent.PermissionDenied):
        agent.delete_note(session, tom, note["id"])
    agent.delete_note(session, admin, note["id"])  # admin override (FR-N6)
    assert session.get(Note, note["id"]) is None
