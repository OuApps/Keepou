# Keepou — Product Requirements Document (PRD)

**Status:** Reviewed · **Owner:** @fregogui · **Last updated:** 2026-07-01

---

## 1. Vision

Keepou is a **self-hosted, minimalist, multi-user notes app** — a Google Keep
alternative you run for a closed group (family, team, community). It stays
deliberately small and fast, but adds the few things a shared, self-hosted tool
needs: gated access, private/public notes, safe concurrent editing on shared
notes, and a full history of who changed what.

> "Keep's simplicity, on your own server, for your own people."

## 2. Goals & non-goals

### Goals (what success looks like)
- A member can capture a note in seconds and find it later.
- A group can maintain **shared public notes** without overwriting each other.
- An admin fully controls **who** can access the instance.
- Every change to a note is **attributable and auditable** via history.
- The app is **installable** and pleasant on both phone and desktop.
- A single instance is **trivial to self-host** (one database, a small API + static front).
- **Data is safe**: regular off-site backups with a tested restore (see E9) — no lost notes.
- A new member can **bring their existing Google Keep notes in** (Takeout import) instead of starting empty (see E10).

### Non-goals (out of scope — Keepou stays small)
- ❌ Real-time collaborative co-editing (multiple live cursors, CRDT merge).
- ❌ Multi-tenant SaaS (one instance = one group; no org isolation).
- ❌ Public/anonymous access — everything is behind login.
- ❌ Rich media beyond text + checklists — no images or embeds. (Bodies are
  persisted as **Markdown / GFM task lists**, so richer text is possible later
  without a migration, but the MVP UI stays text + checkboxes.)
- ❌ Email-dependent flows (password reset, email invitations — no SMTP
  dependency).
- ❌ Native mobile apps (the PWA covers mobile).
- ❌ Nice-to-haves that aren't part of the current scope: pinning, labels/tags,
  retention/pruning, offline editing, and allowlist bulk-add.

## 3. Personas

| Persona | Description | Primary needs |
| --- | --- | --- |
| **Admin** | The first user; runs the instance | Control access (allowlist), promote admins, deactivate users, manage members |
| **Member** | An authorized user | Take private notes, contribute to public notes, see history |
| **Prospective user** | Someone with the app URL but not yet allowed | Gets a clear, polite "you're not on the list" message |

## 4. Core concepts

- **Instance** — one deployment, one group of people. No cross-instance sharing.
- **Allowlist** — the set of email addresses an admin has authorized to sign up.
- **Admin** — a member with elevated rights. The **first ever user becomes admin
  automatically** (bootstrap); admins can promote others.
- **Note** — a unit of content owned by one user. Either **private** (owner only)
  or **public** (all members).
- **Lock** — a transient, single-editor claim on a public note while someone
  edits it.
- **Version** — an immutable snapshot of a note's title + content, created once
  per **editing session**, with author and timestamp.

## 5. Functional requirements

### 5.1 Access & accounts
- **FR-A1** The first account ever created becomes **Admin**, bypassing the
  allowlist (bootstrap).
- **FR-A2** Subsequent sign-ups are allowed **only if the email is on the
  allowlist**; otherwise the user is politely rejected on the login/register page.
- **FR-A3** Authentication is **email + password**; passwords are stored hashed.
- **FR-A4** Authentication uses a **bearer token** (signed JWT: access + refresh)
  issued at login; the client stores it and sends it on each request. _(A secure
  httpOnly-cookie session is a documented later upgrade — see ARCHITECTURE §8.)_
- **FR-A5** A **deactivated** user can no longer sign in, but **their notes are
  kept** (never deleted). Reactivation restores access.

### 5.2 User management (admin interface)
- **FR-U1** Admins can **add / remove emails** on the allowlist.
- **FR-U2** Admins can see the member list: who is **registered** vs merely
  **allowed (pending first sign-in)**.
- **FR-U3** Admins can **promote** a member to admin and **demote** an admin back
  to member.
- **FR-U4** Admins can **deactivate / reactivate** a user (no hard delete).
- **FR-U5** Guardrail: the instance must always have **at least one active admin**
  (an admin cannot demote/deactivate the last admin — including themselves).

### 5.3 Notes
- **FR-N1** A member can **create, read, update, archive** their notes.
- **FR-N2** A note is **private** (owner-only) or **public** (all members).
- **FR-N3** Note content supports **plain text and checklists** (checkable
  items); bodies are persisted as **Markdown (GFM task lists)**.
- **FR-N4** A note has a **color** chosen from a fixed palette.
- **FR-N5** Only the **owner** can change a note's **visibility** (private ⇄
  public).
- **FR-N6** **Deleting** a note (private or public) is restricted to the **owner or
  an admin**.
- **FR-N7** Any member can **edit the content** of a public note (subject to the
  lock, see 5.4).
- **FR-N8** **Archive** hides a note from the main board without deleting it.

### 5.4 Public-note locking (single editor)
- **FR-L1** When a member opens a public note to edit, the client attempts to
  **acquire a lock**.
- **FR-L2** Only the **lock holder** can save changes to a public note; others are
  in **read-only** mode.
- **FR-L3** While editing, the client **refreshes the lock** (heartbeat) so it
  doesn't expire mid-session.
- **FR-L4** A lock **auto-expires** after a short TTL of inactivity (~60s without
  heartbeat; the client refreshes it about every ~20s) so a closed tab never
  blocks others permanently.
- **FR-L5** If a member tries to edit a locked note, they see a **gentle message**
  identifying who's editing and inviting them to try again shortly — never a hard
  error.
- **FR-L6** Leaving the editor **releases the lock** promptly.

### 5.5 History
- **FR-H1** Each **editing session** creates at most one immutable **version**
  (title + content snapshot) with **author + timestamp**, recorded when the
  session ends (lock release on public notes, editor close on private notes).
- **FR-H2** Members can **view the history** of any note they can see (public-note
  history is visible to all members; private-note history only to the owner).
- **FR-H3** History shows **who** made each change and **when**, and lets the
  viewer read the **content of any past version**.
- **FR-H4** **Restoring** a past version creates a **new version** whose content
  equals the chosen one — nothing is ever overwritten.

### 5.6 Organization & search
- **FR-S1** A member can **search** their notes (and accessible public notes) by
  title/content (simple text match).
- **FR-S2** Two boards: **"My notes"** (the member's own) and **"Public"** (all
  public notes, with author shown).

### 5.7 Import from Google Keep
- **FR-I1** A member can **import their Google Keep notes** into Keepou from a
  **Google Takeout** export (the only viable export path — the Keep API is
  Workspace-only). Each member imports their own notes.
- **FR-I2** Import parses the Takeout archive **server-side**: title, text, and
  **checklist items** become a note (GFM Markdown body); Keep colors map to the
  fixed 5-shade palette.
- **FR-I2b** Before anything is created, the member sees a **review/selection view**
  listing every parsed note and **checks/unchecks the ones to keep** (a cleanup
  pass); **only the checked notes are imported**. Trashed notes are pre-unchecked.
- **FR-I3** Imported notes are **private** and owned by the importer (the owner can
  make any of them public afterwards, FR-N5).
- **FR-I4** The **original Keep dates** (created / last-edited) are **preserved**,
  and each imported note gets its history root (« Créée par X ») at that date.
- **FR-I5** **Trashed** Keep notes are skipped; **images and labels are ignored**
  (MVP — Keepou has no rich media). The member sees a summary of what was imported.

### 5.8 Platform (PWA)
- **FR-P1** The app is a **responsive PWA**: usable on phone and desktop, with a
  web app manifest and installability.
- **FR-P2** Layout adapts (multi-column masonry on desktop, 1–2 columns on mobile).

> **Settled decisions:** note bodies are stored as **Markdown / GFM** and history
> keeps **one version per editing session**, with **restore** creating a new
> version (FR-H1, FR-H4); the allowlist is managed **one email at a time** (no bulk
> add); and the **first registered user becomes admin** (FR-A1), with no
> environment-seeded admin.

## 6. Key user stories

> Format: _As a **role**, I want **capability**, so that **benefit**._

- As an **admin**, I want to add an email to the allowlist, so that a new person
  can sign up.
- As a **prospective user** not on the list, I want a clear message when I try to
  register, so that I know to ask the admin for access.
- As a **member**, I want to jot a private note quickly, so that I don't lose a
  thought.
- As a **member**, I want to make a note public, so that the whole group can read
  and update it.
- As a **member**, I want to be told politely when a public note is being edited by
  someone else, so that I wait instead of losing my changes.
- As a **member**, I want to see who last changed a shared note and when, so that I
  can trust its content.
- As an **admin**, I want to deactivate a user, so that they can no longer sign in
  — without losing their notes.

## 7. UX principles

- **Calm by default.** No destructive surprises; locks and conflicts are
  communicated gently.
- **Speed first.** Creating a note is the fastest path in the app.
- **Minimal chrome.** Cards, colors, and a single composer — nothing more on the
  main surface.
- **Honest collaboration.** It's always clear whether a note is private/public,
  locked, and who touched it last.

## 8. Success metrics (post-launch, indicative)

- Time-to-capture a note < 5 seconds from app open.
- Zero "lost edit" incidents on public notes (lock effectiveness).
- 100% of public-note changes attributable to a user via history.
- An admin can onboard a new member end-to-end in < 1 minute.
