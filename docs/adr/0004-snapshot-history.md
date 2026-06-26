# ADR-0004 — Snapshot-based note history

**Status:** Accepted · **Date:** 2026-06-26

## Context

Users must be able to **see past states of a note and who changed them**. Because
public notes are edited under a single-editor lock, each content change has a
single, clear author.

## Decision

Store history as **immutable, append-only snapshots** (`NoteVersion`): on every
save that changes **title or content**, write a full snapshot (title + content +
`authorId` + timestamp) **in the same transaction** as the note update.
Non-content changes (color, visibility, archive) and lifecycle events go to a
separate **`ActivityLog`** rather than creating versions.

## Consequences

- ✅ Trivial to read any historical state — a version *is* the full content.
- ✅ Clear attribution per change (author + time), satisfying the audit need.
- ✅ Restore (a later feature) is simply "write a new version equal to an old
  one" — non-destructive and easy.
- ⚠️ Storage grows with edits (full snapshots, not diffs). Acceptable for
  text/checklist content; a retention/pruning policy is deferred to a later
  phase.

## Alternatives considered

- **Diff/patch storage:** smaller, but reconstructing a state means replaying
  diffs, and corruption risk compounds. Not worth it for small text notes.
- **Event sourcing (per-keystroke or per-field events):** powerful but overkill;
  heavier to query "what did this look like then".
