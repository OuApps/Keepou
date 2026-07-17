"""ForwardedHostMiddleware: the public host from X-Edge-Host wins the `Host`.

Behind Cloudflare → Railway the proxy rewrites the outgoing `Host` (and
`X-Forwarded-Host`) to the internal `*.up.railway.app` origin; the edge forwards
the real public host in `X-Edge-Host`. The middleware restores it so anything the
app derives from the request host (absolute URLs, redirect `Location`) points at
the public domain, not the Railway one.
"""

from fastapi import FastAPI, Request
from fastapi.testclient import TestClient

from app.main import ForwardedHostMiddleware


def _client() -> TestClient:
    app = FastAPI()
    app.add_middleware(ForwardedHostMiddleware)

    @app.get("/whoami")
    def whoami(request: Request) -> dict[str, str]:
        return {"host": request.headers["host"], "url": str(request.url)}

    return TestClient(app)


def test_x_edge_host_overrides_host() -> None:
    res = _client().get(
        "/whoami",
        headers={
            "Host": "keepou-api-production.up.railway.app",
            "X-Edge-Host": "api-keepou.galaxou.com",
        },
    )
    body = res.json()
    assert body["host"] == "api-keepou.galaxou.com"
    assert "api-keepou.galaxou.com" in body["url"]
    assert "railway.app" not in body["url"]


def test_x_forwarded_host_is_the_fallback() -> None:
    # No X-Edge-Host: fall back to X-Forwarded-Host.
    res = _client().get(
        "/whoami",
        headers={"Host": "internal.up.railway.app", "X-Forwarded-Host": "api-keepou.galaxou.com"},
    )
    assert res.json()["host"] == "api-keepou.galaxou.com"


def test_x_edge_host_wins_over_x_forwarded_host() -> None:
    # X-Forwarded-Host is rewritten by Railway and not trustworthy; X-Edge-Host wins.
    res = _client().get(
        "/whoami",
        headers={
            "Host": "internal.up.railway.app",
            "X-Forwarded-Host": "internal.up.railway.app",
            "X-Edge-Host": "api-keepou.galaxou.com",
        },
    )
    assert res.json()["host"] == "api-keepou.galaxou.com"


def test_host_untouched_without_forwarding_headers() -> None:
    res = _client().get("/whoami", headers={"Host": "example.test"})
    assert res.json()["host"] == "example.test"
