#!/usr/bin/env bash
#
# Keepou — restore a cold backup produced by scripts/backup.sh (epic E9).
#
# Flow:
#   1. Get the dump — either a local file (--file) or an object key downloaded
#      from Scaleway Object Storage (--key daily/keepou-….dump, default: the
#      newest object under daily/).
#   2. pg_restore it into the TARGET database (custom-format `-Fc` archive).
#   3. Verify — list every table with its exact row count (a smoke read).
#
# SAFETY: restoring is destructive. This script refuses to write into the same
# URL as DATABASE_URL (assumed to be prod) unless --force is given; restore into
# a FRESH database instead (that is what the runbook prescribes). The runbook is
# docs/RUNBOOK-backups-restore.md.
#
# Required env / args:
#   TARGET_DATABASE_URL   Where to restore (a fresh, empty DB). A SQLAlchemy
#                         `+psycopg`/`+asyncpg` driver suffix is stripped.
#   --key KEY | --file PATH   Source dump. With --key (or none), Scaleway creds
#                             (SCW_ACCESS_KEY/SCW_SECRET_KEY/BACKUP_BUCKET) are
#                             required to download. With no --key, the newest
#                             object under hourly/ (the most recent point) is used.
#
# Optional env (same defaults as backup.sh):
#   SCW_REGION [fr-par], SCW_ENDPOINT [https://s3.$SCW_REGION.scw.cloud],
#   BACKUP_BUCKET, DATABASE_URL (guard reference).
#
# Usage:
#   TARGET_DATABASE_URL=postgresql://…/keepou_restore \
#   SCW_ACCESS_KEY=… SCW_SECRET_KEY=… BACKUP_BUCKET=keepou-backups \
#   scripts/restore.sh --key hourly/keepou-20260717T030000Z.dump
#
#   # or from a local file already downloaded:
#   TARGET_DATABASE_URL=postgresql://…/keepou_restore scripts/restore.sh --file ./dump

set -euo pipefail

log() { printf '%s  %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"; }
die() { printf '%s  ERROR: %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >&2; exit 1; }

# --- Parse args -------------------------------------------------------------
KEY=""; FILE=""; FORCE=false
while [ $# -gt 0 ]; do
  case "$1" in
    --key)   KEY="$2"; shift 2;;
    --file)  FILE="$2"; shift 2;;
    --force) FORCE=true; shift;;
    -h|--help) grep '^#' "$0" | sed 's/^# \{0,1\}//'; exit 0;;
    *) die "unknown argument: $1";;
  esac
done

: "${TARGET_DATABASE_URL:?TARGET_DATABASE_URL is required (restore into a FRESH database)}"

# Strip SQLAlchemy driver suffix → libpq URL.
strip_driver() {
  local u="$1"
  u="${u/postgresql+psycopg:\/\//postgresql:\/\/}"
  u="${u/postgresql+asyncpg:\/\//postgresql:\/\/}"
  printf '%s' "$u"
}
target_url="$(strip_driver "$TARGET_DATABASE_URL")"

# --- Guard against clobbering prod -----------------------------------------
if [ "$FORCE" != true ] && [ -n "${DATABASE_URL:-}" ]; then
  if [ "$(strip_driver "$DATABASE_URL")" = "$target_url" ]; then
    die "TARGET_DATABASE_URL == DATABASE_URL — refusing to overwrite the live DB. Restore into a FRESH database, or pass --force if you really mean it."
  fi
fi

command -v pg_restore >/dev/null 2>&1 || die "pg_restore not found on PATH"
command -v psql       >/dev/null 2>&1 || die "psql not found on PATH"

# --- 1. Obtain the dump -----------------------------------------------------
# NB: end cleanup on `return 0` — a failing `[ -n … ]` here would otherwise
# become the script's exit status when the EXIT trap fires after success.
workdir=""; cleanup() { [ -n "$workdir" ] && rm -rf "$workdir"; return 0; }; trap cleanup EXIT

if [ -n "$FILE" ]; then
  [ -f "$FILE" ] || die "no such dump file: $FILE"
  dump_path="$FILE"
  log "using local dump: $dump_path"
else
  command -v aws >/dev/null 2>&1 || die "aws (aws-cli) not found on PATH (needed to download)"
  : "${SCW_ACCESS_KEY:?SCW_ACCESS_KEY required to download}"
  : "${SCW_SECRET_KEY:?SCW_SECRET_KEY required to download}"
  : "${BACKUP_BUCKET:?BACKUP_BUCKET required to download}"
  SCW_REGION="${SCW_REGION:-fr-par}"
  SCW_ENDPOINT="${SCW_ENDPOINT:-https://s3.${SCW_REGION}.scw.cloud}"
  export AWS_ACCESS_KEY_ID="$SCW_ACCESS_KEY" AWS_SECRET_ACCESS_KEY="$SCW_SECRET_KEY" AWS_DEFAULT_REGION="$SCW_REGION"
  s3() { aws --endpoint-url "$SCW_ENDPOINT" "$@"; }

  if [ -z "$KEY" ]; then
    log "no --key given → picking the newest object under hourly/ (most recent point)"
    KEY="hourly/$(s3 s3 ls "s3://${BACKUP_BUCKET}/hourly/" | awk '{print $4}' | grep -v '^$' | sort | tail -n 1)"
    [ "$KEY" != "hourly/" ] || die "no dumps found under s3://${BACKUP_BUCKET}/hourly/"
  fi
  workdir="$(mktemp -d)"
  dump_path="${workdir}/$(basename "$KEY")"
  log "downloading s3://${BACKUP_BUCKET}/${KEY} → ${dump_path}"
  s3 s3 cp "s3://${BACKUP_BUCKET}/${KEY}" "$dump_path" || die "download failed"
fi

# Integrity check before touching the target DB.
log "integrity check (pg_restore --list)"
pg_restore --list "$dump_path" >/dev/null || die "dump is not a readable custom-format archive"

# --- 2. Restore -------------------------------------------------------------
# `--clean --if-exists` drops objects first so a re-run is idempotent;
# `--no-owner --no-privileges` maps everything to the connecting role (the fresh
# DB's role differs from prod's). `--exit-on-error` surfaces any failure.
log "restoring into target database"
pg_restore --clean --if-exists --no-owner --no-privileges --exit-on-error \
  --dbname="$target_url" "$dump_path" || die "pg_restore failed"

# --- 3. Verify (smoke read) -------------------------------------------------
log "verifying — row counts per table:"
tables="$(psql "$target_url" -tAc "select tablename from pg_tables where schemaname='public' order by tablename")"
[ -n "$tables" ] || die "no tables found in public schema after restore"
total=0
while IFS= read -r t; do
  [ -n "$t" ] || continue
  c="$(psql "$target_url" -tAc "select count(*) from \"$t\"")"
  printf '    %-28s %s\n' "$t" "$c"
  total=$((total + c))
done <<< "$tables"
log "restore complete — $(printf '%s\n' "$tables" | grep -c .) table(s), ${total} row(s) total"
