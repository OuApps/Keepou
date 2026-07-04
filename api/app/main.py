from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.routers import admin, auth, import_keep, notes

app = FastAPI(title="Keepou API", version="0.0.0")

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


@app.get("/api/health", tags=["meta"])
def health() -> dict[str, str]:
    return {"status": "ok"}
