# Keepou — project instructions (Claude Code)

> This file is read at the start of every session. It sets the frame. The exhaustive detail of screens, tokens, and behaviors lives in **`HANDOFF.md`** — read it before writing any UI code.

## Repository language
- **The working language of this repository is English.** All `.md` deliverables (READMEs, `docs/` — incl. `docs/EPICS.md` and `docs/stories/` —, this file) and all code comments are written in **English**.
- **Exception — the product UI copy stays French.** Keepou's users are a small francophone community, so every user-facing string in the app (and the "copy FR" section of `HANDOFF.md`) stays in **French**, verbatim. Translate the documentation, never the UI strings.
- The design bundle transcript `design/chats/chat1.md` is a historical record of the design conversation and is kept in its original language.

## The product
Keepou is a **self-hosted Google Keep**, private, for a small community (family, neighbors). Text notes + checkboxes, private or public, **single-editor locked** editing, version history, access via an admin-managed **allowlist**. Responsive PWA (desktop + mobile), light + dark theme.

## Target stack
- **Back: Python + FastAPI** (REST API), **SQLModel** (SQLAlchemy + Pydantic) on a relational database, **Alembic** migrations
- **Front: React + TypeScript** (Vite SPA), decoupled, consumes the FastAPI API
- **JWT bearer** auth (email + password, hashed with **passlib/bcrypt**; access + refresh tokens in `localStorage`), allowlist check **server-side** — a httpOnly-cookie session is a documented later upgrade
- Note bodies stored as **Markdown** (GFM task lists `- [ ]` / `- [x]`)

## Non-negotiable rules (from the validated design)
1. **Single-editor lock**: only one person edits a note at a time. Heartbeat ~20 s, expiry ~60 s, takeover possible, conflict handling. Never concurrent editing.
2. **Autosave** ~1.5 s after the last keystroke + on blur/close. The session state ("Enregistré") is distinct from the "last saved version" (persisted author + date).
3. **Versioning**: **one version = one editing session** (created when the lock is released), not one version per keystroke or per checkbox toggle. Restoring creates a new version — nothing is ever overwritten.
4. **Allowlist**: an account is only created if the email is on the list. The check is **server-side**; the front only displays the message the server returns. No in-app "access request", no in-app admin contact.
5. **Disable, never delete**: an admin can disable an account (login blocked, notes kept, re-enableable). No account deletion.
6. **`/admin` protected server-side**: the entry only appears for admins; the route rejects non-admins.
7. **Private ⇄ public reversible**: switching a note back to private removes it from other members' public board (confirmation required).

## Visual fidelity
The `.dc.html` mockups are the **visual source of truth**. Reuse the exact tokens (colors, card gradients, typography, radii, shadows) listed in `HANDOFF.md` — do not reinvent a palette. Fonts: **Fredoka** (titles/brand), **Nunito Sans** (body/UI), **IBM Plex Mono** (technical labels, uppercase timestamps).

## Do not
- No real-time collaboration à la CRDT/OT — the model is the **lock**, deliberately simple.
- No visual diff in history — a version is simply re-displayed as-is.
- No decorative emoji in the chrome (the ones in the sample notes are user content).
- No new heavy UI dependency without reason; keep CSS as close to the mockups as possible.
