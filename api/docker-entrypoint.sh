#!/bin/sh
set -e

# Apply any pending database migrations, then start the API.
alembic upgrade head
exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}"
