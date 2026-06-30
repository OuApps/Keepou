from collections.abc import Generator

from sqlmodel import Session, create_engine

from app.config import settings

# `check_same_thread` requis seulement pour SQLite (dev). Sans effet sur PostgreSQL.
connect_args = {"check_same_thread": False} if settings.database_url.startswith("sqlite") else {}

engine = create_engine(settings.database_url, echo=False, connect_args=connect_args)


def get_session() -> Generator[Session, None, None]:
    """Dépendance FastAPI : ouvre une session DB par requête."""
    with Session(engine) as session:
        yield session
