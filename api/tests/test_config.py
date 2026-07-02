"""Config: Postgres URL normalization (E1-S2) + prod secret guard (E2)."""

import pytest
from pydantic import ValidationError

from app.config import Settings, normalize_database_url


def test_normalize_postgres_scheme() -> None:
    assert (
        normalize_database_url("postgres://u:p@host:5432/db")
        == "postgresql+psycopg://u:p@host:5432/db"
    )


def test_normalize_postgresql_scheme() -> None:
    assert (
        normalize_database_url("postgresql://u:p@host:5432/db")
        == "postgresql+psycopg://u:p@host:5432/db"
    )


def test_sqlite_unchanged() -> None:
    assert normalize_database_url("sqlite:///./keepou.db") == "sqlite:///./keepou.db"


def test_already_qualified_unchanged() -> None:
    url = "postgresql+psycopg://u:p@host/db"
    assert normalize_database_url(url) == url


def test_settings_normalizes_from_env(monkeypatch) -> None:
    monkeypatch.setenv("DATABASE_URL", "postgres://u:p@host:5432/db")
    monkeypatch.setenv("SESSION_SECRET", "a-real-secret-for-this-test")
    assert Settings().database_url == "postgresql+psycopg://u:p@host:5432/db"


def test_default_secret_refused_outside_sqlite(monkeypatch) -> None:
    """The public dev secret must not sign tokens against a prod-looking DB."""
    monkeypatch.setenv("DATABASE_URL", "postgres://u:p@host:5432/db")
    monkeypatch.setenv("SESSION_SECRET", "dev-change-me")
    with pytest.raises(ValidationError, match="SESSION_SECRET"):
        Settings()


def test_default_secret_allowed_on_sqlite(monkeypatch) -> None:
    monkeypatch.setenv("DATABASE_URL", "sqlite:///./keepou.db")
    monkeypatch.setenv("SESSION_SECRET", "dev-change-me")
    assert Settings().session_secret == "dev-change-me"
