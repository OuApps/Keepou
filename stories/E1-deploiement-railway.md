# E1 — Railway Deployment (CD-first) — Detailed stories

> Epic goal: **put Keepou online on Railway from the very foundations**, with
> managed PostgreSQL, migrations run on deploy, and **continuous deployment** on push.
> Placed early so every following epic ships to prod with no manual effort.
>
> Estimation convention: **S** (≤ ½ day), **M** (1–2 days), **L** (3+ days).
> All these stories are `to do` (nothing is deployed yet).

**Target topology on Railway (1 project, 3 services):**

```
Railway project "Keepou"
├── Postgres     (managed plugin)     → DATABASE_URL
├── keepou-api   (root: api/)         → https://<api>.up.railway.app · /api/health
└── keepou-web   (root: web/)         → https://<web>.up.railway.app
```

> Monorepo: each Railway service points to a **Root Directory** (`api/` or `web/`).
> Railway injects `$PORT` — both services **must listen on `$PORT`**.
> Auth is a **JWT bearer token** (not a cookie), so the two can stay on the default
> Railway domains and talk cross-origin — **no custom domain needed** (S6).

---

## Stories at a glance

- [ ] **E1-S1** — Railway project + managed PostgreSQL — *dashboard*
- [x] **E1-S2** — PostgreSQL driver & backend prod config — *code done*
- [~] **E1-S3** — FastAPI API service on Railway — *`api/railway.json` ready; provisioning is dashboard*
- [~] **E1-S4** — Alembic migrations run on deploy — *pre-deploy command + rollback runbook ready; verified on 1st deploy*
- [~] **E1-S5** — Frontend service (Vite) on Railway — *`web/railway.json` + `serve` ready; SPA fallback verified locally*
- [x] **E1-S6** — CORS & prod security (bearer auth) — *code done + tested*
- [ ] **E1-S7** — Continuous deployment (push + PR preview) — *dashboard*
- [x] **E1-S8** — Env variables & runbook documented — *see `docs/DEPLOY.md`*

**Status.** All **code & config** is in the repo (S2, S3, S4, S5, S6, S8): psycopg driver
+ URL normalization, strict CORS, the two `railway.json` service configs, the `serve`
static server, and the [deployment runbook](../docs/DEPLOY.md). What remains is
**dashboard-only** provisioning that can't live in the repo — creating the Railway
project + Postgres (S1), the two services and their domains (S3/S5), and enabling
auto-deploy (S7) — plus the live verification of S3–S6 on the first deploy. Follow
`docs/DEPLOY.md` step by step. `[~]` = code ready, awaiting provisioning.

---

## E1-S1 — Railway project + managed PostgreSQL · M

**Goal.** Provision the project and the database, connect the GitHub repo.

**Tasks**
- Create the Railway project « Keepou », connect the **OuApps/Keepou** repo (GitHub integration).
- Add the managed **PostgreSQL** service → exposes `DATABASE_URL` (+ `PGHOST`, `PGUSER`…).
- Define the `production` environment (and prepare shared variables).

**Acceptance criteria**
- [ ] Railway project created and linked to the GitHub repo.
- [ ] PostgreSQL service up, `DATABASE_URL` available as a reference variable.
- [ ] Team access configured.

**Notes.** No code; infra story. The API/web services are created in S3/S5.

---

## E1-S2 — PostgreSQL driver & backend prod config · S

**Goal.** Make the backend PostgreSQL-compatible (dev stays SQLite).

**Tasks**
- Add the **psycopg (v3)** driver to `api/requirements.txt` (`psycopg[binary]`).
- Normalize the URL scheme: Railway provides `postgresql://…`; SQLModel/psycopg v3 expects `postgresql+psycopg://…`.
  → in `app/config.py`, rewrite the prefix if needed (`postgresql://` → `postgresql+psycopg://`).
- Check `app/db.py`: SQLite `connect_args` does **not** apply to Postgres (already handled).

**Acceptance criteria**
- [x] `pip install -r requirements.txt` installs psycopg (`psycopg[binary]` in `pyproject.toml` + generated `requirements.txt`).
- [x] With `DATABASE_URL=postgres://…` or `postgresql://…`, the scheme is normalized to `postgresql+psycopg://…` automatically (`app/config.py`, covered by `tests/test_config.py`).
- [x] Local SQLite dev keeps working with no change (SQLite `connect_args` still applied only for SQLite).

**Notes.** Depends on E0-S2/S3 (config + db in place). The live Postgres connection is
exercised on the first Railway deploy.

---

## E1-S3 — FastAPI API service on Railway · M

**Goal.** Deploy the backend, reachable over HTTPS, with a healthcheck.

**Tasks**
- **keepou-api** service, **Root Directory = `api/`**, Nixpacks builder (detects `requirements.txt`).
- **Start command**: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`.
- `api/railway.json` (or `railway.toml`) file: builder, `startCommand`, `healthcheckPath = /api/health`, restart policy.
- Variables: `DATABASE_URL` (Postgres reference), `SESSION_SECRET` (generated), `CORS_ORIGINS` (frontend URL, see S6).
- Generate a **public domain** for the API service.

**Acceptance criteria**
- [ ] `GET https://<api>/api/health` → 200 `{"status":"ok"}`.
- [ ] The service reads its env variables (DB, secret, CORS).
- [ ] Railway healthcheck green; automatic restart on crash.

**Notes.** `api/railway.json` is in the repo (Nixpacks builder, start command, healthcheck
`/api/health`, pre-deploy migration). Creating the service + generating the domain is the
dashboard part (see `docs/DEPLOY.md`). `SESSION_SECRET` **must** be a strong secret in prod
(not the `.env.example` value).

---

## E1-S4 — Alembic migrations run on deploy · M

**Goal.** The database is always up to date after a deployment, automatically.

**Tasks**
- Define a Railway **pre-deploy command**: `alembic upgrade head` (run before switching traffic).
  - Alternative if pre-deploy is unavailable: prefix the start command (`alembic upgrade head && uvicorn …`) — less clean (re-run on each replica).
- Make sure `alembic.ini`/`migrations/env.py` read `DATABASE_URL` from the environment (already the case).
- Document the rollback (revert to an Alembic revision + redeploy the previous image).

**Acceptance criteria**
- [ ] A deployment applies pending migrations before serving traffic.
- [ ] A deployment with no new migration does not break (idempotent).
- [ ] Rollback procedure documented (runbook S8).

**Notes.** The pre-deploy command lives in `api/railway.json` (`deploy.preDeployCommand`);
the rollback procedure is written up in `docs/DEPLOY.md`. As long as there is no real model
(before E2), `alembic upgrade head` is a safe no-op.

---

## E1-S5 — Frontend service (Vite) on Railway · M

**Goal.** Serve the frontend static build, pointing at the API.

**Tasks**
- **keepou-web** service, **Root Directory = `web/`**, build `npm ci && npm run build` → `dist/`.
- Serve `dist/` statically **with SPA fallback** on `$PORT`:
  - simple option: start `npx serve -s dist -l $PORT` (add `serve` as a devDep or via `npx`),
  - or a small static server (Caddy/Nginx) depending on ops preference.
- Build variable **`VITE_API_URL`** = public URL of the API (S3). ⚠️ injected **at build time** (Vite inlines `import.meta.env`) → rebuild if the URL changes.
- Generate the frontend **public domain**.

**Acceptance criteria**
- [ ] The frontend is served over HTTPS and loads with no console error.
- [ ] `fetch` calls target the prod API (`VITE_API_URL`), not localhost.
- [ ] SPA routing works on deep-link (fallback to `index.html`).

**Notes.** `web/railway.json` + the `start` script (`serve -s dist -l $PORT`) and the `serve`
dependency are in the repo; the static build with SPA fallback was verified locally
(`npm run build && npm run start`, deep-link → `index.html`). Creating the service + domain
is the dashboard part. In dev the Vite `/api` proxy is enough; in prod the front calls the
API cross-origin at `VITE_API_URL`, sending the JWT bearer token in the `Authorization`
header, with CORS allowing the web origin (S6).

---

## E1-S6 — CORS & prod security (bearer auth) · S

**Goal.** Working, secure cross-origin auth between the two Railway services, with **no custom domain**.

**Tasks**
- **Decision — JWT bearer token (like our sibling project), no cookie.** The front stores an access + refresh token in `localStorage` and sends `Authorization: Bearer <token>`; the API validates it and re-checks the user `status` on every request. This needs **no custom domain and no reverse proxy** — the two default Railway domains just talk cross-origin.
- Backend **CORS**: `CORS_ORIGINS` = the exact web origin(s); `allow_credentials=False` (the token is a header, not a cookie — so **no** `*`-with-credentials issue).
- Secrets: `SESSION_SECRET` signs the JWTs (strong value in prod, not the `.env.example` one). Short access-token TTL + longer refresh TTL.
- HTTPS enforced (default on Railway).

**Acceptance criteria**
- [ ] Login from the prod frontend returns tokens; `GET /api/auth/me` works with the `Authorization` header. *(E2 — needs the auth endpoints.)*
- [x] The API only accepts the configured web origin(s) (strict CORS, `allow_credentials=False`) — `app/main.py`, covered by `tests/test_cors.py`.
- [ ] A disabled account is rejected on its next request (the server re-checks `status`). *(E2 — needs `get_current_user`.)*

**Notes.** Decision recorded in [`docs/ARCHITECTURE.md`](../docs/ARCHITECTURE.md) §8: JWT bearer for the MVP; a httpOnly same-site cookie is a **documented later upgrade** (needs a custom domain). Impacts E2 (token issuance/validation). The CORS/credentials posture is done now; the token-dependent criteria are satisfied in E2.

---

## E1-S7 — Continuous deployment (push + PR preview) · S

**Goal.** Every push triggers a deployment; every PR has a test environment.

**Tasks**
- Enable **auto-deploy** on the production branch (e.g. `main`) for both services.
- Enable **PR deploys** (an ephemeral environment per PR) if the Railway plan allows it.
- Verify that the frontend build injects the right `VITE_API_URL` per environment.

**Acceptance criteria**
- [ ] A merge on `main` automatically redeploys API + frontend.
- [ ] A PR creates (or updates) a reachable preview environment.
- [ ] Env variables differ correctly between prod and preview.

**Notes.** Complements the "basic CI" from E0-S8 (lint/build) with **CD**.

---

## E1-S8 — Env variables & runbook documented · S

**Goal.** An ops/dev can (re)deploy and troubleshoot without guessing.

**Tasks**
- Document all variables: backend (`DATABASE_URL`, `SESSION_SECRET`, `CORS_ORIGINS`) and frontend (`VITE_API_URL`).
- Update `api/.env.example` / `web/.env.example` if new variables appear.
- **Runbook** (`docs/DEPLOY.md` or README section): create a service, re-run a migration, rollback, regenerate `SESSION_SECRET`, check the logs.

**Acceptance criteria**
- [x] Exhaustive list of variables (role + example) documented (`docs/DEPLOY.md`).
- [x] Deployment + rollback runbook written (`docs/DEPLOY.md`).
- [x] A new member can follow the docs to reproduce the environment.

**Notes.** Builds on the `.env.example` files already provided by the scaffold; `api/.env.example`
updated to reflect JWT signing + the Postgres URL normalization.

---

## Definition of "E1 done"

- [ ] API + frontend accessible via their Railway URLs (HTTPS).
- [ ] PostgreSQL connected; migrations run automatically on deploy.
- [ ] Push on the production branch → auto-deploy of both services.
- [ ] Bearer-token auth working between frontend and API (cross-origin + CORS — see E1-S6).
- [ ] Env variables and runbook documented.

> ℹ️ **To confirm before implementation:** the production branch (`main`?) and the Railway
> plan (whether PR deploys are available). No custom domain is needed for the MVP (bearer
> auth); one is only required if/when we move to same-site cookies (see E1-S6).
