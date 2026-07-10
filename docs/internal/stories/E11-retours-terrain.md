# E11 — Field-feedback follow-up — Detailed stories

> Epic goal: fold the **field feedback** gathered after the first real use of
> Keepou (notably a ~300-note Google Keep import) into concrete, shippable
> improvements to the board, the editor, deletion and the user profile.
>
> Estimation convention: **S** (≤ ½ day), **M** (1–2 days), **L** (3+ days).

**Reference docs.** `design/HANDOFF.md` §7 (French copy), `docs/ARCHITECTURE.md`
§4 (permissions) / §8 (auth), `design/claude.md`. Visual source of truth: the
existing `design/Keepou - *.dc.html` mockups (Board, Éditeur). **Depends on**
E3 (board), E4/E5 (editor + lock), E8 (pin/archive), E10 (Keep import — the
source of the feedback). No new product rule: everything here is additive UX
plus one small profile endpoint.

**Raw feedback → story map**

| # | Feedback (verbatim, FR) | Story |
|---|---|---|
| 1 | Retour en arrière garde la sélection public / privée | E11-S1 |
| 2 | Hard delete d'une note (à côté d'archiver) | E11-S2 |
| 3 | Permettre à l'utilisateur de changer son nom d'affichage | E11-S4 |
| 4 | Hard delete depuis « Archives » avec multi-sélection (+ tout sélectionner) | E11-S2 |
| 5 | Épingler / archiver / supprimer depuis l'édition d'une note | E11-S3 |
| 6 | Réinitialiser la recherche avec une croix dans le champ | E11-S1 |
| 7 | Maj + Entrée pour enregistrer une note en cours d'édition | E11-S3 |
| 8 | Rendu fenêtré pour ne pas tout charger (300 notes, démarrage lent) | E11-S5 |
| 9 | Trier par date de dernière modification | E11-S1 |
| 10 / 11 | Afficher tout / public / privé — couvert par l'onglet « Mes notes / Public » | E11-S1 |
| 12 | Afficher l'année en plus de la date (notes Keep anciennes) | E11-S1 |

---

## Stories at a glance

- [x] **E11-S1** — Board list controls: sort selector (Modifié/Créé/Titre),
      search reset (✕), year in old dates, and preserving the board view when
      returning from the editor. (A separate Tout/Public/Privé visibility filter
      was shipped then removed — it duplicated the top-right « Mes notes / Public »
      tab; see the follow-up note below.)
- [x] **E11-S2** — Hard delete: card ⋯ « Supprimer définitivement » (confirm) +
      archive multi-select with « Tout sélectionner » and a bulk delete
- [x] **E11-S3** — Editor: owner ⋯ menu (pin / archive / hard delete) + `Maj+Entrée`
      to save & close
- [x] **E11-S4** — Profile: `PATCH /api/auth/me` + a « Modifier mon nom » dialog
- [x] **E11-S5** — Windowed rendering of the board (render a growing slice so a
      300-note board mounts instantly)

---

## E11-S1 — Board list controls & return-state · L

**Goal.** Make a large, imported board actually navigable: sort it, clear the
search in one click, read real years on old notes, and never lose your place
when you open and close a note.

**Tasks**
- **Visibility filter (#10/#11) — removed.** A segmented **Tout / Public / Privé**
  control was shipped on **Mes notes** (driven by `?vis=`) but then removed: it
  duplicated the top-right **« Mes notes / Public »** tab that already separates
  own private notes from public ones, so users saw two overlapping public/privé
  toggles. See the follow-up note at the end of this story.
- **Sort selector (#9).** **Modifié** (last edit, default) / **Créé** (creation
  date) / **Titre** (A→Z, accent-insensitive), driven by `?sort=`. Client-side,
  **pinned notes always first**. « Modifié » matches the server's default order,
  so nothing regresses; the import preserves real Keep dates (E10) so the sort
  is meaningful.
- **Search reset (#6).** A ✕ button inside the search field when it is non-empty;
  clears the query and refocuses the input.
- **Year in dates (#12).** `formatRelative` (and the history day labels) append
  the year when the date is **not in the current year** (« le 13 sept. 2020 »),
  so imported Keep notes read correctly. Recent dates are unchanged.
- **Return-state (#1).** Opening a note carries the board's current URL as
  navigation state (`from`); the editor's back / close / `Échap` returns there,
  preserving the tab and the sort.

**Acceptance criteria**
- [x] The board can be sorted by last edit (default), creation date or title,
      pinned always first.
- [x] The search field shows a ✕ that clears it and refocuses it.
- [x] Dates outside the current year show the year, on cards and in history.
- [x] Opening then closing a note returns to the same tab + sort.
- [x] Front tests cover sort, reset, year and return-state.

---

## E11-S2 — Hard delete (single + archive multi-select) · M

**Goal.** Let an owner permanently delete a note — one at a time from any board,
and in bulk from the archive — with an explicit, irreversible confirmation.

**Tasks**
- **API wiring.** `deleteNote(id)` → the existing owner/admin `DELETE
  /api/notes/{id}` (E3; deletes the note and its versions). No backend change.
- **Card action (#2).** In the card ⋯ menu (all boards, owner only), add
  **« Supprimer définitivement »** below Archiver / Désarchiver, behind a
  confirmation dialog (irreversible; the history is deleted too). Optimistic
  removal, resync on failure.
- **Archive multi-select (#4).** In the archived view, a checkbox per card, a
  **« Tout sélectionner » / « Tout désélectionner »** toggle and a **« Supprimer
  définitivement (N) »** action over the whole selection (behind one confirm).
  Selecting works over the full filtered list, not just the rendered window.

**Acceptance criteria**
- [x] A note can be permanently deleted from its card menu, after confirmation.
- [x] The archived view offers per-card selection, select-all, and a bulk
      permanent delete guarded by a single confirmation.
- [x] Deletion is optimistic and resyncs from the server on failure.
- [x] Front tests cover single delete, multi-select, select-all and bulk delete.

**Notes.** Hard delete of a **note** is distinct from « disable, never delete » —
that rule is about **user accounts** (claude.md §5), not notes; notes have always
had `DELETE /api/notes/{id}` (FR-N6).

---

## E11-S3 — Editor organization & shortcut · M

**Goal.** Bring the board's owner actions into the editor and add a keyboard
save.

**Tasks**
- **Owner ⋯ menu (#5).** In the editor header, an owner-only menu:
  **Épingler / Ne plus épingler**, **Archiver**, **Supprimer définitivement**
  (confirm). Pin updates in place; archive and delete flush, then return to the
  board. Lock-free owner metadata (E8) — allowed even on a note someone else is
  editing, exactly like the server permits.
- **Maj+Entrée (#7).** `Shift+Enter` anywhere in the editor **saves and closes**
  (flush → return to board). Handled in the editor's capture phase so it never
  inserts a stray newline in a paragraph or checkbox line; plain `Enter` keeps
  its paragraph / checklist behavior.

**Acceptance criteria**
- [x] The editor exposes pin / archive / hard delete for the owner only.
- [x] Archiving or deleting from the editor returns to the board; pinning stays.
- [x] `Shift+Enter` saves and closes without leaving a newline behind.
- [x] Front tests cover the menu actions and the shortcut.

---

## E11-S4 — Change display name · S

**Goal.** Let a member fix / change the name shown on their notes and avatar.

**Tasks**
- **Back.** `PATCH /api/auth/me {display_name}` (authenticated, self only):
  trims, `1..80` chars, returns the updated `UserOut`. `ProfilePatch` schema.
- **Front.** `updateMe(display_name)` + an avatar-menu entry **« Modifier mon
  nom »** opening a small dialog (input prefilled, Enregistrer / Annuler,
  inline error). On success the auth context updates so the avatar initial,
  the menu and future « Modifié par » reflect the new name immediately.

**Acceptance criteria**
- [x] A member can change their display name from the avatar menu.
- [x] The new name is validated server-side (1..80, trimmed) and reflected in
      the UI without a reload.
- [x] Tests cover the endpoint (self-update, validation) and the dialog.

**Notes.** Names are not unique (they never were); email stays the identity.

---

## E11-S5 — Windowed board rendering · S

**Goal.** A 300-note board must mount instantly — render a growing slice instead
of all cards at once.

**Tasks**
- A render window: show the first ~48 cards, then grow by a page when a sentinel
  near the bottom scrolls into view (`IntersectionObserver`). Reset when the
  effective list changes (tab / filter / sort / search / archived). Degrades to
  « render everything » where `IntersectionObserver` is absent (SSR / tests).
- Selection and search still operate over the **full** list, not the window.

**Acceptance criteria**
- [x] A board with hundreds of notes renders a small initial slice, then reveals
      more on scroll.
- [x] Filtering / sorting / searching reset the window to the top.
- [x] No regression where `IntersectionObserver` is unavailable.

**Notes.** The API still returns the full set in one call (300 rows is cheap);
the cost was the DOM, so the window is purely client-side.

---

## Definition of "E11 done"

- [x] Board is sortable (Modifié/Créé/Titre), the search resets in one click,
      and old notes show their year.
- [x] Opening and closing a note preserves the tab and sort.
- [x] Notes can be hard-deleted from the card, the editor, and in bulk from the
      archive (select-all included), each behind a confirmation.
- [x] Pin / archive / delete are reachable from the editor; `Shift+Enter` saves.
- [x] Members can change their display name.
- [x] Large boards mount instantly (windowed rendering).
- [x] Front + back tests green in CI; docs (EPICS, ARCHITECTURE, HANDOFF §7) synced.

---

## Follow-up — visibility filter removed (duplicate of the tab)

The E11-S1 **Tout / Public / Privé** visibility filter (`?vis=`, rendered under
the composer) was removed after field use: it overlapped the existing top-right
**« Mes notes / Public »** tab (`?tab=`), leaving two public/privé toggles on the
same screen. The tab already separates a member's own notes from the shared
public board, so the extra filter was redundant.

Removed: `web/src/components/VisibilityFilter.tsx`, the `?vis=` parsing / state /
client filter in `BoardPage.tsx`, the `filterLabel` / `filterAll` / `filterPublic`
/ `filterPrivate` copy in `web/src/lib/copy.ts`, and the associated front test.
The « Mes notes / Public » tab and the sort selector are unchanged.

---

## Follow-up — density selector & instant open/close

Two field asks after living with a large imported board:

- **Density selector.** Next to the sort selector, a native `<select>` **Notes
  entières / Aperçu** (`?density=`, default « Notes entières »). « Aperçu » caps
  each card body (`.kp-note__body--compact`, `max-height` + `overflow: hidden`) so
  long notes stop forcing a long scroll and more cards fit on one screen. It is
  display-only — it never changes which notes show or their order, and so is not
  part of the render-window reset key. Copy: `densityLabel` / `densityFull` /
  `densityCompact` in `web/src/lib/copy.ts`; component
  `web/src/components/DensitySelect.tsx`.

- **Instant open / close.** Opening or closing a note flashed « Chargement… »
  because the editor is a separate route: opening always refetched the note, and
  closing remounted BoardPage from a blank state and refetched the whole list.
  Now:
  - a **module-level board cache** (`web/src/lib/boardCache.ts`) keeps the
    last-fetched lists across the editor round-trip; BoardPage renders the cached
    list immediately (stale-while-revalidate) and reconciles with a background
    `listNotes()`. The editor **upserts** the note it just saved (and removes it on
    archive / delete) so the board reflects the change without waiting for the
    refetch — the optimistic update. The cache is cleared on sign-out / session
    expiry.
  - **opening a card passes the already-loaded note** in navigation state, so the
    editor paints from it synchronously; `getNote` becomes a silent revalidation
    that never blocks and never clobbers edits in progress (a bare deep link with
    no seed still loads normally).

  Tests: `web/src/lib/boardCache.test.ts` (store), a board density test, and an
  editor seed test (a hung `getNote` still paints instantly from the seed).
