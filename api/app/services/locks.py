"""
Service de verrou mono-éditeur (E4).

Modèle volontairement simple (pas de CRDT/OT) — handoff §3.1 :
- acquisition / renouvellement (heartbeat ~20s) / relâche ;
- expiration ~60s sans heartbeat ;
- acquisition ATOMIQUE : `UPDATE ... WHERE locked_by_id IS NULL OR lock_expires_at < now`
  → 0 ligne affectée = conflit (le serveur tranche, le perdant passe en lecture seule).

Squelette : implémenté en E4.
"""

HEARTBEAT_SECONDS = 20
LOCK_TTL_SECONDS = 60
