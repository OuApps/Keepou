# E8 — Polish: PWA, a11y, archive, i18n, quality — Detailed stories

> Epic goal: harden and finalize — installable, accessible, centralized strings,
> tested. Cross-cutting; hardened at the end.
>
> Estimation convention: **S** (≤ ½ day), **M** (1–2 days), **L** (3+ days).
> All these stories are `to do` (nothing is built yet).

**Reference docs.** `design/HANDOFF.md` §8, `docs/ARCHITECTURE.md` §9, PRD FR-N8 /
FR-P1 / FR-P2, claude.md. **Depends on** all feature epics (E2–E7).

> ⚠️ **Archive (E8-S2) is design-gated.** There is **no mockup** for the archive UI
> yet. Per Guillaume's instruction, this epic does **not** design or implement the
> archive here — E8-S2 is a placeholder story: **"voir design avec designer"**. The
> archive implementation stories (unarchive, `?archived=` board filter,
> `Note.archived` column + migration) will be detailed **only after** the archive UI
> is designed and validated with the designer.

---

## Stories at a glance

- [ ] **E8-S1** — PWA: manifest, icons, minimal service worker
- [ ] **E8-S2** — Archive — **voir design avec designer** *(design-gated, not built here)*
- [ ] **E8-S3** — Accessibility pass (a11y)
- [ ] **E8-S4** — i18n: centralize the French copy
- [ ] **E8-S5** — Quality hardening (tests + green CI)

**Status.** All `to do`. E8-S2 is **blocked on design** — see the warning above.

---

## E8-S1 — PWA: manifest, icons, minimal service worker · M

**Goal.** Keepou is installable and pleasant on phone + desktop (FR-P1/P2).

**Tasks**
- `manifest.webmanifest`: name, **icons = the mascot**, theme/background color,
  `display: standalone`, `start_url` — shipped with the `web/` build (ARCHITECTURE §9).
- Favicon (mascot) already present; wire the manifest + apple-touch metadata.
- **Minimal service worker**: installability + app-shell caching only (no offline
  editing, no background sync — out of scope, ARCHITECTURE §9).

**Acceptance criteria**
- [ ] The app is installable (valid manifest, icons, standalone display).
- [ ] Lighthouse "installable" PWA check passes.
- [ ] The SW caches the app shell without breaking API calls (network for `/api`).

**Notes.** Responsive layout already comes from E0/E3; this story adds the install
surface.

---

## E8-S2 — Archive — voir design avec designer · (design-gated)

**Goal.** Archive hides a note from the main board **without deleting** it (FR-N8).

**Status.** ⛔ **Blocked on design.** There is no archive mockup yet. **Voir design
avec designer** before any implementation: run the design-driven workflow
(`design/claude.md` / `design/HANDOFF.md`) to produce and validate the archive UI
(board affordance, archived view, unarchive action, empty states) — the `.dc.html`
mockup is the source of truth, as for every other screen.

**Tasks (later, once the design is validated — not part of this epic yet)**
- Then, and only then, detail the implementation stories: `Note.archived` column +
  migration, archive/unarchive endpoints, the `?archived=` board filter, and the UI
  wiring — added as new stories here after design.

**Acceptance criteria**
- [ ] An archive UI is designed **with the designer** and a validated `.dc.html`
  mockup exists (this is the deliverable of this story).
- [ ] Implementation stories are written **only after** the design is validated.

**Notes.** Deliberately no implementation detail here, per instruction. The
`Note.archived` field is intentionally **not** added until the design lands, keeping
migrations feature-aligned (see E3-S1).

---

## E8-S3 — Accessibility pass (a11y) · M

**Goal.** The app is usable with assistive tech and on touch, per HANDOFF §8.

**Tasks**
- Checkboxes = real `<input type=checkbox>` + associated **label** (verify E4-S4).
- All form fields **labeled** (auth, composer, editor, admin).
- Lock **and** save banners as `role="status"` with **aria-live polite** (E4-S6, E5-S5).
- Contrast check on the light card shades; **mobile hit targets ≥ 44px**.
- Keyboard navigation and focus states across the flows.

**Acceptance criteria**
- [ ] Real labeled checkboxes and labeled fields throughout.
- [ ] Lock/save status regions announced (aria-live).
- [ ] Contrast OK on all card shades; touch targets ≥ 44px.
- [ ] Keyboard-navigable primary flows.

**Notes.** Uses real inputs from E4 onward; this story is the audit + fixes pass.

---

## E8-S4 — i18n: centralize the French copy · M

**Goal.** All UI strings live in one place, ready for a later translation.

**Tasks**
- Centralize the frozen FR copy (HANDOFF §7) into a single strings module; replace
  scattered inline strings (auth, board, editor, lock, history, admin).
- Keep the copy **French verbatim** (product rule: docs English, **UI stays French**
  — claude.md). Structure the module so a locale can be added later without touching
  components.

**Acceptance criteria**
- [ ] No user-facing string hardcoded in components; all come from the strings module.
- [ ] The frozen copy matches HANDOFF §7 exactly.
- [ ] Adding a locale would not require editing component JSX.

**Notes.** i18n = centralization now; actual translation is out of MVP scope.

---

## E8-S5 — Quality hardening (tests + green CI) · L

**Goal.** A trustworthy safety net over the critical business rules.

**Tasks**
- Consolidate the back tests on the non-negotiables: allowlist gate (E2), atomic
  lock (E5), one-version-per-session + restore (E6), last-admin guard (E7).
- Key front tests across the flows (auth errors, board, editor autosave/markdown,
  lock banners, history, admin).
- CI (`.github/workflows/ci.yml`) runs lint · types · tests · build for both apps
  and blocks on failure (extends E0-S8).

**Acceptance criteria**
- [ ] Back suite covers allowlist, atomic lock, versioning/restore, last-admin guard.
- [ ] Key front tests pass across all flows.
- [ ] CI green (lint · type · test · build) on push/PR, blocking on failure.

**Notes.** Much of this accumulates in each epic's `-S*` test story; E8-S5 is the
final consolidation + coverage sweep.

---

## Definition of "E8 done"

- [ ] App installable (valid manifest, icons, minimal SW).
- [ ] **Archive designed with the designer** (E8-S2) — implementation stories written
  only afterwards; not built in this epic.
- [ ] A11y verified (labeled inputs, aria-live status, contrast, 44px targets).
- [ ] UI strings centralized (French verbatim), ready for later i18n.
- [ ] Test suite green in CI across both apps.
