# Keepou — EPICS breakdown (macro)

> **Purpose of this document.** Propose a **macro** breakdown of Keepou's development into
> epics, based on the validated mockups and the handoff (`design/HANDOFF.md`,
> `design/claude.md`). We stay at the **epic** level; the **detailed stories** are
> written epic by epic in the [`stories/`](./stories/) folder as we start each one.
>
> Visual source of truth: the `design/Keepou - *.dc.html` files.
> Non-negotiable product rules: `design/claude.md`.

**Progress** — `[x]` epic shipped · `[ ]` not yet · 🔨 in progress · ✅ stories detailed · ⏳ stories TBD:
- [x] **E0** — Foundations & design system · ✅ detailed → [`stories/E0-fondations.md`](./stories/E0-fondations.md) — *shipped (S3's 1st migration landed with E2-S1)*
- [ ] 🔨 **E1** — Railway deployment · ✅ detailed → [`stories/E1-deploiement-railway.md`](./stories/E1-deploiement-railway.md) — *live on Railway (S1/S3/S4/S5 done, auto-deploy on `main`); bearer-auth endpoints shipped (E2) — verify in prod after the next deploy; remaining: PR previews (S7)*
- [x] **E2** — Authentication & allowlist · ✅ detailed → [`stories/E2-authentification.md`](./stories/E2-authentification.md) — *shipped (bootstrap admin, allowlist gate, JWT bearer, login/register/denial screens, tests)*
- [x] **E3** — Board & note management · ✅ detailed → [`stories/E3-board-notes.md`](./stories/E3-board-notes.md) — *shipped (Note model + CRUD API, Mes notes/Public tabs, composer, faithful cards, masonry 4→2, client-side search, tests)*
- [x] **E4** — Note editor · ✅ detailed → [`stories/E4-editeur-note.md`](./stories/E4-editeur-note.md) — *shipped (consolidated PATCH, `lib/markdown.ts` blocks ⇄ GFM, modal/full-screen editor, BlockList + « Insérer une case à cocher », 3-state autosave + flush on blur/close, color picker, public→private confirmation, tests)*
- [x] **E5** — Single-editor lock & real-time · ✅ detailed → [`stories/E5-verrou-temps-reel.md`](./stories/E5-verrou-temps-reel.md) — *shipped (lock columns migration, atomic acquire/renew/release + PATCH enforcement with structured 409, lock state in the note payload, `useNoteLock` heartbeat 20 s / poll ~12 s / release on close & `beforeunload`, LockBanner 4 states + read-only, tests back & front)*
- [x] **E6** — History & versions · ✅ detailed → [`stories/E6-historique-versions.md`](./stories/E6-historique-versions.md) — *shipped (`NoteVersion` migration, creation root « Créée par X », one version per session on lock release / editor close with a no-op guard, newest-first visibility-gated `GET .../versions`, restore = new version — lock-checked, visibility owner-only —, HistoryPanel desktop + mobile 2-screen flow, tests back & front)*
- [x] **E7** — Access administration · ✅ detailed → [`stories/E7-administration.md`](./stories/E7-administration.md) — *shipped (admin router: members LEFT JOIN, allowlist add / pending-only remove, role/status PATCH + last-admin guard; AccessManager tabs + counters, MemberRow ⋯ menu, PendingRow « Retirer », admins-only « Administration » avatar-menu entry, tests back & front)*
- [ ] 🔨 **E8** — Polish (PWA, a11y, formatting, **pin + archive**, i18n, quality) · ✅ detailed → [`stories/E8-polish-pwa-a11y-i18n.md`](./stories/E8-polish-pwa-a11y-i18n.md) — *S1–S11 shipped (PWA install surface + minimal SW, a11y pass + ink-contrast policy, FR copy centralized in `lib/copy.ts`, tests + CI green, mobile-keyboard handling, autofill markup, dark tokens WCAG AA, inline bold/italic/headings as-you-type, text under a checkbox, **pin + archive** — `Note.pinned`/`archived` migration, owner-only lock-free PATCH, `?archived=` view, card ⋯ menu + pinned-first ordering, new notebook+pen logo/icon set); remaining: on-device checks only (Android/iOS install & keyboard, Bitwarden)*
- [ ] **E9** — Database cold backups & restore · ✅ detailed → [`stories/E9-backups-restore.md`](./stories/E9-backups-restore.md) — *Scaleway Object Storage + Railway cron*
- [x] **E10** — Import from Google Keep · ✅ detailed → [`stories/E10-import-keep.md`](./stories/E10-import-keep.md) — *shipped (Takeout parser, preview/confirm endpoints, validated mockup `Keepou - Import Keep.dc.html`, `/import` flow — upload → review « mode tunnel » → summary —, tests back & front, user how-to)*
- [x] **E11** — Field-feedback follow-up · ✅ detailed → [`stories/E11-retours-terrain.md`](./stories/E11-retours-terrain.md) — *shipped (board visibility filter + sort selector + search reset + year-in-old-dates + return-state; hard delete from the card, the editor and archive multi-select/select-all; owner pin/archive/delete + `Maj+Entrée` in the editor; self-service display-name change `PATCH /api/auth/me`; windowed board rendering; tests back & front)*

---

## Overview & sequencing

| # | Epic | Core | Depends on |
|---|------|------|-----------|
| **E0** | Foundations & design system | Monorepo, tooling, tokens, theme, responsive layout | — |
| **E1** | Railway deployment (CD-first) | Railway project, Postgres, API + front services, migrations at deploy, CI/CD | E0 |
| **E2** | Authentication & allowlist | Accounts, sessions, server allowlist, rejection | E0 |
| **E3** | Board & note management | Note CRUD, My notes/Public tabs, composer, cards | E0, E2 |
| **E4** | Note editor | Text + checkboxes, GFM Markdown, autosave, color, visibility | E3 |
| **E5** | Single-editor lock & real-time | Atomic acquisition, heartbeat, expiration, conflict, read-only | E4 |
| **E6** | History & versions | Versioning (1 session = 1 version), preview, restore | E4, E5 |
| **E7** | Access administration | Allowlist, members/pending, roles, enable/disable | E2 |
| **E8** | Polish: PWA, a11y, formatting, i18n, quality | Manifest, accessibility, **inline formatting + text under a checkbox**, **pin + archive**, copy centralization, tests/CI | all |
| **E9** | Database cold backups & restore | Scheduled off-site `pg_dump`, retention, tested restore | E1 |
| **E10** | Import from Google Keep | Takeout ZIP upload, server-side parse/mapping, bulk-create private notes | E3 |
| **E11** | Field-feedback follow-up | Board filter/sort/search-reset/year + return-state, hard delete (card/editor/archive bulk), editor owner actions + Maj+Entrée, display-name change, windowed rendering | E3, E4, E8, E10 |

**Recommended critical path:** `E0 → E1 → E2 → E3 → E4 → E5 → E6`. **E1 (Railway)** is placed
early on purpose: as soon as the scaffold runs, we wire up continuous deployment so **each
following epic ships to prod automatically**. **E7** can be parallelized as soon as E2 is done.
**E8** is cross-cutting, hardened at the end. E5 and E6 are strongly coupled (a version
is born when the lock is released): chain them together.

```
E0 ──▶ E1 (continuous deploy) ──▶ E2 ──▶ E3 ──▶ E4 ──▶ E5 ──▶ E6
                               └────────────▶ E7   (in parallel once E2 is done)
E8: cross-cutting, hardened at the end
E9: DB cold backups, once the DB is live (after E1)
E10: import from Google Keep, in parallel once E3 (Note model) is done
```

---

## E0 — Foundations & design system

**Goal.** Lay down a monorepo that boots (front + back), the tooling, and **translate the
mockups' tokens into a reusable design system** so all following screens are
"pixel-faithful" without reinventing the palette.

**Scope — Back (`api/`)**
- Bootable FastAPI app, CORS, `/api/health` route.
- DB connection + `get_session`, config via env, Alembic scaffold.
- Conventions: Pydantic in/out schemas, `HTTPException` error handling.

**Scope — Front (`web/`)**
- Bootable React + Vite + TS app, React Router, `api/client.ts` wrapper (bearer token, typed errors).
- **Design tokens** (light + dark CSS variables) taken **exactly** from handoff §1.
- **Fonts**: Fredoka (brand/titles), Nunito Sans (UI/text), IBM Plex Mono (labels/timestamps).
- **Theme**: `data-theme="light|dark"`, honor `prefers-color-scheme` + persistent override (localStorage).
- **Layout/responsive**: containers, topbar (blur), breakpoint ~640px.

**Mockups.** All (cross-cutting reference) — especially `Keepou - Board.dc.html`.

**Related rules.** Visual fidelity (`claude.md`). No heavy UI dependency.

**Done when.** Both apps boot, the front shows a reference page with the right
tokens/fonts, light/dark toggle works, CI lint/build green.

➡️ **Detailed stories: [`stories/E0-fondations.md`](./stories/E0-fondations.md)**

---

## E1 — Railway deployment (CD-first)

**Goal.** Get Keepou **online on Railway from the foundations onward**, with a managed
**PostgreSQL** database, **migrations run at deploy**, and **continuous deployment**
on push — so each following epic reaches prod with no manual effort.

**Scope — Infra / Railway**
- Railway project + managed **PostgreSQL** (`DATABASE_URL`).
- **API** service (FastAPI): Nixpacks/Dockerfile build, `uvicorn` on `$PORT`, healthcheck `/api/health`, root dir `api/`.
- **Front** service (Vite): static build served, `VITE_API_URL` → API public URL.
- **Alembic migrations** run automatically at deploy (pre-deploy command).
- **CD**: auto deploy on push (GitHub integration), preview per PR.
- **Prod security**: front-origin CORS, JWT bearer auth (short access TTL), HTTPS.

**Scope — Code**
- **PostgreSQL** driver (psycopg) added; normalization of the Railway URL scheme.
- Deployment config files (`railway.json`/`nixpacks`, build/start commands).
- Documented environment variables (back + front).

**Mockups.** — (infra epic, no screen).

**Related rules.** Server auth (JWT bearer, server-checked) · server allowlist/lock remain the reference.

**Done when.** API + front reachable via Railway URLs, Postgres connected, migrations
auto at deploy, push to the branch → deployment, prod security checklist ticked.

➡️ **Detailed stories: [`stories/E1-deploiement-railway.md`](./stories/E1-deploiement-railway.md)**

---

## E2 — Authentication & allowlist

**Goal.** Allow **creating an account (gated by the allowlist)** and **logging in**,
with all the error states from the mockups. The allowlist is checked **server-side**.

**Scope — Back**
- `User` model (email, display_name, password_hash, role, status) + `AllowlistEntry`.
- `POST /api/auth/register` `{email, password, display_name}` → **403** if e-mail not in allowlist, **201** + `{access, refresh}` otherwise (passlib/bcrypt hash).
- `POST /api/auth/login` `{email, password}` → **401** credentials, **403** if `status=DISABLED`; returns `{access, refresh}`.
- `POST /api/auth/refresh` (refresh → new access token), `GET /api/auth/me` (current user + role); logout is client-side.
- **JWT bearer** sessions (access + refresh tokens), `get_current_user` dependency.

**Scope — Front**
- **Login** and **Create account** screens.
- Inline messages: wrong credentials (terracotta), **disabled account** (gold).
- **Unauthorized access** screen (allowlist rejection) → **Retour à la connexion** button.
- Client-side route guard (redirect if not authenticated).

**Mockups.** `Keepou - Auth.dc.html`.

**Related rules (claude.md).** §4 server allowlist · §5 disable ≠ delete. No "access request" or in-app admin contact.

**Frozen copy.** HANDOFF §7 "Auth".

**Done when.** Registration blocked outside the allowlist, login OK/KO and disabled account handled, session established, `/api/auth/me` used by the front.

---

## E3 — Board & note management

**Goal.** The main board: list, create, and navigate your notes; switch **My
notes / Public**; quick composer; faithful cards (color, checklist, meta).

**Scope — Back**
- `Note` model (title, body Markdown, color, visibility, owner, timestamps).
- `GET /api/notes?tab=mine|public`, `POST /api/notes` (create), `GET /api/notes/{id}`.
- `PATCH /api/notes/{id}` (base; fine-grained editing comes in E4).
- `DELETE /api/notes/{id}` — delete a note, **owner or admin** (FR-N6).
- **Public** tab = `PUBLIC` notes from all members (author + last-modified date).

**Scope — Front**
- **Topbar** (logo, search, pill tabs, theme, avatar + menu).
- **TabSwitch** My notes / Public · **Composer** (quick input + color + public toggle).
- **NoteCard** (5 shades, Fredoka title, read-only checklist, visibility/author badge).
- **NoteGrid** masonry `column-count` 4→2 responsive · search (minimal client-side filter).

**Mockups.** `Keepou - Board.dc.html`.

**Related rules.** §7 reversible visibility (toggle; public→private confirmation in E4). Color stored as an identifier (`gold|avocat|salsa|clay|teal`).

**Done when.** You can see/create notes, tabs work, board faithful light + dark, desktop + mobile.

---

## E4 — Note editor (text + checkboxes + Markdown + autosave)

**Goal.** The canonical editor: **modal ≥ tablet / full screen < ~640px**, mix of
paragraphs + checkboxes, **GFM Markdown persistence**, **autosave**, color
picker, private/public toggle with confirmation.

**Scope — Back**
- Body persistence in **Markdown** (title stored separately).
- Consolidated `PATCH /api/notes/{id}` (title, body, color, visibility) + `updated_at`.
- Public→private confirmation (the note disappears from others' public board).

**Scope — Front**
- **NoteEditor** (desktop modal / mobile full-screen shell) · **BlockList** (paragraphs + checkboxes; **"Insérer une case" at the bottom**).
- **ColorPicker** (5 shades) · **VisibilityToggle** (+ public→private confirmation).
- **SaveStatus**: `Modifié` → `Enregistrement…` → `Enregistré · à l'instant`, **distinct** from "last saved version".
- **lib/markdown.ts** (mirror of `buildMd`) · **useAutosave hook** (debounce ~1.5 s + flush on blur).

**Mockups.** `Keepou - Éditeur canonique.dc.html`, `Keepou - Éditeur & verrou.dc.html`.

**Related rules (claude.md).** §2 autosave · §3 versioning (version created in E6 when the lock is released) · §7 public→private confirmation · GFM Markdown from the MVP.

**Frozen copy.** HANDOFF §7 "Save" and "Visibility".

**Done when.** Text + checkbox editing, checkbox insertion, correct Markdown, 3-state autosave, visibility toggle + confirmation. **Without a lock** yet (added in E5).

---

## E5 — Single-editor lock & real-time

**Goal.** Guarantee that **only one person edits a note at a time**, with the **4
states** from the mockups (yours / locked by another / expired-takeover / conflict), in
read-only for the others, updated in near real-time.

**Scope — Back**
- Lock fields on `Note` (`locked_by_id`, `locked_at`, `lock_expires_at`).
- `POST /api/notes/{id}/lock` (acquire/renew) → **409** if held by another + who holds it · `DELETE /api/notes/{id}/lock`.
- **Atomic acquisition**: `UPDATE ... WHERE locked_by_id IS NULL OR lock_expires_at < now` (0 rows → conflict).
- `locks.py` service (acquisition / renewal / release / expiration / conflict) · state broadcast (poll or SSE).

**Scope — Front**
- **useNoteLock hook** (heartbeat ~20 s, expiration ~60 s, states) · **LockBanner** (4 states).
- **Read-only** mode + **Modifier la note** button (takeover) / **Passer en lecture seule** (conflict).
- "Dernière édition par X" line (desktop **and** mobile).

**Mockups.** `Keepou - Éditeur & verrou.dc.html`.

**Related rules (claude.md).** §1 single-editor lock — **never concurrent editing**, **no CRDT/OT**, no persistent draft.

**Frozen copy.** HANDOFF §7 "Lock".

**Done when.** The 4 states reproduced, conflict decided server-side, real-time read-only, takeover after expiration.

---

## E6 — History & versions

**Goal.** Keep history (**1 editing session = 1 version**), let you **preview a version
read-only** and **restore** it (never overwrite).

**Scope — Back**
- `NoteVersion` model (author, timestamp, snapshot title/body/color/visibility) + `(note_id, created_at)` index.
- Version created **when the lock is released**.
- `GET /api/notes/{id}/versions` · `POST /api/notes/{id}/restore/{version_id}` (→ **new** version).

**Scope — Front**
- **HistoryPanel** desktop (list + preview) · **VersionRow** · **VersionPreview** · **RestoreConfirm**.
- **2-screen mobile flow**: list (chevrons) → **read-only preview** → **Fermer / Restaurer** bar.
- No visual diff: we **re-render the version as-is**.

**Mockups.** `Keepou - Historique.dc.html`.

**Related rules (claude.md).** §3 versioning · **no visual diff**, a single **Restaurer** button.

**Frozen copy.** HANDOFF §7 "History".

**Done when.** List of who/when, read-only preview (desktop + mobile), restore creates a new version, nothing is overwritten.

---

## E7 — Access administration

**Goal.** Give the admin management of the **allowlist** and **members** (registered
vs pending), roles, **enable/disable** — **never delete**.

**Scope — Back**
- `require_admin` dependency; `/admin` route **server-protected**.
- `GET /api/admin/members` (Users + Allowlist LEFT JOIN on email).
- `POST /api/admin/allowlist {email}` · `DELETE /api/admin/allowlist/{id}` (pending entries only).
- `PATCH /api/admin/users/{id} {role|status}` (ACTIVE|DISABLED, **never delete**).

**Scope — Front**
- **AccessManager** (Membres / Invités en attente tabs + counters) · **MemberRow** · **PendingRow**.
- **Ajouter un e-mail** · member menu **Promouvoir admin** / **Désactiver le compte**.
- **Entry point** "Administration" in the avatar menu, **admins only**.

**Mockups.** `Keepou - Admin.dc.html`.

**Related rules (claude.md).** §5 disable, never delete · §6 `/admin` server-protected.

**Frozen copy.** HANDOFF §7 "Admin".

**Done when.** Allowlist manageable, statuses/roles editable, disable reversible, admin route refused server-side, entry hidden from non-admins.

---

## E8 — Polish: PWA, accessibility, formatting, i18n, quality

**Goal.** Harden and finalize: installable, accessible, richer note formatting, centralized strings, tested.

**Scope**
- **PWA**: manifest (icon = mascot), favicon, apple-touch metadata, minimal SW — **installable + pinnable to the mobile home screen** (Android install prompt / iOS "Ajouter à l'écran d'accueil").
- **Text formatting** (E8-S9/S10): **inline Markdown recognized as you type** — bold `**`, italic `*`, headings `#` (bounded subset, no toolbar/selection step), rendered in every read-only surface; and **normal text under a checkbox** — two line breaks exit the checklist (drop the « only a checkbox can follow a checkbox » restriction). Bodies are already GFM Markdown (E4), so **no migration** — this is recognition/rendering + editor interaction. Checkboxes stay unchanged.
- **Archive** (FR-N8): **starts with a design phase** — there is no mockup yet, so first **design the archive UI** (per the design-driven workflow in `design/claude.md` / `HANDOFF.md`), then implement archive / unarchive (hide from the board without deleting) + the `?archived=` board filter + the `Note.archived` field.
- **A11y**: real `<input type=checkbox>` + labels, labeled fields, `role="status"`/aria-live lock banners, contrasts OK, mobile hit targets ≥ 44px.
- **Dark-mode legibility**: fix the "on voit pas bien" cases (low-contrast text, washed-out card shades, faint borders) via the **dark token set** (HANDOFF §1) to WCAG AA.
- **Mobile keyboard**: keep the focused input and its primary button above the on-screen keyboard (auth, composer, editor, admin).
- **Password-manager autofill**: recognizable login form so Bitwarden (and built-in managers) autofill and offer to save the password.
- **i18n**: centralize the FR copy (HANDOFF §7).
- **Quality**: back tests (allowlist, atomic lock, versioning), key front tests, CI lint/build/test.

**Mockups.** All (state & responsive verification).

**Done when.** App installable **and pinnable to the home screen**, **inline formatting (bold/italic/headings) recognized as you type + text allowed under a checkbox**, archive **designed then built** (hide/restore + filter), a11y verified, **dark mode legible everywhere (WCAG AA)**, mobile keyboard never hides inputs/buttons, password managers autofill the login, strings centralized, test suite green in CI.

---

## E9 — Database cold backups & restore

**Goal.** Never lose data: take regular **off-site** backups of the PostgreSQL
database and be able to **restore** them.

**Scope — Backups**
- Scheduled **logical dump** (`pg_dump`, compressed) of the prod DB — e.g. a daily
  cron / scheduled job. "Cold" = a consistent point-in-time dump, **not** continuous
  replication (hot standby / PITR are out of scope for the MVP).
- Store dumps **off Railway** (external object storage — S3-compatible / Backblaze
  B2 — or a pulled copy) so a Railway-side incident can't take the backups with it.
- **Retention** (e.g. 7 daily + 4 weekly) + an integrity check of each dump.
- Backup-target credentials in env (secrets); a **failure alert** is nice-to-have.

**Scope — Restore**
- A documented, **tested** restore: `pg_restore`/`psql` into a fresh database,
  `alembic upgrade head` if needed, then verify (row counts / a smoke read).
- Record in the runbook the restore time and the data-loss window (= backup interval).

**Depends on.** E1 (the DB must be deployed). Wire it **as soon as the DB is live**,
ideally **before real user data accumulates** (right after E1/E2).

**Related rules.** The DB is the single source of truth — "disable, never delete"
(users) and append-only history mean nothing should be lost; protect it.

**Done when.** Automated backups run on schedule and land off-site, retention is
enforced, dumps pass an integrity check, and a **full restore has been performed
end-to-end at least once** (runbook written).

---

## E10 — Import from Google Keep

**Goal.** Let a member **bring their existing Google Keep notes into Keepou**, so
leaving Keep doesn't mean abandoning years of notes.

**Scope — Source**
- **Google Takeout** is the import source (the only realistic path): the Keep REST
  API is **Workspace-only** and unusable on personal Gmail; the unofficial
  `gkeepapi` is fragile and ToS-grey. Each user runs their **own** Takeout and
  imports their **own** notes. A Takeout export gives one **JSON per note** under
  `Takeout/Keep/` (title, `textContent`, `listContent[]`, color, timestamps, flags).

**Scope — Back**
- `services/keep_import.py`: pure mapping Keep JSON → Keepou fields — body as **GFM
  Markdown** (same shape as `web/src/lib/markdown.ts`), a **color mapping** (Keep's
  ~12 colors → the 5 shades), **µs timestamps → `created_at`/`updated_at`**, skip
  `isTrashed`, drop images/labels/pin.
- **Two endpoints** for a preview-then-confirm flow (deterministic file order → a
  **stable index**): `POST /api/import/keep/preview` (unzip + parse, **no writes**,
  returns the parsed notes) and `POST /api/import/keep` (same ZIP **+ selected
  indices** → bulk-create **only the selected** in **one transaction**, forced
  `PRIVATE`, `owner_id` = caller, each with its « Créée par X » **creation version**
  at the imported date). Returns a summary (imported / duplicate / failed).

**Scope — Front (design-gated)**
- Avatar-menu entry « Importer depuis Google Keep », a **3-screen flow**: upload
  (help text + Takeout link + `.zip` picker) → **review/selection view (« mode
  tunnel »)** where the member **checks/unchecks the notes to keep** (trashed
  pre-unchecked, « Tout cocher / décocher », live count) → **result summary**. No
  mockup yet → a short design pass first (design-driven workflow), French copy
  centralized.

**Key decisions (validated).** Parsing is **server-side** · a **review/selection
step** lets the member do their cleanup and import **only the checked notes** ·
**images ignored** (MVP; Keepou has no image support) · **original Keep dates
preserved** · imported notes are **PRIVATE** (owner can flip them public afterwards).

**Depends on.** E3 (the `Note` model + creation version) — imports go through the
same create + versioning path as any note. No schema change (dates already exist on
`Note`; the MVP dedups by content match, no new column).

**Related rules (claude.md).** Bodies are **GFM Markdown** from the MVP (no
migration) · visibility is **owner-only** (imported private) · UI copy stays
**French**, docs in English.

**Done when.** A member exports from Takeout, **reviews the parsed notes and
checks/unchecks** the ones to keep (« mode tunnel »), and imports **only the checked
ones** in a few clicks; title/text/checklists faithful, colors mapped, **Keep dates
preserved**; trashed pre-unchecked, images/labels ignored; each note gets its
history root at the Keep date; the flow matches the design system; back tests + a
user how-to written.

➡️ **Detailed stories: [`stories/E10-import-keep.md`](./stories/E10-import-keep.md)**

---

## E11 — Field-feedback follow-up

**Goal.** Fold the **field feedback** gathered after the first real use of Keepou
(notably a ~300-note Google Keep import) into concrete, shippable improvements to
the board, the editor, deletion and the user profile — additive UX, no new
product rule.

**Scope — Board (`web/`)**
- **Visibility filter** on Mes notes (Tout / Public / Privé, default Tout,
  `?vis=`), **sort selector** (Modifié / Créé / Titre, `?sort=`, pinned first),
  **search reset** (✕), **year** shown on dates outside the current year, and a
  **return-state** so opening then closing a note keeps the tab / filter / sort.
- **Windowed rendering**: render a growing slice (`useRenderWindow`) so a large
  imported board mounts instantly instead of laying out every card at once.

**Scope — Deletion**
- **Hard delete** wired to the existing `DELETE /api/notes/{id}`: from the card ⋯
  menu, from the editor's owner menu, and as a **bulk delete** in the archived
  view (per-card selection + « Tout sélectionner »), each behind a confirmation.

**Scope — Editor / profile**
- Editor **owner ⋯ menu** (pin / archive / hard delete) and **`Maj+Entrée`**
  (save & close, capture-phase so it never inserts a newline).
- **Change display name**: `PATCH /api/auth/me {display_name}` + a « Modifier mon
  nom » dialog, reflected immediately in the UI.

**Related rules.** Hard delete concerns **notes** (FR-N6), not accounts — the
« disable, never delete » rule (claude.md §5) is about **user accounts** and is
untouched. Server-side permissions (owner/admin) are unchanged; the profile
endpoint edits only the caller's own display name.

**Done when.** The board is filterable / sortable / resettable and shows real
years; opening a note preserves the view; notes are hard-deletable from card,
editor and archive (bulk); the editor exposes pin/archive/delete + `Maj+Entrée`;
members can rename themselves; large boards mount instantly; tests green in CI.

➡️ **Detailed stories: [`stories/E11-retours-terrain.md`](./stories/E11-retours-terrain.md)**

---

## Cross-cutting (present in each epic)

- **Visual fidelity**: exact tokens; light **and** dark; desktop **and** mobile.
- **Server security**: allowlist, admin role, lock — **always** server-side.
- **Markdown**: note bodies in GFM from the MVP (no future migration).
- **Tests** as we go on the critical business rules.

---

## Next step

**E0, E1 (core), E2, E3, E4, E5, E6, E7, E10 and E11 are shipped**, and **E8 is
in with S1/S3–S10 done** — the whole critical path, access administration,
the Google Keep import, the polish pass (PWA, a11y, dark-mode AA, inline
formatting, i18n centralization, quality) and the first field-feedback
follow-up (E11) are done; E9 is detailed in
[`stories/`](./stories/) with acceptance criteria and technical scope.
Next: **E9 — DB cold backups**, recommended now that real user data
accumulates; **E8-S2 (archive)** stays design-gated.

Two points to keep in mind:
- **E8 archive** is deliberately **design-gated** — its story is just "voir design
  avec designer"; implementation stories come after the archive UI is designed.
- **E9** uses **Scaleway Object Storage** (off-site) + a **Railway cron** service; the
  live provisioning is dashboard-only (like E1).
- **E10** (import from Google Keep) is **shipped end-to-end** — mockup validated
  (`design/Keepou - Import Keep.dc.html`), `/import` flow live, tests back & front,
  user how-to in `docs/HOWTO-import-google-keep.md`.
- **E11** (field-feedback follow-up) is **shipped** — board filter/sort/search-reset/
  year + return-state, hard delete (card / editor / archive bulk), editor owner
  actions + `Maj+Entrée`, self-service display-name change, windowed rendering;
  tests back & front, docs synced.
