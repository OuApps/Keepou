# Keepou — Deployment runbook (Railway)

How to deploy, operate and troubleshoot Keepou on [Railway](https://railway.com).
Covers epic **E1** (CD-first deployment). Read alongside
[`stories/E1-deploiement-railway.md`](./stories/E1-deploiement-railway.md).

> **What is code vs. dashboard.** The repository already ships everything code-side:
> the psycopg driver, URL normalization, strict CORS, and the two `railway.json`
> service configs. The steps below are the **dashboard actions** an operator runs
> once to provision the project — they can't be committed to the repo.

---

## Target topology (1 project, 3 services)

```
Railway project "Keepou"
├── Postgres     (managed plugin)     → DATABASE_URL
├── keepou-api   (root: api/)         → https://<api>.up.railway.app · /api/health
└── keepou-web   (root: web/)         → https://<web>.up.railway.app
```

Both services listen on Railway's injected `$PORT`. Auth is a **JWT bearer token**
(not a cookie), so the two default Railway domains talk cross-origin with strict
CORS — **no custom domain needed** for the MVP.

---

## Environment variables

### keepou-api (backend)

| Variable | Role | Example / source |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection. Railway gives `postgresql://…`; the app normalizes it to `postgresql+psycopg://…` (see `api/app/config.py`). | Reference: `${{ Postgres.DATABASE_URL }}` |
| `SESSION_SECRET` | Signs the JWT access + refresh tokens. **Must** be a strong secret in prod. | `python -c "import secrets; print(secrets.token_urlsafe(48))"` |
| `CORS_ORIGINS` | Exact web origin(s) allowed by CORS, comma-separated. | `https://<web>.up.railway.app` |

### keepou-web (frontend)

| Variable | Role | Notes |
|---|---|---|
| `VITE_API_URL` | Public URL of the API service. | ⚠️ Injected **at build time** (Vite inlines `import.meta.env`). Changing it requires a **rebuild**. |

> Set `VITE_API_URL` = `https://<api>.up.railway.app` (no trailing slash). The front
> calls `${VITE_API_URL}/api/...`.

---

## First-time provisioning (dashboard)

### 1. Project + PostgreSQL (E1-S1)
1. Create a Railway project named **Keepou**.
2. **New → Database → PostgreSQL**. This exposes `DATABASE_URL` (+ `PGHOST`, `PGUSER`…).
3. Connect the **OuApps/Keepou** GitHub repo (project settings → GitHub).

### 2. API service — keepou-api (E1-S3 / S4)
1. **New → GitHub Repo → OuApps/Keepou**.
2. Service **Settings → Root Directory = `api/`**. The build reads `api/railway.json`:
   - builder **Nixpacks** (detects `requirements.txt`),
   - **pre-deploy**: `alembic upgrade head` (runs before traffic switches),
   - **start**: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`,
   - **healthcheck**: `/api/health`.
3. **Variables**: `DATABASE_URL` = `${{ Postgres.DATABASE_URL }}`, `SESSION_SECRET`
   (generate one), `CORS_ORIGINS` (fill after the web domain exists — step 4).
4. **Settings → Networking → Generate Domain** → note `https://<api>.up.railway.app`.
5. Check `GET https://<api>.up.railway.app/api/health` → `{"status":"ok"}`.

### 3. Web service — keepou-web (E1-S5)
1. **New → GitHub Repo → OuApps/Keepou** (same repo, second service).
2. Service **Settings → Root Directory = `web/`**. The build reads `web/railway.json`:
   - Nixpacks runs `npm ci` + `npm run build` (→ `dist/`),
   - **start**: `npm run start` → `serve -s dist -l $PORT` (static + SPA fallback).
3. **Variables**: `VITE_API_URL` = `https://<api>.up.railway.app`.
4. **Generate Domain** → note `https://<web>.up.railway.app`.

### 4. Close the CORS loop (E1-S6)
1. Set the API's `CORS_ORIGINS` = `https://<web>.up.railway.app` and redeploy the API.
2. Load the web URL; confirm `fetch` hits the prod API (not localhost) and there are
   no CORS errors in the console.

### 5. Continuous deployment (E1-S7)
1. For **both** services: **Settings → Deploys**, set the deploy branch to the
   production branch (**`main`**) with auto-deploy on push.
2. If the Railway plan supports it, enable **PR environments** for ephemeral previews.
   Each preview needs its own `VITE_API_URL` (its API preview URL).

---

## Routine operations

### Deploy
Merge/push to **`main`** → both services rebuild and redeploy automatically. The API
runs `alembic upgrade head` (pre-deploy) before serving traffic.

### Run a migration manually
Migrations run automatically on deploy. To force it: redeploy the API service, or
from a local shell pointed at prod:
```bash
cd api
DATABASE_URL="<prod postgres url>" uv run alembic upgrade head
```

### Rollback (E1-S4)
- **Code**: in Railway, open the API service → **Deployments** → pick the previous
  successful deploy → **Redeploy** (Railway calls this "Rollback").
- **Schema**: a redeploy of old code does **not** auto-downgrade the DB. If a
  migration must be reverted, downgrade explicitly, then redeploy:
  ```bash
  cd api
  DATABASE_URL="<prod postgres url>" uv run alembic downgrade -1
  ```
  Prefer forward-only fixes; keep destructive migrations out of a single deploy.

### Regenerate `SESSION_SECRET`
Generate a new value (`python -c "import secrets; print(secrets.token_urlsafe(48))"`),
update the API variable, redeploy. Note: rotating it **invalidates all existing JWTs**
(everyone must log in again).

### Check logs
Railway → service → **Deployments / Logs**. Healthcheck failures show under the
deploy; app logs (uvicorn) stream live.

---

## Local parity

- **Backend**: SQLite by default, no Postgres needed. To rehearse against Postgres,
  set `DATABASE_URL=postgresql://…` — it's normalized to psycopg automatically.
- **Frontend**: `npm run dev` proxies `/api` to `http://localhost:8000` (see
  `vite.config.ts`); `VITE_API_URL` stays empty in dev.
- **Prod build locally**: `npm run build && npm run start` serves `dist/` on `$PORT`
  (defaults to 3000) exactly like Railway.

---

## Definition of "E1 done" (checklist)

- [ ] API + web reachable over HTTPS on their Railway domains.
- [ ] PostgreSQL connected; `alembic upgrade head` runs on deploy.
- [ ] Push to `main` → auto-deploy of both services.
- [ ] Login from the prod front returns a bearer token; `/api/auth/me` works with it
      (delivered in E2).
- [ ] Variables + this runbook documented.

> **To confirm with the team:** production branch (assumed **`main`**) and whether the
> Railway plan offers PR preview environments.
