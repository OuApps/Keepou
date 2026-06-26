# ADR-0005 — Admin-managed allowlist + bootstrap admin

**Status:** Accepted · **Date:** 2026-06-26

## Context

Keepou is a closed, self-hosted instance for a known group. There is no public
sign-up: an admin decides who may join. The instance must bootstrap from an empty
database without a chicken-and-egg admin problem.

## Decision

- The **first account ever created becomes `ADMIN`**, bypassing the allowlist
  (bootstrap from empty DB).
- Afterwards, registration is **allowed only if the email is on an
  admin-managed allowlist** (`AllowedEmail`); otherwise it is **politely
  rejected**.
- Admins can **add/remove allowed emails**, **promote/demote** admins, and
  **deactivate/reactivate** users. Users are **never hard-deleted**; deactivation
  blocks sign-in but keeps their notes.
- A **last-admin guard** prevents removing/demoting/deactivating the final active
  admin.

## Consequences

- ✅ No open registration; the instance owner fully controls membership.
- ✅ Self-bootstrapping: the person who deploys it becomes admin by signing up
  first.
- ✅ Deactivation preserves data and is reversible (no destructive account ops).
- ⚠️ Bootstrap assumes the *intended* admin registers first — documented as a
  deployment step. (A future option: seed the first admin via env var.)
- ⚠️ Allowlist is email-based; correctness depends on users registering with the
  exact allowed email. Email verification (SMTP) is a later enhancement.

## Alternatives considered

- **Open registration toggle (`ALLOW_REGISTRATION`):** simpler, but doesn't give
  per-person control the product wants.
- **Invite tokens by email:** nicer UX, but requires SMTP — deferred to a later
  phase; the allowlist achieves the same gate without email dependency.
