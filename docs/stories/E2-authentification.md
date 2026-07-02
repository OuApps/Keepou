# E2 — Authentication & allowlist — Detailed stories

> Epic goal: **create an account (gated by the server-side allowlist)** and **log
> in**, with every error state from the mockups. The allowlist and the account
> `status` are always checked **server-side**; the front only renders what the API
> returns.
>
> Estimation convention: **S** (≤ ½ day), **M** (1–2 days), **L** (3+ days).
> All these stories are `to do` (nothing is built yet).

**Reference docs.** `design/HANDOFF.md` §3.6 & §7 (Auth), `docs/ARCHITECTURE.md`
§4 (access control) & §8 (auth/sessions), PRD FR-A1…FR-A5. Visual source of truth:
`design/Keepou - Auth.dc.html`.

**Key decisions carried in (already validated):**
- **Bootstrap admin** — the **first account ever created becomes ADMIN**, bypassing
  the allowlist (FR-A1); every subsequent sign-up is allowlist-gated (FR-A2).
- **JWT bearer** — login/register return `{access, refresh}`; the front stores them
  in `localStorage` and sends `Authorization: Bearer <token>` (no cookie). Access
  TTL ~15 min, refresh TTL ~30 days (indicative). Logout is client-side.
- **Immediate deactivation** — `get_current_user` re-loads the user and checks
  `status == ACTIVE` on **every** request, so disabling takes effect at once.

---

## Stories at a glance

- [ ] **E2-S1** — Data model `User` + `AllowlistEntry` & first real migration
- [ ] **E2-S2** — Security core: bcrypt hashing, JWT, `get_current_user` / `require_admin`
- [ ] **E2-S3** — `POST /api/auth/register` (allowlist gate + bootstrap admin)
- [ ] **E2-S4** — `login` / `refresh` / `me` endpoints
- [ ] **E2-S5** — Front: Login screen (inline error states)
- [ ] **E2-S6** — Front: Create-account screen + allowlist-denial screen
- [ ] **E2-S7** — Front: auth wiring (context, real guard, `me`, logout, 401 redirect)
- [ ] **E2-S8** — Tests: allowlist, bootstrap admin, login KO/disabled, immediate deactivation

**Status.** All `to do`. E2-S1 also **completes E0-S3** (the first real Alembic
migration was deliberately delegated here). E2-S7 **replaces** the temporary
"Entrer en mode démo" button from the E0 scaffold with the real login flow.

---

## E2-S1 — Data model `User` + `AllowlistEntry` & first real migration · M

**Goal.** The auth tables exist and Alembic's autogenerate→upgrade flow is proven
end-to-end for the first time.

**Tasks**
- `app/models.py`: `User` (id, email unique+index, display_name, password_hash,
  `role` `MEMBER|ADMIN`, `status` `ACTIVE|DISABLED`, created_at) and
  `AllowlistEntry` (id, email unique+index, added_by_id FK→user.id, added_at) —
  per HANDOFF §4 / ARCHITECTURE §3.
- Enums `Role` and `UserStatus`.
- `alembic revision --autogenerate` → review the generated migration →
  `alembic upgrade head` on SQLite (dev) and confirm it is Postgres-safe.

**Acceptance criteria**
- [ ] `User` and `AllowlistEntry` tables created by a checked-in Alembic migration.
- [ ] `alembic upgrade head` runs the first real migration (closes E0-S3's open item).
- [ ] `email` is unique + indexed on both tables; the DB URL still comes from
  `settings.database_url` (no hardcoding).

**Notes.** This is the **first real migration** in the project (the scaffold left
Alembic empty on purpose). Lock columns (E5), `NoteVersion` (E6) and `archived`
(E8) land in their own later migrations.

---

## E2-S2 — Security core: hashing, JWT & auth dependencies · M

**Goal.** A reusable `security.py` that hashes passwords and issues/validates the
bearer tokens, plus the FastAPI dependencies used by every protected route.

**Tasks**
- `app/security.py`: **passlib/bcrypt** `hash_password` / `verify_password`.
- JWT helpers (sign with `SESSION_SECRET`): `create_access_token` (short TTL) +
  `create_refresh_token` (long TTL); `decode_token` with expiry/signature checks.
- `get_current_user` dependency: decode the access token → **load the user** →
  reject if missing or `status != ACTIVE` (401/403). `require_admin`: also check
  `role == ADMIN`.
- Pydantic schemas in `app/schemas.py`: `RegisterIn`, `LoginIn`, `TokenPair`,
  `UserOut`.

**Acceptance criteria**
- [ ] Password hash round-trip works (hash ≠ plaintext, verify true/false).
- [ ] A valid access token resolves to the right user via `get_current_user`.
- [ ] An expired/invalid/tampered token → **401**; a `DISABLED` user → rejected even
  with a still-valid token (status re-checked from the DB every request).
- [ ] `require_admin` refuses a `MEMBER` with **403**.

**Notes.** `SESSION_SECRET` must be a strong value in prod (not the `.env.example`
one). No session table (stateless JWT, ARCHITECTURE §8).

---

## E2-S3 — `POST /api/auth/register` (allowlist gate + bootstrap admin) · M

**Goal.** Create an account **only** when allowed, with the first-user-is-admin
bootstrap.

**Tasks**
- `routers/auth.py` `POST /api/auth/register {email, password, display_name}`:
  - If **no user exists yet** → create as **ADMIN** (bootstrap, bypass allowlist).
  - Else if the email **is on the allowlist** → create as **MEMBER**.
  - Else → **403** (email not allowed), no account created.
- Hash the password (E2-S2); return **201** + `{access, refresh}` on success.
- Reject duplicate email (already registered) cleanly.

**Acceptance criteria**
- [ ] First-ever register → user created with `role=ADMIN`, even off-allowlist (FR-A1).
- [ ] A later register with an allowlisted email → `role=MEMBER`, **201** + tokens.
- [ ] A register with a non-allowlisted email → **403**, **no** user row created (FR-A2).
- [ ] Passwords are stored hashed only (FR-A3).

**Notes.** No "request access" flow, no in-app admin contact (claude.md §4). The
allowlist is populated by admins in E7.

---

## E2-S4 — `login` / `refresh` / `me` endpoints · M

**Goal.** Sign in, keep the session alive, and expose the current user to the front.

**Tasks**
- `POST /api/auth/login {email, password}` → `{access, refresh}`; **401** on bad
  credentials, **403** if `status == DISABLED`.
- `POST /api/auth/refresh {refresh}` → new access token; **401** if invalid/expired.
- `GET /api/auth/me` (bearer) → `UserOut` (id, email, display_name, **role**, status)
  — drives the client route guards and the admin-menu visibility.

**Acceptance criteria**
- [ ] Correct credentials → tokens; wrong password/unknown email → **401**.
- [ ] A `DISABLED` account → **403** at login (FR-A5).
- [ ] `refresh` swaps a valid refresh token for a fresh access token; invalid → **401**.
- [ ] `GET /api/auth/me` returns the authenticated user (incl. `role`).

**Notes.** Logout is client-side (drop the tokens). Frozen copy: HANDOFF §7 "Auth".

---

## E2-S5 — Front: Login screen (inline error states) · M

**Goal.** A pixel-faithful login screen with the mockup's inline messages.

**Tasks**
- `pages/LoginPage.tsx` faithful to `Keepou - Auth.dc.html` (fields, brand, button
  gradient) in light + dark.
- Submit → `POST /api/auth/login`; on success store the tokens (E2-S7) and redirect
  to `/`.
- Inline messages: wrong credentials **« E-mail ou mot de passe incorrect. »**
  (terracotta), disabled account **« Ton accès a été suspendu. Contacte
  l'administrateur. »** (gold).

**Acceptance criteria**
- [ ] Login screen matches the mockup (light + dark, desktop + mobile).
- [ ] 401 → terracotta inline error; 403 disabled → gold inline message.
- [ ] Successful login stores tokens and lands on the board.

**Notes.** French UI copy stays verbatim (HANDOFF §7). Link to `/register`.

---

## E2-S6 — Front: Create-account screen + allowlist-denial screen · M

**Goal.** Account creation and the polite "not on the list" rejection.

**Tasks**
- `pages/RegisterPage.tsx` (email, display_name, password) faithful to the mockup;
  submit → `POST /api/auth/register`.
- **Allowlist-denial** screen on **403**: **« Accès non autorisé »** + **« L'adresse
  <email> ne figure pas sur la liste des membres autorisés de cette instance
  Keepou. »** + button **« Retour à la connexion »** (denial gradient
  `linear-gradient(150deg,#D86A50,#C04A30)`).
- On success (201): store tokens, redirect to `/`.

**Acceptance criteria**
- [ ] Register screen faithful (light + dark, desktop + mobile).
- [ ] 403 → the **Accès non autorisé** screen with the exact copy and the
  **Retour à la connexion** button (no account created).
- [ ] 201 → session established, redirect to the board.

**Notes.** No in-app "request access" (claude.md §4). Frozen copy: HANDOFF §7.

---

## E2-S7 — Front: auth wiring (context, real guard, `me`, logout, 401) · M

**Goal.** Wire the real session end-to-end and retire the demo shortcut.

**Tasks**
- `auth/AuthContext.tsx` + `auth/storage.ts`: hold tokens + current user; hydrate
  from `localStorage` on load and call `GET /api/auth/me` to validate.
- `auth/RequireAuth.tsx`: gate on a **valid** session (not just a token's presence);
  redirect to `/login` when absent/invalid. **Remove the "Entrer en mode démo"
  button** from the login placeholder (E0-S4 note).
- `api/client.ts`: on **401**, drop tokens and redirect to `/login`; optionally try
  `refresh` once before giving up. Logout action clears tokens.

**Acceptance criteria**
- [ ] A fresh visit with no/invalid token → redirected to `/login`.
- [ ] After login, `me` populates the context; the avatar menu reflects the user.
- [ ] A 401 from any endpoint drops the session and returns to `/login`.
- [ ] The temporary demo-mode button is gone.

**Notes.** The authoritative check stays server-side; the guard is a UX convenience.
Fine-grained 403/409 mapping continues in E5/E7.

---

## E2-S8 — Tests: allowlist, bootstrap, login KO, immediate deactivation · M

**Goal.** Lock down the non-negotiable auth rules with automated tests.

**Tasks**
- Back (pytest + TestClient): bootstrap admin on first register; allowlist gate
  (403 off-list, 201 on-list); login OK/401/403-disabled; `me` with/without token;
  a disabled user's existing token stops working immediately.
- Front (Vitest): login error rendering (terracotta/gold), denial screen render,
  guard redirect when unauthenticated.

**Acceptance criteria**
- [ ] Back tests cover FR-A1/A2/A3/A5 and the per-request `status` re-check.
- [ ] Front tests cover the two inline errors + the denial screen + the guard.
- [ ] CI (`api` + `web` jobs) green.

**Notes.** Extends the E0-S8 harness; these are the first business-rule tests.

---

## Definition of "E2 done"

- [ ] First user bootstraps as admin; later sign-ups are allowlist-gated server-side.
- [ ] Login OK/KO and disabled account handled with the exact inline copy.
- [ ] Bearer session established (`access`/`refresh`), `refresh` + `me` working.
- [ ] Deactivation is effective immediately (status re-checked every request).
- [ ] Real guard replaces the demo shortcut; 401 returns to login.
- [ ] Auth business-rule tests green in CI.
