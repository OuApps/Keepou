"""
MCP transport smoke test (E13) — drives the streamable-HTTP server end to end:
bearer auth via a Personal Access Token, tool discovery, and a create→read round
trip. The tools' business rules are covered in test_agent.py; this checks the
wiring (auth backend, tool registration, request/response) is sound.
"""

import json

import pytest
from sqlmodel import Session

import app.mcp_server as mcp_server

MCP_HEADERS = {"Content-Type": "application/json", "Accept": "application/json, text/event-stream"}
ADMIN = {"email": "marie@famille-ou.fr", "password": "un mot de passe", "display_name": "Marie"}


@pytest.fixture()
def mcp_session(engine, monkeypatch):
    # Point the MCP tools + token verifier at the test engine (the FastAPI
    # dependency override does not reach code outside request handling).
    monkeypatch.setattr(mcp_server, "open_session", lambda: Session(engine))


def rpc(client, method, params=None, token=None):
    headers = dict(MCP_HEADERS)
    if token is not None:
        headers["Authorization"] = f"Bearer {token}"
    body = {"jsonrpc": "2.0", "id": 1, "method": method}
    if params is not None:
        body["params"] = params
    return client.post("/mcp/", json=body, headers=headers)


def result_of(response):
    """Unwrap a JSON-RPC result (stateless JSON mode returns plain JSON)."""
    return response.json()["result"]


def tool_payload(response):
    """The structured content of a successful tools/call.

    A list return surfaces as ``structuredContent = {"result": [...]}`` (plus one
    `content` block per item); a dict return has no structured content and lands
    as JSON in the single `content` block. Handle both."""
    result = result_of(response)
    assert result.get("isError") is not True, result
    if "structuredContent" in result:
        structured = result["structuredContent"]
        if isinstance(structured, dict) and set(structured) == {"result"}:
            return structured["result"]
        return structured
    return json.loads(result["content"][0]["text"])


def pat_token(client) -> str:
    access = client.post("/api/auth/register", json=ADMIN).json()["access"]
    headers = {"Authorization": f"Bearer {access}"}
    return client.post("/api/tokens", json={"name": "Agent"}, headers=headers).json()["token"]


def test_mcp_requires_a_valid_token(client, mcp_session) -> None:
    assert rpc(client, "tools/list", {}).status_code == 401
    assert rpc(client, "tools/list", {}, token="kpat_nope").status_code == 401


def test_mcp_lists_the_note_tools(client, mcp_session) -> None:
    token = pat_token(client)
    rpc(client, "initialize", _init_params(), token=token)
    res = rpc(client, "tools/list", {}, token=token)
    assert res.status_code == 200
    names = {t["name"] for t in result_of(res)["tools"]}
    assert {"list_notes", "search_notes", "get_note", "create_note", "update_note"} <= names


def test_mcp_create_then_read_round_trip(client, mcp_session) -> None:
    token = pat_token(client)
    rpc(client, "initialize", _init_params(), token=token)
    created = tool_payload(
        rpc(
            client,
            "tools/call",
            {"name": "create_note", "arguments": {"title": "Depuis l'agent", "body": "- [ ] Test"}},
            token=token,
        )
    )
    assert created["title"] == "Depuis l'agent"

    listed = tool_payload(
        rpc(client, "tools/call", {"name": "list_notes", "arguments": {}}, token=token)
    )
    assert [n["title"] for n in listed] == ["Depuis l'agent"]


def _init_params() -> dict:
    return {
        "protocolVersion": "2025-06-18",
        "capabilities": {},
        "clientInfo": {"name": "test", "version": "1"},
    }
