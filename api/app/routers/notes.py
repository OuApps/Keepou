"""
Notes — CRUD, verrou, versions, restauration.

Endpoints prévus (handoff §5), implémentés en E2 (CRUD), E4 (lock), E5 (versions) :
  GET    /api/notes?tab=mine|public
  POST   /api/notes
  GET    /api/notes/{id}
  PATCH  /api/notes/{id}
  POST   /api/notes/{id}/lock            → 409 si tenu par un autre (update atomique)
  DELETE /api/notes/{id}/lock
  GET    /api/notes/{id}/versions
  POST   /api/notes/{id}/restore/{version_id}
"""

from fastapi import APIRouter

router = APIRouter(prefix="/api/notes", tags=["notes"])
