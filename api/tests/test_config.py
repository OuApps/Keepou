"""Config: Railway/Heroku PostgreSQL URLs normalize to the psycopg v3 driver (E1-S2)."""

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
    assert Settings().database_url == "postgresql+psycopg://u:p@host:5432/db"
