# Keepou — off-site backup runner (epic E9).
#
# Image for the Railway *scheduled (cron)* service that runs scripts/backup.sh:
# it bundles the PostgreSQL client tools (pg_dump/pg_restore/psql) and the AWS
# CLI (S3-compatible client → Scaleway Object Storage). The service is
# dashboard-provisioned (see docs/RUNBOOK-backups-restore.md); this Dockerfile is
# what it builds.
#
# BUILD CONTEXT = repo root (so it can COPY scripts/). On Railway, set the backup
# service's Root Directory to the repo root and its Dockerfile Path to
# `ops/backup/Dockerfile`.
#
# PG_MAJOR must be >= the managed Postgres server's major version (pg_dump refuses
# to dump a server newer than itself). Bump this build arg when Railway upgrades
# the database — the Railway managed Postgres is on 18 as of 2026-07.
ARG PG_MAJOR=18
FROM postgres:${PG_MAJOR}-bookworm

# postgres:*-bookworm already ships pg_dump/pg_restore/psql + bash + coreutils.
# Add the AWS CLI (Debian's `awscli`, a self-contained S3 client) and CA certs
# for TLS to the Scaleway endpoint. No app code, no secrets — those arrive as
# runtime env vars from Railway.
RUN apt-get update \
 && apt-get install -y --no-install-recommends awscli ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY scripts/backup.sh scripts/restore.sh /app/
RUN chmod +x /app/backup.sh /app/restore.sh

# Default command = take one backup. A Railway cron service runs the container on
# schedule; the process exits when the backup finishes (non-zero on any failure,
# which the scheduler surfaces).
ENTRYPOINT ["/app/backup.sh"]
