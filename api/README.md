Keepou API — FastAPI + SQLModel + Alembic.

Géré avec **uv**. Démarrage :

```bash
uv sync
uv run uvicorn app.main:app --reload   # http://localhost:8000 — /api/health
```

Qualité : `uv run ruff check .` · `uv run ruff format .` · `uv run ty check` · `uv run pytest`.

`requirements.txt` est généré depuis `uv.lock` (`uv export --no-dev`) pour le déploiement.

Squelette ; logique métier implémentée epic par epic (voir `../EPICS.md` et `../stories/`).
