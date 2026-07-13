# E13 — Agent access over MCP — Detailed stories

> Epic goal: **expose Keepou's notes to an agent over the Model Context Protocol
> (MCP)**, so the instance can be driven from an assistant — and, later, from a
> **WhatsApp / Telegram bot** that speaks MCP.
>
> Estimation convention: **S** (≤ ½ day), **M** (1–2 days), **L** (3+ days).

> **Rework (post-MVP).** The agent no longer acts *as the member* over private +
> public notes. It now has its **own identity, « Botou »** (`services/bot.py`) — a
> non-login, admin-hidden `User` that owns every note it creates (« Créée par
> Botou ») — and is **public-only**: it reads and writes public notes, never sees
> or creates a private note. Tokens are **admin-managed** (`/api/admin/tokens`,
> owned by Botou) and moved out of the member account menu into **/admin**.
> `resolve_bot_token` accepts only Botou-owned tokens, retiring any legacy
> member-scoped token. See ARCHITECTURE §14.

**Reference docs.** `docs/ARCHITECTURE.md` §4 (permissions / visibility), §5
(single-editor lock), §6 (versioning), §8 (auth). **Depends on** E3 (notes),
E5 (lock), E6 (versioning) — the agent operations reuse them so behavior stays
identical to the REST API.

**Key decisions (validated, as reworked).**
- **Identity: « Botou ».** The agent has its own dedicated, public-only identity —
  it does not impersonate a member. Notes it creates are public and owned by
  Botou. (`services/bot.py`; ARCHITECTURE §14.)
- **Transport: streamable HTTP**, the MCP server **mounted inside the FastAPI
  app** at `/mcp` (stateless) — future-proof for a remote bot that connects to
  it directly.
- **Auth: admin-managed Personal Access Tokens (PATs).** JWT access tokens live
  ~15 min, too short for an always-on agent, so an **admin** mints a long-lived
  `kpat_…` token (shown once, stored **hashed**, owned by Botou). FastMCP's
  `token_verifier` resolves it via `resolve_bot_token` to the ACTIVE Botou; tools
  then run as Botou.
- **Scope: public read + write.** list / search / read / create / update / pin ·
  archive / delete — each enforcing the same lock and versioning rules as the web
  app, restricted to public content (create/update always public, delete only
  Botou's own; a member's private notes stay invisible).

---

## Stories at a glance

- [x] **E13-S1** — Back: `PersonalAccessToken` model (hashed secret, prefix,
      `last_used_at`, `revoked_at`) + migration; `security.py` PAT mint/hash/resolve
- [x] **E13-S2** — Back: token management API — reworked to admin-only,
      Botou-owned `GET/POST /api/admin/tokens`, `DELETE /api/admin/tokens/{id}`
- [x] **E13-S3** — Back: agent operations service (`services/agent.py`) — CRUD +
      search + organize, reworked to the public-only Botou rules (lock, versioning)
- [x] **E13-S4** — Back: MCP server (`mcp_server.py`) — FastMCP streamable-HTTP,
      Botou `TokenVerifier`, 7 tools; mounted at `/mcp` with a rebuild-safe lifespan
- [x] **E13-S5** — Front: « Accès agent (MCP) » token manager (mint / copy-once /
      list / revoke) reworked into **/admin** + MCP endpoint display
- [x] **E13-S6** — Tests (PAT lifecycle + resolution, agent operations, MCP
      transport smoke) + README « Agent access (MCP) » setup (key creation + auth)

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

## E13-S6 — Tests & README setup · S

**Tasks**
- Back tests: `test_tokens.py`, `test_agent.py`, `test_mcp.py`,
  `test_auth.py` (unchanged endpoints still green).
- README **« Agent access (MCP) »** section: the setup is **UI-driven** (create
  an API key + copy the endpoint from the account-menu dialog); the README
  documents the **key creation** and the **expected bearer auth**
  (`Authorization: Bearer kpat_…`), plus a Claude-Desktop `mcp-remote` example,
  the tools list, and the WhatsApp/Telegram outlook.

**Acceptance**
- [x] CI green; a member creates a key in the UI and connects an agent with the
      documented bearer auth.

---

## Definition of done (epic)

- [x] An **admin** generates a token in Keepou (/admin) and points an MCP-speaking
      agent at `<api>/mcp`; the agent reads and manages **public** notes under its
      own **Botou** identity (never sees a member's private note).
- [x] All actions enforce the same server-side rules as the web app (single-editor
      lock, versioning, owner/admin permissions), restricted to public content.
- [x] Secrets are stored hashed and shown once; tokens are revocable; agent
      access can be disabled instance-wide (`MCP_ENABLED=false`).
- [x] Back tests green in CI; ARCHITECTURE / EPICS / how-to synced.

---

## E13-R — Rework: own identity « Botou », public-only, admin-managed

**Goal.** Give the agent its own identity and tighten its reach, per product
decision: (1) the MCP has its own identity, **Botou**; (2) it reads and writes
**public notes only**; (3) **only an admin** can configure / add an agent.

**Changes**
- `services/bot.py` (new): the **Botou** identity — `ensure_bot` (lazy,
  non-login, hidden), `get_bot`, `resolve_bot_token` (Botou-owned tokens only,
  retiring legacy member-scoped ones). `models.py`: `BOT_EMAIL` / `BOT_DISPLAY_NAME`.
- `services/agent.py`: `create_note` always **PUBLIC**; `update_note` drops the
  visibility change (public-only). Notes it creates are « Créée par Botou ».
- `mcp_server.py`: token verifier resolves to Botou; `create_note` / `update_note`
  tools drop the `visibility` arg; instructions describe the public Botou agent.
- `routers/tokens.py`: moved to **admin-guarded** `GET/POST/DELETE
  /api/admin/tokens`, every token owned by Botou. `routers/admin.py`: Botou hidden
  from the members list.
- Front: token management moved out of the account menu into **/admin**
  (`pages/AdminPage.tsx` + `TokenManager` dialog); `api/tokens.ts` → `/api/admin/tokens`;
  `TOKEN_COPY` intro reworded (FR + EN) to name Botou and the public-only scope.
- Tests: `test_agent.py`, `test_tokens.py`, `test_mcp.py` reworked to the Botou
  model (public-only, admin-minted, legacy token retired).

**Acceptance**
- [x] The agent writes under « Botou »; notes it creates are public and authored
      « par Botou »; it cannot read or create a private note.
- [x] Only admins can create / list / revoke agent tokens; members get `403`.
- [x] Back + front tests green (`api` pytest, `web` vitest/tsc/eslint).
