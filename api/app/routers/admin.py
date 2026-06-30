"""
Admin — gestion des accès (dépendance require_admin).

Endpoints prévus (handoff §5), implémentés en E6 :
  GET    /api/admin/members              (Users + Allowlist en LEFT JOIN)
  POST   /api/admin/allowlist            {email}
  DELETE /api/admin/allowlist/{id}       (uniquement entrées "en attente")
  PATCH  /api/admin/users/{id}           {role|status}  # jamais de suppression
"""

from fastapi import APIRouter

router = APIRouter(prefix="/api/admin", tags=["admin"])
