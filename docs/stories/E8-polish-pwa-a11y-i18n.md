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

- [ ] **E8-S1** — PWA: manifest, icons, **add-to-home-screen**, minimal service worker
- [ ] **E8-S2** — Archive — **voir design avec designer** *(design-gated, not built here)*
- [ ] **E8-S3** — Accessibility pass (a11y)
- [ ] **E8-S4** — i18n: centralize the French copy
- [ ] **E8-S5** — Quality hardening (tests + green CI)
- [ ] **E8-S6** — Mobile keyboard: keep focused inputs/buttons above the on-screen keyboard
- [ ] **E8-S7** — Password-manager autofill (Bitwarden): recognizable login form

**Status.** All `to do`. E8-S2 is **blocked on design** — see the warning above.

---

## E8-S1 — PWA: manifest, icons, add-to-home-screen, minimal service worker · M

**Goal.** Keepou is installable and pleasant on phone + desktop (FR-P1/P2) —
Guillaume can **"Ajouter à l'écran d'accueil"** on his phone and get a real app
icon (the mascot) that launches standalone, no browser chrome.

**Current state.** `web/index.html` already sets `theme-color` (`#FBF4E6`) and a
`favicon.png`, but there is **no `manifest.webmanifest`, no `apple-touch-icon`, and
no service worker** — so Android's install prompt and iOS "Add to Home Screen" don't
produce a proper standalone app yet.

**Tasks**
- `manifest.webmanifest`: `name` / `short_name` (`Keepou`), **icons = the mascot**
  (192 + 512, plus a **`maskable`** variant for Android adaptive icons),
  `theme_color` / `background_color`, `display: standalone`, `start_url: "/"` —
  shipped with the `web/` build and linked from `index.html` (ARCHITECTURE §9).
- **iOS "Add to Home Screen"**: `<link rel="apple-touch-icon">` (mascot, 180×180)
  and `<meta name="apple-mobile-web-app-*">` (title + status-bar style) so pinning
  from Safari gives the mascot icon and a standalone launch.
- **Minimal service worker**: installability + app-shell caching only (no offline
  editing, no background sync — out of scope, ARCHITECTURE §9).

**Acceptance criteria**
- [ ] The app is installable (valid manifest, mascot icons incl. maskable, standalone display).
- [ ] Lighthouse "installable" PWA check passes.
- [ ] **Android** shows the install prompt; **iOS Safari "Ajouter à l'écran d'accueil"**
  pins a mascot icon that launches standalone (no browser bar).
- [ ] The SW caches the app shell without breaking API calls (network for `/api`).

**Notes.** Responsive layout already comes from E0/E3; this story adds the install
surface. The mascot asset already exists (`web/public/keepou-mascot.png`); generate
the sized icon set from it.

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

## E8-S6 — Mobile keyboard: keep focused inputs/buttons above the on-screen keyboard · S

**Goal.** On phones, the software keyboard must **never cover the field being
edited or its primary action button** — the login/register cards, the quick
composer, the note editor, and the admin "Ajouter un e-mail" field must all stay
reachable while typing.

**Current state.** `web/index.html` uses the bare
`<meta name="viewport" content="width=device-width, initial-scale=1.0">`; nothing
keeps the layout above the keyboard. Bottom-anchored bars (editor save bar, the
mobile history « Fermer / Restaurer » bar, the composer) are the most likely to be
hidden behind the keyboard.

**Tasks**
- Add `interactive-widget=resizes-content` to the viewport meta so the layout
  viewport shrinks with the keyboard on Chrome/Android (and doesn't just overlay).
- Scroll the focused field into view on `focus` (native anchoring is unreliable on
  iOS Safari); ensure the submit/primary button follows or stays reachable.
- Audit bottom-anchored / fixed bars (note editor save bar, mobile history bar,
  composer, admin add-email) so the keyboard doesn't sit on top of them — prefer a
  `visualViewport`-aware offset or in-flow layout over `position: fixed; bottom: 0`.
- Verify on **iOS Safari** and **Android Chrome** (the two behave differently).

**Acceptance criteria**
- [ ] Focusing any field on mobile scrolls it above the keyboard; its primary
  button stays reachable without dismissing the keyboard first.
- [ ] Bottom-anchored bars (editor save, mobile history « Fermer / Restaurer »,
  composer) are not covered by the keyboard.
- [ ] Verified on iOS Safari **and** Android Chrome.

**Notes.** Pairs with E8-S3 (mobile hit targets ≥ 44px). Keep the auth cards
scrollable inside the viewport rather than vertically centering when the keyboard
is open.

---

## E8-S7 — Password-manager autofill (Bitwarden): recognizable login form · S

**Goal.** Bitwarden (and Chrome/Safari/iCloud built-in managers) must **recognize
the login as a login** and **offer the saved password** on `/login`, and offer to
**save** the credentials after a successful login/registration.

**Current state.** `LoginPage.tsx` / `RegisterPage.tsx` already set the right
`autoComplete` tokens (`email` / `current-password` / `new-password` / `nickname`)
inside a real `<form>` with a submit button — **but the inputs have no `name`
attribute**. Bitwarden's heuristics lean on stable field `name`/`id`, so the missing
`name` is the most likely reason it isn't detecting/offering the password reliably.

**Tasks**
- Add stable `name` attributes to the auth inputs (`name="email"`,
  `name="password"`, `name="displayName"`) — keep the existing `id`s and
  `autocomplete` tokens.
- Login: mark the identifier field as the username for managers
  (`autocomplete="username"`, kept alongside `type="email"`); password stays
  `current-password`. Register password stays `new-password`.
- Confirm the login lives in a single `<form>` whose submit triggers navigation, so
  managers show the **"save password?"** prompt on submit (avoid submitting via a
  non-`submit` handler that skips the browser's credential detection).
- Verify end-to-end with **Bitwarden** on desktop + mobile: fill on `/login`, save
  prompt after register/login.

**Acceptance criteria**
- [ ] On `/login`, Bitwarden offers to autofill the saved e-mail + password.
- [ ] After a successful login or registration, the manager offers to **save**
  the credentials.
- [ ] Auth inputs carry stable `name` + correct `autocomplete` tokens
  (`username` / `current-password` / `new-password`).

**Notes.** No visible UI change and no frozen-copy change (HANDOFF §7) — this is
markup/semantics only. Complements E8-S3's "all fields labeled".

---

## Definition of "E8 done"

- [ ] App installable (valid manifest, mascot icons, minimal SW) and **pinnable to
  the mobile home screen** (Android install prompt + iOS "Ajouter à l'écran d'accueil").
- [ ] **Archive designed with the designer** (E8-S2) — implementation stories written
  only afterwards; not built in this epic.
- [ ] A11y verified (labeled inputs, aria-live status, contrast, 44px targets).
- [ ] Mobile keyboard never covers the focused input or its primary button (E8-S6).
- [ ] Bitwarden/built-in password managers autofill the login and offer to save (E8-S7).
- [ ] UI strings centralized (French verbatim), ready for later i18n.
- [ ] Test suite green in CI across both apps.
