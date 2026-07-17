# Keepou — off-site backup runner (E9)

This directory holds the container image for the **Railway scheduled (cron)
service** that backs the Keepou database up off-site to **Scaleway Object
Storage**. The actual logic is the versioned, provider-generic script
[`scripts/backup.sh`](../../scripts/backup.sh); restoring is
[`scripts/restore.sh`](../../scripts/restore.sh). Full procedure, retention
policy and the tested restore runbook: **[`docs/RUNBOOK-backups-restore.md`](../../docs/RUNBOOK-backups-restore.md)**.

- `Dockerfile` — `postgres:*-bookworm` + AWS CLI; runs `backup.sh` as its entrypoint.
  **Build context = repo root** (it copies `scripts/`).
- `.env.example` — the service variables (DB source + Scaleway target + retention knobs).

## Provision on Railway (dashboard)

1. **New service → GitHub repo** (this repo). Set **Root Directory** = repo root
   and **Dockerfile Path** = `ops/backup/Dockerfile`.
2. **Variables**: `DATABASE_URL` = `${{ Postgres.DATABASE_URL }}` (the plugin's
   **internal** URL — the DB stays private), plus `SCW_ACCESS_KEY`,
   `SCW_SECRET_KEY`, `BACKUP_BUCKET`, `SCW_REGION`.
3. **Cron Schedule** = `0 3 * * *` (daily 03:00 UTC). Railway runs the container
   on that schedule; it exits when the backup finishes (non-zero on failure).
4. Bump the image's `PG_MAJOR` build arg if Railway upgrades the Postgres major.

## Run locally

```bash
cp ops/backup/.env.example ops/backup/.env   # fill in secrets
set -a; . ops/backup/.env; set +a
scripts/backup.sh                            # dump → integrity check → upload → prune
# dump + integrity only, no Scaleway creds needed:
UPLOAD=false KEEP_LOCAL=true scripts/backup.sh
```
