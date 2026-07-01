# Keepou

**Self-hosted Google Keep**, private, for a small community (family, neighbors).
Text notes + checkboxes, private or public, **locked single-editor** editing,
version history, access via an admin-managed **allowlist**. Responsive PWA
(desktop + mobile), light + dark theme.

> This repository starts from the mockups validated with a designer. The design is **frozen** and
> serves as the visual source of truth. Implementation proceeds **epic by epic** — see
> [`EPICS.md`](./EPICS.md).

## Repository structure

```
.
├── EPICS.md          # Macro breakdown into epics (dev entry point)
├── docs/             # Product & architecture specs (PRD, ARCHITECTURE)
├── design/           # Validated mockups + handoff (visual SOURCE OF TRUTH)
│   ├── HANDOFF.md            # Tokens, behaviors, data model, API, French UI copy
│   ├── claude.md            # Non-negotiable product rules
│   ├── Keepou - *.dc.html   # Interactive mockups (board, editor, history, auth, admin)
│   ├── assets/ uploads/     # Mascot logo, favicon
│   └── chats/               # Design conversation transcript
├── web/              # Frontend — React + Vite + TypeScript (decoupled SPA)
└── api/              # Backend — Python + FastAPI + SQLModel + Alembic
```

## Stack

| Layer | Tech |
|---|---|
| Front | React + TypeScript (Vite), React Router, consumes the REST API |
| Back | Python + FastAPI, SQLModel (SQLAlchemy + Pydantic), Alembic |
| Auth | **JWT bearer** (access + refresh in localStorage), email + password (passlib/bcrypt), **server-side** allowlist |
| Note storage | Markdown (GFM task lists `- [ ]` / `- [x]`) |

## Documentation

| Doc | What's inside |
|---|---|
| [`docs/PRD.md`](./docs/PRD.md) | Product vision, personas, scope, functional requirements |
| [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) | System design, data model, auth, locking, history, API, deployment |
| [`EPICS.md`](./EPICS.md) | Macro breakdown into epics (dev entry point) |
| [`design/HANDOFF.md`](./design/HANDOFF.md) | Design tokens, behaviors, data model, API, French UI copy |

## Getting started (scaffold)

### Front (`web/`)
```bash
cd web
npm install
npm run dev          # http://localhost:5173
```

### Back (`api/`) — managed with [uv](https://docs.astral.sh/uv/)
```bash
cd api
uv sync                              # creates .venv + installs runtime & dev (lockfile uv.lock)
uv run uvicorn app.main:app --reload # http://localhost:8000 — /api/health
```

> `requirements.txt` is **generated** from `uv.lock` (`uv export --no-dev`) for
> deployment (Nixpacks/Railway) — do not edit it by hand.

## Quality & tests

| | Back (`api/`) | Front (`web/`) |
|---|---|---|
| Lint | `uv run ruff check .` | `npm run lint` (ESLint) |
| Format | `uv run ruff format .` | `npm run format` (Prettier) |
| Types | `uv run ty check` | `npm run typecheck` (tsc) |
| Tests | `uv run pytest` | `npm run test` (Vitest) |

The **CI** (`.github/workflows/ci.yml`) replays all of this on every push/PR. Optional
pre-commit hooks: `pip install pre-commit && pre-commit install`.

> ⚠️ At this stage the project is a **scaffold**: structure, tooling, design system and
> quality/CI are in place; business logic is implemented **story by story** across the epics.

## Non-negotiable product rules

See [`design/claude.md`](./design/claude.md). In short: single-editor lock,
autosave, 1 session = 1 version, server-side allowlist, **disable, never delete**,
`/admin` protected server-side, reversible private⇄public visibility.
