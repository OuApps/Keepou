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

    # Public origins of the two services, the single source of truth for every
    # absolute URL the backend builds. In prod these are the paired custom
    # (Cloudflare) sub-domains — e.g. FRONTEND_URL=https://keepou.galaxou.com /
    # API_BASE_URL=https://api-keepou.galaxou.com — never a `*.up.railway.app`
    # domain. `frontend_url` feeds the default CORS origin (below); `api_base_url`
    # feeds the default public MCP URL.
    frontend_url: str = "http://localhost:5173"
    api_base_url: str = "http://localhost:8000"

    # Allowed CORS origins (the web front), comma-separated. Defaults to
    # `frontend_url` so the single web origin is only named once; override to list
    # several. Credentials are off (bearer token in the header, not a cookie), so
    # the strict origin list never hits the wildcard-with-credentials pitfall.
    cors_origins: str = ""
    # JWT bearer TTLs (ARCHITECTURE §8 — indicative ~15 min access / ~30 days refresh).
    access_token_ttl_minutes: int = 15
    refresh_token_ttl_days: int = 30

    # MCP agent access (E13). The streamable-HTTP MCP server is mounted at
    # `<api>/mcp` and authenticated by Personal Access Tokens. `mcp_public_url`
    # is the externally reachable MCP endpoint (used for the OAuth-style resource
    # metadata the spec advertises); it defaults to `api_base_url` + `/mcp`, so
    # setting API_BASE_URL is enough in prod. DNS-rebinding protection is off by
    # default: the endpoint is a bearer-authenticated public API, not a localhost
    # server (the attack it guards against targets browsers reaching 127.0.0.1).
    mcp_enabled: bool = True
    mcp_public_url: str = ""
    mcp_dns_rebinding_protection: bool = False

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @model_validator(mode="after")
    def _normalize_database_url(self) -> "Settings":
        # Normalize once at load so db.py and Alembic both get a psycopg-ready URL.
        self.database_url = normalize_database_url(self.database_url)
        return self

    @model_validator(mode="after")
    def _derive_public_urls(self) -> "Settings":
        # Keep FRONTEND_URL / API_BASE_URL the single source of truth: the CORS
        # origin list and the public MCP URL fall back to them when not set
        # explicitly, so a deploy only has to name the two public origins.
        if not self.cors_origins:
            self.cors_origins = self.frontend_url
        if not self.mcp_public_url:
            self.mcp_public_url = self.api_base_url.rstrip("/") + "/mcp"
        return self

    @model_validator(mode="after")
    def _require_real_secret_outside_dev(self) -> "Settings":
        # The default secret is public (checked into .env.example): tokens signed
        # with it are forgeable by anyone. Refuse to boot against a non-SQLite
        # database (i.e. anything that looks like prod) without a real secret.
        if self.session_secret == "dev-change-me" and not self.database_url.startswith("sqlite"):
            raise ValueError(
                "SESSION_SECRET is still the public dev default; set a strong value "
                "before running against a non-SQLite database."
            )
        return self

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


settings = Settings()
