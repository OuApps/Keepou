#!/usr/bin/env bash
# Prepare a Claude Code cloud session for Keepou.
#
# Runs from the repo's SessionStart hook (.claude/settings.json) so it travels
# with the repo — no per-environment UI config beyond the RAILWAY_TOKEN secret.
# It installs what the Anthropic base image does NOT ship: the Railway CLI, and
# the project's Python/Node dependencies.
#
# Cloud-only: local devs manage their own toolchain, so this is a no-op unless
# CLAUDE_CODE_REMOTE=true. All steps are idempotent and best-effort — a flaky
# registry must warn, never wedge session startup — so we do not use `set -e`.

set -uo pipefail

# Local sessions: do nothing (see docs/en/hooks — CLAUDE_CODE_REMOTE is set to
# "true" only in cloud sessions).
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

repo_root="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"

# 1. Railway CLI — not part of the base image. Idempotent: skip if present.
if ! command -v railway >/dev/null 2>&1; then
  npm i -g @railway/cli >/dev/null 2>&1 \
    || echo "warn: railway CLI install failed — 'railway' will be unavailable" >&2
fi

# 1b. Scope the Railway CLI to THIS repo's Railway project.
#
#   Two token strategies are supported, so one shared cloud environment can
#   serve every repo without per-project Claude config:
#
#   * Account token (RAILWAY_API_TOKEN) — one token for the whole workspace,
#     set ONCE in the shared environment. It is NOT project-scoped, so we run
#     `railway link` here (an account-level op) to associate this working
#     directory with the project/environment/service below. Bare
#     `railway logs/status/up` then target the right project.
#   * Project token (RAILWAY_TOKEN) — already scoped to one project; `railway
#     link` is both unnecessary and unauthorized for it, so we skip.
#
#   These IDs are project metadata (not secrets); each repo commits its own.
#   Default linked service is the API; use `railway logs -s Keepou` for the web.
RAILWAY_PROJECT_ID="321191da-cd4d-4c52-afd6-37193ecb4ae3"
RAILWAY_ENV_NAME="production"
RAILWAY_SERVICE_NAME="keepou-api"
if [ -n "${RAILWAY_API_TOKEN:-}" ] && command -v railway >/dev/null 2>&1; then
  railway link --project "$RAILWAY_PROJECT_ID" \
               --environment "$RAILWAY_ENV_NAME" \
               --service "$RAILWAY_SERVICE_NAME" >/dev/null 2>&1 \
    || echo "warn: 'railway link' failed — pass -p/-e/-s explicitly, e.g. \
railway logs -p $RAILWAY_PROJECT_ID -e $RAILWAY_ENV_NAME -s $RAILWAY_SERVICE_NAME" >&2
fi

# 2. API deps — sync into api/.venv. The base image already ships Python 3.11
#    (>= the project's requires-python), which `uv` discovers and uses; we do
#    NOT run `uv python install`, whose GitHub-release download the network
#    proxy blocks (403). To hard-pin a version, add api/.python-version instead.
( cd "$repo_root/api" && uv sync ) \
  || echo "warn: api dependencies (uv sync) failed" >&2

# 3. Web deps — install the locked dependency tree.
( cd "$repo_root/web" && npm ci --no-audit --no-fund ) \
  || echo "warn: web dependencies (npm ci) failed" >&2

exit 0
