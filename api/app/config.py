from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


def normalize_database_url(url: str) -> str:
    """Return a SQLAlchemy-ready database URL.

    Railway (and Heroku-style providers) expose PostgreSQL as ``postgres://`` or
    ``postgresql://``; SQLModel/SQLAlchemy driving psycopg **v3** expects the explicit
    ``postgresql+psycopg://`` driver prefix. SQLite and already-qualified URLs
    (``postgresql+psycopg://``, ``postgresql+asyncpg://``…) are returned unchanged.
    """
    if url.startswith("postgres://"):
        url = "postgresql://" + url[len("postgres://") :]
    if url.startswith("postgresql://"):
        url = "postgresql+psycopg://" + url[len("postgresql://") :]
    return url


class Settings(BaseSettings):
    """Application configuration (read from the environment / .env)."""

    database_url: str = "sqlite:///./keepou.db"
    session_secret: str = "dev-change-me"
    cors_origins: str = "http://localhost:5173"
    # JWT bearer TTLs (ARCHITECTURE §8 — indicative ~15 min access / ~30 days refresh).
    access_token_ttl_minutes: int = 15
    refresh_token_ttl_days: int = 30

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @model_validator(mode="after")
    def _normalize_database_url(self) -> "Settings":
        # Normalize once at load so db.py and Alembic both get a psycopg-ready URL.
        self.database_url = normalize_database_url(self.database_url)
        return self

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


settings = Settings()
