# Connect an agent to Keepou (MCP)

Keepou exposes your notes to an **AI agent** over the
[Model Context Protocol (MCP)](https://modelcontextprotocol.io). Once connected,
an assistant can read, search, create and update **your** notes — for example to
add an item to a shopping list, or to summarize what's on your board. Later, the
same endpoint lets a **WhatsApp or Telegram bot** drive Keepou.

The agent acts **as you**, with the exact same rules as the web app: it only sees
your private notes and everyone's public notes, respects the single-editor lock,
and keeps version history.

## 1. Generate an access token

1. Open Keepou, click your avatar (top-right), and choose **« Accès agent (MCP) »**.
2. Give the token a name (e.g. `Bot WhatsApp`, `Claude Desktop`) and click
   **« Générer un jeton »**.
3. **Copy the token now** — it starts with `kpat_` and is shown **only once**.
   Keepou stores only a hash of it; if you lose it, generate a new one.

The same dialog shows the **MCP endpoint address** to copy (something like
`https://your-keepou.example.org/mcp`), and lists your active tokens. You can
**revoke** any token at any time — the agent using it loses access immediately.

> Treat the token like a password: it grants full access to your notes. Never
> commit it to a repository or share it. Revoke it if it might have leaked.

## 2. Point your agent at Keepou

The server speaks **streamable HTTP** and authenticates with the token as a
bearer credential:

```
POST <endpoint>
Authorization: Bearer kpat_xxxxxxxx…
```

### Claude Desktop / clients that need a stdio bridge

Clients that only speak stdio can use the [`mcp-remote`](https://www.npmjs.com/package/mcp-remote)
bridge. In the client's MCP config (for Claude Desktop:
`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "keepou": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote",
        "https://your-keepou.example.org/mcp",
        "--header",
        "Authorization: Bearer kpat_xxxxxxxx…"
      ]
    }
  }
}
```

### Clients with native remote-MCP support

Point them at the endpoint URL and set the `Authorization: Bearer <token>`
header. No OAuth flow is required — the token is the credential.

## 3. What the agent can do

The server exposes these tools (all scoped to you):

| Tool | What it does |
| --- | --- |
| `list_notes` | List your notes, or everyone's public notes (`tab="public"`), newest first |
| `search_notes` | Find notes whose title or body contains a query |
| `get_note` | Read one note in full by id |
| `create_note` | Create a note (title, Markdown body, color, private/public) |
| `update_note` | Edit a note's title / body / color (and visibility, on your own notes) |
| `organize_note` | Pin/unpin or archive/unarchive one of your notes |
| `delete_note` | Permanently delete a note and its history |

Note bodies are **Markdown with GFM checklists** (`- [ ]` / `- [x]`), and colors
are one of `GOLD`, `AVOCAT`, `SALSA`, `CLAY`, `TEAL`. Editing a **public** note
can fail if someone else is editing it live — the agent will say so and you can
retry.

## 4. WhatsApp / Telegram (later)

The endpoint is designed so a **bot** can connect to it directly. A WhatsApp or
Telegram bot that embeds an MCP-speaking agent points at `<endpoint>` with a
Keepou token, and your messages become note actions ("ajoute du lait à la liste
de courses"). That integration lives outside this repo for now; the MCP surface
here is what it will connect to.

## Turning agent access off

An instance operator can disable the whole MCP surface by setting
`MCP_ENABLED=false` in the API environment (see `api/.env.example`). Individual
tokens are revoked from the **« Accès agent (MCP) »** dialog.
