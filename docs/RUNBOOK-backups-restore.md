# Runbook — database cold backups & restore (E9)

> **Goal.** Never lose data: take regular **off-site** logical backups of the
> production PostgreSQL database and be able to **restore** them, end-to-end.
>
> **Scope.** "Cold" = a consistent point-in-time `pg_dump` — **not** continuous
> replication (hot standby / PITR are out of MVP scope). "Off-site" = **Scaleway
> Object Storage**, not Railway, so a Railway-side incident can't take the backups
> with it. Scaleway is S3-compatible and EU-hosted (GDPR-friendly for a
> francophone community).

## At a glance

| | |
|---|---|
| **What runs** | [`scripts/backup.sh`](../scripts/backup.sh) — `pg_dump -Fc` → integrity check → tiered upload → prune |
| **Where** | A Railway **scheduled (cron) service** built from [`ops/backup/Dockerfile`](../ops/backup/Dockerfile) |
| **Schedule** | Hourly, `0 * * * *` — set as code in [`railway.json`](../railway.json) (`deploy.cronSchedule`) |
| **Target** | `s3://$BACKUP_BUCKET/hourly/…`, promoted to `…/daily/…` once a day and `…/weekly/…` once a week, on Scaleway |
| **Retention** | 48 hourly + 7 daily + 4 weekly (pruned every run, logged) |
| **Restore** | [`scripts/restore.sh`](../scripts/restore.sh) — download → `pg_restore` → verify |
| **Data-loss window** | ≤ 1 h (= the backup interval) — see [Data-loss window](#data-loss-window) |

---

## 1. What the backup does

Each run of `scripts/backup.sh` (one run = one dump):

1. **Dump** — `pg_dump --format=custom --no-owner --no-privileges` from
   `DATABASE_URL`. Custom format (`-Fc`) is self-compressing and restores
   selectively; `--no-owner --no-privileges` keeps the dump portable so it loads
   into a fresh DB whose role differs from prod's. The `DATABASE_URL` may carry a
   SQLAlchemy `+psycopg` / `+asyncpg` driver suffix (the API uses one) — the
   script strips it back to a libpq URL automatically.
2. **Integrity check** — `pg_restore --list` reads the archive's table of
   contents back. A truncated or corrupt dump fails here, **before** it is
   uploaded.
3. **Upload (tiered)** — every run lands in `s3://$BACKUP_BUCKET/hourly/keepou-<UTC-timestamp>.dump`.
   The **first run of each UTC day** is also promoted to `daily/`, and the **first
   run of `WEEKLY_DOW`** (default **7 = Sunday**) to `weekly/`. "First run of the
   period" is inferred from the objects already in the bucket, so the tiers stay
   correct whatever the cron cadence (hourly, every 6 h, daily…).
4. **Prune** — keep the newest `HOURLY_RETENTION` (48) under `hourly/`, `DAILY_RETENTION`
   (7) under `daily/`, and `WEEKLY_RETENTION` (4) under `weekly/`; delete the rest.
   Dumps are named with a lexicographically-sortable UTC timestamp, so alphabetical
   order == age. Every deletion is logged (no silent truncation).

The script **exits non-zero on any failure** so the Railway cron surfaces it.

### Configuration (env only — nothing hardcoded)

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `DATABASE_URL` | ✅ | — | Source DB (Railway's **internal** Postgres URL) |
| `SCW_ACCESS_KEY` | ✅¹ | — | Scaleway API access key |
| `SCW_SECRET_KEY` | ✅¹ | — | Scaleway API secret key |
| `BACKUP_BUCKET` | ✅¹ | — | Target bucket name |
| `SCW_REGION` | | `fr-par` | Scaleway region |
| `SCW_ENDPOINT` | | `https://s3.$SCW_REGION.scw.cloud` | S3 endpoint (swap for R2/B2/MinIO) |
| `BACKUP_PREFIX` | | `keepou` | Dump-name prefix inside the bucket |
| `HOURLY_PREFIX` | | `hourly` | Fine-grained tier prefix (every run) |
| `HOURLY_RETENTION` | | `48` | Fine-grained dumps to keep (2 days at hourly) |
| `DAILY_RETENTION` | | `7` | Daily dumps to keep |
| `WEEKLY_RETENTION` | | `4` | Weekly dumps to keep |
| `WEEKLY_DOW` | | `7` | ISO day-of-week that also lands a weekly |
| `UPLOAD` | | `true` | `false` → dump + integrity check only (local smoke test) |
| `KEEP_LOCAL` | | `false` | `true` → keep the local dump file after upload |

¹ Required only when `UPLOAD=true` (the default).

---

## 2. Provision the Railway cron service

The service itself is created in the **dashboard**; its **build + cron schedule**
are **config-as-code** in the repo-root [`railway.json`](../railway.json).

1. **New service** in the Keepou project → deploy from **this GitHub repo**. Set
   **Root Directory** = repo root. Railway then reads the repo-root `railway.json`,
   which pins the Dockerfile (`ops/backup/Dockerfile`), the **cron schedule**
   (`0 * * * *`, hourly), and `restartPolicyType: NEVER` (a failed run waits for
   the next tick instead of crash-looping). keepou-api / keepou-web are unaffected
   — they have their own root dirs (`api/`, `web/`) and their own `railway.json`.
2. **Service variables**:
   - `DATABASE_URL` = `${{ Postgres.DATABASE_URL }}` — the plugin's **internal**
     URL, so the database is **never exposed publicly**.
   - `SCW_ACCESS_KEY`, `SCW_SECRET_KEY`, `BACKUP_BUCKET`, `SCW_REGION` — the
     Scaleway credentials + target (kept in Railway secrets, **not** in the repo).
3. To change cadence, edit `deploy.cronSchedule` in `railway.json` (minimum
   interval on Railway is **5 min**). Adjust `HOURLY_RETENTION` if you want a
   different fine-grained depth (window = cadence × `HOURLY_RETENTION`).
4. If Railway upgrades the managed Postgres major version, bump the image's
   `PG_MAJOR` build arg (`pg_dump` must be ≥ the server version).

**Failure alerting** (nice-to-have): enable Railway's deploy/crash notifications
on this service, or add a webhook, so a non-zero exit pages someone.

### Scaleway setup (one-time)

1. Create a **bucket** (e.g. `keepou-backups`) in the `fr-par` region, **private**.
2. Create an **API key** (access + secret) scoped to Object Storage; put it in the
   Railway service variables above.
3. **Retention** is enforced by the script (48 hourly + 7 daily + 4 weekly).
   Optionally add a bucket **lifecycle rule** as a backstop (e.g. expire objects
   older than 60 days) — but note a pure age rule can't express "keep 4 weeklies",
   so the script stays
   the source of truth for the policy.

---

## 3. Restore procedure (tested)

> **Restore into a FRESH database**, never over the live one. `restore.sh` refuses
> to write into the same URL as `DATABASE_URL` unless `--force` is given.

### Steps

1. **Create a fresh, empty database** to restore into — a scratch Railway Postgres,
   a local one, or a new database on the same server:
   ```bash
   createdb -h <host> -U <user> keepou_restore
   ```
2. **Run the restore** — it downloads the dump from Scaleway (or takes a local
   `--file`), integrity-checks it, `pg_restore`s it, then verifies:
   ```bash
   TARGET_DATABASE_URL="postgresql://<user>:<pass>@<host>:5432/keepou_restore" \
   SCW_ACCESS_KEY=… SCW_SECRET_KEY=… BACKUP_BUCKET=keepou-backups SCW_REGION=fr-par \
   scripts/restore.sh --key hourly/keepou-20260717T030000Z.dump
   ```
   - Omit `--key` to restore the **newest** `hourly/` dump (the most recent point)
     automatically. Pass a `daily/…` or `weekly/…` key to go further back.
   - Use `--file ./keepou-….dump` to restore a dump you already downloaded (no
     Scaleway creds needed).
   - The dump was taken with `--no-owner --no-privileges`, so it maps to the
     connecting role. It carries the **schema + data**, so a plain restore is
     complete — you do **not** run `alembic upgrade head` on it. (Only run
     migrations if you ever restore into a DB whose schema is newer than the dump.)
3. **Verify** — the script prints a row count per table and a total. Cross-check
   the important tables (e.g. `note`, `noteversion`, `user`, `personalaccesstoken`)
   against expectations, or open the app against the restored DB for a smoke read.

### Promoting a restore to production

If this is a real recovery (not a drill): point the API service's `DATABASE_URL`
at the restored database (or restore into the prod DB with `--force` during a
maintenance window), redeploy, and confirm `GET /api/health` + a login.

---

## 4. Retention & integrity policy

- **Retention**: **48 hourly + 7 daily + 4 weekly** (a grandfather-father-son
  scheme). The hourly tier gives fine-grained recent recovery (~2 days at hourly
  cadence); daily/weekly give depth without keeping many objects. Enforced every
  run by the prune step; each deletion is logged. Snapshots are small (Markdown
  text — a full dump is ~180 KB), so retention is cheap — the value is in *tested
  recoverability*, not volume.
- **Integrity**: every dump is validated with `pg_restore --list` **before**
  upload; `restore.sh` re-validates **before** touching the target DB. A periodic
  full **restore-verify** into a scratch DB (section 3) is the strongest check —
  run it at least quarterly.

---

## 5. Data-loss window

The backup runs **hourly**, so the worst-case data-loss window is the **backup
interval ≈ 1 h**: a failure just before the top-of-hour run loses up to an hour of
edits. Change the cadence in `railway.json` (`deploy.cronSchedule`; Railway
minimum is 5 min) and adjust `HOURLY_RETENTION` for the fine-grained depth you
want (window = cadence × `HOURLY_RETENTION`).

| Metric | Value |
|---|---|
| Backup interval | 1 h (hourly `0 * * * *`) |
| **Data-loss window (RPO)** | **≤ 1 h** |
| Restore time (RTO), observed | **~6 s** (download → verified, ~180 KB / 736 rows) — plus a few min to provision a fresh DB + repoint the app for a real recovery |

---

## 6. First real restore — record

The first full restore has been **performed end-to-end against the live Scaleway
bucket** — the durability promise is real:

- **Date performed:** 2026-07-18
- **Dump restored (key):** `hourly/keepou-20260718T200001Z.dump` (~180 KB / 183,318 bytes)
- **Restore time (download → verified):** ~6 s
- **Tables / rows verified:** 6 tables, 736 rows — `note` 313, `noteversion` 414,
  `user` 3, `personalaccesstoken` 4, `allowlistentry` 1, `alembic_version` 1
- **Method:** `scripts/restore.sh` into a **fresh PostgreSQL 18** database;
  Scaleway credentials injected via `railway run -s keepou-backups` (never printed).
- **Notes / issues:** none — dump integrity-checked, restored and row-counts
  verified cleanly. `pg_dump`/`pg_restore` client pinned to **18** to match the
  Railway server (18.4).

> Re-run this drill after any major change (schema, Postgres major upgrade, provider
> swap) and at least quarterly; update the numbers above.
