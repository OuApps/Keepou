"""
Admin — access management (require_admin dependency).

Planned endpoints (handoff §5), implemented in E7:
  GET    /api/admin/members              (Users + Allowlist via LEFT JOIN)
  POST   /api/admin/allowlist            {email}
  DELETE /api/admin/allowlist/{id}       (only "pending" entries)
  PATCH  /api/admin/users/{id}           {role|status}  # never delete
"""

from fastapi import APIRouter

router = APIRouter(prefix="/api/admin", tags=["admin"])
