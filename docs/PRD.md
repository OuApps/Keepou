# Keepou — Product Requirements Document (PRD)

**Status:** Draft for review · **Owner:** @guillaume · **Last updated:** 2026-06-26

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
- A single instance is **trivial to self-host** (one database, one service).

### Non-goals (explicitly out of scope, at least for now)
- ❌ Real-time collaborative co-editing (multiple live cursors, CRDT merge).
- ❌ Multi-tenant SaaS (one instance = one group; no org isolation).
- ❌ Public/anonymous access — everything is behind login.
- ❌ Rich content beyond text + checklists in the MVP (no images, no Markdown).
- ❌ Email-dependent flows (password reset, email invites) in the MVP.
- ❌ Native mobile apps (the PWA covers mobile).

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
- **Version** — an immutable snapshot of a note's title + content at save time,
  with author and timestamp.

## 5. Functional requirements

Each requirement is tagged: **[MVP]**, **[V1]** (right after MVP), or **[Later]**.

### 5.1 Access & accounts
- **FR-A1 [MVP]** The first account ever created becomes **Admin**, bypassing the
  allowlist (bootstrap).
- **FR-A2 [MVP]** Subsequent sign-ups are allowed **only if the email is on the
  allowlist**; otherwise the user is politely rejected on the login/register page.
- **FR-A3 [MVP]** Authentication is **email + password**; passwords are stored
  hashed.
- **FR-A4 [MVP]** Sessions persist via secure, httpOnly cookies.
- **FR-A5 [MVP]** A **deactivated** user can no longer sign in, but **their notes
  are kept** (never deleted). Reactivation restores access.
- **FR-A6 [Later]** Password reset by email, email-based invitations (requires
  SMTP).

### 5.2 User management (admin interface)
- **FR-U1 [MVP]** Admins can **add / remove emails** on the allowlist.
- **FR-U2 [MVP]** Admins can see the member list: who is **registered** vs merely
  **allowed (pending first sign-in)**.
- **FR-U3 [MVP]** Admins can **promote** a member to admin and **demote** an admin
  back to member.
- **FR-U4 [MVP]** Admins can **deactivate / reactivate** a user (no hard delete).
- **FR-U5 [MVP]** Guardrail: the instance must always have **at least one active
  admin** (an admin cannot demote/deactivate the last admin — including
  themselves).

### 5.3 Notes
- **FR-N1 [MVP]** A member can **create, read, update, archive** their notes.
- **FR-N2 [MVP]** A note is **private** (owner-only) or **public** (all members).
- **FR-N3 [MVP]** Note content supports **plain text and checklists** (checkable
  items).
- **FR-N4 [MVP]** A note has a **color** chosen from a fixed palette.
- **FR-N5 [MVP]** Only the **owner** can change a note's **visibility**
  (private ⇄ public).
- **FR-N6 [MVP]** **Deleting** a note (private or public) is restricted to the
  **owner or an admin**.
- **FR-N7 [MVP]** Any member can **edit the content** of a public note (subject to
  the lock, see 5.4).
- **FR-N8 [MVP]** **Archive** hides a note from the main board without deleting it.
- **FR-N9 [V1]** **Pinning** notes to the top.
- **FR-N10 [V1]** **Labels / tags** for organization.

### 5.4 Public-note locking (single editor)
- **FR-L1 [MVP]** When a member opens a public note to edit, the client attempts
  to **acquire a lock**.
- **FR-L2 [MVP]** Only the **lock holder** can save changes to a public note;
  others are in **read-only** mode.
- **FR-L3 [MVP]** While editing, the client **refreshes the lock** (heartbeat) so
  it doesn't expire mid-session.
- **FR-L4 [MVP]** A lock **auto-expires** after a short TTL of inactivity (e.g.
  ~30s without heartbeat) so a closed tab never blocks others permanently.
- **FR-L5 [MVP]** If a member tries to edit a locked note, they see a **gentle
  message** identifying who's editing and inviting them to try again shortly —
  never a hard error.
- **FR-L6 [MVP]** Leaving the editor **releases the lock** promptly.

### 5.5 History
- **FR-H1 [MVP]** Each **save that changes title or content** creates an immutable
  **version** with **author + timestamp**.
- **FR-H2 [MVP]** Members can **view the history** of any note they can see
  (public-note history is visible to all members; private-note history only to
  the owner).
- **FR-H3 [MVP]** History shows **who** made each change and **when**, and lets the
  viewer read the **content of any past version**.
- **FR-H4 [MVP]** Changes to color / visibility / archive are recorded in a
  **lightweight activity log**, not as content versions.
- **FR-H5 [MVP]** **No restore** in the MVP — history is read-only.
- **FR-H6 [V1]** **Restore** a note to a previous version (non-destructive: the
  restore itself becomes a new version).
- **FR-H7 [Later]** **Retention policy** (prune versions older than N days / keep
  last K). MVP keeps all versions.

### 5.6 Organization & search
- **FR-S1 [MVP]** A member can **search** their notes (and accessible public
  notes) by title/content (simple text match).
- **FR-S2 [MVP]** Two boards: **"My notes"** (the member's own) and **"Public"**
  (all public notes, with author shown).

### 5.7 Platform (PWA)
- **FR-P1 [MVP]** The app is a **responsive PWA**: usable on phone and desktop,
  with a web app manifest and installability.
- **FR-P2 [MVP]** Layout adapts (multi-column masonry on desktop, 1–2 columns on
  mobile).
- **FR-P3 [Later]** Offline reading / queued edits via service worker caching.

## 6. Key user stories

> Format: _As a **role**, I want **capability**, so that **benefit**._

- **[MVP]** As an **admin**, I want to add an email to the allowlist, so that a
  new person can sign up.
- **[MVP]** As a **prospective user** not on the list, I want a clear message when
  I try to register, so that I know to ask the admin for access.
- **[MVP]** As a **member**, I want to jot a private note quickly, so that I don't
  lose a thought.
- **[MVP]** As a **member**, I want to make a note public, so that the whole group
  can read and update it.
- **[MVP]** As a **member**, I want to be told politely when a public note is
  being edited by someone else, so that I wait instead of losing my changes.
- **[MVP]** As a **member**, I want to see who last changed a shared note and
  when, so that I can trust its content.
- **[MVP]** As an **admin**, I want to deactivate a user, so that they can no
  longer sign in — without losing their notes.
- **[V1]** As a **member**, I want to restore a note to a previous version, so
  that I can undo a bad edit.

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

## 9. Open questions / to revisit

- Should the activity log (color/visibility/archive changes) be surfaced in the
  UI in the MVP, or only stored for later?
- Do we want a per-note "viewers" indicator in V1 (presence), as a stepping stone
  toward live updates?
- Allowlist UX: bulk add (paste multiple emails) in MVP or V1?
