# E0 — Foundations & design system — Detailed stories

> Epic goal: a monorepo that boots (frontend + backend) and a **design system
> faithful to the mockups**, the base for all subsequent screens.
>
> 🛠️ **Part of this is already in place from the scaffold** (integration commit). Each story
> notes its state: `in place` (done by the scaffold), `to complete`, or `to do`.
> Estimate scale: **S** (≤ ½ day), **M** (1–2 days), **L** (3+ days).

---

## Stories at a glance

- [x] **E0-S1** — Monorepo, structure & tooling
- [x] **E0-S2** — Backend bootstrap FastAPI
- [ ] **E0-S3** — Database & Alembic migrations *(scaffold ready; 1st real migration in E2)*
- [ ] **E0-S4** — Frontend bootstrap React/Vite + routing *(routes/guard to add)*
- [x] **E0-S5** — Design system: tokens & light/dark theme
- [ ] **E0-S6** — UI shell: topbar + responsive layout
- [ ] **E0-S7** — API client & typed error handling *(base wired; error mapping later)*
- [x] **E0-S8** — Quality: lint, format, types, tests & CI

**Done: 4/8** — the scaffold covers S1, S2, S5, S8.

---

## E0-S1 — Monorepo, structure & tooling · `in place` · S

**Goal.** A clear tree `web/` + `api/` + `design/`, with dev scripts.

**Tasks**
- Tree `web/` (React+Vite+TS), `api/` (FastAPI), `design/` (mockups, source of truth).
- `.gitignore` (node_modules, `__pycache__`, `.venv`, `dist`, `*.db`, `.env`…).
- Root README (structure, frontend/backend startup).

**Acceptance criteria**
- [x] `web/` and `api/` present with their structure (handoff §6).
- [x] `README.md` describes the structure and the startup commands.
- [x] No build artifacts versioned (`dist/`, `node_modules/`, `*.tsbuildinfo`).

**Notes.** Done. See `README.md`, `.gitignore`.

---

## E0-S2 — Backend bootstrap FastAPI · `in place` · S

**Goal.** An API that boots, is configurable, and has a health endpoint.

**Tasks**
- `app/main.py`: `FastAPI()`, mounting the routers (stubs), CORS.
- `app/config.py`: settings via env (`DATABASE_URL`, `SESSION_SECRET`, `CORS_ORIGINS`).
- `app/db.py`: engine + `get_session`.
- Route `GET /api/health`.

**Acceptance criteria**
- [x] `uvicorn app.main:app` starts without error.
- [x] `GET /api/health` → `{"status":"ok"}`.
- [x] CORS reads `CORS_ORIGINS` from the environment.
- [x] `.env.example` provided.

**Notes.** Done. Routers `auth`/`notes`/`admin` are mounted but **without routes** (filled in E2/E3…).

---

## E0-S3 — Database & Alembic migrations · `to complete` · M

**Goal.** DB layer ready, migrations operational (empty as long as there's no model).

**Tasks**
- `alembic.ini` + `migrations/env.py` wired to `app.config` and `SQLModel.metadata` — `in place`.
- `app/models.py`: currently a stub (the real model is defined in E2/E3/E5/E6 per handoff §4).
- **To complete**: validate the `alembic revision --autogenerate` + `alembic upgrade head` flow as soon as the first model lands (E2).
- Choose the dev DBMS: SQLite by default (E0), PostgreSQL in prod (see E1).

**Acceptance criteria**
- [x] `alembic current` runs (env.py loads the config without error).
- [ ] `alembic upgrade head` runs a first real migration (triggered in E2 with `User`/`AllowlistEntry`).
- [x] The database URL comes from `settings.database_url` (not hardcoded).

**Notes.** The Alembic scaffold is in place; the first real migration comes with the first model (E2 dependency).

---

## E0-S4 — Frontend bootstrap React/Vite + routing · `to complete` · M

**Goal.** An SPA that boots, router in place, ready to host the screens.

**Tasks**
- `main.tsx` (BrowserRouter), `App.tsx` (shell) — `in place`.
- `vite.config.ts` with a proxy `/api` → backend in dev — `in place`.
- **To complete**: declare the handoff §5 routes (`/login`, `/register`, `/`, `/note/:id`, `/note/:id/history`, `/admin`) with placeholders, + a basic auth guard (redirect).

**Acceptance criteria**
- [x] `npm run dev` starts, `npm run build` (type-check + build) passes.
- [x] Relative API calls `/api/...` proxied to the backend in dev.
- [ ] The main routes exist (placeholders) and navigation works.

**Notes.** The shell boots; the routes/placeholders scaffold is still to be added (the real screens arrive in E2+).

---

## E0-S5 — Design system: tokens & light/dark theme · `in place` · M

**Goal.** The exact tokens from the mockups available everywhere, switchable theme.

**Tasks**
- `styles/tokens.css`: `:root` + `[data-theme="dark"]` variables **copied from the mockups** (surfaces, text, 5 card shades light+dark, brand, radii, shadows) — handoff §1.
- Fredoka / Nunito Sans / IBM Plex Mono fonts (Google Fonts import in `index.html`).
- `hooks/useTheme.ts`: `data-theme` on `<html>`, respect `prefers-color-scheme`, persistent override (localStorage).

**Acceptance criteria**
- [x] The values in `tokens.css` match **exactly** the `:root`/`[data-theme=dark]` of `Keepou - Board.dc.html`.
- [x] The 3 fonts load and are exposed via `--font-brand/-ui/-mono`.
- [x] The theme toggle switches light⇄dark and persists across reload; first load respects the OS.

**Notes.** Done. Visual reference: `design/Keepou - Board.dc.html`.

---

## E0-S6 — UI shell: topbar + responsive layout · `to do` · M

**Goal.** A reusable shell (topbar + container) at the mockups' breakpoint.

**Tasks**
- **Topbar** component: mascot logo + « Keepou » (Fredoka), central area, actions (theme, avatar) — structure faithful to `Keepou - Board.dc.html` (sticky, `backdrop-filter: blur(8px)`, `--topbar` background).
- Content container (`max-width` ~1320px, mockup paddings).
- Responsive helper: breakpoint **~640px** (desktop ↔ mobile) — used later by the editor/history.

**Acceptance criteria**
- [ ] Topbar faithful (measurements, blur, `--border`) in light + dark.
- [ ] Responsive layout ≥/< 640px matching the mockups.
- [ ] Reusable components (imported by the Board in E3).

**Notes.** The current `App.tsx` contains a minimal demo topbar to be replaced by the real component.

---

## E0-S7 — API client & typed error handling · `to complete` · S

**Goal.** A single fetch wrapper (auth header + typed errors) usable by the UI.

**Tasks**
- `api/client.ts`: `get/post/patch/delete`, `ApiError(status, message, payload)` — `in place`.
- **To complete**: attach the **`Authorization: Bearer`** token from `localStorage` (wired in E2 — the scaffold currently sets `credentials:'include'`, to be dropped), and UI error-mapping helpers (401 → login redirect, 403 → message, 409 → lock conflict) as the epics progress.

**Acceptance criteria**
- [x] Every request goes through the wrapper.
- [x] Non-2xx responses raise `ApiError` with `status` + `payload`.
- [ ] The wrapper attaches the `Authorization: Bearer` token from `localStorage` (E2).
- [ ] 401/403/409 handling convention documented and applied (E2/E5).

**Notes.** Base in place; the fine-grained handling of the codes happens in the relevant epics.

---

## E0-S8 — Quality: lint, format, types, tests & CI · `in place` · M

**Goal.** Automatic guardrails from the start (before the code grows).

**Tasks**
- Backend managed by **uv** (`pyproject.toml` + `uv.lock`); `requirements.txt` **generated** (`uv export`).
  - **Ruff** (lint `E/W/F/I/UP/B/SIM/C4` + format), **ty** (types, Astral), **pytest** (+ httpx for `TestClient`).
- Frontend: **ESLint** (flat config + typescript-eslint + react-hooks/refresh), **Prettier**, **tsc --noEmit**, **Vitest** (+ Testing Library, jsdom).
- **CI** GitHub Actions (`.github/workflows/ci.yml`): `api` job (ruff · ty · pytest) + `web` job (tsc · eslint · prettier · vitest · build).
- Cross-cutting: `.editorconfig`, `.pre-commit-config.yaml` (ruff + prettier).

**Acceptance criteria**
- [x] Backend: `uv run ruff check .`, `uv run ruff format --check .`, `uv run ty check`, `uv run pytest` pass.
- [x] Frontend: `npm run typecheck`, `lint`, `format`, `test`, `build` pass.
- [x] Backend smoke test: `GET /api/health` + password hash roundtrip (`tests/test_health.py`).
- [x] CI workflow triggered on push/PR, blocks if a step fails.

**Notes.** In place and verified locally. **CD** (deployment) is added in **E1** (Railway).

---

## Definition of "E0 done"

- [x] Both apps start and talk to each other in dev (`/api` proxy).
- [x] Faithful design system (tokens + 3 fonts + persistent light/dark theme).
- [ ] Reusable topbar + responsive layout.
- [ ] Frontend routes scaffold + basic auth guard.
- [x] Frontend/backend lint + green CI.
- [x] Alembic scaffold ready (1st real migration delegated to E2).
