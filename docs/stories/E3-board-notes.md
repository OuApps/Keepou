# E3 — Board & note management — Detailed stories

> Epic goal: the main board — list, create and open your notes; switch **Mes notes /
> Public**; a quick composer; faithful cards (color, checklist, meta).
>
> Estimation convention: **S** (≤ ½ day), **M** (1–2 days), **L** (3+ days).
> All these stories are `to do` (nothing is built yet).

**Reference docs.** `design/HANDOFF.md` §3.5 (visibility) & §7, `docs/ARCHITECTURE.md`
§3/§7, PRD FR-N1/N2/N4/N6, FR-S1/S2. Visual source of truth:
`design/Keepou - Board.dc.html`. **Depends on** E2 (a session is required).

**Scope note.** E3 is the board + **base** note CRUD. Fine-grained editing (blocks,
autosave, Markdown round-trip) is **E4**; the single-editor **lock** is **E5**;
**history** is **E6**; **archive** is **E8**. Cards render the checklist **read-only**
here — real editing arrives in E4.

---

## Stories at a glance

- [ ] **E3-S1** — `Note` model & migration (core columns)
- [ ] **E3-S2** — Notes CRUD API (`list` / `create` / `read` / `patch` / `delete`)
- [ ] **E3-S3** — Front: board Topbar integration (search, tabs slot, avatar menu)
- [ ] **E3-S4** — Front: TabSwitch (Mes notes / Public) + `?tab=` routing
- [ ] **E3-S5** — Front: Composer (quick create: input + color + public toggle)
- [ ] **E3-S6** — Front: NoteCard (5 shades, title, read-only checklist, badges)
- [ ] **E3-S7** — Front: NoteGrid masonry (4→2) + client-side search filter
- [ ] **E3-S8** — Tests: CRUD, tab filtering, delete permission, visibility

**Status.** All `to do`. Reuses the E0 `Topbar`/`AppShell`/`ThemeToggle` shell.

---

## E3-S1 — `Note` model & migration (core columns) · M

**Goal.** The `Note` table with its core columns, migrated cleanly.

**Tasks**
- `app/models.py` `Note`: id, title, `body` (Markdown/GFM), `color`
  (`GOLD|AVOCAT|SALSA|CLAY|TEAL`, default GOLD), `visibility` (`PRIVATE|PUBLIC`,
  default PRIVATE), `owner_id` FK→user.id (index), created_at, updated_at.
- Enums `NoteColor`, `Visibility`.
- Alembic autogenerate + `upgrade head` (2nd real migration).

**Acceptance criteria**
- [ ] `Note` table created by a checked-in migration; color stored as an **identifier**,
  not a hex (FR-N4).
- [ ] `owner_id` indexed; `updated_at` present (feeds "last saved version" later).
- [ ] Migration runs clean on SQLite (dev) and is Postgres-safe.

**Notes.** **Feature-aligned migrations**: lock columns come in **E5**,
`NoteVersion` in **E6**, and `archived` in **E8** (after the archive design) — each
in its own migration. No dead columns before their feature ships.

---

## E3-S2 — Notes CRUD API · L

**Goal.** The endpoints the board needs, with server-side visibility & permissions.

**Tasks**
- `routers/notes.py` (all `Depends(get_current_user)`):
  - `GET /api/notes?tab=mine|public` — `mine` = caller's own notes; `public` = all
    members' `PUBLIC` notes (author + last-modified date). Newest-first.
  - `POST /api/notes {title?, body?, color?, visibility?}` → create (owner = caller).
  - `GET /api/notes/{id}` — visibility-checked (owner for private; any member for public).
  - `PATCH /api/notes/{id}` — **base** update (title, body, color, visibility);
    consolidated fine-grained editing is E4.
  - `DELETE /api/notes/{id}` — **owner or admin** only (FR-N6).
- Pydantic `NoteIn` / `NoteOut` (include author + updated_at for the public tab).

**Acceptance criteria**
- [ ] `tab=mine` returns only the caller's notes; `tab=public` returns all members'
  public notes with author (FR-S2).
- [ ] Reading a private note you don't own → **403/404**; public readable by any member.
- [ ] `DELETE` allowed for owner or admin, refused otherwise (FR-N6).
- [ ] Create/patch persist and echo the note back.

**Notes.** Private-note content stays shielded even from admins (ARCHITECTURE §4.2).
Lock enforcement on public-note mutations is added in E5 (409 without a held lock).

---

## E3-S3 — Front: board Topbar integration · M

**Goal.** The board topbar from the mockup, built on the E0 shell.

**Tasks**
- Wire `components/Topbar.tsx` for the board: mascot + « Keepou » (Fredoka), central
  **search** input, pill **tabs** slot, theme toggle, **avatar + menu**.
- Avatar menu: display name + **Se déconnecter** (logout drops tokens, E2). The
  **Administration** entry is added in E7 (admins only).

**Acceptance criteria**
- [ ] Topbar faithful (blur, `--border`, measurements) in light + dark.
- [ ] Search input present; avatar menu shows the current user + logout.
- [ ] Sticky/responsive behavior matches `Keepou - Board.dc.html`.

**Notes.** Reuses `ThemeToggle`/`Topbar`/`AppShell` from E0-S6.

---

## E3-S4 — Front: TabSwitch (Mes notes / Public) + `?tab=` routing · S

**Goal.** The segmented pill switching the two boards, reflected in the URL.

**Tasks**
- `components/TabSwitch.tsx` (segmented pill) → **Mes notes** / **Public**.
- Drive the active board from `?tab=mine|public`; default `mine`. Fetch via E3-S2.

**Acceptance criteria**
- [ ] Switching tabs updates `?tab=` and reloads the right list.
- [ ] Deep-linking `/?tab=public` opens the public board directly.
- [ ] Faithful pill styling (light + dark).

**Notes.** Public cards show the author badge; own cards don't need it.

---

## E3-S5 — Front: Composer (quick create) · M

**Goal.** The fastest path in the app: capture a note in seconds (PRD UX).

**Tasks**
- `components/Composer.tsx`: quick input + **ColorPicker** (5 shades) + **public
  toggle** → `POST /api/notes`, then prepend the new card / open the editor (E4).
- Faithful to the composer in `Keepou - Board.dc.html`.

**Acceptance criteria**
- [ ] Creating a note from the composer adds it to the board immediately.
- [ ] Color + public toggle are applied on create.
- [ ] Composer faithful (light + dark, desktop + mobile).

**Notes.** Full editing (blocks, autosave) is E4; the composer only creates.

---

## E3-S6 — Front: NoteCard · M

**Goal.** A faithful board card for each note.

**Tasks**
- `components/NoteCard.tsx`: 5 card shades (gradient + border per HANDOFF §1),
  **Fredoka** title, **read-only** checklist rendered from the Markdown body,
  **visibility/author** badge, meta (updated_at). Click → open the editor (E4).

**Acceptance criteria**
- [ ] The 5 shades match the tokens exactly (light + dark).
- [ ] Checkbox lines from the body render as a read-only checklist.
- [ ] Public cards show the author; private cards don't.
- [ ] `break-inside: avoid`; card shadow per token.

**Notes.** Read-only here; the interactive editor (toggling boxes, insert) is E4.
Parsing the body for preview can reuse `lib/markdown.ts` once E4 lands (a minimal
inline parser is fine for the card in the meantime).

---

## E3-S7 — Front: NoteGrid masonry + client-side search · M

**Goal.** The responsive board layout and a simple search.

**Tasks**
- `components/NoteGrid.tsx`: CSS masonry `column-count` **4 → 2** (~640px),
  `column-gap` 16–18px.
- **Search** (FR-S1): client-side filter over the loaded board by title/body
  (simple text match), wired to the Topbar input.

**Acceptance criteria**
- [ ] 4 columns on desktop, 2 on mobile, matching the mockup.
- [ ] Typing in search filters the visible cards (title + body match).
- [ ] No layout jump / broken columns on resize.

**Notes.** MVP search is a **client-side filter** over the loaded set (ARCHITECTURE
§7); a server endpoint can come later if the note count grows.

---

## E3-S8 — Tests: CRUD, tabs, delete permission, visibility · M

**Goal.** Guard the note rules that matter.

**Tasks**
- Back (pytest): create/read/patch/delete; `tab=mine` vs `tab=public` filtering;
  delete allowed for owner/admin and refused otherwise (FR-N6); private note
  invisible to non-owners.
- Front (Vitest): NoteCard renders the right shade + read-only checklist + author
  badge; TabSwitch changes the list; search filters.

**Acceptance criteria**
- [ ] Back tests cover tab filtering, visibility, and delete permission.
- [ ] Front tests cover card render, tab switch, and search filter.
- [ ] CI green.

**Notes.** Builds on E0-S8 + E2-S8 harnesses.

---

## Definition of "E3 done"

- [ ] You can see, create and open your notes; **Mes notes / Public** tabs work.
- [ ] Public tab shows all members' public notes with author; visibility enforced
  server-side.
- [ ] Delete restricted to owner or admin (FR-N6).
- [ ] Board faithful in light + dark, desktop + mobile (masonry 4→2), search filters.
- [ ] Note CRUD + board tests green in CI.
