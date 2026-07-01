Keepou API — FastAPI + SQLModel + Alembic.

Managed with **uv**. Getting started:

```bash
uv sync
uv run uvicorn app.main:app --reload   # http://localhost:8000 — /api/health
```

Quality: `uv run ruff check .` · `uv run ruff format .` · `uv run ty check` · `uv run pytest`.

`requirements.txt` is generated from `uv.lock` (`uv export --no-dev`) for deployment.

Scaffold; business logic is implemented epic by epic (see `../EPICS.md` and `../stories/`).
