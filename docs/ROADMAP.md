# Keepou — Roadmap

**Status:** Draft for review · **Last updated:** 2026-06-26

Phased plan from specs to a shipped, evolving product. Item tags mirror the
[PRD](./PRD.md) requirement IDs.

---

## Phase 0 — Specs & design _(current)_

- [x] Product requirements (PRD)
- [x] Architecture & data model
- [x] Roadmap & ADRs
- [ ] UI/UX design & mockups (via **Claude Design**)
- **Exit criteria:** specs approved; screens and component library designed.

## Phase 1 — MVP

The smallest lovable, self-hostable release.

**Access & users**
- [ ] Email/password auth, hashed, DB sessions _(FR-A3, FR-A4)_
- [ ] First user → admin bootstrap _(FR-A1)_
- [ ] Allowlist-gated registration with polite rejection _(FR-A2)_
- [ ] Admin user-management UI: allowlist, promote/demote, deactivate _(FR-U1…U5)_
- [ ] Deactivated users keep notes, lose sign-in _(FR-A5)_

**Notes**
- [ ] Create / edit / archive notes, colors _(FR-N1, FR-N4, FR-N8)_
- [ ] Private vs public visibility (owner-controlled) _(FR-N2, FR-N5)_
- [ ] Text + checklist content _(FR-N3)_
- [ ] Delete restricted to owner/admin _(FR-N6)_
- [ ] "My notes" and "Public" boards _(FR-S2)_
- [ ] Simple search _(FR-S1)_

**Collaboration**
- [ ] Single-editor lock with TTL + heartbeat _(FR-L1…L4, L6)_
- [ ] Gentle "being edited by X" messaging _(FR-L5)_

**History**
- [ ] Version snapshot per content save (author + time) _(FR-H1)_
- [ ] History viewer (read-only), visibility-gated _(FR-H2, FR-H3, FR-H5)_
- [ ] Activity log for color/visibility/archive _(FR-H4)_

**Platform**
- [ ] Responsive, installable PWA _(FR-P1, FR-P2)_
- [ ] Deploy on Railway with Postgres plugin

**Exit criteria:** a group can be onboarded by an admin, take private/public
notes, edit shared notes safely, and audit history — installed as a PWA.

## Phase 2 — V1

Quality-of-life on top of a solid MVP.

- [ ] **Restore** a note to a previous version (non-destructive) _(FR-H6)_
- [ ] **Pinning** notes _(FR-N9)_
- [ ] **Labels / tags** + filtering _(FR-N10)_
- [ ] Activity-log surfaced in the UI
- [ ] Allowlist bulk-add (paste multiple emails)

## Phase 3 — Later

Bigger bets, scheduled by demand.

- [ ] **Presence & live read** (SSE push of saved updates; who's viewing)
- [ ] **Rich content**: Markdown, images / attachments (object storage)
- [ ] **Email**: invitations + password reset (SMTP)
- [ ] **Offline-first** PWA (queued edits, background sync) _(FR-P3)_
- [ ] **History retention/pruning** policies _(FR-H7)_
- [ ] Optional **real-time co-editing** (CRDT) — only if single-editor proves
      too limiting

## Explicitly not planned

- Multi-tenant SaaS / org isolation
- Public/anonymous access
- Native mobile apps
