# E13 — Agent access over MCP — Detailed stories

> Epic goal: **expose Keepou's notes to an agent over the Model Context Protocol
> (MCP)**, so a member can read and manage their notes from an assistant — and,
> later, from a **WhatsApp / Telegram bot** that speaks MCP. The agent acts **as
> the member**, under the exact same server-side rules as the web app.
>
> Estimation convention: **S** (≤ ½ day), **M** (1–2 days), **L** (3+ days).

**Reference docs.** `docs/ARCHITECTURE.md` §4 (permissions / visibility), §5
(single-editor lock), §6 (versioning), §8 (auth). **Depends on** E3 (notes),
E5 (lock), E6 (versioning) — the agent operations reuse them so behavior stays
identical to the REST API.

**Key decisions (validated).**
- **Transport: streamable HTTP**, the MCP server **mounted inside the FastAPI
  app** at `/mcp` (stateless) — future-proof for a remote bot that connects to
  it directly.
- **Auth: Personal Access Tokens (PATs).** JWT access tokens live ~15 min, too
  short for an always-on agent, so the member mints a long-lived `kpat_…` token
  in Keepou (shown once, stored **hashed**). FastMCP's `token_verifier` resolves
  it to its ACTIVE owner; tools then run as that member.
- **Scope: read + write.** list / search / read / create / update / pin ·
  archive / delete — each enforcing the same visibility, lock and versioning
  rules as the web app (public content edits borrow the single-editor lock).

---

## Stories at a glance

- [x] **E13-S1** — Back: `PersonalAccessToken` model (hashed secret, prefix,
      `last_used_at`, `revoked_at`) + migration; `security.py` PAT mint/hash/resolve
- [x] **E13-S2** — Back: token management API — `GET/POST /api/tokens`,
      `DELETE /api/tokens/{id}` (owner-scoped, secret returned once)
- [x] **E13-S3** — Back: agent operations service (`services/agent.py`) — CRUD +
      search + organize, mirroring the REST rules (visibility, lock, versioning)
- [x] **E13-S4** — Back: MCP server (`mcp_server.py`) — FastMCP streamable-HTTP,
      PAT `TokenVerifier`, 7 tools; mounted at `/mcp` with a rebuild-safe lifespan
- [x] **E13-S5** — Front: « Accès agent (MCP) » token manager (mint / copy-once /
      list / revoke) + account-menu entry + MCP endpoint display
- [x] **E13-S6** — Tests (PAT lifecycle + resolution, agent operations, MCP
      transport smoke) + a user how-to (`docs/HOWTO-mcp-agent.md`)

---

## E13-S1 — Personal Access Tokens (model + crypto) · S

**Goal.** A long-lived, revocable bearer secret an agent can present.

**Tasks**
- `models.py`: `PersonalAccessToken` — `user_id`, `name`, `token_hash`
  (SHA-256, unique + indexed), `prefix` (display only), `created_at`,
  `last_used_at`, `revoked_at`. Migration `d6f3b2c0e4a5`.
- `security.py`: `generate_pat()` → `(secret, hash, prefix)` with a 256-bit
  `kpat_…` secret; `hash_token`; `resolve_pat_user()` — indexed lookup, rejects
  unknown / revoked / disabled-owner, stamps `last_used_at`.

**Acceptance**
- [x] The raw secret is never stored (only its SHA-256); resolution is one
      indexed lookup; a revoked token and a disabled owner both resolve to `None`.

---

## E13-S2 — Token management API · S

**Goal.** Self-service create / list / revoke, owner-scoped.

**Tasks**
- `routers/tokens.py`: `GET /api/tokens` (metadata only), `POST /api/tokens
  {name}` (→ secret **once**, `201`), `DELETE /api/tokens/{id}` (revoke —
  `revoked_at`, never deleted; someone else's id → shielded `404`).

**Acceptance**
- [x] The secret appears only in the create response; the list never carries it;
      revoking removes it from the list and disables MCP auth immediately.

---

## E13-S3 — Agent operations service · M

**Goal.** One transport-free home for the note actions, faithful to the REST rules.

**Tasks**
- `services/agent.py`: `list_notes` / `search_notes` / `get_note` / `create_note`
  / `update_note` / `set_flags` / `delete_note`. Visibility gating (private notes
  invisible to non-owners → `NoteNotFound`), public content edits **borrow the
  single-editor lock** (yield to a live editor → `NoteLocked`), each content edit
  records the session's version (create writes the « Créée par X » root),
  pin/archive/visibility owner-only.

**Acceptance**
- [x] Unit tests cover CRUD, visibility shielding, the lock borrow, owner-only
      metadata/visibility and version recording (`tests/test_agent.py`).

---

## E13-S4 — MCP server (transport + auth + tools) · M

**Goal.** A working MCP endpoint an agent can connect to with a PAT.

**Tasks**
- `mcp_server.py`: `FastMCP("Keepou", stateless_http=True, json_response=True)`
  with a `KeepouTokenVerifier` (PAT → `AccessToken(subject=user.id)`); 7 tools
  (`list_notes`, `search_notes`, `get_note`, `create_note`, `update_note`,
  `organize_note`, `delete_note`), each opening a DB session, resolving the
  current user from the token, and delegating to `services/agent.py` (domain
  errors → clean `ToolError`s).
- `config.py`: `mcp_enabled`, `mcp_public_url`, `mcp_dns_rebinding_protection`.
- `main.py`: mount at `/mcp`; the session manager runs in the app lifespan,
  rebuilt per lifespan (a stable ASGI wrapper keeps the mount valid) so the test
  harness can open many clients.

**Acceptance**
- [x] `tools/list` / `tools/call` succeed with a valid PAT; a missing or bad
      token is `401`; a smoke test drives a create→read round trip
      (`tests/test_mcp.py`).

---

## E13-S5 — Token manager UI · S

**Goal.** Let the member generate and manage agent tokens from the app.

**Tasks**
- Account-menu entry « Accès agent (MCP) » → `TokenManager` dialog: intro, the
  **MCP endpoint** to copy, a create form (name → secret shown **once** with a
  copy button + « copie-le maintenant » warning), and the list of active tokens
  (name, prefix, created / last-used) with a confirmed « Révoquer ».
- `api/tokens.ts`; French + English copy (`TOKEN_COPY`).

**Acceptance**
- [x] The member mints a token, copies the secret and the endpoint, sees it in
      the list, and revokes it behind a confirmation.

---

## E13-S6 — Tests & how-to · S

**Tasks**
- Back tests: `test_tokens.py`, `test_agent.py`, `test_mcp.py`,
  `test_auth.py` (unchanged endpoints still green).
- `docs/HOWTO-mcp-agent.md`: generate a token, the endpoint, a Claude-Desktop
  config example, the tools list, and the WhatsApp/Telegram outlook.

**Acceptance**
- [x] CI green; the how-to lets a member connect an agent end to end.

---

## Definition of done (epic)

- [x] A member generates a token in Keepou and points an MCP-speaking agent at
      `<api>/mcp`; the agent reads and manages **their** notes as them.
- [x] All actions enforce the same server-side rules as the web app (visibility,
      single-editor lock, versioning, owner/admin permissions).
- [x] Secrets are stored hashed and shown once; tokens are revocable; agent
      access can be disabled instance-wide (`MCP_ENABLED=false`).
- [x] Back tests green in CI; ARCHITECTURE / EPICS / how-to synced.
