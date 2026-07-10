Keepou API — FastAPI + SQLModel + Alembic.

Managed with **uv**. Getting started:

```bash
uv sync
uv run alembic upgrade head                # create/upgrade the SQLite dev DB
uv run uvicorn app.main:app --reload       # http://localhost:8000 — /api/health
```

Quality: `uv run ruff check .` · `uv run ruff format .` · `uv run ty check` · `uv run pytest`.

`requirements.txt` is generated from `uv.lock` (`uv export --no-dev`) and is only
used by the legacy Nixpacks/Railway build; the Docker image installs from `uv.lock`.

The API surface, data model, auth and locking are documented in
[`../docs/ARCHITECTURE.md`](../docs/ARCHITECTURE.md).
