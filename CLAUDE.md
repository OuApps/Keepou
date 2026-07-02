# Keepou — Claude Code project guide

Keepou is a **self-hosted Google Keep** for a small francophone community: text
notes + checkboxes, private/public, **single-editor locked** editing, version
history, admin-managed **allowlist**. Responsive PWA, light + dark. Stack: **React +
TypeScript** (`web/`), **FastAPI + SQLModel + Alembic** (`api/`).

## Read first (sources of truth)

Read the relevant file **before** writing code — do not reinvent decisions already
recorded here.

| File | What it holds | When to read |
|---|---|---|
| [`design/claude.md`](./design/claude.md) | **Non-negotiable product rules** | Always — before any feature work |
| [`design/HANDOFF.md`](./design/HANDOFF.md) | Design system (exact tokens), behaviors, data model, API, **French UI copy** (§7) | Before any UI code |
| `design/Keepou - *.dc.html` | Validated mockups — **visual source of truth** | When building a screen |
| [`docs/PRD.md`](./docs/PRD.md) | Product requirements (`FR-*`), scope, non-goals | For scope/behavior questions |
| [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) | System design: data model, auth, locking, history, API surface, deployment, security | For technical decisions |
| [`docs/EPICS.md`](./docs/EPICS.md) | Macro breakdown into epics + **progress table** | To pick up / sequence work |
| [`docs/stories/`](./docs/stories/) | **Detailed stories per epic** (E0…E9): goal, tasks, acceptance criteria, definition of done | Before implementing a story |

## Working conventions

- **Language.** The repository working language is **English** — all `.md`
  deliverables (this file, `docs/`, `README`s) and all code comments are in English.
  **Exception:** the product **UI copy stays French, verbatim** (see
  `design/HANDOFF.md` §7). Translate the docs, never the UI strings.
- **Auth.** JWT bearer (access + refresh in `localStorage`), email + password
  (passlib/bcrypt), **server-side** allowlist. See `docs/ARCHITECTURE.md` §8.
- **Notes.** Bodies stored as **Markdown (GFM task lists** `- [ ]` / `- [x]`); the
  title is a separate field.
- **Visual fidelity.** Reuse the exact tokens from `design/HANDOFF.md` §1 — do not
  invent a palette. Light **and** dark, desktop **and** mobile.
- **Security is server-side.** Allowlist, admin role, and the single-editor lock are
  always enforced on the server; the front only renders what the API returns.

## Keeping the docs in sync (important)

**After any code change, update the docs in the same change if the change warrants
it** — stale docs are treated as a bug:

- **Behavior / data model / API change** → update `docs/ARCHITECTURE.md` (and
  `docs/PRD.md` if the product scope shifts).
- **Deploy / env / ops change** → update the deployment section of
  `docs/ARCHITECTURE.md`, the `api/.env.example` / `web/.env.example` files, and the
  E1 story (`docs/stories/E1-deploiement-railway.md`).
- **As work completes, tick the checkboxes:**
  - in the story file `docs/stories/E*.md` — the **acceptance criteria**, the
    **"Stories at a glance"** list, and the **"Definition of done"** (`[ ]` → `[x]`);
  - in `docs/EPICS.md` — the **progress table** (`[ ]` → `[x]`, and the status
    markers 🔨 / ✅).
- Keep the epic/story wording consistent with what the code actually does; if an
  implementation choice diverges from a story, update the story (or note the change)
  rather than letting them drift apart.

## Non-negotiable product rules (summary — full text in `design/claude.md`)

Single-editor lock (never concurrent editing, no CRDT/OT) · autosave ~1.5 s ·
**1 editing session = 1 version** (restore creates a new version, nothing
overwritten) · server-side allowlist · **disable, never delete** accounts ·
`/admin` protected server-side · reversible private⇄public visibility · no visual
diff in history.
