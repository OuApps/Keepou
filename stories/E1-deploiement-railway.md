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
├── Postgres            (managed plugin)  → DATABASE_URL
├── keepou-api          (root: api/)      → https://keepou-api.up.railway.app
└── keepou-web          (root: web/)      → https://keepou.up.railway.app
```

> Monorepo: each Railway service points to a **Root Directory** (`api/` or `web/`).
> Railway injects `$PORT` — both services **must listen on `$PORT`**.

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
- [ ] `pip install -r requirements.txt` installs psycopg.
- [ ] With `DATABASE_URL=postgresql://…`, the app connects (scheme normalized automatically).
- [ ] Local SQLite dev keeps working with no change.

**Notes.** Depends on E0-S2/S3 (config + db in place).

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

**Notes.** `SESSION_SECRET` **must** be a strong secret in prod (not the `.env.example` value).

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

**Notes.** As long as there is no real model (before E2), `alembic upgrade head` is a safe no-op.

---

## E1-S5 — Frontend service (Vite) on Railway · M

**Goal.** Serve the frontend static build, pointing at the API.

**Tasks**
- **keepou-web** service, **Root Directory = `web/`**, build `npm ci && npm run build` → `dist/`.
- Serve `dist/` statically **with SPA fallback** on `$PORT`:
  - simple option: start `npx serve -s dist -l $PORT` (add `serve` as a devDep or via `npx`),
  - or a small static server (Caddy/Nginx) depending on ops preference.
- Build variable **`VITE_API_URL`** = public URL of the API (S3). ⚠️ injected **at build time** (Vite inlines `import.meta.env` at compilation) → rebuild if the URL changes.
- Generate the frontend **public domain**.

**Acceptance criteria**
- [ ] The frontend is served over HTTPS and loads with no console error.
- [ ] `fetch` calls target the prod API (`VITE_API_URL`), not localhost.
- [ ] SPA routing works on deep-link (fallback to `index.html`).

**Notes.** In dev, the Vite `/api` proxy is enough; in prod, `VITE_API_URL` + CORS (S6) connect the two services.

---

## E1-S6 — CORS, cookies & prod security · M

**Goal.** Cookie-based auth that is functional and secure between two Railway domains.

**Tasks**
- Backend: `CORS_ORIGINS` = the exact frontend domain, `allow_credentials=True` (already wired in `main.py`).
- Session cookies (set in E2) in prod: `Secure`, `HttpOnly`, appropriate `SameSite`.
  - Distinct domains `keepou-web` ↔ `keepou-api` ⇒ **cross-site** cookie ⇒ `SameSite=None; Secure` (otherwise the cookie is not sent back).
  - ➡️ **Recommendation**: eventually, serve frontend + API under the **same domain** (`/api` subpath via a reverse proxy / custom domain) to stay on `SameSite=Lax` — simpler and safer. To be decided.
- HTTPS enforced (default on Railway).

**Acceptance criteria**
- [ ] Login from the prod frontend establishes the session and `GET /api/auth/me` works (cookie sent back).
- [ ] No unauthorized origin is accepted by the API (strict CORS).
- [ ] Cookies marked `Secure` + `HttpOnly` in prod.

**Notes.** This story formalizes the architecture decision (cross-site vs same domain). Impacts E2.

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
- [ ] Exhaustive list of variables (role + example) documented.
- [ ] Deployment + rollback runbook written.
- [ ] A new member can follow the docs to reproduce the environment.

**Notes.** Builds on the `.env.example` files already provided by the scaffold.

---

## Definition of "E1 done"

- [ ] API + frontend accessible via their Railway URLs (HTTPS).
- [ ] PostgreSQL connected; migrations run automatically on deploy.
- [ ] Push on the production branch → auto-deploy of both services.
- [ ] Cookie-based auth working between frontend and API (cross-site/same-domain decision made).
- [ ] Env variables and runbook documented.

> ℹ️ **Hypotheses to confirm with you before implementation:** production branch (`main`?),
> desired custom domain (impacts the cookie strategy S6), and Railway plan (PR deploys
> available or not).
