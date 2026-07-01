"""
Security: password hash, sessions, authz dependencies.

Scaffold (implemented in E1/E6):
- `hash_password` / `verify_password` via passlib (bcrypt);
- session via signed cookie (itsdangerous);
- `get_current_user` (401 if not authenticated);
- `require_admin` (403 if not admin) — real guard for /admin (handoff rule 6).
"""

from passlib.context import CryptContext

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    return pwd_context.verify(password, password_hash)
