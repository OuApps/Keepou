# ADR-0002 — PostgreSQL + Prisma, hosted on Railway

**Status:** Accepted · **Date:** 2026-06-26

## Context

Keepou stores users, notes, an append-only history, and an activity log, with
**concurrent writes** to shared public notes. It will be deployed on **Railway**.
We want typed data access and painless migrations.

## Decision

Use **PostgreSQL** as the database, **Prisma** as the ORM/migration tool, and
deploy on **Railway** using its managed **PostgreSQL plugin** (which injects
`DATABASE_URL`).

## Consequences

- ✅ Real concurrency, transactions, and indexes for locking + history at scale.
- ✅ `prisma migrate deploy` runs on release for reproducible schema changes.
- ✅ Railway's plugin removes the need to operate a database ourselves.
- ✅ JSON columns let `Note.content` hold text or checklists without migrations.
- ⚠️ Requires a managed Postgres (a real service), heavier than a single SQLite
  file — accepted as the correct choice for a multi-user, networked app.

## Alternatives considered

- **SQLite:** simplest to host (one file), great for a prototype, but weaker for
  concurrent multi-user writes and not the target for a hosted Railway service.
  (The throwaway prototype used SQLite; production moves to Postgres.)
- **Drizzle ORM:** lighter than Prisma, but Prisma's migrations + typed client
  fit the team's DX preference.
