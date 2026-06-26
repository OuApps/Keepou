# ADR-0003 — Pessimistic single-editor lock for public notes

**Status:** Accepted · **Date:** 2026-06-26

## Context

Public notes are editable by every member. Two people editing simultaneously
could overwrite each other. The product explicitly wants **simplicity** and
**"one editor at a time"**, not live collaborative editing.

## Decision

Use a **pessimistic, single-writer lock** on public notes:
- A note has `lockedById` + `lockedAt`.
- A client **acquires** the lock to edit, **heartbeats** (~every 12s) to keep it,
  and the lock **auto-expires** after a short TTL (~30s) without a heartbeat.
- The server **rejects saves** (HTTP 423) from anyone who doesn't hold a valid
  lock.
- A blocked user gets a **gentle "being edited by X, try again shortly"** message.

## Consequences

- ✅ Guarantees a single writer → no lost updates, no merge logic.
- ✅ Stale locks self-heal via TTL, so a closed tab never blocks others for long.
- ✅ Simple to implement and reason about; no extra infrastructure.
- ⚠️ Not truly real-time: a second person must wait. Acceptable per product
  intent; presence/live-read can be layered on later.
- ⚠️ TTL is a tradeoff: too short risks losing a lock mid-edit; too long blocks
  others. ~30s with a ~12s heartbeat is the starting point, tunable.

## Alternatives considered

- **Optimistic concurrency (version check on save):** no waiting, but produces
  conflicts the user must resolve — more complex UX than "one at a time".
- **CRDT / OT real-time co-editing:** best collaboration UX, but large complexity
  and infra; explicitly out of scope for now.
