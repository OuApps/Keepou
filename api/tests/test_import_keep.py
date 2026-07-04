"""
Google Keep import (E10): the pure Takeout mapper (S1) and the preview/confirm
endpoints (S2) — stable index, preview writes nothing, only the selected notes
are created (private, Keep dates preserved, one creation version each),
trashed/out-of-range ignored, duplicates and malformed notes handled.
"""

import json
import zipfile
from collections.abc import Mapping
from datetime import datetime
from io import BytesIO

from sqlmodel import select

from app.models import Note, NoteColor, NoteVersion, _utcnow
from app.routers import import_keep
from app.services.keep_import import keep_note_to_fields, parse_keep_note, usec_to_datetime
from tests.test_auth import bootstrap_admin
from tests.test_notes import LEA, auth, member

# 2020-09-13 12:26:40 UTC, in Takeout's µs-since-epoch convention.
CREATED_USEC = 1_600_000_000_000_000
EDITED_USEC = 1_600_000_500_000_000
CREATED_DT = datetime(2020, 9, 13, 12, 26, 40)
EDITED_DT = datetime(2020, 9, 13, 12, 35, 0)

MIXED_NOTE = {
    "title": "Courses",
    "textContent": "Pour le week-end",
    "listContent": [
        {"text": "Café", "isChecked": False},
        {"text": "Pain", "isChecked": True},
    ],
    "color": "TEAL",
    "isTrashed": False,
    "createdTimestampUsec": CREATED_USEC,
    "userEditedTimestampUsec": EDITED_USEC,
}


# --- S1 — the pure mapper ---


def test_text_only_note_maps_to_a_plain_paragraph() -> None:
    note = keep_note_to_fields({"title": "Idée", "textContent": "Un banc sous le tilleul"})
    assert note is not None
    assert note.title == "Idée"
    assert note.body == "Un banc sous le tilleul"


def test_checklist_only_note_maps_to_gfm_task_lines() -> None:
    note = keep_note_to_fields(
        {"listContent": [{"text": "Café", "isChecked": False}, {"text": "Pain", "isChecked": True}]}
    )
    assert note is not None
    assert note.body == "- [ ] Café\n- [x] Pain"


def test_mixed_note_puts_the_paragraph_first_then_a_blank_line() -> None:
    note = keep_note_to_fields(MIXED_NOTE)
    assert note is not None
    assert note.body == "Pour le week-end\n\n- [ ] Café\n- [x] Pain"


def test_multi_paragraph_text_keeps_single_blank_line_separators() -> None:
    note = keep_note_to_fields({"textContent": "Premier\n\n\n\nSecond\r\nsuite"})
    assert note is not None
    # Collapsed to one blank line — exactly what the editor's serialize() emits,
    # so the body round-trips unchanged (parse ⇄ serialize stable).
    assert note.body == "Premier\n\nSecond\nsuite"


def test_every_keep_color_maps_to_one_of_the_five_shades() -> None:
    expected = {
        "DEFAULT": NoteColor.GOLD,
        "YELLOW": NoteColor.GOLD,
        "GREEN": NoteColor.AVOCAT,
        "RED": NoteColor.SALSA,
        "PINK": NoteColor.SALSA,
        "PURPLE": NoteColor.SALSA,
        "ORANGE": NoteColor.CLAY,
        "BROWN": NoteColor.CLAY,
        "TEAL": NoteColor.TEAL,
        "BLUE": NoteColor.TEAL,
        "CERULEAN": NoteColor.TEAL,
        "GRAY": NoteColor.TEAL,
    }
    for keep_color, keepou_color in expected.items():
        note = keep_note_to_fields({"color": keep_color})
        assert note is not None and note.color == keepou_color, keep_color


def test_unknown_or_missing_color_falls_back_to_gold() -> None:
    for raw in ({"color": "CHARTREUSE"}, {"color": 7}, {}):
        note = keep_note_to_fields(raw)
        assert note is not None and note.color == NoteColor.GOLD


def test_trashed_note_yields_none_but_stays_previewable() -> None:
    trashed = {**MIXED_NOTE, "isTrashed": True}
    assert keep_note_to_fields(trashed) is None
    parsed = parse_keep_note(trashed)
    assert parsed.is_trashed is True
    assert parsed.title == "Courses"  # the preview still shows its content


def test_keep_timestamps_are_preserved() -> None:
    note = keep_note_to_fields(MIXED_NOTE)
    assert note is not None
    assert note.created_at == CREATED_DT
    assert note.updated_at == EDITED_DT


def test_missing_edited_timestamp_falls_back_to_created() -> None:
    note = keep_note_to_fields({"createdTimestampUsec": CREATED_USEC})
    assert note is not None
    assert note.created_at == CREATED_DT
    assert note.updated_at == CREATED_DT


def test_invalid_timestamps_fall_back_without_raising() -> None:
    before = _utcnow()
    for bad in (None, -5, 0, "hier", True, 10**25):
        assert usec_to_datetime(bad) >= before, bad


def test_malformed_fields_never_raise() -> None:
    note = keep_note_to_fields(
        {
            "title": 42,
            "textContent": ["pas", "une", "chaîne"],
            "listContent": [None, "brut", {"text": 3, "isChecked": "oui"}, {}],
            "color": None,
            "createdTimestampUsec": "bientôt",
            "extraKey": {"nested": True},
        }
    )
    assert note is not None
    assert note.title == ""
    assert note.body == "- [ ] \n- [ ] "  # tolerated items keep their slot, unchecked


def test_title_is_truncated_to_the_note_bound() -> None:
    note = keep_note_to_fields({"title": "x" * 500})
    assert note is not None
    assert len(note.title) == 200


# --- S2 — endpoints ---


def make_zip(files: Mapping[str, object]) -> bytes:
    """Build an in-memory Takeout-shaped archive; str values land verbatim
    (to plant invalid JSON), anything else is JSON-encoded."""
    buffer = BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        for name, content in files.items():
            data = content if isinstance(content, str) else json.dumps(content)
            archive.writestr(name, data)
    return buffer.getvalue()


def upload(client, tokens, data: bytes, selected: list[int] | None = None, confirm: bool = False):
    url = "/api/import/keep" if confirm else "/api/import/keep/preview"
    form = {"selected": [str(i) for i in selected]} if selected is not None else None
    return client.post(
        url,
        files={"file": ("takeout.zip", data, "application/zip")},
        data=form,
        headers=auth(tokens),
    )


TAKEOUT = {
    "Takeout/Keep/b-liste.json": MIXED_NOTE,
    "Takeout/Keep/a-texte.json": {
        "title": "Idée",
        "textContent": "Un banc sous le tilleul",
        "color": "GREEN",
        "createdTimestampUsec": CREATED_USEC,
    },
    "Takeout/Keep/c-corbeille.json": {"title": "Vieux brouillon", "isTrashed": True},
}


def test_preview_returns_a_stable_sorted_index_and_writes_nothing(client, session) -> None:
    admin = bootstrap_admin(client)
    res = upload(client, admin, make_zip(TAKEOUT))
    assert res.status_code == 200
    body = res.json()
    # Sorted by path: a-texte → 0, b-liste → 1, c-corbeille → 2.
    assert [(i["index"], i["title"]) for i in body["items"]] == [
        (0, "Idée"),
        (1, "Courses"),
        (2, "Vieux brouillon"),
    ]
    assert body["items"][2]["is_trashed"] is True
    assert body["counts"] == {"total": 3, "trashed": 1, "parse_failed": 0}
    assert session.exec(select(Note)).all() == []  # preview never creates


def test_preview_reports_an_unreadable_note_without_failing(client) -> None:
    admin = bootstrap_admin(client)
    res = upload(client, admin, make_zip({**TAKEOUT, "Takeout/Keep/aa-cassé.json": "{pas du json"}))
    assert res.status_code == 200
    body = res.json()
    assert body["counts"]["parse_failed"] == 1
    # The broken file consumes index 1 (sorted between a-texte and b-liste)…
    assert body["failed"] == [{"index": 1, "reason": import_keep.REASON_UNREADABLE}]
    # …and the notes around it keep a stable index.
    assert [(i["index"], i["title"]) for i in body["items"]] == [
        (0, "Idée"),
        (2, "Courses"),
        (3, "Vieux brouillon"),
    ]


def test_preview_rejects_a_non_zip_payload(client) -> None:
    admin = bootstrap_admin(client)
    res = upload(client, admin, b"ceci n'est pas un zip")
    assert res.status_code == 400
    assert res.json()["detail"] == import_keep.DETAIL_NOT_A_ZIP


def test_preview_rejects_an_archive_without_keep_notes(client) -> None:
    admin = bootstrap_admin(client)
    res = upload(client, admin, make_zip({"Takeout/YouTube/watch-history.html": "<html></html>"}))
    assert res.status_code == 400
    assert res.json()["detail"] == import_keep.DETAIL_NO_NOTES


def test_upload_size_limit_is_enforced(client, monkeypatch) -> None:
    admin = bootstrap_admin(client)
    monkeypatch.setattr(import_keep, "MAX_UPLOAD_BYTES", 100)
    res = upload(client, admin, make_zip(TAKEOUT))
    assert res.status_code == 413
    assert res.json()["detail"] == import_keep.DETAIL_TOO_LARGE


def test_import_requires_authentication(client) -> None:
    res = client.post(
        "/api/import/keep/preview",
        files={"file": ("takeout.zip", make_zip(TAKEOUT), "application/zip")},
    )
    assert res.status_code == 401


def test_import_creates_only_the_selected_notes_with_keep_dates(client, session) -> None:
    admin = bootstrap_admin(client)
    res = upload(client, admin, make_zip(TAKEOUT), selected=[0], confirm=True)
    assert res.status_code == 200
    assert res.json() == {"imported": 1, "skipped_duplicate": 0, "failed": []}

    notes = session.exec(select(Note)).all()
    assert len(notes) == 1
    note = notes[0]
    assert note.title == "Idée"
    assert note.body == "Un banc sous le tilleul"
    assert note.color == NoteColor.AVOCAT
    assert note.visibility == "PRIVATE"  # forced private (FR-I3)
    assert note.created_at == CREATED_DT  # Keep dates preserved (FR-I4)
    assert note.updated_at == CREATED_DT

    # Exactly one « Créée par X » history root, stamped at the Keep date.
    versions = session.exec(select(NoteVersion)).all()
    assert len(versions) == 1
    assert versions[0].note_id == note.id
    assert versions[0].author_id == note.owner_id
    assert versions[0].created_at == CREATED_DT


def test_import_ignores_trashed_and_out_of_range_indices(client, session) -> None:
    admin = bootstrap_admin(client)
    res = upload(client, admin, make_zip(TAKEOUT), selected=[1, 2, 99], confirm=True)
    assert res.status_code == 200
    assert res.json() == {"imported": 1, "skipped_duplicate": 0, "failed": []}
    notes = session.exec(select(Note)).all()
    assert [n.title for n in notes] == ["Courses"]  # index 2 (trashed) + 99 dropped


def test_import_with_an_empty_selection_creates_nothing(client, session) -> None:
    admin = bootstrap_admin(client)
    res = upload(client, admin, make_zip(TAKEOUT), selected=[], confirm=True)
    assert res.status_code == 200
    assert res.json()["imported"] == 0
    assert session.exec(select(Note)).all() == []


def test_reimporting_the_same_archive_skips_duplicates(client, session) -> None:
    admin = bootstrap_admin(client)
    first = upload(client, admin, make_zip(TAKEOUT), selected=[0, 1], confirm=True)
    assert first.json()["imported"] == 2
    again = upload(client, admin, make_zip(TAKEOUT), selected=[0, 1], confirm=True)
    assert again.json() == {"imported": 0, "skipped_duplicate": 2, "failed": []}
    assert len(session.exec(select(Note)).all()) == 2


def test_duplicates_inside_one_archive_are_created_once(client, session) -> None:
    admin = bootstrap_admin(client)
    twice = {
        "Takeout/Keep/a.json": TAKEOUT["Takeout/Keep/a-texte.json"],
        "Takeout/Keep/b.json": TAKEOUT["Takeout/Keep/a-texte.json"],
    }
    res = upload(client, admin, make_zip(twice), selected=[0, 1], confirm=True)
    assert res.json() == {"imported": 1, "skipped_duplicate": 1, "failed": []}
    assert len(session.exec(select(Note)).all()) == 1


def test_a_selected_malformed_note_is_reported_and_the_rest_imported(client, session) -> None:
    admin = bootstrap_admin(client)
    archive = make_zip({**TAKEOUT, "Takeout/Keep/aa-cassé.json": "{pas du json"})
    # aa-cassé takes index 1: select it plus the two importable notes.
    res = upload(client, admin, archive, selected=[0, 1, 2], confirm=True)
    assert res.status_code == 200
    body = res.json()
    assert body["imported"] == 2
    assert body["failed"] == [{"index": 1, "reason": import_keep.REASON_UNREADABLE}]
    assert {n.title for n in session.exec(select(Note)).all()} == {"Idée", "Courses"}


def test_imported_notes_belong_to_the_caller_only(client, session) -> None:
    bootstrap_admin(client)
    lea = member(client, session, LEA)
    res = upload(client, lea, make_zip(TAKEOUT), selected=[0], confirm=True)
    assert res.json()["imported"] == 1
    note = session.exec(select(Note)).one()
    lea_id = client.get("/api/auth/me", headers=auth(lea)).json()["id"]
    assert note.owner_id == lea_id


def test_notes_fall_back_to_every_json_when_no_keep_folder(client) -> None:
    admin = bootstrap_admin(client)
    res = upload(client, admin, make_zip({"notes/a.json": MIXED_NOTE}))
    assert res.status_code == 200
    assert res.json()["counts"]["total"] == 1
