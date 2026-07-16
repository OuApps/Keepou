"""Config: Postgres URL normalization (E1-S2) + prod secret guard (E2) +
public-URL derivation (FRONTEND_URL / API_BASE_URL → CORS + MCP)."""

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


def test_cors_defaults_to_frontend_url(monkeypatch) -> None:
    """FRONTEND_URL is the single source for the web origin; CORS falls back to it."""
    monkeypatch.delenv("CORS_ORIGINS", raising=False)
    monkeypatch.setenv("FRONTEND_URL", "https://keepou.galaxou.com")
    assert Settings().cors_origins_list == ["https://keepou.galaxou.com"]


def test_cors_origins_override_frontend_url(monkeypatch) -> None:
    """An explicit CORS_ORIGINS wins and may list several origins."""
    monkeypatch.setenv("FRONTEND_URL", "https://keepou.galaxou.com")
    monkeypatch.setenv("CORS_ORIGINS", "https://a.example, https://b.example")
    assert Settings().cors_origins_list == ["https://a.example", "https://b.example"]


def test_mcp_public_url_derives_from_api_base_url(monkeypatch) -> None:
    """API_BASE_URL feeds the public MCP endpoint (trailing slash tolerated)."""
    monkeypatch.delenv("MCP_PUBLIC_URL", raising=False)
    monkeypatch.setenv("API_BASE_URL", "https://api-keepou.galaxou.com/")
    assert Settings().mcp_public_url == "https://api-keepou.galaxou.com/mcp"


def test_mcp_public_url_explicit_override_wins(monkeypatch) -> None:
    monkeypatch.setenv("API_BASE_URL", "https://api-keepou.galaxou.com")
    monkeypatch.setenv("MCP_PUBLIC_URL", "https://mcp.example/mcp")
    assert Settings().mcp_public_url == "https://mcp.example/mcp"
