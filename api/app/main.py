import contextlib
from collections.abc import AsyncIterator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.types import ASGIApp, Receive, Scope, Send

from app.config import settings
from app.routers import admin, auth, import_keep, notes, tokens


class ForwardedHostMiddleware:
    """Rewrite the ASGI `Host` header from the public host the edge advertises.

    Behind the Cloudflare → Railway chain the proxy rewrites the outgoing `Host`
    (and `X-Forwarded-Host`) to the default `*.up.railway.app` origin, so anything
    the app derives from the request host — absolute URLs, redirect `Location`
    targets — would point at the internal Railway domain. The edge forwards the
    real public host in `X-Edge-Host` (reliable; `X-Forwarded-Host` is not), so we
    trust that first and fall back to `X-Forwarded-Host`, then overwrite `Host`
    before routing sees it. `--proxy-headers` still handles the scheme/client IP.
    """

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] == "http":
            hdrs = dict(scope["headers"])
            public_host = hdrs.get(b"x-edge-host") or hdrs.get(b"x-forwarded-host")
            if public_host:
                headers = [(k, v) for (k, v) in scope["headers"] if k != b"host"]
                headers.append((b"host", public_host))
                scope = {**scope, "headers": headers}
        await self.app(scope, receive, send)


@contextlib.asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    # The MCP streamable-HTTP server (E13) runs its own session manager; a mounted
    # sub-app's lifespan is not started by FastAPI, so we run it here. Guarded by
    # the feature flag so a deployment can turn agent access off entirely.
    if settings.mcp_enabled:
        from app.mcp_server import mcp_lifespan

        async with mcp_lifespan():
            yield
    else:
        yield


app = FastAPI(title="Keepou API", version="0.0.0", lifespan=lifespan)

# Auth is a JWT bearer token in the `Authorization` header, not a cookie (E1-S6 /
# ARCHITECTURE §8), so credentials are not needed and CORS stays strict on the
# configured web origin(s) — no wildcard-with-credentials pitfall.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Added last so it wraps the CORS layer (Starlette runs the most-recently-added
# middleware first): the public `Host` is restored from `X-Edge-Host` before any
# request/URL logic — including redirects — reads it.
app.add_middleware(ForwardedHostMiddleware)

app.include_router(auth.router)
app.include_router(notes.router)
app.include_router(admin.router)
app.include_router(import_keep.router)
app.include_router(tokens.router)

# Agent access over MCP (E13): mount the streamable-HTTP server at `/mcp`,
# bearer-authenticated by Personal Access Tokens. The lifespan (above) builds the
# session manager the wrapper delegates to.
if settings.mcp_enabled:
    from app.mcp_server import mcp_asgi

    app.mount("/mcp", mcp_asgi)


@app.get("/api/health", tags=["meta"])
def health() -> dict[str, str]:
    return {"status": "ok"}
