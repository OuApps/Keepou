# E4 — Note editor — Detailed stories

> Epic goal: the canonical editor — **modal ≥ tablet / full screen < ~640px**, a
> mix of paragraphs + checkboxes, **GFM Markdown** persistence, **autosave**, color
> picker, private/public toggle with confirmation.
>
> Estimation convention: **S** (≤ ½ day), **M** (1–2 days), **L** (3+ days).

**Reference docs.** `design/HANDOFF.md` §3.2 (save), §3.3 (content & Markdown), §3.5
(visibility) & §7, `docs/ARCHITECTURE.md` §3, PRD FR-N3/FR-N5. Visual source of
truth: `design/Keepou - Éditeur canonique.dc.html` (+ `Keepou - Éditeur &
verrou.dc.html`). **Depends on** E3.

**Scope note.** E4 is the editor **without a lock** — the single-editor lock and its
4 banner states are added in **E5**; **versioning** (a version born on session end)
is **E6**. Here the two save signals are the **session state** and the **last saved
version** subtitle (§3.2), which must never contradict each other.

---

## Stories at a glance

- [x] **E4-S1** — Back: consolidated `PATCH /api/notes/{id}` (title, body, color, visibility)
- [x] **E4-S2** — Front: `lib/markdown.ts` (blocks ⇄ GFM, mirror of `buildMd`)
- [x] **E4-S3** — Front: NoteEditor shell (desktop modal / mobile full-screen)
- [x] **E4-S4** — Front: BlockList (paragraphs + checkboxes; "Insérer une case" at the bottom)
- [x] **E4-S5** — Front: ColorPicker + VisibilityToggle (public→private confirmation)
- [x] **E4-S6** — Front: `useAutosave` + SaveStatus (3 states, distinct from last version)
- [x] **E4-S7** — Tests: Markdown round-trip, autosave debounce/flush, visibility flow

**Status.** All shipped ✅ — the editor is live at `/note/:id` (desktop modal /
mobile full screen), lock-free until **E5**.

---

## E4-S1 — Back: consolidated `PATCH /api/notes/{id}` · M

**Goal.** One update endpoint that persists everything the editor changes.

**Tasks**
- Consolidate `PATCH /api/notes/{id}` to accept `title`, `body` (Markdown), `color`,
  `visibility`; bump `updated_at` on a successful save.
- **Public → private**: allowed only by the **owner** (FR-N5); once private, the note
  disappears from other members' Public board (it simply no longer matches
  `tab=public`).
- Title stored in its own column; the body stays **Markdown (GFM)** — the title is
  never embedded in the Markdown.

**Acceptance criteria**
- [x] A partial PATCH updates only the provided fields and sets `updated_at`.
- [x] Only the owner can change `visibility` (FR-N5); public→private removes it from
  others' public tab.
- [x] Body persists verbatim as Markdown; title stays separate.

**Notes.** Lock enforcement (409 on a public note without a held lock) is layered on
in **E5** — this story leaves it lock-free.

---

## E4-S2 — Front: `lib/markdown.ts` (blocks ⇄ GFM) · M

**Goal.** A faithful mirror of the mockup's `buildMd`: serialize/parse the block
list to/from GFM Markdown.

**Tasks**
- `serialize(blocks) → md`: paragraph → text; checkbox → `- [ ] label` /
  `- [x] label`. A **blank line** between a paragraph and a group of boxes; **no more
  than one** consecutive blank line (HANDOFF §3.3).
- `parse(md) → blocks`: inverse, tolerant of the shapes we emit.
- Match the reference serialization in `Keepou - Éditeur canonique.dc.html`.

**Acceptance criteria**
- [x] `parse(serialize(blocks))` is stable (round-trip preserves the block list).
- [x] Output matches the mockup's `buildMd` on the sample content.
- [x] Checkbox state (`[ ]` / `[x]`) survives the round-trip.

**Notes.** Storing Markdown from the MVP means richer rendering later needs **no
migration** (ARCHITECTURE §3). Reused by the NoteCard preview (E3-S6).

---

## E4-S3 — Front: NoteEditor shell · M

**Goal.** The frozen editor format: modal on tablet+, full-screen page below ~640px.

**Tasks**
- `components/editor/NoteEditor.tsx` at route `/note/:id`: **desktop modal**
  (radius 20px, modal shadow) / **mobile full-screen** shell, faithful to
  `Keepou - Éditeur canonique.dc.html`.
- Load the note (E3-S2 `GET`), header with title field + meta, footer/toolbar slots
  (color, visibility, save status).
- Close returns to the board (lock release hook slot for E5).

**Acceptance criteria**
- [x] Modal ≥ tablet, full-screen < ~640px (frozen decision, HANDOFF §2).
- [x] Faithful chrome (radii, shadows, spacing) in light + dark.
- [x] Opening a card from the board opens the editor on that note.

**Notes.** The 4-state LockBanner slot is filled in E5; here the editor is always
editable.

---

## E4-S4 — Front: BlockList (paragraphs + checkboxes) · L

**Goal.** The mixed content editing surface.

**Tasks**
- `components/editor/BlockList.tsx`: an ordered flow of **paragraph** and
  **checkbox** blocks; real `<input type=checkbox>` + label per box.
- **"Insérer une case"** affordance at the **bottom** of the text area (not in the
  middle) — HANDOFF §3.3.
- Edits update the in-memory block model → serialized via `lib/markdown.ts` (E4-S2)
  for saving (E4-S6).

**Acceptance criteria**
- [x] You can edit paragraphs, add/toggle/label checkboxes, and reorder within the flow.
- [x] "Insérer une case" adds a box at the bottom.
- [x] The serialized body is correct GFM (matches E4-S2).

**Notes.** Accessibility polish (labels, hit targets) is verified in **E8-S3**, but
use real inputs from the start.

---

## E4-S5 — Front: ColorPicker + VisibilityToggle · M

**Goal.** Change a note's color and visibility, with the public→private guard.

**Tasks**
- `components/editor/ColorPicker.tsx` (5 shades) → PATCH `color`.
- `components/editor/VisibilityToggle.tsx` (private/public) → PATCH `visibility`.
  On **public → private**, show a confirmation **« Cette note ne sera plus visible
  par les autres. »** before applying.

**Acceptance criteria**
- [x] Picking a color updates the note (and card shade) after save.
- [x] Toggling public→private asks for confirmation with the exact copy; on confirm
  the note leaves others' public board.
- [x] Private→public is immediate (reversible, no confirmation).

**Notes.** Only the owner sees the visibility control (FR-N5). Frozen copy: HANDOFF §7.

---

## E4-S6 — Front: `useAutosave` + SaveStatus · M

**Goal.** Autosave with a session state that never contradicts the last saved version.

**Tasks**
- `hooks/useAutosave.ts`: **debounce ~1.5 s** after the last keystroke; **immediate
  flush** on blur / editor close. Sends the consolidated PATCH (E4-S1).
- `components/editor/SaveStatus.tsx`: **session state** `Modifié` (dot `#EAB64C`) →
  `Enregistrement…` (dot `#9DAE6C`) → `Enregistré · à l'instant` (check `#3A5132`).
- **Last saved version** subtitle **« Dernière version enregistrée par X · <date> »**
  — updates only after a successful save; **distinct** from the session state (§3.2).

**Acceptance criteria**
- [x] Typing shows `Modifié`, then autosaves after ~1.5 s → `Enregistrement…` →
  `Enregistré`.
- [x] Blur/close flushes immediately (no lost trailing edit).
- [x] The "last saved version" subtitle changes only on a successful persist and
  never conflicts with the session state.

**Notes.** The lock heartbeat is **independent** of saving (added in E5, §3.2).

---

## E4-S7 — Tests: Markdown round-trip, autosave, visibility flow · M

**Goal.** Cover the editor's core rules.

**Tasks**
- Front (Vitest): `serialize`/`parse` round-trip + `buildMd` parity; autosave
  debounce + flush-on-blur; public→private confirmation; SaveStatus transitions.
- Back (pytest): consolidated PATCH persists all fields + `updated_at`;
  owner-only visibility change (FR-N5).

**Acceptance criteria**
- [x] Markdown round-trip + `buildMd` parity tested.
- [x] Autosave debounce/flush and SaveStatus states tested.
- [x] Owner-only visibility change tested; public→private removes from public tab.
- [x] CI green.

**Notes.** Builds on E3-S8.

---

## Definition of "E4 done"

- [x] Text + checkbox editing with "Insérer une case" at the bottom.
- [x] Body persisted as correct GFM Markdown (title separate).
- [x] 3-state autosave (~1.5 s + flush on blur), distinct from the last-version subtitle.
- [x] Color picker + visibility toggle with public→private confirmation.
- [x] Editor faithful (modal ≥ tablet / full-screen mobile), light + dark.
- [x] Editor tests green in CI. **Lock is added in E5.**
