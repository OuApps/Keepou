# E10 — Import from Google Keep — Detailed stories

> Epic goal: let a member **bring their existing Google Keep notes into Keepou**,
> so switching off Keep doesn't mean losing years of notes.
>
> Estimation convention: **S** (≤ ½ day), **M** (1–2 days), **L** (3+ days).
> All these stories are `to do` (nothing is built yet).

**Reference docs.** `docs/EPICS.md` (E10), `docs/ARCHITECTURE.md` §12 (import),
`docs/PRD.md` §5.8 (FR-I*). **Depends on** E3 (the `Note` model + creation
version) — imported notes are created through the same path as any other note.

**Key decisions carried in (validated with Guillaume):**
- **Source = Google Takeout**, the only realistic export path. The Keep REST API
  is **Workspace-only** (service account + domain-wide delegation) and unusable on
  personal Gmail accounts; the unofficial `gkeepapi` is fragile and ToS-grey. Each
  user runs their **own** Takeout and imports their **own** notes.
- **Parsing happens server-side.** The client uploads the Takeout archive; a
  FastAPI endpoint unzips it, maps each note, and bulk-creates in one transaction.
- **Images are ignored** for the MVP — Keepou has no image support (PRD non-goal
  "no rich media beyond text + checklists"). Only title + text + checklist items
  are imported.
- **Original creation dates are preserved** — `createdTimestampUsec` →
  `Note.created_at`, `userEditedTimestampUsec` → `Note.updated_at`. This keeps the
  board's chronology faithful and stamps the « Créée par X » history root with the
  real Keep date.
- **All imported notes are PRIVATE** — Keep has no public/shared concept that maps
  to Keepou's, and visibility is an owner-only decision (ARCHITECTURE §4.2). The
  owner can flip any of them public afterwards.

---

## The Takeout format (what we parse)

A Google Takeout export delivers a `Takeout/Keep/` folder with **one JSON file per
note** (plus an HTML mirror and any attachments, which we ignore). Each JSON looks
like:

```json
{
  "title": "Courses",
  "textContent": "Pour le week-end",
  "listContent": [
    { "text": "Café", "isChecked": false },
    { "text": "Pain", "isChecked": true }
  ],
  "color": "TEAL",
  "isTrashed": false,
  "isArchived": false,
  "isPinned": true,
  "labels": [{ "name": "Maison" }],
  "attachments": [{ "filePath": "…", "mimetype": "image/jpeg" }],
  "createdTimestampUsec": 1600000000000000,
  "userEditedTimestampUsec": 1600000500000000
}
```

**Field mapping → `Note`:**

| Keep JSON | Keepou | Rule |
|---|---|---|
| `title` | `title` | direct (may be empty) |
| `textContent` + `listContent[]` | `body` (GFM Markdown) | paragraph → text block; each `{text,isChecked}` → `- [ ]` / `- [x]` — same serialization as `web/src/lib/markdown.ts` |
| `color` (≈12 values) | `color` (5: `GOLD/AVOCAT/SALSA/CLAY/TEAL`) | fixed mapping table (below); unknown/`DEFAULT` → `GOLD` |
| — | `visibility` | always `PRIVATE` |
| — | `owner_id` | the authenticated caller |
| `createdTimestampUsec` | `created_at` | µs since epoch → UTC datetime |
| `userEditedTimestampUsec` | `updated_at` | µs since epoch → UTC datetime |
| `isTrashed: true` | — | **skipped** (not imported) |
| `isArchived`, `isPinned`, `labels`, `attachments`, `sharees` | — | **dropped** (MVP; archived can map once E8 ships) |

**Color mapping (default, tunable in design):**

| Keep | Keepou |
|---|---|
| `YELLOW`, `DEFAULT`/white | `GOLD` |
| `GREEN` | `AVOCAT` |
| `RED`, `PINK`, `PURPLE` | `SALSA` |
| `ORANGE`, `BROWN` | `CLAY` |
| `TEAL`, `BLUE`, `CERULEAN`/darkblue, `GRAY` | `TEAL` |

---

## Stories at a glance

- [ ] **E10-S1** — Takeout parser + field/color/timestamp mapping (pure, tested)
- [ ] **E10-S2** — `POST /api/import/keep` endpoint (ZIP upload → bulk create + versions → summary)
- [ ] **E10-S3** — Front: import entry point, upload screen, result summary (design-gated)
- [ ] **E10-S4** — Docs, edge cases & tests

**Status.** All `to do`. S1 is a pure function (easy to unit-test); S2 wires it to
the DB; S3 is the only UI and needs a short design pass (no mockup yet).

---

## E10-S1 — Takeout parser + mapping · M

**Goal.** A pure, well-tested module that turns one Keep JSON object into the
fields Keepou needs — no DB, no HTTP.

**Tasks**
- Add `api/app/services/keep_import.py` with:
  - `keep_note_to_fields(raw: dict) -> ImportedNote | None` — returns `None` for a
    trashed note; otherwise a small dataclass/typed dict `{title, body, color,
    created_at, updated_at}`.
  - Body serialization mirroring `web/src/lib/markdown.ts` / `buildMd`: the
    `textContent` paragraph first, a blank line, then the `listContent` lines as
    GFM task-list items — never more than one consecutive blank line.
  - `COLOR_MAP` (the table above); unknown/missing → `NoteColor.GOLD`.
  - `usec_to_datetime(usec: int) -> datetime` (µs → naive UTC, matching the model's
    convention); missing/invalid timestamps fall back to "now".
- Be tolerant: missing `title`/`textContent`/`listContent`, empty note, unexpected
  keys — never raise on a single malformed note (collect it as an error instead).

**Acceptance criteria**
- [ ] A text-only note, a checklist-only note, and a mixed note each produce the
  exact Markdown our editor round-trips (`parse(serialize(...))` stable).
- [ ] Every Keep color maps to one of the 5 shades; unknown → `GOLD`.
- [ ] `isTrashed: true` yields `None` (skipped).
- [ ] `created_at` / `updated_at` reflect the Keep timestamps (µs converted).
- [ ] Malformed input is handled without raising (unit tests cover the odd cases).

**Notes.** Keep it pure so the endpoint (S2) is a thin wrapper and the mapping is
trivially testable. The serialization must match the front so imported notes look
identical to natively-created ones.

---

## E10-S2 — Import endpoint · M

**Goal.** `POST /api/import/keep` takes an uploaded Takeout archive and creates the
caller's notes, preserving dates, in one transaction.

**Tasks**
- New router `api/app/routers/import_keep.py`, mounted in `app/main.py`:
  `POST /api/import/keep` — **bearer-authenticated**, `multipart/form-data` with the
  Takeout **ZIP** (accept the whole `Takeout*.zip`; read `*.json` under any `Keep/`
  folder). Enforce a **max upload size** and reject non-ZIP payloads.
- For each note: call `keep_import.keep_note_to_fields`, then create a `Note`
  (`owner_id = caller`, `visibility = PRIVATE`, `created_at`/`updated_at` from the
  mapping) and its **creation version** via `versions.record_creation` (stamped
  with the imported `created_at`, so history reads « Créée par X » at the Keep
  date). Do it in **one transaction** — all-or-nothing on a fatal error.
- Return a **summary**: `{ imported, skipped_trashed, failed: [{file, reason}] }`.
- **Idempotence guardrail (MVP):** to avoid double-import when a user clicks twice,
  skip a note whose `(owner_id, title, body)` already exists verbatim; count it
  under a `skipped_duplicate` field. (No new column — a query is enough. A durable
  "imported_from" marker is a post-MVP option.)

**Acceptance criteria**
- [ ] Uploading a real Takeout ZIP creates the caller's notes (private), with the
  right title/body/color and the **original Keep dates**.
- [ ] Trashed notes are skipped; the response reports counts (imported / skipped /
  duplicate / failed).
- [ ] A malformed single note is reported in `failed` without aborting the whole
  import; a fatal error rolls the transaction back (no partial half-import).
- [ ] The endpoint is bearer-authenticated and enforces an upload-size limit.
- [ ] Each imported note has exactly one « Créée par X » version at its Keep date.

**Notes.** Reuses the existing create + versioning path — no new lock/visibility
rules. Notes are created directly (not through `POST /api/notes`) so `created_at`
can be set; the server still owns `owner_id` and forces `PRIVATE`.

---

## E10-S3 — Front: import flow · M (design-gated)

**Goal.** A member can upload their Takeout export and see the result, in a screen
faithful to the design system.

**Design first.** There is **no mockup yet** — follow the design-driven workflow
(`design/claude.md`, `HANDOFF.md`): produce a small validated screen (upload +
progress + result) reusing the exact tokens/fonts before building. Copy is
**French, verbatim** and centralized (HANDOFF §7 — new "Import" strings to add).

**Tasks**
- **Entry point** in the avatar menu: « Importer depuis Google Keep » (all members).
- **Import screen/modal**: explain how to get a Takeout export (short help text +
  link to Google Takeout), a file picker (`.zip`), an **Importer** button, and a
  disabled/loading state during upload.
- **Result summary**: « N notes importées », skipped/duplicate/failed counts, and a
  **Voir mes notes** button that returns to the board (refreshed).
- Errors surfaced calmly (wrong file type, too large, network) — never a hard crash.

**Acceptance criteria**
- [ ] The import screen is reachable from the avatar menu and matches the design
  system (light + dark, desktop + mobile).
- [ ] A user can pick a Takeout ZIP, upload it, and see a clear French summary.
- [ ] The board reflects the imported notes on return.
- [ ] All new copy is French and centralized (no hardcoded strings).

**Notes.** Keep it a one-shot upload + summary — no per-note preview grid in the
MVP (that can come later). The heavy lifting is server-side (S2).

---

## E10-S4 — Docs, edge cases & tests · S

**Goal.** Ship it documented and covered.

**Tasks**
- Back tests: parser mapping (S1 cases), endpoint happy path + trashed/duplicate/
  malformed handling, date preservation, forced-private + owner ownership.
- A short **user note** (README or a docs page): "How to import from Google Keep"
  (run Takeout, download the ZIP, upload it in Keepou).
- Tick the docs: ARCHITECTURE §12, PRD §5.8 (FR-I*), this story, EPICS progress.

**Acceptance criteria**
- [ ] Back tests green for parser + endpoint (including edge cases).
- [ ] The "import from Keep" how-to is written.
- [ ] Docs (ARCHITECTURE, PRD, EPICS, this story) reflect what shipped.

---

## Definition of "E10 done"

- [ ] A member can export from Google Takeout and **import their notes into
  Keepou** in a few clicks.
- [ ] Title, text, and checklist items are imported faithfully (GFM Markdown);
  colors are mapped; **original Keep dates are preserved**.
- [ ] Trashed notes are skipped; images/labels are ignored (MVP); imported notes
  are **private** and owned by the importer.
- [ ] Each imported note has its « Créée par X » history root at the Keep date.
- [ ] The import screen matches the design system (light/dark, mobile/desktop),
  French copy centralized.
- [ ] Back tests cover the parser and the endpoint; a user how-to is written.

---

## Out of scope (post-MVP notes)

- **Images / attachments** — needs image support in Keepou first (PRD non-goal today).
- **Labels / tags** — Keepou has no labels; dropped.
- **Archived / pinned** — `isArchived` can map to `Note.archived` once **E8** ships
  the archive feature; pinning is a PRD non-goal.
- **Other sources** (Standard Notes, Evernote, plain Markdown folders) — the parser
  is isolated in `keep_import.py`, so a second importer could be added later without
  touching the endpoint plumbing.
- **Durable dedup** — an `imported_from`/source-hash column would make re-imports
  idempotent across sessions; the MVP uses a content-match guard instead.
