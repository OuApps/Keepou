# E9 — Database cold backups & restore — Detailed stories

> Epic goal: never lose data — take regular **off-site** backups of the PostgreSQL
> database and be able to **restore** them.
>
> Estimation convention: **S** (≤ ½ day), **M** (1–2 days), **L** (3+ days).
> All these stories are `to do` (nothing is built yet).

**Reference docs.** `EPICS.md` (E9), `docs/ARCHITECTURE.md` §10 (backups), PRD Goals
("data is safe"). **Depends on** E1 (the DB must be deployed). Wire it **as soon as
the DB is live**, ideally before real user data accumulates.

**Key decisions carried in (validated with Guillaume):**
- **Off-site target = Scaleway Object Storage** (S3-compatible, hosted in the EU —
  GDPR-friendly for a francophone community). "Off-site" = **not** on Railway, so a
  Railway incident can't take the backups with it.
- **Scheduler = a Railway scheduled (cron) service**: it runs `pg_dump` via the
  **internal** `DATABASE_URL` (the DB is never exposed publicly) and pushes the dump
  to Scaleway. Credentials stay in Railway secrets.
- **Cold** = a consistent point-in-time logical dump — **not** continuous
  replication (hot standby / PITR are out of MVP scope).

---

## Stories at a glance

- [ ] **E9-S1** — Backup script: `pg_dump` → compress → upload to Scaleway
- [ ] **E9-S2** — Railway scheduled (cron) service running the backup
- [ ] **E9-S3** — Retention & integrity checks
- [ ] **E9-S4** — Tested restore + runbook

**Status.** All `to do`. The **script** (S1) lives in the repo; the **scheduled
service** (S2) is dashboard provisioning that references it.

---

## E9-S1 — Backup script: dump → compress → upload · M

**Goal.** A single, versioned, idempotent script that produces one off-site dump.

**Tasks**
- Add a script under the repo (e.g. `scripts/backup.sh` or a small
  `scripts/backup.py`): `pg_dump` the DB from `DATABASE_URL`, compress (custom format
  `-Fc` or gzip), name it with a UTC timestamp, then upload to **Scaleway Object
  Storage** (S3-compatible) via `aws-cli`/`rclone`.
- Config via env: `DATABASE_URL`, `SCW_ACCESS_KEY`, `SCW_SECRET_KEY`,
  `SCW_ENDPOINT`/region, `BACKUP_BUCKET`. Never hardcode secrets.
- Exit non-zero on any failure (so the scheduler surfaces it).

**Acceptance criteria**
- [ ] Running the script locally against a test DB produces a compressed dump and
  uploads it to the bucket.
- [ ] All connection/credential inputs come from env (nothing hardcoded).
- [ ] The script fails loudly (non-zero exit) if the dump or upload fails.

**Notes.** Keep the S3-compatible client generic so another endpoint (R2/B2/MinIO)
could be swapped by env only, but the **default target is Scaleway**.

---

## E9-S2 — Railway scheduled (cron) service · M

**Goal.** The backup runs automatically on a schedule, off-site, with no public DB
exposure.

**Tasks**
- Provision a **Railway scheduled/cron service** (dashboard) that runs the E9-S1
  script — e.g. **daily**. It uses the project's **internal** `DATABASE_URL`
  reference (DB stays private) + the Scaleway secrets as service variables.
- Document the schedule + the exact command in `docs/DEPLOY.md`.
- (Nice-to-have) a **failure alert** (Railway notification / webhook) if a run fails.

**Acceptance criteria**
- [ ] A scheduled run executes the backup automatically (daily) and lands a dump in
  Scaleway.
- [ ] The DB is reached over the **internal** URL — not exposed publicly.
- [ ] Secrets live in Railway (not in the repo); the schedule is documented.

**Notes.** Pairs with the "Railway cron" decision. Provisioning is dashboard-only
(like E1-S1/S3/S5); the script it runs is versioned (E9-S1).

---

## E9-S3 — Retention & integrity checks · M

**Goal.** Keep a sane history of dumps and prove each one is usable.

**Tasks**
- **Retention** (e.g. **7 daily + 4 weekly**): enforce via a Scaleway bucket
  **lifecycle rule** or a prune step in the script. Log what is deleted (no silent
  truncation).
- **Integrity check** of each dump: at minimum `gzip -t` / `pg_restore --list`
  succeeds; ideally a periodic **restore-verify** into a scratch DB (ties into S4).

**Acceptance criteria**
- [ ] Old dumps beyond the retention window are pruned automatically; the count of
  kept dumps matches the policy.
- [ ] Each dump passes an integrity check (listing/CRC), logged.
- [ ] Retention + integrity policy documented in the runbook.

**Notes.** Snapshots are small (Markdown text), so retention is cheap; the value is
in the *tested* recoverability, not volume.

---

## E9-S4 — Tested restore + runbook · M

**Goal.** A documented restore that has actually been performed end-to-end at least
once.

**Tasks**
- Write the **restore procedure** in the runbook (`docs/DEPLOY.md` or a dedicated
  section): download a dump from Scaleway → `pg_restore`/`psql` into a **fresh**
  database → `alembic upgrade head` if needed → verify (row counts / a smoke read).
- **Perform it once for real** and record: the restore **time** and the **data-loss
  window** (= the backup interval).

**Acceptance criteria**
- [ ] The restore runbook is written and reproducible by another dev.
- [ ] A **full restore has been done end-to-end at least once** and verified.
- [ ] Restore time + data-loss window recorded in the runbook.

**Notes.** "Disable, never delete" + append-only history mean the DB is the single
source of truth — a *tested* restore is what makes the durability promise real
(PRD Goals).

---

## Definition of "E9 done"

- [ ] Automated backups run on schedule (Railway cron) and land **off-site** on
  Scaleway Object Storage.
- [ ] Retention enforced; each dump passes an integrity check.
- [ ] A full restore has been performed end-to-end at least once (runbook written).
- [ ] Restore time + data-loss window documented.
