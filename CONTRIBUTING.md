# Contributing to Keepou

Thanks for taking the time to look. Keepou is a small self-hosted notes app; the
codebase is meant to stay readable, so contributions that keep it that way are
very welcome.

## Ground rules

- **Working language is English.** Docs, comments and commit messages are in
  English. The one exception is the **user-facing UI copy, which stays French,
  verbatim** — it is centralised in `web/src/lib/copy.ts` and specified in
  `design/HANDOFF.md` §7. Don't translate the UI strings.
- **Security is enforced server-side.** The allowlist, the admin role and the
  single-editor lock live in the API. The front-end only renders what the API
  returns — never move an access check to the client.
- **Keep the docs in sync.** If you change behaviour, the data model or the API,
  update `docs/ARCHITECTURE.md` in the same change.

## Project layout

- `web/` — React + TypeScript (Vite) front-end.
- `api/` — FastAPI + SQLModel + Alembic back-end.
- `docs/` — product (`PRD.md`) and technical (`ARCHITECTURE.md`) reference.
- `design/` — the validated mockups and the design system handoff.

## Local setup

See the [Development](./README.md#development) section of the README for how to
run the front and the back.

## Before you open a pull request

CI runs the same checks on every push and pull request. Run them locally first:

```bash
# api/
uv run ruff check . && uv run ruff format --check . && uv run ty check && uv run pytest

# web/
npm run typecheck && npm run lint && npm run format && npm run test && npm run build
```

Then:

1. Branch off `main`.
2. Keep the change focused; add or update tests when you touch behaviour.
3. Describe what changed and how you tested it in the pull request.

Commit messages loosely follow `type(scope): summary` (`feat`, `fix`, `docs`,
`chore`…), but readability matters more than the exact format.
