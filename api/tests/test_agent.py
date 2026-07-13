"""
Agent-facing note operations (E13, app/services/agent.py) — the MCP tools'
business logic, tested transport-free. The agent acts as **Botou**, a public-only
identity: notes it creates are PUBLIC (« Créée par Botou »), it never sees a
member's private note, public edits borrow the single-editor lock, and organize
/ delete stay owner-scoped.
"""

import pytest
from sqlmodel import select

from app.models import Note, NoteVersion, Role, User, UserStatus, Visibility
from app.services import agent, locks
from app.services.bot import ensure_bot


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


def make_note(session, owner, title="", body="", visibility=Visibility.PUBLIC, archived=False):
    """A note created directly (not via the agent) — used to set up members'
    notes, including PRIVATE ones the agent must never see."""
    note = Note(
        title=title, body=body, owner_id=owner.id, visibility=visibility, archived=archived
    )
    session.add(note)
    session.commit()
    session.refresh(note)
    return note


def versions_of(session, note_id) -> list[NoteVersion]:
    return list(session.exec(select(NoteVersion).where(NoteVersion.note_id == note_id)).all())


# --- create ---


def test_create_note_is_public_and_authored_by_botou(session) -> None:
    bot = ensure_bot(session)
    note = agent.create_note(session, bot, title="Courses", body="- [ ] Pain")
    assert note["title"] == "Courses"
    assert note["visibility"] == "PUBLIC"  # the agent is public-only
    assert note["author"] == "Botou"
    (version,) = versions_of(session, note["id"])
    assert version.author_id == bot.id  # « Créée par Botou »


# --- list / search ---


def test_list_mine_is_botou_notes_excluding_archived(session) -> None:
    bot = ensure_bot(session)
    tom = make_user(session, "Tom")
    agent.create_note(session, bot, title="A")
    archived = agent.create_note(session, bot, title="Old")
    agent.set_flags(session, bot, archived["id"], archived=True)
    make_note(session, tom, title="Tom's public")

    titles = [n["title"] for n in agent.list_notes(session, bot, tab="mine")]
    assert titles == ["A"]  # Tom's note and the archived one are excluded
    assert [n["title"] for n in agent.list_notes(session, bot, tab="mine", archived=True)] == [
        "Old"
    ]


def test_list_public_spans_all_members(session) -> None:
    bot = ensure_bot(session)
    tom = make_user(session, "Tom")
    make_note(session, tom, title="Fête", visibility=Visibility.PUBLIC)
    make_note(session, tom, title="Privée", visibility=Visibility.PRIVATE)
    agent.create_note(session, bot, title="Botou dit bonjour")
    titles = {n["title"] for n in agent.list_notes(session, bot, tab="public")}
    assert titles == {"Fête", "Botou dit bonjour"}  # Tom's private note is excluded


def test_search_matches_title_and_body_case_insensitively(session) -> None:
    bot = ensure_bot(session)
    agent.create_note(session, bot, title="Recette", body="tomates et basilic")
    agent.create_note(session, bot, title="Bricolage", body="perceuse")
    assert [n["title"] for n in agent.search_notes(session, bot, "TOMATES")] == ["Recette"]
    assert [n["title"] for n in agent.search_notes(session, bot, "brico")] == ["Bricolage"]


# --- visibility gating ---


def test_get_a_members_private_note_is_not_found(session) -> None:
    bot = ensure_bot(session)
    tom = make_user(session, "Tom")
    secret = make_note(session, tom, title="Secret", visibility=Visibility.PRIVATE)
    with pytest.raises(agent.NoteNotFound):
        agent.get_note(session, bot, secret.id)


# --- update: versioning + lock ---


def test_update_records_a_version(session) -> None:
    bot = ensure_bot(session)
    note = agent.create_note(session, bot, title="Liste")
    agent.update_note(session, bot, note["id"], body="- [x] Fait")
    # Creation root + the edit = 2 versions.
    assert len(versions_of(session, note["id"])) == 2


def test_update_borrows_and_releases_the_lock(session) -> None:
    bot = ensure_bot(session)
    note = agent.create_note(session, bot, title="Repas")
    agent.update_note(session, bot, note["id"], title="Repas de quartier")
    fresh = session.get(Note, note["id"])
    assert fresh.title == "Repas de quartier"
    assert fresh.locked_by_id is None  # the borrowed lock was released


def test_update_a_note_a_member_holds_raises(session) -> None:
    bot = ensure_bot(session)
    tom = make_user(session, "Tom")
    note = agent.create_note(session, bot, title="Repas")
    locks.acquire(session, note["id"], tom.id)  # Tom is editing it live
    with pytest.raises(agent.NoteLocked):
        agent.update_note(session, bot, note["id"], title="X")


def test_update_can_edit_a_members_public_note(session) -> None:
    bot = ensure_bot(session)
    tom = make_user(session, "Tom")
    note = make_note(session, tom, title="Repas", visibility=Visibility.PUBLIC)
    updated = agent.update_note(session, bot, note.id, body="- [ ] Apporter du pain")
    assert updated["body"] == "- [ ] Apporter du pain"


def test_update_rejects_bad_color(session) -> None:
    bot = ensure_bot(session)
    note = agent.create_note(session, bot, title="X")
    with pytest.raises(ValueError):
        agent.update_note(session, bot, note["id"], color="MAUVE")


# --- organize / delete permissions ---


def test_set_flags_is_owner_only(session) -> None:
    bot = ensure_bot(session)
    tom = make_user(session, "Tom")
    note = make_note(session, tom, title="Repas", visibility=Visibility.PUBLIC)
    with pytest.raises(agent.PermissionDenied):
        agent.set_flags(session, bot, note.id, pinned=True)  # Botou can't pin a member's note


def test_delete_own_note_removes_note_and_history(session) -> None:
    bot = ensure_bot(session)
    note = agent.create_note(session, bot, title="X")
    agent.delete_note(session, bot, note["id"])
    assert session.get(Note, note["id"]) is None
    assert versions_of(session, note["id"]) == []


def test_botou_cannot_delete_a_members_public_note(session) -> None:
    bot = ensure_bot(session)
    tom = make_user(session, "Tom")
    note = make_note(session, tom, title="Repas", visibility=Visibility.PUBLIC)
    with pytest.raises(agent.PermissionDenied):
        agent.delete_note(session, bot, note.id)  # not the author, not an admin
    assert session.get(Note, note.id) is not None
