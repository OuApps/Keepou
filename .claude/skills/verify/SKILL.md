---
name: verify
description: Build, launch and drive Keepou (FastAPI + React) locally to verify a change end-to-end through the real UI.
---

# Verify Keepou locally

Two processes + Playwright against the Vite dev server (it proxies `/api` to :8000).

## Launch

```bash
# API — fresh SQLite in a temp dir, migrations, then uvicorn on :8000
cd api
DATABASE_URL="sqlite:///$TMPDIR/keepou.db" uv run alembic upgrade head
DATABASE_URL="sqlite:///$TMPDIR/keepou.db" uv run uvicorn app.main:app --port 8000 &
curl -s http://localhost:8000/api/health   # → {"status":"ok"}

# Front — Vite dev server on :5173 (proxy /api → :8000, see web/vite.config.ts)
cd web && npx vite --port 5173 &
```

## Drive (Playwright)

Chromium is pre-installed: `chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })`
(`npm i playwright-core` in a scratch dir if `@playwright/test` isn't resolvable).

- **First register bootstraps the ADMIN** and bypasses the allowlist — start
  every scenario by registering via `/register` (`#register-name`,
  `#register-email`, `#register-password`, button « Créer mon compte »).
- Login: `#login-email`, `#login-password`, button « Se connecter ».
- Avatar menu: button `Menu du compte`; admin entry « Administration » → `/admin`.
- Tokens live in `localStorage` (`keepou.access` / `keepou.refresh`).

## Gotchas

- `body` has a 0.25 s background transition — wait ~600 ms after a themed load
  before screenshotting dark mode, or the capture lands mid-fade.
- Several labels exist twice (desktop + mobile spans, e.g. « En attente » tab
  vs status pill): scope locators by class (`.kp-admin__status`) or role, not
  bare `getByText`.
- The UI is French — assert on the exact copy from `design/HANDOFF.md` §7.
- Reset state by deleting the SQLite file and re-running `alembic upgrade head`
  (kill uvicorn first).
