"""
Single-editor lock service (E5).

Deliberately simple model (no CRDT/OT) — handoff §3.1:
- acquisition / renewal (heartbeat ~20s) / release;
- expiration ~60s without heartbeat;
- ATOMIC acquisition: `UPDATE ... WHERE locked_by_id IS NULL OR lock_expires_at < now`
  → 0 affected rows = conflict (the server decides, the loser goes read-only).

Scaffold: implemented in E5.
"""

HEARTBEAT_SECONDS = 20
LOCK_TTL_SECONDS = 60
