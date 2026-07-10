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
- **Import is a two-step flow with a review/selection step (« mode tunnel »).**
  Upload never imports everything blindly: the archive is first **parsed into a
  preview**, the member **reviews each note and checks/unchecks** the ones to keep
  (a cleanup pass — trashed notes pre-unchecked), and **only the checked notes are
  imported**. This is the core of the epic, not a nice-to-have: an old Keep account
  is full of junk the user wants to drop on the way in.

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

## Two-step flow (upload → review → import)

```
1. Upload ZIP ──▶ 2. Preview (parse only, no DB writes)
                     └─▶ 3. Review view (« mode tunnel »): check/uncheck notes to keep
                            └─▶ 4. Import: create only the checked notes ──▶ summary
```

- **Step 2 — preview.** `POST /api/import/keep/preview` unzips + parses and returns
  the parsed notes with a **stable index** (files sorted deterministically), each
  carrying `{index, title, body, color, created_at, is_trashed}`. **No note is
  created.**
- **Step 3 — review (the funnel view).** The front lists every parsed note as a
  selectable card (checkbox), with **« Tout cocher / Tout décocher »** and trashed
  notes **pre-unchecked**. The member does their cleanup here.
- **Step 4 — import.** `POST /api/import/keep` re-sends the **same ZIP** plus the
  **selected indices**; the server re-parses (deterministic — index N is the same
  note) and creates **only the checked notes**. Re-sending the ZIP avoids trusting
  client-echoed content and avoids a server-side staging table (the export is small
  text — images are ignored). *Alternative if double-upload is a concern: echo the
  selected parsed payloads back and re-validate server-side; decided at S2.*

---

## Stories at a glance

- [x] **E10-S1** — Takeout parser + field/color/timestamp mapping (pure, tested)
- [x] **E10-S2** — Endpoints: `POST /api/import/keep/preview` (parse only) + `POST /api/import/keep` (create selected + versions → summary)
- [x] **E10-S3** — Front: import entry point, upload, **review/selection view (« mode tunnel »)**, result summary (design-gated)
- [x] **E10-S4** — Docs, edge cases & tests

**Status.** Shipped. Back: `services/keep_import.py`, `routers/import_keep.py`,
`tests/test_import_keep.py`, user how-to (`docs/HOWTO-import-google-keep.md`).
Front: mockup **validated** (`design/Keepou - Import Keep.dc.html` — the
checkable-cards grid is the « mode tunnel » baseline; the one-note-at-a-time
stepper variant was reviewed and dropped), `/import` route +
`components/importer/*`, strings in `lib/copy.ts` (HANDOFF §7 « Import »),
front tests in `pages/import.test.tsx`, verified end-to-end through the real
UI (upload → review → import → board, duplicates on re-import, Keep dates +
history root).

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
- [x] A text-only note, a checklist-only note, and a mixed note each produce the
  exact Markdown our editor round-trips (`parse(serialize(...))` stable).
- [x] Every Keep color maps to one of the 5 shades; unknown → `GOLD`.
- [x] `isTrashed: true` yields `None` (skipped) — `parse_keep_note` still maps the
  content so the preview can show it pre-unchecked.
- [x] `created_at` / `updated_at` reflect the Keep timestamps (µs converted).
- [x] Malformed input is handled without raising (unit tests cover the odd cases).

**Notes.** Keep it pure so the endpoint (S2) is a thin wrapper and the mapping is
trivially testable. The serialization must match the front so imported notes look
identical to natively-created ones.

---

## E10-S2 — Import endpoints (preview + confirm) · M

**Goal.** Two endpoints implementing the two-step flow: **parse a preview** (no
writes) so the front can offer the review view, then **create only the selected
notes**, preserving dates, in one transaction.

**Tasks**
- New router `api/app/routers/import_keep.py`, mounted in `app/main.py`. Both
  endpoints are **bearer-authenticated**, `multipart/form-data` with the Takeout
  **ZIP** (accept `Takeout*.zip`; read `*.json` under any `Keep/` folder), enforce a
  **max upload size**, and reject non-ZIP payloads. Files are iterated in a
  **deterministic order** (sorted by path) so the **index is stable** between
  preview and confirm.
- `POST /api/import/keep/preview` — unzip + parse via
  `keep_import.keep_note_to_fields`, **write nothing**, return
  `{ items: [{index, title, body, color, created_at, is_trashed}], counts: {total, trashed, parse_failed} }`.
  A note that fails to parse is reported (in `counts.parse_failed` / a `failed`
  list), never fatal.
- `POST /api/import/keep` — same ZIP **+ `selected: [index, …]`**. Re-parse
  deterministically, keep only the selected indices, and for each create a `Note`
  (`owner_id = caller`, `visibility = PRIVATE`, `created_at`/`updated_at` from the
  mapping) plus its **creation version** via `versions.record_creation` (stamped
  with the imported `created_at`, so history reads « Créée par X » at the Keep
  date). **One transaction** — all-or-nothing on a fatal error. Ignore a selected
  index that is trashed/out-of-range rather than erroring.
- Return a **summary**: `{ imported, skipped_duplicate, failed: [{index, reason}] }`.
- **Idempotence guardrail (MVP):** skip a selected note whose `(owner_id, title,
  body)` already exists verbatim (double-click / re-import); count it under
  `skipped_duplicate`. No new column — a query is enough; a durable
  `imported_from` marker is a post-MVP option.

**Acceptance criteria**
- [x] `preview` returns the parsed notes with a **stable index** and the trashed
  flag, and **creates nothing** in the DB.
- [x] `import` with a `selected` list creates **only** those notes (private, caller
  as owner) with the right title/body/color and the **original Keep dates**.
- [x] A note unchecked by the user is **not** created; a trashed/out-of-range index
  in `selected` is ignored without error.
- [x] A malformed single note is reported (not fatal); a fatal error rolls the
  transaction back (no partial half-import — one commit at the end).
- [x] Both endpoints are bearer-authenticated and enforce an upload-size limit
  (20 MB archive, 1 MB per note file — zip-bomb guard).
- [x] Each imported note has exactly one « Créée par X » version at its Keep date.

**Notes.** Reuses the existing create + versioning path — no new lock/visibility
rules. Notes are created directly (not through `POST /api/notes`) so `created_at`
can be set; the server still owns `owner_id` and forces `PRIVATE`. The index is the
contract between the two calls — keep the file sort identical in both.

---

## E10-S3 — Front: import flow · M (design-gated)

**Goal.** A member can upload their Takeout export and see the result, in a screen
faithful to the design system.

**Design first.** Done — the mockup was proposed, reviewed and **validated**
(`design/Keepou - Import Keep.dc.html`): checkable-cards grid as the « mode
tunnel » baseline, unchecked cards dimmed ~40%, the one-by-one stepper variant
dropped. Copy is **French, verbatim** and centralized (HANDOFF §7 « Import »).

The flow has **three screens**: upload → **review/selection (« mode tunnel »)** →
result.

**Tasks**
- **Entry point** in the avatar menu: « Importer depuis Google Keep » (all members).
- **Upload screen**: explain how to get a Takeout export (short help text + link to
  Google Takeout), a file picker (`.zip`), a **Continuer** button, and a
  disabled/loading state while `preview` runs.
- **Review / selection view (the funnel).** After `preview`, show every parsed note
  as a **selectable card** (real `<input type=checkbox>` + label — a11y, E8-S3):
  title, a body snippet with the checklist rendered read-only, its mapped color, and
  the Keep date. Controls:
  - **« Tout cocher » / « Tout décocher »** and a live **« N sélectionnées »** count;
  - **trashed notes pre-unchecked** (and visibly marked « Corbeille ») so cleanup is
    the default, not extra work;
  - the primary action **« Importer les N notes »** calls `import` with the checked
    indices.
  - *(Optional, if the design favors it: a one-by-one « tunnel » stepper — one note
    at a time with Garder / Ignorer — over the same selection state. The grid is the
    baseline; the stepper is a presentation choice validated in design.)*
- **Result summary**: « N notes importées », duplicate/failed counts, and a **Voir
  mes notes** button that returns to the board (refreshed).
- Errors surfaced calmly (wrong file type, too large, network) — never a hard crash.

**Acceptance criteria**
- [x] The import flow is reachable from the avatar menu and matches the design
  system (light + dark, desktop + mobile).
- [x] After upload, the **review view lists every parsed note with a checkbox**;
  the user can check/uncheck individually and via « Tout cocher / décocher ».
- [x] **Trashed notes are pre-unchecked**; the selected count updates live.
- [x] Importing creates **only the checked notes**; the board reflects them on
  return, and the summary is a clear French message.
- [x] All new copy is French and centralized (`web/src/lib/copy.ts`).

**Notes.** The review/selection view **is the point of the feature** (« faire le
ménage » on the way in) — it is in scope for the MVP, not deferred. The heavy
lifting (parse, create) is server-side (S2); the front owns the selection state and
the two calls.

---

## E10-S4 — Docs, edge cases & tests · S

**Goal.** Ship it documented and covered.

**Tasks**
- Back tests: parser mapping (S1 cases); `preview` writes nothing + stable index;
  `import` creates only the selected indices, ignores trashed/out-of-range,
  duplicate + malformed handling, date preservation, forced-private + owner
  ownership.
- A short **user note** (README or a docs page): "How to import from Google Keep"
  (run Takeout, download the ZIP, upload it in Keepou).
- Tick the docs: ARCHITECTURE §12, PRD §5.8 (FR-I*), this story, EPICS progress.

**Acceptance criteria**
- [x] Back tests green for parser + endpoint (including edge cases).
- [x] The "import from Keep" how-to is written
  ([`docs/HOWTO-import-google-keep.md`](../../HOWTO-import-google-keep.md)).
- [x] Docs (ARCHITECTURE, PRD, EPICS, this story) reflect what shipped.

---

## Definition of "E10 done"

- [x] A member can export from Google Takeout and **import their notes into
  Keepou** in a few clicks.
- [x] After upload, a **review/selection view (« mode tunnel »)** lets the member
  **check/uncheck** notes (cleanup); **only the checked notes are imported**,
  trashed pre-unchecked.
- [x] Title, text, and checklist items are imported faithfully (GFM Markdown);
  colors are mapped; **original Keep dates are preserved**.
- [x] Trashed notes are skipped; images/labels are ignored (MVP); imported notes
  are **private** and owned by the importer.
- [x] Each imported note has its « Créée par X » history root at the Keep date.
- [x] The import screen matches the design system (light/dark, mobile/desktop),
  French copy centralized.
- [x] Back tests cover the parser and the endpoint; a user how-to is written.

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
