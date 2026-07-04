# E7 — Access administration — Detailed stories

> Epic goal: give the admin management of the **allowlist** and **members**
> (registered vs pending), roles, and **enable/disable** — **never delete**.
>
> Estimation convention: **S** (≤ ½ day), **M** (1–2 days), **L** (3+ days).

**Reference docs.** `design/HANDOFF.md` §3.7 & §7 (Admin), `docs/ARCHITECTURE.md`
§4/§7, PRD FR-U1…FR-U5, claude.md §5/§6. Visual source of truth:
`design/Keepou - Admin.dc.html`. **Depends on** E2 (auth, roles, `require_admin`);
can run **in parallel** with E3–E6.

**Key decisions carried in (already validated):**
- **`/admin` protected server-side** — the entry only appears for admins; the route
  rejects non-admins (claude.md §6).
- **Disable, never delete** — an admin can disable an account (login blocked, notes
  kept, reversible); removing a **pending** allowlist email is allowed (FR-U4/N/A).
- **Last-admin guard** — the instance must always keep **≥ 1 active admin**; an admin
  cannot demote/disable the last one, including themselves (FR-U5).

---

## Stories at a glance

- [x] **E7-S1** — Back: `GET /api/admin/members` (registered vs pending, LEFT JOIN)
- [x] **E7-S2** — Back: allowlist add / remove (pending only)
- [x] **E7-S3** — Back: user role/status PATCH + last-admin guard
- [x] **E7-S4** — Front: AccessManager (Membres / Invités en attente + counters)
- [x] **E7-S5** — Front: add email, member menu, admin entry point (admins only)
- [x] **E7-S6** — Tests: server protection, allowlist, promote/disable, last-admin guard

**Status.** All **done**. Built on E2-S2's `require_admin`; routes in
`api/app/routers/admin.py`, UI in `web/src/components/admin/`.

---

## E7-S1 — Back: `GET /api/admin/members` · M

**Goal.** One admin listing showing registered members and pending invitees.

**Tasks**
- `routers/admin.py` `GET /api/admin/members` (`Depends(require_admin)`):
  `User` **LEFT JOIN** `AllowlistEntry` on `email` → each row is **registered**
  (has a `User`) or **pending** (allowlisted, no `User` yet), with role + status.
- Pydantic `MemberOut` (email, display_name?, role?, status?, `pending: bool`).

**Acceptance criteria**
- [x] Returns both registered members (role + status) and pending invitees.
- [x] Non-admin → **403** (server-side, claude.md §6).
- [x] Pending = allowlisted email with no `User` row (FR-U2).

**Notes.** Bootstrap admin (E2-S3) appears here as the first ACTIVE admin.

---

## E7-S2 — Back: allowlist add / remove · S

**Goal.** Manage the allowlist one email at a time.

**Tasks**
- `POST /api/admin/allowlist {email}` → add an entry (record `added_by_id`);
  idempotent/clear error on duplicates. Appears as **pending** until sign-up.
- `DELETE /api/admin/allowlist/{id}` → remove a **pending** entry only (an email
  whose `User` already exists cannot be removed this way — disable the user instead).

**Acceptance criteria**
- [x] Adding an email makes it appear as **En attente** in the members list (FR-U1).
- [x] Removing a **pending** entry works; removing an entry that has a registered
  user is refused (use disable instead).
- [x] Admin-only; non-admin → 403.

**Notes.** No bulk add (PRD settled decision). No email invitations (no SMTP).

---

## E7-S3 — Back: user role/status PATCH + last-admin guard · M

**Goal.** Promote/demote and enable/disable safely, never deleting.

**Tasks**
- `PATCH /api/admin/users/{id} {role?, status?}`: `role` ACTIVE promote/demote
  (MEMBER⇄ADMIN); `status` ACTIVE|DISABLED. **Never** hard-delete (FR-U4).
- **Last-admin guard** (FR-U5): refuse demoting or disabling the **last active
  admin** (including self) → **409/422** with a clear message.

**Acceptance criteria**
- [x] Promote/demote and enable/disable work and persist.
- [x] Disable blocks the next request immediately (status re-checked, E2-S2) and
  keeps the user's notes (FR-A5).
- [x] The last active admin cannot be demoted or disabled (FR-U5).
- [x] No endpoint deletes a user.

**Notes.** Disabling ≠ deleting (claude.md §5). Reactivation restores access.

---

## E7-S4 — Front: AccessManager (tabs + counters) · L

**Goal.** The admin screen: members and pending invitees with counts.

**Tasks**
- `components/admin/AccessManager.tsx` at `/admin`: tabs **Membres** /
  **Invités en attente** with **counters**, `MemberRow` and `PendingRow`, faithful
  to `Keepou - Admin.dc.html`.
- Statuses: **Actif** (green) / **Désactivé** (gold) / **En attente**.

**Acceptance criteria**
- [x] Two tabs with live counters; rows show role + status with the right colors.
- [x] Registered vs pending correctly separated (from E7-S1).
- [x] Faithful in light + dark, desktop + mobile.

**Notes.** The route's real guard is the API (E7-S1); the client guard is UX only.

---

## E7-S5 — Front: add email, member menu, admin entry point · M

**Goal.** The admin actions and the admins-only entry into the screen.

**Tasks**
- **Ajouter un e-mail** field + button → `POST /api/admin/allowlist` (appears as
  *En attente*). Remove action on pending rows → `DELETE`.
- Member menu (⋯): **Promouvoir admin** / **Désactiver le compte** → `PATCH`;
  reflect the last-admin guard (disabled/explained when it would break the rule).
- **Administration** entry in the avatar menu, visible **only to admins** (from
  `GET /api/auth/me` role, E2-S4).

**Acceptance criteria**
- [x] Admins can add/remove pending emails and promote/disable members from the UI.
- [x] The last-admin guard surfaces gracefully (no dead-end error).
- [x] The Administration entry is hidden for non-admins and the route is refused
  server-side.

**Notes.** Copy: « Ajouter à la liste », « Promouvoir admin », « Désactiver le
compte », note « Désactiver, jamais supprimer ». Frozen copy: HANDOFF §7 "Admin".

---

## E7-S6 — Tests: protection, allowlist, roles, last-admin guard · M

**Goal.** Lock down the admin rules.

**Tasks**
- Back (pytest): `/admin/*` refuses non-admins (403); allowlist add/remove
  (pending-only remove); promote/demote; disable blocks login + keeps notes;
  **last-admin guard** blocks demoting/disabling the final admin.
- Front (Vitest): AccessManager renders members/pending + counters; admin entry
  hidden for members; add-email + member-menu actions call the API.

**Acceptance criteria**
- [x] Server-side admin protection tested (claude.md §6).
- [x] Allowlist + role/status changes tested (FR-U1/U3/U4).
- [x] Last-admin guard tested (FR-U5).
- [x] CI green.

**Notes.** Supports "an admin can onboard a member in < 1 minute" (PRD §8).

---

## Definition of "E7 done"

- [x] Allowlist manageable one email at a time; pending vs registered clearly shown.
- [x] Roles and statuses editable; disable is reversible and keeps notes.
- [x] `/admin` refused server-side for non-admins; entry hidden from non-admins.
- [x] Last-admin guard prevents locking everyone out.
- [x] Admin tests green in CI.
