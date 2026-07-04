"""
Import from Google Keep (E10-S2) — the two-step preview/confirm flow.

  POST /api/import/keep/preview   Takeout ZIP → parsed notes with a stable
                                  index, **no DB writes** — feeds the front's
                                  review/selection view (« mode tunnel »).
  POST /api/import/keep           same ZIP + `selected` indices → create only
                                  the checked notes (forced PRIVATE, caller as
                                  owner, Keep dates preserved, one « Créée par
                                  X » version each) in **one transaction**.

The index is the contract between the two calls: JSON files are iterated in a
deterministic (sorted-by-path) order, and a file keeps its index whether it
parses or not. Re-sending the ZIP on confirm avoids trusting client-echoed
content and avoids a server-side staging table (the export is small text —
attachments are ignored, never extracted).

Guardrails: bearer auth (like every route), a max upload size on the archive
and on each JSON member (zip-bomb), non-ZIP payloads rejected, a selected
index that is trashed or out of range is ignored rather than an error, and a
content-match dedup (`owner + title + body`) absorbs double-clicks/re-imports.
"""

import json
import posixpath
import zipfile
from dataclasses import dataclass
from io import BytesIO
from typing import Annotated

from fastapi import APIRouter, Form, HTTPException, UploadFile, status
from sqlmodel import select

from app.db import SessionDep
from app.models import Note, Visibility
from app.schemas import (
    ImportCounts,
    ImportFailure,
    ImportPreviewItem,
    ImportPreviewOut,
    ImportSummaryOut,
)
from app.security import CurrentUser
from app.services import versions
from app.services.keep_import import ImportedNote, parse_keep_note

router = APIRouter(prefix="/api/import", tags=["import"])

# A Takeout Keep export is small text (attachments are ignored); 20 MB of ZIP
# holds thousands of notes. The per-member cap defuses zip bombs.
MAX_UPLOAD_BYTES = 20 * 1024 * 1024
MAX_MEMBER_BYTES = 1 * 1024 * 1024

DETAIL_NOT_A_ZIP = "Le fichier n'est pas une archive ZIP valide."
DETAIL_TOO_LARGE = "Archive trop volumineuse (20 Mo maximum)."
DETAIL_NO_NOTES = "Aucune note Google Keep trouvée dans l'archive."
REASON_UNREADABLE = "Note illisible (JSON invalide)."
REASON_MEMBER_TOO_LARGE = "Fichier trop volumineux pour une note."


@dataclass
class _Entry:
    """One JSON file of the archive — it owns its index even when unparseable."""

    index: int
    note: ImportedNote | None
    error: str | None


def _keep_json_names(archive: zipfile.ZipFile) -> list[str]:
    """The note files, in the deterministic order that defines the index.

    Takeout puts them under `Takeout/Keep/*.json`; we accept any `Keep/`
    folder, and fall back to every JSON in the archive when none exists (a
    user who re-zipped the folder's contents). macOS resource-fork junk is
    skipped.
    """
    names = [
        name
        for name in archive.namelist()
        if name.lower().endswith(".json")
        and not name.startswith("__MACOSX/")
        and not posixpath.basename(name).startswith("._")
    ]
    under_keep = [name for name in names if "Keep" in name.split("/")[:-1]]
    return sorted(under_keep or names)


async def _load_entries(file: UploadFile) -> list[_Entry]:
    """Read + unzip + parse — shared by both endpoints so the index matches."""
    data = await file.read(MAX_UPLOAD_BYTES + 1)
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail=DETAIL_TOO_LARGE
        )
    try:
        archive = zipfile.ZipFile(BytesIO(data))
    except zipfile.BadZipFile:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=DETAIL_NOT_A_ZIP
        ) from None
    names = _keep_json_names(archive)
    if not names:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=DETAIL_NO_NOTES)
    entries: list[_Entry] = []
    for index, name in enumerate(names):
        try:
            with archive.open(name) as member:
                raw_bytes = member.read(MAX_MEMBER_BYTES + 1)
            if len(raw_bytes) > MAX_MEMBER_BYTES:
                entries.append(_Entry(index, None, REASON_MEMBER_TOO_LARGE))
                continue
            entries.append(_Entry(index, parse_keep_note(json.loads(raw_bytes)), None))
        except (json.JSONDecodeError, UnicodeDecodeError, ValueError, zipfile.BadZipFile):
            # One broken note is reported, never fatal (FR-I2).
            entries.append(_Entry(index, None, REASON_UNREADABLE))
    return entries


@router.post("/keep/preview", response_model=ImportPreviewOut)
async def preview_keep_import(file: UploadFile, user: CurrentUser) -> ImportPreviewOut:
    """Parse the archive and return the review-view payload — writes nothing."""
    entries = await _load_entries(file)
    items = [
        ImportPreviewItem(
            index=entry.index,
            title=entry.note.title,
            body=entry.note.body,
            color=entry.note.color,
            created_at=entry.note.created_at,
            updated_at=entry.note.updated_at,
            is_trashed=entry.note.is_trashed,
        )
        for entry in entries
        if entry.note is not None
    ]
    return ImportPreviewOut(
        items=items,
        counts=ImportCounts(
            total=len(entries),
            trashed=sum(1 for item in items if item.is_trashed),
            parse_failed=sum(1 for entry in entries if entry.error is not None),
        ),
        failed=[
            ImportFailure(index=entry.index, reason=entry.error)
            for entry in entries
            if entry.error is not None
        ],
    )


@router.post("/keep", response_model=ImportSummaryOut)
async def import_keep_notes(
    file: UploadFile,
    user: CurrentUser,
    session: SessionDep,
    selected: Annotated[list[int], Form()] = [],  # noqa: B006 — FastAPI Form default
) -> ImportSummaryOut:
    """Create the selected notes — and only them — in one transaction."""
    entries = await _load_entries(file)
    selected_set = set(selected)
    imported = 0
    skipped_duplicate = 0
    failed: list[ImportFailure] = []
    # Content-match dedup within the batch too, so an archive holding the same
    # note twice (or a double-submitted selection) creates it once.
    batch_contents: set[tuple[str, str]] = set()
    for entry in entries:
        if entry.index not in selected_set:
            continue
        if entry.error is not None:
            failed.append(ImportFailure(index=entry.index, reason=entry.error))
            continue
        assert entry.note is not None
        if entry.note.is_trashed:
            # Trashed stays out even if the client checked it (server decides).
            continue
        content = (entry.note.title, entry.note.body)
        already_imported = session.exec(
            select(Note.id).where(
                Note.owner_id == user.id,
                Note.title == entry.note.title,
                Note.body == entry.note.body,
            )
        ).first()
        if content in batch_contents or already_imported is not None:
            skipped_duplicate += 1
            continue
        batch_contents.add(content)
        note = Note(
            title=entry.note.title,
            body=entry.note.body,
            color=entry.note.color,
            visibility=Visibility.PRIVATE,  # imported notes are always private (FR-I3)
            owner_id=user.id,
            created_at=entry.note.created_at,
            updated_at=entry.note.updated_at,
        )
        session.add(note)
        # The « Créée par X » history root, at the Keep date (FR-I4).
        session.add(versions.creation_snapshot(note))
        imported += 1
    # Out-of-range selected indices simply matched no entry: ignored, no error.
    session.commit()
    return ImportSummaryOut(imported=imported, skipped_duplicate=skipped_duplicate, failed=failed)
