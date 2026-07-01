# Keepou — EPICS breakdown (macro)

> **Purpose of this document.** Propose a **macro** breakdown of Keepou's development into
> epics, based on the validated mockups and the handoff (`design/HANDOFF.md`,
> `design/claude.md`). We stay at the **epic** level; the **detailed stories** are
> written epic by epic in the [`stories/`](./stories/) folder as we start each one.
>
> Visual source of truth: the `design/Keepou - *.dc.html` files.
> Non-negotiable product rules: `design/claude.md`.

**Progress** — `[x]` epic shipped · `[ ]` not yet · 🔨 in progress · ✅ stories detailed · ⏳ stories TBD:
- [ ] 🔨 **E0** — Foundations & design system · ✅ detailed → [`stories/E0-fondations.md`](./stories/E0-fondations.md) — *4/8 stories done*
- [ ] **E1** — Railway deployment · ✅ detailed → [`stories/E1-deploiement-railway.md`](./stories/E1-deploiement-railway.md) — *0/8, not started*
- [ ] **E2** — Authentication & allowlist · ⏳ stories TBD
- [ ] **E3** — Board & note management · ⏳ stories TBD
- [ ] **E4** — Note editor · ⏳ stories TBD
- [ ] **E5** — Single-editor lock & real-time · ⏳ stories TBD
- [ ] **E6** — History & versions · ⏳ stories TBD
- [ ] **E7** — Access administration · ⏳ stories TBD
- [ ] **E8** — Polish (PWA, a11y, archive, i18n, quality) · ⏳ stories TBD
- [ ] **E9** — Database cold backups & restore · ⏳ stories TBD

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
| **E8** | Polish: PWA, a11y, i18n, quality | Manifest, accessibility, **archive**, copy centralization, tests/CI | all |
| **E9** | Database cold backups & restore | Scheduled off-site `pg_dump`, retention, tested restore | E1 |

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

## E8 — Polish: PWA, accessibility, i18n, quality

**Goal.** Harden and finalize: installable, accessible, centralized strings, tested.

**Scope**
- **PWA**: manifest (icon = mascot), favicon, responsive.
- **Archive** (FR-N8): **starts with a design phase** — there is no mockup yet, so first **design the archive UI** (per the design-driven workflow in `design/claude.md` / `HANDOFF.md`), then implement archive / unarchive (hide from the board without deleting) + the `?archived=` board filter + the `Note.archived` field.
- **A11y**: real `<input type=checkbox>` + labels, labeled fields, `role="status"`/aria-live lock banners, contrasts OK, mobile hit targets ≥ 44px.
- **i18n**: centralize the FR copy (HANDOFF §7).
- **Quality**: back tests (allowlist, atomic lock, versioning), key front tests, CI lint/build/test.

**Mockups.** All (state & responsive verification).

**Done when.** App installable, archive **designed then built** (hide/restore + filter), a11y verified, strings centralized, test suite green in CI.

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

## Cross-cutting (present in each epic)

- **Visual fidelity**: exact tokens; light **and** dark; desktop **and** mobile.
- **Server security**: allowlist, admin role, lock — **always** server-side.
- **Markdown**: note bodies in GFM from the MVP (no future migration).
- **Tests** as we go on the critical business rules.

---

## Next step

E0 and E1 are detailed in [`stories/`](./stories/). After review/merge, we move on
to the **detail of E2** (or the epic of your choice), with acceptance criteria and technical scope.
