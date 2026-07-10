"""
Google Keep import — pure Takeout-JSON → Keepou-fields mapping (E10-S1).

A Google Takeout export ships one JSON file per Keep note. This module turns
one such object into the fields a Keepou `Note` needs — no DB, no HTTP — so
the import endpoints (E10-S2) stay thin and the mapping is trivially testable.

Mapping rules (docs/internal/stories/E10-import-keep.md):
- `textContent` + `listContent[]` → a single GFM Markdown body, serialized
  exactly like `web/src/lib/markdown.ts` so imported notes round-trip through
  the editor identically to natively-created ones;
- Keep's ~12 colors collapse onto the 5 Keepou shades (unknown → GOLD);
- µs timestamps are preserved (`created_at` / `updated_at`) so the board's
  chronology and the « Créée par X » history root keep the real Keep dates;
- `isTrashed` notes map with `is_trashed=True` (the preview shows them
  pre-unchecked; the import never creates them);
- images, labels, pinned/archived flags are dropped (MVP).

Tolerance: a malformed value inside a note (wrong type, missing key, absurd
timestamp) degrades to a sensible default — only a payload that is not a JSON
object at all raises (the endpoint reports it as a failed file, never fatal).
"""

from dataclasses import dataclass
from datetime import UTC, datetime

from app.models import NoteColor, _utcnow

# Keep's palette (Takeout `color` values) → the 5 Keepou shades (HANDOFF §1).
# `DEFAULT` is Keep's white. Unknown/missing values fall back to GOLD.
COLOR_MAP: dict[str, NoteColor] = {
    "DEFAULT": NoteColor.GOLD,
    "WHITE": NoteColor.GOLD,
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
    "DARKBLUE": NoteColor.TEAL,
    "GRAY": NoteColor.TEAL,
}

# Mirrors NoteIn's title bound (schemas.py) — Keep titles can be arbitrarily long.
MAX_TITLE_LENGTH = 200


@dataclass(frozen=True)
class ImportedNote:
    """One parsed Keep note, ready to become a Keepou `Note`."""

    title: str
    body: str  # GFM Markdown, same serialization as the editor
    color: NoteColor
    created_at: datetime
    updated_at: datetime
    is_trashed: bool


def usec_to_datetime(usec: object, default: datetime | None = None) -> datetime:
    """µs since epoch → naive UTC datetime (the model's convention).

    Missing / non-numeric / non-positive / absurd values fall back to
    `default` (or "now"), so one odd timestamp never sinks a note.
    """
    fallback = default if default is not None else _utcnow()
    if isinstance(usec, bool) or not isinstance(usec, int | float) or usec <= 0:
        return fallback
    try:
        return datetime.fromtimestamp(usec / 1_000_000, tz=UTC).replace(tzinfo=None)
    except (OverflowError, OSError, ValueError):
        return fallback


# --- GFM body (Python mirror of web/src/lib/markdown.ts) ---------------------

_Block = tuple[str, bool, str]  # (kind "text"|"check", checked, text)


def _serialize_blocks(blocks: list[_Block]) -> str:
    """`serialize()` from web/src/lib/markdown.ts, line for line: paragraphs as
    plain text, checkboxes as GFM task-list lines, a blank line between a
    paragraph and its neighbours, never more than one consecutive blank line."""
    lines: list[str] = []
    prev_check = False
    for i, (kind, checked, text) in enumerate(blocks):
        if kind == "check":
            if i > 0 and not prev_check:
                lines.append("")
            lines.append(("- [x] " if checked else "- [ ] ") + text)
            prev_check = True
        else:
            if i > 0:
                lines.append("")
            lines.append(text)
            prev_check = False
    out = "\n".join(lines)
    while "\n\n\n" in out:
        out = out.replace("\n\n\n", "\n\n")
    return out.strip("\n")


def _text_blocks(text_content: str) -> list[_Block]:
    """Split Keep's free text into paragraph blocks (blank lines separate
    paragraphs — the exact split `parse()` applies in web/src/lib/markdown.ts),
    so serialization is stable through the editor's parse ⇄ serialize."""
    blocks: list[_Block] = []
    paragraph: list[str] = []
    for line in text_content.split("\n"):
        if line.strip() == "":
            if paragraph:
                blocks.append(("text", False, "\n".join(paragraph)))
                paragraph = []
        else:
            paragraph.append(line)
    if paragraph:
        blocks.append(("text", False, "\n".join(paragraph)))
    return blocks


def _build_body(raw: dict) -> str:
    """`textContent` paragraph(s) first, then each `listContent` item as a
    GFM task-list line — the shape `buildMd` / the editor produce."""
    text_content = raw.get("textContent")
    if isinstance(text_content, str):
        # Normalize CRLF so the front's line-based parse sees what we stored.
        blocks = _text_blocks(text_content.replace("\r\n", "\n").replace("\r", "\n"))
    else:
        blocks = []
    list_content = raw.get("listContent")
    if isinstance(list_content, list):
        for item in list_content:
            if not isinstance(item, dict):
                continue
            text = item.get("text")
            checked = item.get("isChecked")
            blocks.append(("check", checked is True, text if isinstance(text, str) else ""))
    return _serialize_blocks(blocks)


# --- Public mapping -----------------------------------------------------------


def parse_keep_note(raw: dict) -> ImportedNote:
    """Map one Takeout JSON object (trashed or not) — the preview needs the
    content of trashed notes too, to show them pre-unchecked (« Corbeille »)."""
    if not isinstance(raw, dict):
        raise ValueError("Keep note payload is not a JSON object")
    title = raw.get("title")
    color = raw.get("color")
    created_at = usec_to_datetime(raw.get("createdTimestampUsec"))
    return ImportedNote(
        title=(title if isinstance(title, str) else "")[:MAX_TITLE_LENGTH],
        body=_build_body(raw),
        color=COLOR_MAP.get(color.upper() if isinstance(color, str) else "", NoteColor.GOLD),
        created_at=created_at,
        # A note edited never (or oddly) keeps its creation date as updated_at,
        # so the board's « modifié le » stays truthful.
        updated_at=usec_to_datetime(raw.get("userEditedTimestampUsec"), default=created_at),
        is_trashed=raw.get("isTrashed") is True,
    )


def keep_note_to_fields(raw: dict) -> ImportedNote | None:
    """The S1 contract: `None` for a trashed note, the mapped fields otherwise."""
    note = parse_keep_note(raw)
    return None if note.is_trashed else note
