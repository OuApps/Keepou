# E1 — Railway Deployment (CD-first) — Detailed stories

> Epic goal: **put Keepou online on Railway from the very foundations**, with
> managed PostgreSQL, migrations run on deploy, and **continuous deployment** on push.
> Placed early so every following epic ships to prod with no manual effort.
>
> Estimation convention: **S** (≤ ½ day), **M** (1–2 days), **L** (3+ days).
> **Update:** provisioned and **live** on Railway (2026-07-01) — see the status below.

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

- [x] **E1-S1** — Railway project + managed PostgreSQL — *provisioned*
- [x] **E1-S2** — PostgreSQL driver & backend prod config — *code done*
- [x] **E1-S3** — FastAPI API service on Railway — *live · `/api/health` 200*
- [x] **E1-S4** — Alembic migrations run on deploy — *pre-deploy `alembic upgrade head` verified on Postgres*
- [x] **E1-S5** — Frontend service (Vite) on Railway — *live · SPA served, `VITE_API_URL` wired*
- [x] **E1-S6** — CORS & prod security (bearer auth) — *strict CORS live; token flow lands in E2*
- [~] **E1-S7** — Continuous deployment (push + PR preview) — *auto-deploy on `main` live; PR previews pending plan*
- [x] **E1-S8** — Env variables documented (`.env.example`) — *ops steps folded into these stories*

**Status.** **Provisioned and live** (verified 2026-07-01). The Railway project +
managed Postgres (S1), both services with public domains (S3/S5), all env variables,
and auto-deploy on `main` (S7) are in place. Verified end-to-end: `GET /api/health` →
`200 {"status":"ok"}`, `alembic upgrade head` ran against **Postgres** as a pre-deploy,
the web SPA is served over HTTPS, and CORS only accepts the web origin. What remains:
the **bearer-token auth flow** (login / `/api/auth/me`) lands in **E2**, and **PR preview
environments** depend on the Railway plan. Variables are documented in the
`api/.env.example` / `web/.env.example` files and the topology above; the live domains
are kept out of the repo. `[~]` = partially done.

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
- [x] `GET https://<api>/api/health` → 200 `{"status":"ok"}`.
- [x] The service reads its env variables (`DATABASE_URL`, `SESSION_SECRET`, `CORS_ORIGINS`).
- [x] Railway healthcheck green; restart policy `ON_FAILURE`.

**Notes.** `api/railway.json` is in the repo (Nixpacks builder, start command, healthcheck
`/api/health`, pre-deploy migration). The service + public domain are provisioned on Railway.
`SESSION_SECRET` **must** be a strong secret in prod (not the `.env.example` value) — a strong
one is set.

---

## E1-S4 — Alembic migrations run on deploy · M

**Goal.** The database is always up to date after a deployment, automatically.

**Tasks**
- Define a Railway **pre-deploy command**: `alembic upgrade head` (run before switching traffic).
  - Alternative if pre-deploy is unavailable: prefix the start command (`alembic upgrade head && uvicorn …`) — less clean (re-run on each replica).
- Make sure `alembic.ini`/`migrations/env.py` read `DATABASE_URL` from the environment (already the case).
- Document the rollback (revert to an Alembic revision + redeploy the previous image).

**Acceptance criteria**
- [x] A deployment applies pending migrations before serving traffic (pre-deploy log: `alembic.runtime.migration ... PostgresqlImpl`).
- [x] A deployment with no new migration does not break (idempotent no-op — no models before E2).
- [x] Rollback procedure documented (see notes).

**Notes.** The pre-deploy command lives in `api/railway.json` (`deploy.preDeployCommand`).
**Rollback:** in Railway, redeploy a previous successful deploy of the API service
("Rollback"); a code rollback does **not** auto-downgrade the DB, so revert a bad migration
explicitly (`alembic downgrade -1` against the prod `DATABASE_URL`) then redeploy. As long as
there is no real model (before E2), `alembic upgrade head` is a safe no-op.

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
- [x] The frontend is served over HTTPS (`200 text/html`).
- [x] `VITE_API_URL` = the prod API URL, inlined at build (not localhost). *(Actual data `fetch` starts in E2.)*
- [x] SPA routing works on deep-link (fallback to `index.html`) — verified locally + `serve -s`.

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
- [ ] Login from the prod frontend returns tokens; `GET /api/auth/me` works with the `Authorization` header. *(Endpoints shipped in E2 — tick after verifying on the next prod deploy.)*
- [x] The API only accepts the configured web origin(s) (strict CORS, `allow_credentials=False`) — `app/main.py`, covered by `tests/test_cors.py`.
- [x] A disabled account is rejected on its next request (the server re-checks `status`) — `get_current_user` shipped in E2, covered by `tests/test_auth.py`.

**Notes.** Decision recorded in [`docs/ARCHITECTURE.md`](../ARCHITECTURE.md) §8: JWT bearer for the MVP; a httpOnly same-site cookie is a **documented later upgrade** (needs a custom domain). Impacts E2 (token issuance/validation). The CORS/credentials posture is done now; the token-dependent criteria are satisfied in E2.

---

## E1-S7 — Continuous deployment (push + PR preview) · S

**Goal.** Every push triggers a deployment; every PR has a test environment.

**Tasks**
- Enable **auto-deploy** on the production branch (e.g. `main`) for both services.
- Enable **PR deploys** (an ephemeral environment per PR) if the Railway plan allows it.
- Verify that the frontend build injects the right `VITE_API_URL` per environment.

**Acceptance criteria**
- [x] A merge on `main` automatically redeploys API + frontend (GitHub source connected on both services).
- [ ] A PR creates (or updates) a reachable preview environment. *(Pending — depends on the Railway plan.)*
- [ ] Env variables differ correctly between prod and preview. *(Pending PR previews.)*

**Notes.** Complements the "basic CI" from E0-S8 (lint/build) with **CD**.

---

## E1-S8 — Env variables & runbook documented · S

**Goal.** An ops/dev can (re)deploy and troubleshoot without guessing.

**Tasks**
- Document all variables: backend (`DATABASE_URL`, `SESSION_SECRET`, `CORS_ORIGINS`, and the optional `ACCESS_TOKEN_TTL_MINUTES` / `REFRESH_TOKEN_TTL_DAYS` from E2) and frontend (`VITE_API_URL`).
- Keep `api/.env.example` / `web/.env.example` in sync when variables appear.
- Ops steps (deploy, re-run a migration, rollback, regenerate `SESSION_SECRET`, check logs)
  are folded into these stories (see S4 notes) and the Railway dashboard.

**Acceptance criteria**
- [x] Exhaustive list of variables (role + example) documented (`api/.env.example`, `web/.env.example`, topology above).
- [x] Deploy + rollback steps documented (S4 notes + Railway dashboard).
- [x] A new member can follow the docs to reproduce the environment.

**Notes.** Builds on the `.env.example` files already provided by the scaffold; `api/.env.example`
updated to reflect JWT signing + the Postgres URL normalization.

---

## Definition of "E1 done"

- [x] API + frontend accessible via their Railway URLs (HTTPS).
- [x] PostgreSQL connected; migrations run automatically on deploy.
- [x] Push on the production branch → auto-deploy of both services.
- [ ] Bearer-token auth working between frontend and API (cross-origin + CORS — see E1-S6). *(Shipped in E2 — tick after verifying on the next prod deploy.)*
- [x] Env variables documented.

> ℹ️ **Resolved:** production branch is **`main`** (auto-deploy live on both services).
> **Still open:** whether the Railway plan offers PR preview environments (E1-S7). No custom
> domain is needed for the MVP (bearer auth); one is only required if/when we move to
> same-site cookies (see E1-S6).
