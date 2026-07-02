# E5 — Single-editor lock & real-time — Detailed stories

> Epic goal: guarantee that **only one person edits a note at a time**, with the **4
> states** from the mockups (yours / locked by another / expired-takeover /
> conflict), read-only for the others, updated in near real-time.
>
> Estimation convention: **S** (≤ ½ day), **M** (1–2 days), **L** (3+ days).
> All these stories are `to do` (nothing is built yet).

**Reference docs.** `design/HANDOFF.md` §3.1 & §7 (Lock), `docs/ARCHITECTURE.md` §5,
PRD FR-L1…FR-L6, claude.md §1. Visual source of truth:
`design/Keepou - Éditeur & verrou.dc.html`. **Depends on** E4.

**Key decisions carried in (already validated):**
- **Lock applies to PUBLIC notes.** A private note is single-owner (no contention),
  so it is edited without a lock; its version is created on **editor close** (E6). A
  public note requires a held, non-stale lock to save.
- **Real-time transport = short-polling** (validated). In read-only, the client
  re-reads the lock state every **~10–15 s** to refresh the banner; **no SSE** for
  the MVP (documented as a possible later upgrade, same data model).
- **Heartbeat ~20 s, TTL ~60 s** (FR-L3/L4). Conflict is decided **server-side** by
  an atomic conditional `UPDATE` (claude.md §1 — never concurrent editing, no CRDT/OT).

---

## Stories at a glance

- [ ] **E5-S1** — Back: lock columns migration (`locked_by_id`, `locked_at`, `lock_expires_at`)
- [ ] **E5-S2** — Back: `locks.py` + acquire/renew/release endpoints (atomic) + enforcement
- [ ] **E5-S3** — Back: lock state in the note payload (for short-poll)
- [ ] **E5-S4** — Front: `useNoteLock` (acquire, heartbeat 20 s, expiry 60 s, poll, release)
- [ ] **E5-S5** — Front: LockBanner (4 states) + read-only mode + takeover / read-only actions
- [ ] **E5-S6** — Tests: atomic acquisition, heartbeat/expiry, enforcement, banner states

**Status.** All `to do`.

---

## E5-S1 — Back: lock columns migration · S

**Goal.** Add the single-editor lock fields to `Note`.

**Tasks**
- `Note`: `locked_by_id` (FK→user.id, nullable), `locked_at` (nullable),
  `lock_expires_at` (nullable) — HANDOFF §4.
- Alembic autogenerate + `upgrade head` (3rd real migration).

**Acceptance criteria**
- [ ] The three nullable lock columns are added by a checked-in migration.
- [ ] Existing notes migrate cleanly (all lock fields `NULL`).
- [ ] Postgres-safe.

**Notes.** The lock is carried by the note (≤ 1 active lock) → atomicity via a
conditional UPDATE (ARCHITECTURE §5).

---

## E5-S2 — Back: lock service & endpoints (atomic) + enforcement · L

**Goal.** Acquire / renew / release with a server-decided conflict, and reject
unlocked saves on public notes.

**Tasks**
- `services/locks.py`: acquire/renew (atomic conditional update
  `UPDATE ... SET locked_by_id=:me, locked_at=now, lock_expires_at=now+60s
  WHERE id=:id AND (locked_by_id IS NULL OR lock_expires_at < now OR locked_by_id=:me)`),
  release, expiry/conflict detection via the affected row count.
- `POST /api/notes/{id}/lock` (acquire/renew heartbeat) → **200** with the holder;
  **409** if held by another, returning **who** holds it (FR-L5).
- `DELETE /api/notes/{id}/lock` (release) — idempotent; releasing ends the session
  (the **version is created here in E6**).
- **Enforcement**: a mutating `PATCH /api/notes/{id}` on a **PUBLIC** note is
  rejected with **409** unless the caller holds a valid (non-stale) lock (FR-L2).
  Private notes are unaffected.

**Acceptance criteria**
- [ ] Two near-simultaneous acquisitions → exactly **one** wins; the other gets
  **409** + the holder's identity (server-decided, FR-L1).
- [ ] Re-acquire by the current holder renews `lock_expires_at` (heartbeat, FR-L3).
- [ ] After the TTL with no heartbeat, the lock is claimable by anyone (FR-L4).
- [ ] A public-note PATCH without a held lock → **409**; with the lock → **200**.

**Notes.** No persistent-draft concept (out of MVP scope): on a lost conflict we
simply inform that the latest edits could not be saved (§3.1). Never a hard error.

---

## E5-S3 — Back: lock state in the note payload · S

**Goal.** Let the front render the read-only banner by short-polling.

**Tasks**
- Include the current lock state in `GET /api/notes/{id}` (and/or the acquire
  response): `locked_by` (id + display_name) and `lock_expires_at`, so a reader can
  show **who** is editing and whether the lock is stale.

**Acceptance criteria**
- [ ] `GET /api/notes/{id}` reports the live lock holder + expiry.
- [ ] A stale lock is distinguishable (expiry in the past) so the front can offer
  takeover.

**Notes.** This is the read-only **short-poll** source (validated transport). SSE
could replace it later without changing this payload.

---

## E5-S4 — Front: `useNoteLock` hook · L

**Goal.** Drive lock acquisition, heartbeat, polling and release from the editor.

**Tasks**
- `hooks/useNoteLock.ts`:
  - On opening a **public** note for editing → **acquire**; if **409**, open in
    **read-only** with the holder.
  - **Heartbeat** every **~20 s** (re-acquire) while active; extend expiry.
  - **Read-only**: **short-poll** the lock state every **~10–15 s** to refresh the
    banner and detect release/expiry in near real-time.
  - **Release** on leaving the editor and on `beforeunload` (fetch `keepalive`).
  - Expose the state machine: **yours / locked / expired / conflict**.
- Private notes: no lock; the hook is a no-op (editing is always allowed).

**Acceptance criteria**
- [ ] Opening an already-locked public note → read-only with the holder shown.
- [ ] The lock is renewed ~every 20 s while editing; leaving releases it promptly.
- [ ] In read-only, the banner updates within one poll interval when the other user
  releases / the lock expires.
- [ ] The heartbeat is independent of content autosave (E4-S6).

**Notes.** Poll interval ~10–15 s is a deliberate MVP trade-off (calm, cheap). SSE
is a documented later upgrade.

---

## E5-S5 — Front: LockBanner + read-only mode + actions · L

**Goal.** The 4 banner states and the read-only / takeover UX, pixel-faithful.

**Tasks**
- `components/editor/LockBanner.tsx` — 4 states with the frozen copy & colors:
  - **Yours** (avocado): « Tu modifies cette note ».
  - **Locked** (terracotta): « 🔒 Bob est en cours d'édition — lecture seule » +
    subtext « Édition indisponible tant que Bob modifie la note. L'affichage se met
    à jour en temps réel. » → fields disabled (read-only).
  - **Expired/takeover** (gold): « Bob a fini de modifier — note disponible » +
    button **« Modifier la note »** (acquire → edit).
  - **Conflict** (sand `#F1EADB`): « Léa modifie cette note » + « Léa a commencé à
    modifier cette note pendant ton absence. Tes dernières modifications n'ont pas pu
    être enregistrées. » + button **« Passer en lecture seule »**.
- Read-only mode disables the block/color/visibility controls; **« Dernière édition
  par X »** line on **desktop and mobile**.

**Acceptance criteria**
- [ ] All 4 states reproduce the mockup (colors + exact copy), light + dark.
- [ ] Locked → inputs disabled; takeover button appears once the lock is free.
- [ ] Conflict → "Passer en lecture seule" switches the loser to read-only.
- [ ] "Dernière édition par X" shown on desktop and mobile.

**Notes.** Banner is `role="status"` (aria-live) — verified in E8-S3. Frozen copy:
HANDOFF §7 "Lock".

---

## E5-S6 — Tests: acquisition, heartbeat/expiry, enforcement, states · M

**Goal.** Lock down the concurrency rules (the most safety-critical epic).

**Tasks**
- Back (pytest): concurrent acquire → single winner + 409 with holder; heartbeat
  renews expiry; stale lock reclaimable; public PATCH rejected without a lock,
  accepted with it; release is idempotent.
- Front (Vitest): the 4 LockBanner states render with the right copy/colors;
  read-only disables inputs; takeover/read-only actions call the hook.

**Acceptance criteria**
- [ ] Atomic single-winner acquisition tested (FR-L1).
- [ ] Heartbeat/expiry/reclaim tested (FR-L3/L4).
- [ ] Public-note save enforcement tested (FR-L2).
- [ ] 4 banner states tested; CI green.

**Notes.** These tests protect the "zero lost edit" metric (PRD §8).

---

## Definition of "E5 done"

- [ ] The 4 lock states are reproduced faithfully (yours / locked / expired / conflict).
- [ ] Conflict decided **server-side** via atomic conditional update (no CRDT/OT).
- [ ] Read-only updates in near real-time via short-polling; takeover after expiry.
- [ ] Public-note saves require a held lock; private notes edit lock-free.
- [ ] Lock concurrency tests green in CI.
