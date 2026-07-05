# E3 — Board & note management — Detailed stories

> Epic goal: the main board — list, create and open your notes; switch **Mes notes /
> Public**; a quick composer; faithful cards (color, checklist, meta).
>
> Estimation convention: **S** (≤ ½ day), **M** (1–2 days), **L** (3+ days).
> All these stories are **done**.

**Reference docs.** `design/HANDOFF.md` §3.5 (visibility) & §7, `docs/ARCHITECTURE.md`
§3/§7, PRD FR-N1/N2/N4/N6, FR-S1/S2. Visual source of truth:
`design/Keepou - Board.dc.html`. **Depends on** E2 (a session is required).

**Scope note.** E3 is the board + **base** note CRUD. Fine-grained editing (blocks,
autosave, Markdown round-trip) is **E4**; the single-editor **lock** is **E5**;
**history** is **E6**; **archive** is **E8**. Cards render the checklist **read-only**
here — real editing arrives in E4.

---

## Stories at a glance

- [x] **E3-S1** — `Note` model & migration (core columns)
- [x] **E3-S2** — Notes CRUD API (`list` / `create` / `read` / `patch` / `delete`)
- [x] **E3-S3** — Front: board Topbar integration (search, tabs slot, avatar menu)
- [x] **E3-S4** — Front: TabSwitch (Mes notes / Public) + `?tab=` routing
- [x] **E3-S5** — Front: Composer (quick create: input + color + public toggle)
- [x] **E3-S6** — Front: NoteCard (5 shades, title, read-only checklist, badges)
- [x] **E3-S7** — Front: NoteGrid masonry (4→2) + client-side search filter
- [x] **E3-S8** — Tests: CRUD, tab filtering, delete permission, visibility
- [x] **E3-S9** — Composer visibility defaults to the active tab (Public tab → public note)

**Status.** All **done**. Reuses the E0 `Topbar`/`AppShell`/`ThemeToggle` shell.

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
- [x] `Note` table created by a checked-in migration; color stored as an **identifier**,
  not a hex (FR-N4).
- [x] `owner_id` indexed; `updated_at` present (feeds "last saved version" later).
- [x] Migration runs clean on SQLite (dev) and is Postgres-safe.

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
- [x] `tab=mine` returns only the caller's notes; `tab=public` returns all members'
  public notes with author (FR-S2).
- [x] Reading a private note you don't own → **403/404**; public readable by any member.
- [x] `DELETE` allowed for owner or admin, refused otherwise (FR-N6).
- [x] Create/patch persist and echo the note back.

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
- [x] Topbar faithful (blur, `--border`, measurements) in light + dark.
- [x] Search input present; avatar menu shows the current user + logout.
- [x] Sticky/responsive behavior matches `Keepou - Board.dc.html`.

**Notes.** Reuses `ThemeToggle`/`Topbar`/`AppShell` from E0-S6.

---

## E3-S4 — Front: TabSwitch (Mes notes / Public) + `?tab=` routing · S

**Goal.** The segmented pill switching the two boards, reflected in the URL.

**Tasks**
- `components/TabSwitch.tsx` (segmented pill) → **Mes notes** / **Public**.
- Drive the active board from `?tab=mine|public`; default `mine`. Fetch via E3-S2.

**Acceptance criteria**
- [x] Switching tabs updates `?tab=` and reloads the right list.
- [x] Deep-linking `/?tab=public` opens the public board directly.
- [x] Faithful pill styling (light + dark).

**Notes.** Public cards show the author badge; own cards don't need it.

---

## E3-S5 — Front: Composer (quick create) · M

**Goal.** The fastest path in the app: capture a note in seconds (PRD UX).

**Tasks**
- `components/Composer.tsx`: quick input + **ColorPicker** (5 shades) + **public
  toggle** → `POST /api/notes`, then **open the note in the editor** (E4) so the
  body is written there. The **title is optional** (a note can be created empty).
- Faithful to the composer in `Keepou - Board.dc.html`.

**Acceptance criteria**
- [x] Creating a note from the composer opens it in the editor (title optional);
  the new card appears on the board when the editor is closed.
- [x] Color + public toggle are applied on create.
- [x] Composer faithful (light + dark, desktop + mobile).

**Notes.** Full editing (blocks, autosave) is E4; the composer only creates then
hands off to the editor. *(Post-E8 polish: the composer used to prepend the card
and stay on the board; it now opens the note straight in the editor, the title is
optional, and the checkbox hint icon was dropped.)*

---

## E3-S6 — Front: NoteCard · M

**Goal.** A faithful board card for each note.

**Tasks**
- `components/NoteCard.tsx`: 5 card shades (gradient + border per HANDOFF §1),
  **Fredoka** title, **read-only** checklist rendered from the Markdown body,
  **visibility/author** badge, meta (updated_at). Click → open the editor (E4).

**Acceptance criteria**
- [x] The 5 shades match the tokens exactly (light + dark).
- [x] Checkbox lines from the body render as a read-only checklist.
- [x] Public cards show the author; private cards don't.
- [x] `break-inside: avoid`; card shadow per token.

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
- [x] 4 columns on desktop, 2 on mobile, matching the mockup.
- [x] Typing in search filters the visible cards (title + body match).
- [x] No layout jump / broken columns on resize.

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
- [x] Back tests cover tab filtering, visibility, and delete permission.
- [x] Front tests cover card render, tab switch, and search filter.
- [x] CI green.

**Notes.** Builds on E0-S8 + E2-S8 harnesses.

---

## E3-S9 — Composer visibility follows the active tab · S

**Goal.** Creating a note from the **Public** tab produces a **public** note by
default. The composer's visibility toggle is pre-armed from the board tab it was
opened on, instead of always starting private — so a note created while browsing
« Public » lands on the Public board, not silently in « Mes notes ».

**Context.** Reported after testing: on the **Public** tab, hitting *Ajouter*
created a **private** note (the toggle always defaulted to off), which was
surprising. The fix ties the default to the tab of origin.

**Tasks**
- `components/Composer.tsx`: add a `defaultPublic?: boolean` prop; initialize the
  `isPublic` toggle from it and reset to it on close. Keep it in step with the
  active tab while the composer is **idle** (closed) via an effect — **without**
  overriding a toggle the user set mid-edit.
- `pages/BoardPage.tsx`: pass `defaultPublic={tab === 'public'}`.

**Acceptance criteria**
- [x] On the **Public** tab, opening the composer shows the toggle already **on**
  (`aria-pressed="true"`); *Ajouter* with no toggle interaction creates a
  `PUBLIC` note.
- [x] On **Mes notes**, the toggle still defaults **off** (private) as before.
- [x] Switching tabs while the composer is closed re-arms the default; a manual
  toggle made while the composer is open is preserved across a tab switch.
- [x] The user can still flip the toggle either way before creating.

**Notes.** UX-only change on top of E3-S5; no API change (visibility was already
sent on create). The reversible visibility rule (`design/claude.md` §7) is
unaffected — this only sets the **initial** value of an existing toggle.

---

## Definition of "E3 done"

- [x] You can see, create and open your notes; **Mes notes / Public** tabs work.
- [x] Public tab shows all members' public notes with author; visibility enforced
  server-side.
- [x] Delete restricted to owner or admin (FR-N6).
- [x] Board faithful in light + dark, desktop + mobile (masonry 4→2), search filters.
- [x] Note CRUD + board tests green in CI.
