"""
Security: password hash, JWT bearer tokens, authz dependencies.

Scaffold (implemented in E2):
- `hash_password` / `verify_password` via passlib (bcrypt);
- signed JWT access + refresh tokens (Authorization: Bearer);
- `get_current_user` (401 if not authenticated; re-checks user status);
- `require_admin` (403 if not admin) — real guard for /admin (handoff rule 6).
"""

from passlib.context import CryptContext

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    return pwd_context.verify(password, password_hash)
