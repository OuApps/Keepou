"""
Auth — register (vérif allowlist serveur), login, logout, me.

Endpoints prévus (handoff §5), implémentés en E1 :
  POST /api/auth/register   → 403 si email hors allowlist ; 201 sinon
  POST /api/auth/login      → 401 identifiants ; 403 si status=DISABLED
  POST /api/auth/logout
  GET  /api/auth/me
"""

from fastapi import APIRouter

router = APIRouter(prefix="/api/auth", tags=["auth"])
