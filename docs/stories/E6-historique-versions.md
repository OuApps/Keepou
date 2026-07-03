# E6 — History & versions — Detailed stories

> Epic goal: keep history (**1 editing session = 1 version**), let you **preview a
> version read-only** and **restore** it (never overwrite).
>
> Estimation convention: **S** (≤ ½ day), **M** (1–2 days), **L** (3+ days).
> **All stories are shipped** (see the implementation notes below).

**Reference docs.** `design/HANDOFF.md` §3.4 & §7 (History), `docs/ARCHITECTURE.md`
§6, PRD FR-H1…FR-H4, claude.md §3. Visual source of truth:
`design/Keepou - Historique.dc.html`. **Depends on** E4 and E5 (a version is born
when the session ends).

**Key decisions carried in (already validated):**
- **One version per editing session**, created when the session ends — on **lock
  release** for a **public** note, on **editor close** for a **private** note
  (FR-H1). Never one version per keystroke or per checkbox toggle.
- **No visual diff** — a version is **re-displayed as-is** (claude.md §3).
- **Restore creates a NEW version** whose content equals the chosen one — nothing is
  ever overwritten (FR-H4).

---

## Stories at a glance

- [x] **E6-S1** — Back: `NoteVersion` model & migration (composite index)
- [x] **E6-S2** — Back: create a version on session end + `GET .../versions`
- [x] **E6-S3** — Back: `POST .../restore/{version_id}` (creates a new version)
- [x] **E6-S4** — Front: HistoryPanel desktop (list + preview + restore)
- [x] **E6-S5** — Front: mobile 2-screen flow (list → preview → Fermer / Restaurer)
- [x] **E6-S6** — Tests: one-per-session, restore = new version, visibility gating

**Status.** All **done**.

**Implementation notes (decisions made while building):**
- **Creation root.** `POST /api/notes` writes the note's first version, stamped
  with the note's own `created_at` — that is how the front tells « Créée par X »
  (root) from « Modifié par X » (edits). Notes created before E6 simply start
  their history at their first post-E6 session.
- **One end-of-session signal.** `DELETE /api/notes/{id}/lock` ends the session
  in both cases: it releases the lock (public note, version written iff a lock
  was actually released) and doubles as the editor-close signal on a private
  note (owner-only, no lock to release). `useNoteLock` sends it on editor
  unmount and on `beforeunload` (keepalive) for private notes too.
- **No-op guard.** A session (or a restore) that leaves the note exactly as the
  latest version left it records nothing — repeated closes stay version-free.
- **Restore & visibility.** Visibility is a sharing setting, owner-only
  (ARCHITECTURE §4.2): a member's restore re-applies title/body/color and leaves
  the current visibility untouched; the owner's restore re-applies it fully. On
  a public note the restore briefly takes the single-editor lock atomically —
  an active editor wins the 409 (`note_locked` + holder).
- **Editor entry point.** The « Historique » text button sits in the editor
  footer (as in `Keepou - Éditeur & verrou.dc.html`); it flushes the pending
  autosave first, then navigates — the unmount ends the session, so the history
  the user lands on already contains this session's version.
- **Lifecycle.** Deleting a note deletes its versions with it.

---

## E6-S1 — Back: `NoteVersion` model & migration · M

**Goal.** An append-only version table backing the history list.

**Tasks**
- `app/models.py` `NoteVersion`: id, `note_id` FK→note.id (index), `author_id`
  FK→user.id, snapshot `title` / `body` (Markdown) / `color` / `visibility`,
  `created_at` — HANDOFF §4.
- Composite index `(note_id, created_at)` for the history listing.
- Alembic autogenerate + `upgrade head` (4th real migration).

**Acceptance criteria**
- [x] `NoteVersion` table + `(note_id, created_at)` composite index created by a
  checked-in migration.
- [x] A version stores a full snapshot (title, body, color, visibility, author, time).
- [x] Postgres-safe.

**Notes.** Append-only; snapshots are small Markdown text, so **all versions are
kept** (ARCHITECTURE §6, no pruning in MVP).

---

## E6-S2 — Back: create a version on session end + list · L

**Goal.** Record exactly one version per session and expose the history.

**Tasks**
- Create a `NoteVersion` **when the session ends**:
  - **Public** note → on **lock release** (`DELETE /api/notes/{id}/lock`, E5-S2).
  - **Private** note → on **editor close** (client signals end-of-session; no lock).
- Snapshot the current note (title/body/color/visibility) + author + timestamp.
  Guard against empty/no-op sessions (skip if nothing changed since the last version).
- `GET /api/notes/{id}/versions` → newest-first, **visibility-gated** exactly like
  the note (public-note history visible to all members; private-note history only to
  the owner, FR-H2).

**Acceptance criteria**
- [x] One editing session produces **at most one** version (not per keystroke, FR-H1).
- [x] Public-note version is written on lock release; private-note version on close.
- [x] `GET .../versions` returns who + when, newest-first, gated by visibility.
- [x] A session with no change does not create a version.

**Notes.** Ties E5 (lock release) to E6: releasing the lock is the version trigger
for public notes (ARCHITECTURE §5/§6). The private-note "session end" needs an
explicit client signal (editor close / flush) since there is no lock.

---

## E6-S3 — Back: restore (creates a new version) · M

**Goal.** Restore a past version without ever overwriting history.

**Tasks**
- `POST /api/notes/{id}/restore/{version_id}`: set the note's current
  title/body/color/visibility to the chosen version's snapshot **and** append a
  **new** `NoteVersion` reflecting the restore (author = caller, new timestamp).
- Same access rules as editing the note (lock-checked for public notes).

**Acceptance criteria**
- [x] Restore makes the note's content equal the chosen version.
- [x] A **new** version is appended; **nothing is overwritten** (FR-H4).
- [x] The previously-current version remains in history untouched.

**Notes.** "La version actuelle sera conservée dans l'historique — rien n'est perdu."
(confirmation copy shown by the front, E6-S4/S5).

---

## E6-S4 — Front: HistoryPanel desktop · L

**Goal.** The desktop history side panel: list + read-only preview + restore.

**Tasks**
- `components/history/HistoryPanel.tsx` (side panel) with `VersionRow`,
  `VersionPreview`, `RestoreConfirm`, faithful to `Keepou - Historique.dc.html`.
- Rows: **« actuelle »** badge on the current one; lines **« Modifié par X »** /
  **« Créée par X »** + timestamp (IBM Plex Mono).
- Selecting a version → **read-only** re-render of that snapshot (no diff).
- **« Restaurer cette version »** → confirmation **« La version actuelle sera
  conservée dans l'historique — rien n'est perdu. »** → `POST .../restore`.

**Acceptance criteria**
- [x] List shows who/when, newest-first, with the "actuelle" badge.
- [x] Selecting a version previews it read-only (re-rendered as-is, no diff).
- [x] Restore asks for confirmation with the exact copy, then creates a new version.
- [x] Faithful in light + dark.

**Notes.** Route `/note/:id/history`. Frozen copy: HANDOFF §7 "History".

---

## E6-S5 — Front: mobile 2-screen flow · M

**Goal.** The mobile history flow: list → preview → action bar.

**Tasks**
- Mobile: **list** (chevrons) → **read-only preview** screen with gold banner
  **« Aperçu — lecture seule · Version de X · <date> »** → bottom bar **« Fermer /
  Restaurer cette version »**.
- Restore reuses the confirmation + endpoint from E6-S3/S4.

**Acceptance criteria**
- [x] Mobile flow: tap a row → preview → Fermer / Restaurer bar (frozen decision).
- [x] Preview is read-only with the gold "Aperçu" banner + author/date.
- [x] Restore from mobile creates a new version.

**Notes.** Breakpoint ~640px (HANDOFF §2/§8).

---

## E6-S6 — Tests: one-per-session, restore, gating · M

**Goal.** Protect the versioning invariants.

**Tasks**
- Back (pytest): a multi-save session yields exactly one version (on release/close);
  no-op session → no version; restore creates a new version and leaves prior ones
  intact; history visibility gating (private history owner-only).
- Front (Vitest): history list render + "actuelle" badge; preview re-render;
  restore confirmation copy.

**Acceptance criteria**
- [x] One-version-per-session tested (FR-H1).
- [x] Restore-creates-new-version, nothing overwritten, tested (FR-H4).
- [x] Private-history gating tested (FR-H2).
- [x] CI green.

**Notes.** Supports the "100% attributable changes" metric (PRD §8).

---

## Definition of "E6 done"

- [x] History lists who + when, newest-first, visibility-gated.
- [x] Read-only preview (desktop panel + mobile 2-screen), re-rendered as-is (no diff).
- [x] One version per editing session (public: lock release; private: editor close).
- [x] Restore creates a new version; nothing is ever overwritten.
- [x] Versioning tests green in CI.
