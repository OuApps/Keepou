import contextlib
from collections.abc import AsyncIterator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.routers import admin, auth, import_keep, notes, tokens


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
