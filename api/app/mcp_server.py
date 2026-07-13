"""
MCP server (E13) — exposes Keepou's notes to an agent over the Model Context
Protocol, so a member can drive their notes from an assistant (and, later, a
WhatsApp / Telegram bot that speaks MCP).

Identity, transport & auth:
- The agent has its **own identity**, **Botou** (services/bot.py): a public-only
  bot account that owns every note created over MCP. It does *not* act as the
  member who minted the token.
- **Streamable HTTP**, mounted at ``<api>/mcp`` (app/main.py), **stateless** so
  each request stands alone — a good fit for an agent that fires one-off calls.
- **Bearer auth via Personal Access Tokens**: FastMCP's ``token_verifier`` runs
  our :class:`KeepouTokenVerifier`, which resolves the presented ``kpat_…`` token
  to Botou (services/bot.py) — only tokens owned by the ACTIVE bot resolve.
  Inside a tool, ``get_access_token()`` carries Botou's id in ``subject``, so
  every action runs as Botou under the same server-side rules as the REST API.
  Admins mint / revoke these tokens (routers/tokens.py).

The note logic lives in app/services/agent.py (transport-free, unit tested); the
tools here are thin adapters. Tool text is English (an agent-facing API, not
product UI copy).
"""

import contextlib
from collections.abc import AsyncIterator

from mcp.server.auth.middleware.auth_context import get_access_token
from mcp.server.auth.provider import AccessToken, TokenVerifier
from mcp.server.auth.settings import AuthSettings
from mcp.server.fastmcp import FastMCP
from mcp.server.fastmcp.exceptions import ToolError
from mcp.server.transport_security import TransportSecuritySettings
from pydantic import AnyHttpUrl
from sqlmodel import Session

from app.config import settings
from app.db import engine
from app.models import User, UserStatus
from app.services import agent
from app.services.bot import resolve_bot_token

# Scope granted to every Personal Access Token — a single coarse scope is enough
# for a personal tool; kept for forward compatibility (finer scopes later).
MCP_SCOPE = "keepou:notes"


def open_session() -> Session:
    """Open a DB session for a tool call. Indirected so tests can point the MCP
    tools at their in-memory engine (the FastAPI dependency override does not
    reach code outside request handling)."""
    return Session(engine)


class KeepouTokenVerifier(TokenVerifier):
    """Resolve a Personal Access Token to the Botou identity for FastMCP's bearer
    auth. Only tokens owned by the ACTIVE bot resolve (services/bot.py)."""

    async def verify_token(self, token: str) -> AccessToken | None:
        with open_session() as session:
            bot = resolve_bot_token(token, session)
            if bot is None:
                return None
            return AccessToken(token=token, client_id=bot.id, scopes=[MCP_SCOPE], subject=bot.id)


def _issuer_url() -> AnyHttpUrl:
    """The origin of the public MCP URL — the advertised authorization server."""
    url = settings.mcp_public_url
    scheme, _, rest = url.partition("://")
    host = rest.split("/", 1)[0]
    return AnyHttpUrl(f"{scheme}://{host}")


def _current_user(session: Session) -> User:
    """The Botou identity for the running tool call."""
    access = get_access_token()
    user = session.get(User, access.subject) if access is not None else None
    if user is None or user.status != UserStatus.ACTIVE:
        raise ToolError("Your access is no longer valid. Ask an admin to issue a new token.")
    return user


def _guard(fn):
    """Map domain errors to clean, agent-readable tool errors."""

    def wrapped(*args, **kwargs):
        try:
            return fn(*args, **kwargs)
        except agent.AgentError as exc:
            raise ToolError(str(exc)) from exc
        except ValueError as exc:
            # e.g. a bad color/visibility enum value.
            raise ToolError(f"Invalid value: {exc}") from exc

    return wrapped


mcp = FastMCP(
    "Keepou",
    instructions=(
        "Keepou is a self-hosted notes app (like Google Keep). You act as Botou, the "
        "app's shared PUBLIC agent: every note you create or edit is PUBLIC and visible "
        "to all members (authored « par Botou »). You cannot see or create private "
        "notes. Notes are text + Markdown checklists (GFM task lists, `- [ ]` / `- [x]`) "
        "with 5 colors (GOLD, AVOCAT, SALSA, CLAY, TEAL). Prefer `search_notes` to find "
        "a note, then act on it by id. Editing a note may fail if a member is editing "
        "it live."
    ),
    stateless_http=True,
    json_response=True,
    token_verifier=KeepouTokenVerifier(),
    auth=AuthSettings(
        issuer_url=_issuer_url(),
        resource_server_url=AnyHttpUrl(settings.mcp_public_url),
        required_scopes=[],
    ),
    transport_security=TransportSecuritySettings(
        enable_dns_rebinding_protection=settings.mcp_dns_rebinding_protection
    ),
    streamable_http_path="/",
)


@mcp.tool()
def list_notes(tab: str = "mine", archived: bool = False) -> list[dict]:
    """List notes, newest first (pinned first).

    Args:
        tab: "mine" for the member's own notes, "public" for every member's public notes.
        archived: when tab="mine", true lists the archived notes instead of the board.
    """
    with open_session() as session:
        user = _current_user(session)
        return _guard(agent.list_notes)(session, user, tab, archived)


@mcp.tool()
def search_notes(query: str, tab: str = "mine") -> list[dict]:
    """Find notes whose title or body contains `query` (case-insensitive).

    Args:
        query: the text to look for.
        tab: "mine" (default) or "public".
    """
    with open_session() as session:
        user = _current_user(session)
        return _guard(agent.search_notes)(session, user, query, tab)


@mcp.tool()
def get_note(note_id: str) -> dict:
    """Return one note in full by its id (title, body, color, visibility, flags)."""
    with open_session() as session:
        user = _current_user(session)
        return _guard(agent.get_note)(session, user, note_id)


@mcp.tool()
def create_note(title: str = "", body: str = "", color: str = "GOLD") -> dict:
    """Create a PUBLIC note (owned by Botou, visible to all members).

    Args:
        title: the note title (optional).
        body: Markdown body — use `- [ ]` / `- [x]` for checklist items.
        color: one of GOLD, AVOCAT, SALSA, CLAY, TEAL.
    """
    with open_session() as session:
        user = _current_user(session)
        return _guard(agent.create_note)(session, user, title, body, color)


@mcp.tool()
def update_note(
    note_id: str,
    title: str | None = None,
    body: str | None = None,
    color: str | None = None,
) -> dict:
    """Edit a PUBLIC note's content (title / body / color); only the provided
    fields change.

    Visibility cannot be changed over MCP (the agent is public-only). Editing
    fails if a member is editing the note live. Each edit is saved as a new
    version (history is preserved).
    """
    with open_session() as session:
        user = _current_user(session)
        return _guard(agent.update_note)(session, user, note_id, title, body, color)


@mcp.tool()
def organize_note(note_id: str, pinned: bool | None = None, archived: bool | None = None) -> dict:
    """Pin/unpin or archive/unarchive one of the member's own notes.

    Args:
        pinned: true floats the note to the top of the board, false unpins it.
        archived: true hides it from the board (kept, not deleted), false restores it.
    """
    with open_session() as session:
        user = _current_user(session)
        return _guard(agent.set_flags)(session, user, note_id, pinned, archived)


@mcp.tool()
def delete_note(note_id: str) -> dict:
    """Permanently delete a note and its history (author or admin only). Irreversible."""
    with open_session() as session:
        user = _current_user(session)
        _guard(agent.delete_note)(session, user, note_id)
        return {"deleted": note_id}


# --- Mounting into FastAPI (app/main.py) ---
#
# The streamable-HTTP session manager is one-shot (`run()` may be entered once
# per instance). The app boots once in production, but the test harness opens a
# fresh TestClient — and thus a fresh lifespan — per test, so we rebuild the
# manager each lifespan. A stable ASGI wrapper (`mcp_asgi`) keeps the FastAPI
# mount valid while delegating to whichever streamable app the lifespan built.

_streamable_app = None


@contextlib.asynccontextmanager
async def mcp_lifespan() -> AsyncIterator[None]:
    """Build a fresh streamable app + session manager, then run it for this app's
    lifetime. Mounted once via `mcp_asgi`, which dispatches to the built app."""
    global _streamable_app
    mcp._session_manager = None  # force a new (re-runnable) session manager
    _streamable_app = mcp.streamable_http_app()
    async with mcp.session_manager.run():
        yield


async def mcp_asgi(scope, receive, send) -> None:
    """Stable ASGI entry point mounted at `/mcp` — forwards to the live app."""
    if _streamable_app is None:  # pragma: no cover - lifespan always runs first
        raise RuntimeError("MCP app accessed before startup")
    await _streamable_app(scope, receive, send)
