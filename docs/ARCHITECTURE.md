# Keepou — Architecture

**Status:** Reviewed · **Last updated:** 2026-07-01

This document describes the technical design behind the requirements in
[PRD.md](./PRD.md). It is aligned with the validated design
([../design/HANDOFF.md](../design/HANDOFF.md)) and the `api/` + `web/` scaffold.

---

## 1. Overview

Keepou is a **decoupled** application: a React single-page app (the client)
talks to a FastAPI backend (the API) over REST/JSON, backed by one PostgreSQL
database. Both run on Railway as **two services** plus the managed Postgres
plugin.

```mermaid
flowchart LR
    subgraph Client [Client · React SPA + PWA]
        UI[React UI + Service Worker]
    end
    subgraph Api [keepou-api · FastAPI · Railway]
        API[REST API]
    end
    subgraph Web [keepou-web · static build · Railway]
        ST[Vite build served statically]
    end
    DB[(PostgreSQL · Railway plugin)]

    UI -- app shell --> ST
    UI -- fetch/JSON + Bearer --> API
    API -- SQLModel / SQLAlchemy --> DB
```

There is **no SSR**: the frontend is a static Vite build served on its own
service; the API is a separate FastAPI service on its own domain. The front calls
the API **cross-origin** and authenticates with a **JWT bearer token** in the
`Authorization` header (see §8) — no cookies, so no custom domain or reverse proxy
is needed and CORS is straightforward. Keeping the two apart makes the API
reusable and the front trivially cacheable (see §10).

## 2. Stack & rationale

| Concern | Choice | Why |
| --- | --- | --- |
| Frontend | **React + TypeScript (Vite SPA)** | Fast dev/build, decoupled from the API, easy PWA. |
| Backend | **Python + FastAPI** | Typed, small, great for a REST API; first-class Pydantic schemas. |
| ORM / migrations | **SQLModel (SQLAlchemy + Pydantic) + Alembic** | Typed models shared with schemas; versioned migrations. |
| Database | **PostgreSQL** (prod), **SQLite** (dev) | Robust concurrency for shared notes + history; SQLite keeps local dev zero-setup. |
| Auth | **Email/password + JWT bearer token** (access + refresh) | Simplest cross-origin setup — no cookie/domain constraints; server-side allowlist and authz. A same-site cookie is a documented later upgrade (§8). |
| Hosting | **Railway** | Managed Postgres plugin injects `DATABASE_URL`; per-service deploys. |
| Client delivery | **PWA** (manifest + service worker) | Installable, responsive, one codebase for mobile + desktop. |

## 3. Data model

Note bodies are stored as **Markdown (GFM task lists)** — the title is a separate
field. History keeps one **version per editing session** (see §6). Passwords are
hashed; auth uses **stateless JWT bearer tokens** (see §8), so there is **no
session table**.

```mermaid
erDiagram
    User ||--o{ Note : owns
    User ||--o{ NoteVersion : authored
    User ||--o{ AllowlistEntry : invited
    User ||--o{ PersonalAccessToken : "Botou owns (agent access)"
    Note ||--o{ NoteVersion : "has history"
    User ||--o| Note : "locks (0..1 active)"

    User {
        string id PK
        string email UK
        string display_name
        string password_hash
        enum role "ADMIN | MEMBER"
        enum status "ACTIVE | DISABLED"
        enum language "FR | EN"
        datetime created_at
    }
    PersonalAccessToken {
        string id PK
        string user_id FK
        string name
        string token_hash UK "sha256"
        string prefix "display only"
        datetime created_at
        datetime last_used_at "nullable"
        datetime revoked_at "nullable"
    }
    AllowlistEntry {
        string id PK
        string email UK
        string added_by_id FK
        datetime added_at
    }
    Note {
        string id PK
        string owner_id FK
        string title
        string body "Markdown (GFM)"
        enum color "GOLD | AVOCAT | SALSA | CLAY | TEAL"
        enum visibility "PRIVATE | PUBLIC"
        bool pinned
        bool archived
        string locked_by_id FK "nullable"
        datetime locked_at "nullable"
        datetime lock_expires_at "nullable"
        datetime created_at
        datetime updated_at
    }
    NoteVersion {
        string id PK
        string note_id FK
        string author_id FK
        string title
        string body "Markdown snapshot"
        enum color
        enum visibility
        datetime created_at
    }
```

### Entity notes

- **User.role** — `ADMIN` or `MEMBER`. The first user created is `ADMIN`.
- **User.status** — `ACTIVE` / `DISABLED`. A disabled user cannot sign in; their
  data is retained (never deleted, FR-A5). The status is checked **on every
  request** (the bearer token only asserts identity — the API re-loads the user
  and verifies `ACTIVE`), so disabling takes effect immediately even if the user
  still holds a valid token.
- **User.language** — the member's preferred UI language (`FR` / `EN`, default
  `FR`), stored server-side so it **follows them across devices** (E12). The SPA
  mirrors it in `localStorage` for a flash-free boot and adopts the server value
  on session load; the member changes it from the account menu
  (`PATCH /api/auth/me {language}`). French stays the reference locale — the
  frozen UI copy (HANDOFF §7) is the FR source, `en.ts` its faithful mirror.
- **PersonalAccessToken** — a long-lived bearer secret the agent (**Botou**) uses
  to reach Keepou over **MCP** (E13, §14). JWT access tokens are short-lived
  (~15 min), so an **admin** mints a `kpat_…` token instead; every token is owned
  by the Botou identity. Only its **SHA-256 hash** is stored (never the secret,
  shown once at creation); `prefix` is a non-secret display label; `revoked_at`
  disables it without deleting the row. Resolving a presented token is one indexed
  lookup that also re-checks the owner is the `ACTIVE` Botou.
- **AllowlistEntry** — the allowlist. An email here may sign up; once they do, a
  `User` row exists. A `LEFT JOIN User ON User.email = AllowlistEntry.email` lets
  the admin UI show "allowed (pending)" vs "registered" (FR-U2).
- **Note.body** — stored as **Markdown** with GFM task lists: a paragraph is
  plain text, a checkbox is `- [ ] label` (unchecked) / `- [x] label` (checked).
  Storing Markdown from the MVP means richer text can be rendered later **without
  a migration**. The reference serializer is `buildMd` in the mockups; the
  frontend mirror is `web/src/lib/markdown.ts`.
  Since E8-S9 the frontend also **renders a bounded inline subset** — bold
  `**…**`, italic `*…*`, heading lines `# `/`## `/`### ` — recognized as you
  type in the editor (`web/src/lib/inline.ts`, markers kept visible) and shown
  as `<strong>`/`<em>`/`<h1>`–`<h3>` on the read-only surfaces. This is pure
  recognition/rendering: the stored body stays plain GFM (no API change, no
  migration), and everything outside the subset remains literal text.
- **Note.color** — an identifier from a fixed palette (`GOLD | AVOCAT | SALSA |
  CLAY | TEAL`), not a hex value (FR-N4).
- **Note.visibility** — `PRIVATE` (owner only) or `PUBLIC` (all members),
  reversible by the owner (FR-N5); switching back to private removes it from
  others' public board.
- **Note.pinned** — floats a note to the top of its board (FR-N9).
- **Note.archived** — hides a note from **every** board (including Public)
  without deleting it (FR-N8), shown only in the dedicated archived view.
  Both flags are **owner-only metadata**, toggled **lock-free** and **without
  writing a version** (they aren't content edits and don't touch `updated_at`).
  Shipped in **E8** — no dedicated mockup; the UI reuses the existing card /
  `.kp-menu` tokens.
- **Note.locked_by_id / locked_at / lock_expires_at** — the single-editor lock
  carried by the note (see §5). Only meaningful on `PUBLIC` notes.
- **NoteVersion** — an immutable snapshot (title + body + color + visibility +
  author + timestamp) created once per editing session (FR-H1). Append-only; a
  composite index on `(note_id, created_at)` backs the history listing.

> **Body shape (illustrative Markdown):**
> ```markdown
> Groceries for the weekend.
>
> - [ ] Coffee
> - [x] Bread
> ```

## 4. Access control

### 4.1 Sign-up gate

```mermaid
flowchart TD
    S[POST /api/auth/register] --> Z{Any user exists yet?}
    Z -- No --> ADM[Create user as ADMIN · bootstrap]
    Z -- Yes --> AL{email in AllowlistEntry?}
    AL -- No --> REJ[403 · polite rejection]
    AL -- Yes --> USR[Create user as MEMBER]
```

The allowlist check runs **server-side**; the client only renders the message the
API returns. There is no in-app "request access" flow.

### 4.2 Permission matrix

| Action | Owner | Other member | Admin | Disabled user |
| --- | :---: | :---: | :---: | :---: |
| View private note | ✅ | ❌ | ❌¹ | ❌ |
| View public note | ✅ | ✅ | ✅ | ❌ |
| Edit private note | ✅ | ❌ | ❌¹ | ❌ |
| Edit public note content (with lock) | ✅ | ✅ | ✅ | ❌ |
| Change note visibility | ✅ | ❌ | ❌ | ❌ |
| Pin a note | ✅ | ❌ | ❌ | ❌ |
| Archive a note | ✅ | ❌ | ❌ | ❌ |
| Delete a note | ✅ | ❌ | ✅ | ❌ |
| Manage allowlist / users | ❌ | ❌ | ✅ | ❌ |

> ¹ Admins govern **access and users**, not the **content of private notes**.
> Privacy is preserved even from admins by design.

## 5. Locking mechanism (public notes)

A **pessimistic, single-writer lock** with a short TTL and a client heartbeat —
chosen over real-time co-editing for simplicity. A note carries at most one
active lock.

- **Acquire** — `POST /api/notes/:id/lock`. Granted if the note is unlocked, the
  existing lock is **stale** (`now > lock_expires_at`), or the caller already
  holds it. The grant is an **atomic conditional update**
  (`UPDATE ... WHERE locked_by_id IS NULL OR lock_expires_at < :now`); if it
  affects **0 rows**, the lock is held by someone else.
- **Heartbeat** — the editor re-calls acquire every **~20s** to extend
  `lock_expires_at` while actively editing.
- **TTL** — **~60s**. After that without a heartbeat, the lock is claimable by
  anyone. This bounds how long a closed tab can block others.
- **Enforce** — a mutating request on a **public** note is rejected with
  **HTTP 409 (Conflict)** unless the caller holds a valid (non-stale) lock; the
  response says **who** holds it.
- **Release** — `DELETE /api/notes/:id/lock` on leaving the editor (and via
  `beforeunload` / `keepalive`). Releasing the lock is what **creates the version**
  for that session (see §6).
- **UX** — when blocked, the UI shows a calm banner identifying who's editing and
  inviting the reader to try again shortly (FR-L5). Never a hard error page.
- **409 body** — structured `detail`: `code: "note_locked"` (someone else holds a
  fresh lock; carries `locked_by {id, display_name}` + `lock_expires_at`) or
  `code: "lock_required"` (the note is free/stale but the caller saved without a
  valid lock — re-acquiring is enough).
- **Read-side state & transport** — `GET /api/notes/:id` carries `locked_by` and
  `lock_expires_at` (a stale lock is reported as-is, expiry in the past). Readers
  **short-poll** it every ~12s to refresh the banner and the content in near
  real-time — the validated MVP transport; SSE could replace the poll later
  without changing this payload.

```mermaid
sequenceDiagram
    participant A as Alice
    participant S as Server
    participant B as Bob
    A->>S: POST /notes/42/lock
    S-->>A: 200 (lock held by Alice)
    B->>S: POST /notes/42/lock
    S-->>B: 409 (held by Alice) → "please wait"
    A->>S: PATCH /notes/42 (save)
    S-->>A: 200
    A->>S: DELETE /notes/42/lock (leave) [+ NoteVersion]
    B->>S: POST /notes/42/lock
    S-->>B: 200 (now Bob holds it)
```

> The lock prevents **simultaneous clobbering**; **history** (next section)
> captures **who changed what**. They are complementary.

## 6. History & versions

- A note's edit is a **session**: from opening the editor to leaving it. One
  session produces **at most one `NoteVersion`** (snapshot of title + body +
  color + visibility + `author_id` + timestamp), created when the session ends —
  i.e. when the **lock is released** on a public note, or the editor is closed on
  a private note (FR-H1). Not one version per keystroke or per checkbox toggle.
  `DELETE /api/notes/:id/lock` is the single end-of-session signal: it releases
  the lock (public) and doubles as the editor-close signal on a private note
  (no lock to release). A session that changed nothing records no version.
- **Creation root**: `POST /api/notes` writes the note's first version (stamped
  with the note's own `created_at`), which the front renders as « Créée par X ».
- **Viewing**: `GET /api/notes/:id/versions` returns the versions newest-first,
  gated by the same visibility rules as the note itself (FR-H2). The history
  lists **who** and **when**; selecting a version re-displays it read-only
  (FR-H3). There is no visual diff — a version is shown as-is.
- **Restore**: `POST /api/notes/:id/restore/:version_id` re-applies the snapshot
  and appends a **new** version. Nothing is ever overwritten (FR-H4). On a
  public note the restore briefly takes the single-editor lock (atomic — an
  active editor wins the `409`); **visibility stays owner-only** (§4.2), so a
  member's restore re-applies the content and leaves the current visibility
  untouched.
- **Retention**: all versions are kept (snapshots are small Markdown text).
  Deleting a note deletes its versions with it.

## 7. API surface (REST, JSON)

Backend **FastAPI**; frontend **React SPA** consuming the API. Inputs/outputs are
**Pydantic** schemas; status codes via `HTTPException`. All sensitive checks
(allowlist, admin role, lock, visibility) are **server-side**.

| Method | Path | Purpose | Notes |
| --- | --- | --- | --- |
| POST | `/api/auth/register` | Create account | Allowlist-gated; bootstraps admin; `403` if not allowed; `409` if email already registered; returns tokens |
| POST | `/api/auth/login` | Sign in | Returns `{access, refresh}`; `401` bad creds, `403` if `DISABLED` |
| POST | `/api/auth/refresh` | Renew the access token | Takes the refresh token; `401` if invalid/expired |
| GET | `/api/auth/me` | Current user + role | Bearer-authenticated; drives client route guards |
| PATCH | `/api/auth/me` | Change own display name / language | Bearer; `{display_name?, language?}` — partial (E11 name, E12 language); email/role/status stay untouched |
| GET | `/api/notes?tab=mine\|public` | List notes | `mine` = own; `public` = all members' public (with author); `?archived=true` = own archived view (E8); pinned-first ordering |
| POST | `/api/notes` | Create note | |
| GET | `/api/notes/:id` | Read a note | Visibility-checked |
| PATCH | `/api/notes/:id` | Update note | `title`, `body`, `color`, `visibility`; `pinned`/`archived` (E8, owner-only, lock-free); content is lock-checked for public |
| DELETE | `/api/notes/:id` | Hard-delete note (+ its versions) | Owner or admin; surfaced in the UI (E11) from the card menu, the editor owner menu, and archive multi-select bulk delete |
| POST | `/api/notes/:id/lock` | Acquire / heartbeat lock | `409` if held by another |
| DELETE | `/api/notes/:id/lock` | Release lock | Ends the session → writes a version |
| GET | `/api/notes/:id/versions` | Version history | Visibility-checked |
| POST | `/api/notes/:id/restore/:version_id` | Restore a version | Creates a new version |
| GET | `/api/admin/members` | Members (registered + allowed/pending) | Admin; `User` ⟕ `AllowlistEntry` |
| POST | `/api/admin/allowlist` | Add allowed email | Admin |
| DELETE | `/api/admin/allowlist/:id` | Remove allowed email | Admin; pending entries only |
| PATCH | `/api/admin/users/:id` | Set `role` or `status` | Admin; last-admin guard; never deletes |
| POST | `/api/import/keep/preview` | Parse a Takeout export | Bearer; ZIP upload → parsed notes with a stable index, **no writes** — feeds the review/selection view (E10) |
| POST | `/api/import/keep` | Import selected notes | Bearer; same ZIP + selected indices → create only the checked notes (private, dates preserved); returns a summary (E10) |
| GET | `/api/admin/tokens` | List the agent (Botou) tokens | **Admin**; metadata only, never the secret (E13) |
| POST | `/api/admin/tokens` | Mint an agent token | **Admin**; `{name}` → the `kpat_…` secret **once** (`201`); owned by Botou, only its hash is stored |
| DELETE | `/api/admin/tokens/:id` | Revoke an agent token | **Admin**; `404` if not a Botou token; sets `revoked_at`, never deletes |
| POST | `/mcp` | MCP endpoint (streamable HTTP) | Bearer **Personal Access Token**; the agent (Botou) surface (§14) — not part of the REST/JSON app, mounted separately |

> **Search** is a **client-side filter** over the loaded board in the MVP (FR-S1);
> a dedicated server endpoint can be added later if the note count grows.
>
> **Board controls (E11)** are all client-side over the loaded set and URL-driven
> (so they survive an editor round-trip — « retour garde la sélection »): a sort
> selector (`?sort=modified|created|title`, pinned always first), a **density**
> selector (`?density=full|compact` — compact caps each card body via CSS so more
> notes fit on one screen; display-only, it never changes the set or its order), a
> search reset (✕), and a **render window** that reveals cards incrementally so a
> large imported board mounts instantly. The API still returns the full set in one
> call. Filtering own notes by visibility is served by the top-right « Mes notes /
> Public » tab (`?tab=`), so no separate visibility filter is needed.
>
> **Perceived latency (E11 follow-up).** The editor is a separate route, so
> BoardPage unmounts while a note is open. A module-level **board cache**
> (`web/src/lib/boardCache.ts`) keeps the last-fetched lists across that
> round-trip: returning paints the cached list instantly (stale-while-revalidate —
> a background `listNotes()` reconciles), and the editor **upserts** the note it
> just saved so the edit shows without a refetch. Opening a card passes the
> already-loaded note in navigation state so the editor renders immediately and
> `GET /api/notes/{id}` becomes a silent revalidation instead of a blocking load.
> The cache is cleared on sign-out / session expiry.

## 8. Authentication & sessions

- Passwords hashed with **bcrypt_sha256** via **passlib** (SHA-256 pre-hash, then
  bcrypt) — never stored in plaintext, and long passphrases keep their full
  entropy instead of being silently truncated at bcrypt's 72-byte limit.
- Auth is a **stateless JWT** flow: login/register return a short-lived **access
  token** (indicative ~15 min) and a longer-lived **refresh token** (indicative
  ~30 days), both **signed** with a server secret. No session table.
- The client stores the tokens in **`localStorage`** and sends the access token on
  every request as **`Authorization: Bearer <token>`**. `POST /api/auth/refresh`
  swaps a valid refresh token for a fresh access token. **Logout is client-side**
  (drop the tokens).
- On each request, `get_current_user` verifies the token signature, loads the
  user, and checks `status == ACTIVE`; `require_admin` also checks the role.
  Because status is re-read from the DB every request, **deactivation is effective
  immediately** — a disabled user's token stops working at once.
- **Why bearer, not a cookie:** it needs **no custom domain and no reverse
  proxy** — front and API live on the default Railway domains and talk
  cross-origin with plain CORS. Accepted MVP trade-offs: `localStorage` tokens are
  readable by JS (**XSS exposure**), and a leaked token can't be revoked
  server-side before it expires (mitigated by a **short access-token TTL** + the
  per-request `status` check; a refresh-token deny-list can be added later).
- **Later upgrade (documented, not MVP):** switch to a **httpOnly,
  `SameSite=Lax` cookie** for stronger XSS resistance. That requires serving front
  + API under **one domain** (custom domain + `/api` reverse proxy) or sibling
  subdomains — deferred until a custom domain is available. The data model is
  unchanged, so the migration stays localized to auth.
- **Personal Access Tokens (agent access, E13).** Separately from the JWT flow,
  an **admin** can mint long-lived **`kpat_…`** tokens for the agent (the JWT
  access token's ~15-min TTL is too short for an always-on agent). Every token is
  owned by the **Botou** identity (§14) and is the bearer credential for the
  **MCP** endpoint: only the SHA-256 **hash** is stored, the secret is shown once,
  and each use re-checks the token belongs to the `ACTIVE` Botou — so revoking a
  token or disabling Botou cuts agent access immediately.

## 9. PWA & responsiveness

- **Manifest** (`web/public/manifest.webmanifest`, E8-S1): name, mascot icons
  (192 / 512 / 512-maskable), theme + background color `#FBF4E6`,
  `display: standalone`, `start_url: "/"`. iOS pinning goes through
  `apple-touch-icon.png` (180×180 on cream) + the `apple-mobile-web-app-*`
  metas in `index.html`.
- **Service worker** (`web/public/sw.js`, E8-S1): installability + app-shell
  caching only — `/api` (and any cross-origin request) stays network-only,
  navigations are network-first with the cached shell as offline fallback,
  hashed build assets are cached first-hit. Registered in production builds
  only. Offline editing and background sync are out of scope.
- **Mobile keyboard** (E8-S6): the viewport meta carries
  `interactive-widget=resizes-content` (Android Chrome resizes the layout
  under the keyboard) and `lib/keyboard.ts` scrolls the focused field into
  view (iOS Safari anchoring is unreliable); bottom bars are in-flow/sticky
  so they follow the resized viewport.
- **Theme**: `data-theme="light|dark"` on the root, CSS token variables; respects
  `prefers-color-scheme` on first load with a persisted manual override
  (localStorage).
- **Responsive layout**: masonry that collapses from 4 columns (desktop) to 1–2
  (mobile); touch-friendly targets; a single composer. Cards are distributed
  round-robin across flex columns (card N → column N % cols) so they read in
  reading order (left→right, top→bottom) rather than the column-major fill of
  CSS `column-count`. The breakpoint is ~640px (editor: modal ≥ tablet,
  full-screen below).

## 10. Deployment (Railway)

One Railway project, **two public services** + the managed Postgres plugin. A
custom domain is **not required** (auth is a bearer token, not a cookie, so the two
services can live on the default `*.up.railway.app` domains and talk cross-origin),
but the deployment now fronts each service with a **custom Cloudflare sub-domain** —
the web app and the API on paired hostnames (e.g. `<web-domain>` / `api-<web-domain>`).
Whatever the hostnames, the two variables that wire the front to the back must stay a
matched pair: **`VITE_API_URL`** (web, build-time) points at the API's public origin,
and **`CORS_ORIGINS`** (api) lists the web's public origin. Each service points at a
**Root Directory** and listens on `$PORT`.

| Service | Root | Build / Start | Public URL |
| --- | --- | --- | --- |
| **keepou-api** | `api/` | Nixpacks; `sh -c 'uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --proxy-headers --forwarded-allow-ips=*'` | custom API sub-domain (Cloudflare) · `/api/health` |
| **keepou-web** | `web/` | `npm ci && npm run build` → serve `dist/` on `$PORT` (SPA fallback) | custom web sub-domain (Cloudflare) |
| **Postgres** | — | managed plugin | injects `DATABASE_URL` |

- **`$PORT` must be shell-expanded**: the API `startCommand` is wrapped in
  `sh -c '… --port ${PORT:-8000}'`. Railway runs a raw `startCommand` in **exec
  form** (no shell), so a bare `--port $PORT` reaches uvicorn as the literal
  string `$PORT` (« `'$PORT'` is not a valid integer »). The `sh -c` wrapper forces
  expansion and the `${PORT:-8000}` fallback keeps local `docker run` working —
  same pattern as the web `start` script and `api/docker-entrypoint.sh`.
- **`--proxy-headers --forwarded-allow-ips=*`**: uvicorn runs behind Railway's
  (TLS-terminating) reverse proxy, so it must trust `X-Forwarded-Proto` to know the
  request arrived over HTTPS. Without it, Starlette builds redirect URLs from the
  internal `http` hop — e.g. the MCP mount's trailing-slash redirect (`/mcp` →
  `/mcp/`) would send clients to an `http://` URL. Same flags in
  `api/docker-entrypoint.sh` for the self-host image.
- **Public `Host` behind Cloudflare (`ForwardedHostMiddleware`)**: the Cloudflare
  edge rewrites the outgoing `Host` to the default `*.up.railway.app` origin and
  Railway rewrites `X-Forwarded-Host` too, so neither is a reliable source for the
  public hostname. The edge forwards the real public host in **`X-Edge-Host`**;
  `app/main.py`'s `ForwardedHostMiddleware` (added last, so it wraps CORS and runs
  first) restores `Host` from `X-Edge-Host` — falling back to `X-Forwarded-Host` —
  before any request/URL logic reads it, so absolute URLs and redirect `Location`
  targets carry the public sub-domain, not the internal Railway one.
- **Front canonical-origin guard**: if the web app is ever reached on a
  `*.up.railway.app` host, `web/src/main.tsx` bounces to the canonical public
  origin **before any API call** — an API call from the Railway origin would miss
  the strict `CORS_ORIGINS` allowlist, and no bookmark should land on the internal
  domain.
- **Railway builds with Nixpacks, not the self-host Dockerfiles**: the web
  container's `Dockerfile` is named **`web/Dockerfile.selfhost`** (nginx,
  single-origin, `/api` proxied — see *Self-hosting* below) precisely so Railway
  does **not** auto-detect a root `web/Dockerfile` and build it. Railway would run
  that nginx image (no `npm`, listening on `:80`, proxying `/api` to a
  compose-only `api` host) and the deploy fails at *Create container* with
  « The executable `npm` could not be found ». With no root `web/Dockerfile`,
  Railway falls back to Nixpacks (`build.builder = NIXPACKS` in `web/railway.json`)
  and runs `npm run start` → `serve -s dist -l $PORT`, the cross-origin
  (`VITE_API_URL`) model above. The API Dockerfile is a plain uvicorn image and is
  architecture-compatible either way, so it keeps its `Dockerfile` name.
- **Migrations**: `alembic upgrade head` runs as a **pre-deploy** command on the
  API service, before traffic shifts (a no-op until the first real model lands in
  E2).
- **Continuous deployment**: pushes to the production branch redeploy both
  services; PR preview environments if the Railway plan allows.
- **Backups (E9)**: the managed plugin alone is **not** a backup, so a Railway
  **scheduled (cron) service** runs [`scripts/backup.sh`](../scripts/backup.sh)
  hourly (`0 * * * *`, set as code in the repo-root [`railway.json`](../railway.json)):
  `pg_dump -Fc` over the **internal** `DATABASE_URL` (the DB is never exposed
  publicly) → `pg_restore --list` integrity check → upload **off-site** to
  **Scaleway Object Storage** (S3-compatible, EU-hosted). Uploads are **tiered** —
  every run → `hourly/`, first run of the day → `daily/`, first run of the week →
  `weekly/` — kept **48 hourly + 7 daily + 4 weekly**, pruned each run and logged.
  The runner image is [`ops/backup/Dockerfile`](../ops/backup/Dockerfile); restore
  is [`scripts/restore.sh`](../scripts/restore.sh) (download → `pg_restore` into a
  **fresh** DB → per-table row-count verify). Data-loss window ≤ 1 h. Full
  procedure + tested runbook: [`docs/RUNBOOK-backups-restore.md`](./RUNBOOK-backups-restore.md).
  The S3 client is provider-generic (`SCW_ENDPOINT`), so R2/B2/MinIO swap by env.
- **CORS**: the API allows the exact web origin(s) via `CORS_ORIGINS`; credentials
  are **not** used (the token rides in the header), so there is no
  wildcard-with-credentials pitfall.
- **Required environment variables**:

  | Variable | Service | Purpose |
  | --- | --- | --- |
  | `DATABASE_URL` | api | Postgres connection (from the Railway plugin) |
  | `SESSION_SECRET` | api | Signs the access/refresh JWTs (strong value in prod) |
  | `FRONTEND_URL` | api | Public web origin (e.g. `https://keepou.galaxou.com`); default source for `CORS_ORIGINS` |
  | `API_BASE_URL` | api | Public API origin (e.g. `https://api-keepou.galaxou.com`); default source for `MCP_PUBLIC_URL` |
  | `CORS_ORIGINS` | api | *(optional)* allowed web origin(s); defaults to `FRONTEND_URL`, set to list several |
  | `ACCESS_TOKEN_TTL_MINUTES` | api | *(optional)* access-token TTL — default 15 min |
  | `REFRESH_TOKEN_TTL_DAYS` | api | *(optional)* refresh-token TTL — default 30 days |
  | `MCP_PUBLIC_URL` | api | *(optional)* public MCP endpoint; defaults to `API_BASE_URL` + `/mcp` |
  | `VITE_API_URL` | web | Public API base URL, inlined **at build time** |

  `FRONTEND_URL` and `API_BASE_URL` are the two public origins the backend treats
  as its single source of truth: `CORS_ORIGINS` falls back to `FRONTEND_URL` and
  `MCP_PUBLIC_URL` falls back to `API_BASE_URL` + `/mcp`, so a prod deploy only has
  to name the two hostnames. Both must be the **custom** (Cloudflare) sub-domains —
  **never** a `*.up.railway.app` domain, and no Railway URL is hard-coded anywhere
  in the repo.

> `VITE_API_URL` is baked into the static build, so changing it requires a
> rebuild of `keepou-web`. The committed default lives in `web/.env.production`; a
> Railway service variable of the same name overrides it. A build without it makes
> the front call its own origin (`serve` returns `index.html`), so every API call —
> login included — silently gets HTML instead of JSON.
>
> When the web origin changes (e.g. a new custom domain), update **both** sides:
> `VITE_API_URL` on `keepou-web` **and** `CORS_ORIGINS` on `keepou-api`. A missing
> web origin in `CORS_ORIGINS` fails the browser preflight (`400`, no
> `access-control-allow-origin`) and the front cannot reach the API.

## 11. Security considerations

- Allowlist enforced **server-side** on registration — never trust the client.
- Lock, visibility and admin-role checks enforced **server-side** on every
  mutating request; the lock grant is an atomic conditional update.
- Auth is a **signed JWT bearer token**; the API re-checks user `status` every
  request, so **deactivation is immediate** (the disabled 403 carries
  `code: "account_disabled"` so the client ends the session). Tokens live in
  `localStorage` (**XSS-exposed** — accepted MVP trade-off; a short access-token
  TTL bounds the window). A httpOnly-cookie upgrade is documented in §8.
- The app **refuses to boot** with the public dev `SESSION_SECRET` against a
  non-SQLite database, so a misconfigured prod deploy cannot sign forgeable
  tokens. Login verifies against a dummy hash when the email is unknown, so
  response latency does not reveal which accounts exist.
- **CORS** is restricted to the exact web origin(s); no credentials are used
  (bearer token in the header), avoiding the `*`-with-credentials footgun.
- **Last-admin guard** prevents locking everyone out of administration (FR-U5).
- **Disable, never delete** for user accounts; note deletion is restricted to the
  owner or an admin (FR-N6).
- Private-note content is shielded **even from admins** (§4.2).
- AGPL-3.0: running a modified network service obliges offering source to users.

## 12. Import from Google Keep (E10)

Members can bring their existing Google Keep notes into Keepou. The design is
constrained by how Keep lets data out:

- **Source = Google Takeout.** The Keep REST API is **Workspace-only** (service
  account + domain-wide delegation) and unusable on personal Gmail; the unofficial
  `gkeepapi` is fragile and ToS-grey. So the import consumes a **Google Takeout
  export**: a `Takeout/Keep/` folder with **one JSON per note** (`title`,
  `textContent`, `listContent[]`, `color`, `createdTimestampUsec`,
  `userEditedTimestampUsec`, `isTrashed`, plus flags/attachments we ignore). Each
  user runs their **own** Takeout and imports their **own** notes.
- **Server-side parse, two-step flow.** Import is **preview → review → confirm** so
  the member can clean up on the way in, never a blind bulk-import:
  - `POST /api/import/keep/preview` (bearer, size-limited) unzips the archive and
    returns the **parsed notes with a stable index** (files iterated in a
    deterministic order) — **no DB writes**.
  - The front shows a **review/selection view (« mode tunnel »)**: every note as a
    checkbox card, trashed **pre-unchecked**, « Tout cocher / décocher ».
  - `POST /api/import/keep` re-sends the **same ZIP + the selected indices**; the
    server re-parses deterministically and creates **only the selected notes**.
    Re-sending the ZIP keeps parsing authoritative (no trust in client-echoed
    content) without a server-side staging table — the export is small text.
  The pure mapper (`services/keep_import.py`) turns each note into Keepou fields:
  - `textContent` + `listContent[]` → **GFM Markdown** body (same serialization as
    `web/src/lib/markdown.ts`, so imports look identical to native notes);
  - Keep's ~12 colors → the **5 shades** via a fixed table (unknown → `GOLD`);
  - `createdTimestampUsec` / `userEditedTimestampUsec` (µs) → `created_at` /
    `updated_at`, **preserving the original Keep dates**;
  - `isTrashed` notes are **skipped**; images, labels, pin, and collaborators are
    **dropped** (MVP — Keepou has no rich media; `isArchived` can map to
    `Note.archived` once E8 ships).
- **Creation path.** Notes are created in **one transaction**, forced to
  `visibility = PRIVATE` with `owner_id` = the caller (visibility is owner-only,
  §4.2 — the owner can flip them public afterwards). Each gets its
  `versions.creation_snapshot` **history root** stamped with the imported
  `created_at`, so history reads « Créée par X » at the real Keep date. The
  endpoint returns a summary (`imported` / `skipped_duplicate` / `failed[]`); a
  malformed selected note is reported in `failed`, never fatal, and a selected
  index that is trashed or out of range is silently ignored (the server decides).
- **No schema change.** `Note.created_at` / `updated_at` already exist; the import
  path just sets them explicitly (the public `POST /api/notes` does not). The MVP
  dedups by a content match (`owner_id, title, body`) rather than a new
  `imported_from` column — a durable source marker is a post-MVP option.

> The mapper is isolated from the endpoint, so a second importer (Standard Notes,
> Evernote, a plain Markdown folder) could be added later without touching the
> upload plumbing.

## 13. Internationalization (E12)

Keepou ships in **French and English**. French is the **reference locale** — the
frozen UI copy (HANDOFF §7) is the source of truth; `web/src/i18n/en.ts` is its
faithful mirror.

- **Where strings live.** `web/src/i18n/fr.ts` holds the reference dictionary
  (grouped `*_COPY` objects); `en.ts` is typed `Copy = typeof fr`, so the
  compiler rejects any missing key or mismatched function signature — the two
  locales **cannot drift out of shape**. Components read the active dictionary via
  `useI18n()` (a React context), so a language switch re-renders every consumer.
- **The preference.** Stored **server-side** on `User.language` (§3) so it follows
  the member across devices, with a **`localStorage` mirror** (`keepou.language`)
  for a flash-free first paint and the pre-login screens. On session load the
  front adopts `User.language`; the account-menu switcher applies the new locale
  immediately, then persists it via `PATCH /api/auth/me {language}` (a failed
  sync keeps the local switch — offline-safe).
- **Timestamps.** The relative/absolute date formatters (`web/src/lib/time.ts`)
  read a module-level active locale kept in sync by the i18n provider, so an
  English UI never shows French dates without threading the locale through every
  call site.
- **Default.** French, unless the browser is clearly English on first visit
  (`navigator.language`) — the product is francophone-first (design/claude.md).

## 14. Agent access over MCP (E13)

Keepou exposes its notes to an **agent** over the **Model Context Protocol**, so
the instance can be driven from an assistant — and, later, from a **WhatsApp /
Telegram bot** that speaks MCP. The agent has its **own identity, Botou** (it does
*not* act as the member who minted the token) and is a **public-only** actor.

- **Identity — Botou.** The agent acts as a single dedicated account, **Botou**
  (`services/bot.py`): a real `User` row (so notes and versions keep a valid
  owner / author) that never signs in (a random password hash) and is **hidden
  from the admin member list**. Every note created over MCP is **owned by Botou**
  and shown « Créée par Botou ». Botou is created lazily on the first token mint.
- **Public-only.** Botou reads and writes **PUBLIC** notes only: `create_note`
  always creates a PUBLIC note, `update_note` never changes visibility, and a
  member's private note is invisible to it (`NoteNotFound`). It can edit any
  member's public note (borrowing the lock) but can only delete its own.
- **Transport.** A **streamable-HTTP** MCP server (`app/mcp_server.py`, built on
  the `mcp` SDK's `FastMCP`, **stateless**) **mounted inside the FastAPI app** at
  **`/mcp`** — future-proof for a remote bot that connects to it directly. The
  session manager runs in the app lifespan (rebuilt per lifespan behind a stable
  ASGI wrapper, so the test harness can open many clients). `MCP_ENABLED=false`
  turns the whole surface off.
- **Auth.** Bearer **Personal Access Token** (§8), now **admin-managed** and
  owned by Botou. FastMCP's `token_verifier` resolves the presented `kpat_…` via
  `resolve_bot_token` — **only** a token owned by the `ACTIVE` Botou resolves, so
  any legacy member-scoped token is retired (and migration `e7a1c3f95b48` stamps
  `revoked_at` on those pre-existing tokens, so the table reflects it). Inside a
  tool,
  `get_access_token().subject` is Botou's id, so every action runs as Botou. A
  missing/invalid/revoked token is `401`.
- **Tools** (7, thin adapters over `app/services/agent.py`, which mirrors the REST
  rules — visibility gating, single-editor lock, versioning, owner/admin
  permissions): `list_notes`, `search_notes`, `get_note`, `create_note`,
  `update_note`, `organize_note` (pin/archive), `delete_note`. Editing a public
  note **borrows the single-editor lock** around the change and yields to a live
  editor (`409` → a clean tool error); each content edit records the session's
  version, exactly like the web editor.
- **Separation of concerns.** The note logic lives in `services/agent.py`
  (transport-free, unit-tested); the MCP tools are adapters that open a session,
  resolve Botou and delegate. Tool text is **English** (an agent-facing API, not
  product UI copy).

Connecting an agent is an **admin** act: from **/admin → « Accès agent (MCP) »**,
an admin creates an API key and copies the endpoint. The
[README](../README.md#agent-access-mcp) documents the key creation and the
expected bearer auth.
