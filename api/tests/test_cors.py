"""CORS: strict origin, no credentials (bearer token, not cookie) — E1-S6."""

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_cors_allows_configured_origin() -> None:
    res = client.get("/api/health", headers={"Origin": "http://localhost:5173"})
    assert res.headers.get("access-control-allow-origin") == "http://localhost:5173"


def test_cors_disables_credentials() -> None:
    # Auth is a bearer header, not a cookie → no allow-credentials header, so the
    # strict origin list never collides with the wildcard-with-credentials rule.
    res = client.get("/api/health", headers={"Origin": "http://localhost:5173"})
    assert "access-control-allow-credentials" not in res.headers
