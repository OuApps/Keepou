"""
Auth — register (server-side allowlist check), login, logout, me.

Planned endpoints (handoff §5), implemented in E1:
  POST /api/auth/register   → 403 if email not in allowlist; 201 otherwise
  POST /api/auth/login      → 401 credentials; 403 if status=DISABLED
  POST /api/auth/logout
  GET  /api/auth/me
"""

from fastapi import APIRouter

router = APIRouter(prefix="/api/auth", tags=["auth"])
