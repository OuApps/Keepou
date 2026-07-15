#!/bin/sh
set -e

# Apply any pending database migrations, then start the API.
alembic upgrade head
# --proxy-headers + --forwarded-allow-ips=* : trust the reverse proxy's
# X-Forwarded-Proto so redirects (e.g. the /mcp → /mcp/ trailing-slash 307) keep
# the https scheme instead of downgrading to http behind the proxy.
exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}" --proxy-headers --forwarded-allow-ips='*'
