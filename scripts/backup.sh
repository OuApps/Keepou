#!/usr/bin/env bash
#
# Keepou — off-site cold backup of the PostgreSQL database (epic E9).
#
# Flow (one run = one dump):
#   1. pg_dump the DB (custom format `-Fc`, self-compressing) from DATABASE_URL.
#   2. Integrity check: `pg_restore --list` must read the dump back (catches a
#      truncated/corrupt dump before it ever leaves the box).
#   3. Upload to Scaleway Object Storage (S3-compatible) under `daily/`, and — on
#      the weekly boundary — also under `weekly/`.
#   4. Retention: keep the N newest dumps in each prefix, prune the rest (logged).
#
# "Cold" = a consistent point-in-time logical dump, NOT continuous replication.
# "Off-site" = Scaleway, not Railway, so a Railway incident can't take the
# backups with it. Restore is the sibling script `restore.sh`; the full runbook
# is docs/RUNBOOK-backups-restore.md.
#
# Everything is env-driven — no secret is ever hardcoded. The script exits
# non-zero on ANY failure so the scheduler (Railway cron) surfaces it.
#
# Required env:
#   DATABASE_URL     Postgres connection string (the app's internal URL on Railway).
#                    A SQLAlchemy `+psycopg`/`+asyncpg` driver suffix is stripped
#                    automatically so the same value the API uses works here.
#   SCW_ACCESS_KEY   Scaleway API access key.
#   SCW_SECRET_KEY   Scaleway API secret key.
#   BACKUP_BUCKET    Target bucket name (without the s3:// prefix).
#
# Optional env (defaults in brackets):
#   SCW_REGION           Scaleway region [fr-par].
#   SCW_ENDPOINT         S3 endpoint URL [https://s3.$SCW_REGION.scw.cloud].
#                        Point it at R2/B2/MinIO to swap providers by env alone.
#   BACKUP_PREFIX        Key prefix inside the bucket [keepou].
#   DAILY_RETENTION      Daily dumps to keep [7].
#   WEEKLY_RETENTION     Weekly dumps to keep [4].
#   WEEKLY_DOW           ISO day-of-week (1=Mon … 7=Sun) that also lands a weekly [7].
#   UPLOAD               Set to "false" to dump + integrity-check only, no upload
#                        (handy to smoke-test locally without Scaleway creds) [true].
#   KEEP_LOCAL           Set to "true" to keep the local dump file after upload [false].
#   BACKUP_DIR           Where the dump is written [a mktemp dir, auto-removed].

set -euo pipefail

log() { printf '%s  %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"; }
die() { printf '%s  ERROR: %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >&2; exit 1; }

# --- Config -----------------------------------------------------------------
: "${DATABASE_URL:?DATABASE_URL is required}"

UPLOAD="${UPLOAD:-true}"
if [ "$UPLOAD" = "true" ]; then
  : "${SCW_ACCESS_KEY:?SCW_ACCESS_KEY is required (or set UPLOAD=false)}"
  : "${SCW_SECRET_KEY:?SCW_SECRET_KEY is required (or set UPLOAD=false)}"
  : "${BACKUP_BUCKET:?BACKUP_BUCKET is required (or set UPLOAD=false)}"
fi

SCW_REGION="${SCW_REGION:-fr-par}"
SCW_ENDPOINT="${SCW_ENDPOINT:-https://s3.${SCW_REGION}.scw.cloud}"
BACKUP_PREFIX="${BACKUP_PREFIX:-keepou}"
DAILY_RETENTION="${DAILY_RETENTION:-7}"
WEEKLY_RETENTION="${WEEKLY_RETENTION:-4}"
WEEKLY_DOW="${WEEKLY_DOW:-7}"
KEEP_LOCAL="${KEEP_LOCAL:-false}"

# pg_dump/pg_restore speak libpq, which does NOT understand SQLAlchemy's
# `postgresql+psycopg://` / `+asyncpg` driver suffix — strip it back to a plain
# libpq URL. `postgres://` is already valid for libpq.
db_url="$DATABASE_URL"
db_url="${db_url/postgresql+psycopg:\/\//postgresql:\/\/}"
db_url="${db_url/postgresql+asyncpg:\/\//postgresql:\/\/}"

# --- Tooling checks ---------------------------------------------------------
command -v pg_dump    >/dev/null 2>&1 || die "pg_dump not found on PATH"
command -v pg_restore >/dev/null 2>&1 || die "pg_restore not found on PATH"
if [ "$UPLOAD" = "true" ]; then
  command -v aws >/dev/null 2>&1 || die "aws (aws-cli) not found on PATH"
fi

# --- Scratch space ----------------------------------------------------------
if [ -n "${BACKUP_DIR:-}" ]; then
  mkdir -p "$BACKUP_DIR"
  workdir="$BACKUP_DIR"
  cleanup_workdir=false
else
  workdir="$(mktemp -d)"
  cleanup_workdir=true
fi

TS="$(date -u +%Y%m%dT%H%M%SZ)"
dump_name="${BACKUP_PREFIX}-${TS}.dump"
dump_path="${workdir}/${dump_name}"

cleanup() {
  if [ "$KEEP_LOCAL" != "true" ]; then
    rm -f "$dump_path"
    [ "$cleanup_workdir" = true ] && rmdir "$workdir" 2>/dev/null || true
  fi
}
trap cleanup EXIT

# --- 1. Dump ----------------------------------------------------------------
# `-Fc` = custom format: self-compressing and restorable selectively with
# pg_restore. `--no-owner --no-privileges` keeps the dump portable — it restores
# cleanly into a fresh DB whose role differs from prod's.
log "dumping database → ${dump_name}"
pg_dump --format=custom --no-owner --no-privileges --dbname="$db_url" --file="$dump_path" \
  || die "pg_dump failed"

dump_bytes="$(wc -c < "$dump_path" | tr -d ' ')"
[ "$dump_bytes" -gt 0 ] || die "dump is empty (${dump_bytes} bytes)"
log "dump written: ${dump_bytes} bytes"

# --- 2. Integrity check -----------------------------------------------------
# `pg_restore --list` walks the archive's table of contents and verifies it is
# readable. A truncated or corrupt custom-format dump fails here, before upload.
log "integrity check (pg_restore --list)"
pg_restore --list "$dump_path" >/dev/null || die "integrity check failed — dump is not readable"
log "integrity check passed"

if [ "$UPLOAD" != "true" ]; then
  log "UPLOAD=false — skipping upload & retention (local dump kept at ${dump_path})"
  KEEP_LOCAL=true
  exit 0
fi

# --- S3 helper --------------------------------------------------------------
export AWS_ACCESS_KEY_ID="$SCW_ACCESS_KEY"
export AWS_SECRET_ACCESS_KEY="$SCW_SECRET_KEY"
export AWS_DEFAULT_REGION="$SCW_REGION"

s3() { aws --endpoint-url "$SCW_ENDPOINT" "$@"; }

# --- 3. Upload --------------------------------------------------------------
daily_key="daily/${dump_name}"
log "uploading → s3://${BACKUP_BUCKET}/${daily_key}"
s3 s3 cp "$dump_path" "s3://${BACKUP_BUCKET}/${daily_key}" \
  || die "upload to daily/ failed"

dow="$(date -u +%u)"  # 1=Mon … 7=Sun
if [ "$dow" = "$WEEKLY_DOW" ]; then
  weekly_key="weekly/${dump_name}"
  log "weekly boundary (ISO dow=${dow}) → also uploading s3://${BACKUP_BUCKET}/${weekly_key}"
  s3 s3 cp "$dump_path" "s3://${BACKUP_BUCKET}/${weekly_key}" \
    || die "upload to weekly/ failed"
fi

# --- 4. Retention -----------------------------------------------------------
# Keep the N newest objects under a prefix, delete the rest. Dumps are named with
# a lexicographically-sortable UTC timestamp, so alphabetical order == age order.
prune_prefix() {
  local prefix="$1" keep="$2" keys total to_delete
  keys="$(s3 s3 ls "s3://${BACKUP_BUCKET}/${prefix}/" | awk '{print $4}' | grep -v '^$' | sort || true)"
  total="$(printf '%s\n' "$keys" | grep -c . || true)"
  if [ "$total" -le "$keep" ]; then
    log "retention ${prefix}/: ${total} dump(s) ≤ keep ${keep} — nothing to prune"
    return 0
  fi
  to_delete=$((total - keep))
  log "retention ${prefix}/: ${total} dump(s), keep ${keep}, pruning ${to_delete} oldest"
  printf '%s\n' "$keys" | head -n "$to_delete" | while IFS= read -r key; do
    [ -n "$key" ] || continue
    log "  pruning s3://${BACKUP_BUCKET}/${prefix}/${key}"
    s3 s3 rm "s3://${BACKUP_BUCKET}/${prefix}/${key}" || die "failed to prune ${prefix}/${key}"
  done
}

prune_prefix "daily"  "$DAILY_RETENTION"
prune_prefix "weekly" "$WEEKLY_RETENTION"

log "backup complete: ${daily_key} (${dump_bytes} bytes)"
