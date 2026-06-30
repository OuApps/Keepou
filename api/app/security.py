"""
Sécurité : hash de mot de passe, sessions, dépendances d'authz.

Squelette (implémenté en E1/E6) :
- `hash_password` / `verify_password` via passlib (bcrypt) ;
- session par cookie signé (itsdangerous) ;
- `get_current_user` (401 si non authentifié) ;
- `require_admin` (403 si non admin) — garde réelle de /admin (handoff règle 6).
"""

from passlib.context import CryptContext

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    return pwd_context.verify(password, password_hash)
