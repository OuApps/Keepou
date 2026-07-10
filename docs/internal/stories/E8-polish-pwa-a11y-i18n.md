# E8 — Polish: PWA, a11y, formatting, pin + archive, i18n, quality — Detailed stories

> Epic goal: harden and finalize — installable, accessible, centralized strings,
> tested. Cross-cutting; hardened at the end.
>
> Estimation convention: **S** (≤ ½ day), **M** (1–2 days), **L** (3+ days).
> All these stories are `to do` (nothing is built yet).

**Reference docs.** `design/HANDOFF.md` §8, `docs/ARCHITECTURE.md` §9, PRD FR-N8 /
FR-P1 / FR-P2, claude.md. **Depends on** all feature epics (E2–E7).

> ℹ️ **Pin + archive (E8-S2 / E8-S11) shipped without a dedicated mockup.** Per
> Guillaume's go-ahead (« fais-le toi-même, colle au design existant, on ajustera
> post-deploy »), the UI reuses the existing card / `.kp-menu` tokens: an owner-only
> ⋯ menu on each card (« Épingler » / « Archiver »), a pinned indicator + pinned-first
> ordering, and a « Notes archivées » view reached from the account menu. To be
> refined with the designer post-deploy if needed.

---

## Stories at a glance

- [x] **E8-S1** — PWA: manifest, icons, **add-to-home-screen**, minimal service worker
- [x] **E8-S2** — Archive: hide a note from every board + « Notes archivées » view
- [x] **E8-S3** — Accessibility pass (a11y)
- [x] **E8-S4** — i18n: centralize the French copy
- [x] **E8-S5** — Quality hardening (tests + green CI)
- [x] **E8-S6** — Mobile keyboard: keep focused inputs/buttons above the on-screen keyboard
- [x] **E8-S7** — Password-manager autofill (Bitwarden): recognizable login form
- [x] **E8-S8** — Dark-mode legibility pass (contrast fixes — « on voit pas bien »)
- [x] **E8-S9** — Inline text formatting: bold `**`, italic `*`, headings `#` recognized as you type
- [x] **E8-S10** — Allow normal text under a checkbox (two line breaks exit the checklist)
- [x] **E8-S11** — Pin: float a note to the top of its board (owner-only)

**Status.** S1–S11 shipped (pin + archive built without a dedicated mockup — see the
note above). A few boxes below need a **real device / password manager** to confirm
(Android install prompt, iOS pinning, Bitwarden fill/save, iOS/Android keyboard) —
the implementation is in, verify them in prod on real hardware.

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
- [x] The app is installable (valid manifest, mascot icons incl. maskable, standalone display).
- [x] Lighthouse "installable" PWA check passes *(manifest + SW + icons served; run
  Lighthouse against prod to record the score)*.
- [ ] **Android** shows the install prompt; **iOS Safari "Ajouter à l'écran d'accueil"**
  pins a mascot icon that launches standalone (no browser bar) — *to confirm on device*.
- [x] The SW caches the app shell without breaking API calls (network for `/api`).

**Notes.** Responsive layout already comes from E0/E3; this story adds the install
surface. The brand logo (`web/public/keepou-mascot.png`, the notebook+pen mascot) is
the source for the sized icon set: transparent brand mark for the topbar/favicon, and
a **cream background + warm border** for the app icons (`apple-touch`, `icon-192/512`,
plus a full-bleed `icon-maskable-512` with the logo in the safe zone). *(Post-E8: the
original maracas mascot was replaced by the notebook+pen logo and the whole icon set
regenerated from it.)*

---

## E8-S2 — Archive: hide a note from every board without deleting it · M

**Goal.** Archive hides a note from **every** board (own + Public) without deleting
it (FR-N8); it stays reachable in a dedicated view and can be unarchived.

**Tasks**
- **Back**: `Note.archived` column + migration (`a1f4c2d9b6e7`, shared with pin);
  `list_notes` hides archived by default and serves `?archived=true` as the caller's
  own archived view; `PATCH` accepts `archived` **owner-only** and **lock-free**
  (metadata: no version, no `updated_at` bump).
- **Front**: the card ⋯ menu « Archiver » (own cards only); a « Notes archivées »
  entry in the account menu → `/?archived=1` (own notes, composer + tabs hidden,
  « Désarchiver » on each card); optimistic removal on toggle, resync on error.

**Acceptance criteria**
- [x] Archiving a note removes it from « Mes notes » **and** « Public ».
- [x] `/?archived=1` lists the caller's archived notes with « Désarchiver ».
- [x] Only the owner can archive/unarchive (server 403 otherwise); no lock needed.
- [x] Tests: back (leaves every board, owner-only) + front (menu, view, optimistic).

**Notes.** No dedicated mockup — reuses existing card / `.kp-menu` tokens (see the
note at the top). Refine with the designer post-deploy if needed.

---

## E8-S11 — Pin: float a note to the top of its board · S

**Goal.** Pin keeps a note at the top of its board (FR-N9), owner-only.

**Tasks**
- **Back**: `Note.pinned` column (same migration as archive); `list_notes` orders
  **pinned-first** then newest-first; `PATCH` accepts `pinned` **owner-only** and
  **lock-free** (no version, no `updated_at` bump).
- **Front**: card ⋯ menu « Épingler » / « Ne plus épingler » (own cards); a pin
  indicator on pinned cards; client re-sort on optimistic toggle (mirrors the server
  order).

**Acceptance criteria**
- [x] Pinning floats the card to the top of the board (server + optimistic client).
- [x] A pinned card shows the pin indicator; unpinning clears it.
- [x] Only the owner can pin/unpin (403 otherwise); no lock needed.
- [x] Tests: back (pinned-first, owner-only) + front (menu, re-sort).

**Notes.** Pinning was previously a PRD non-goal; scoped in on Guillaume's request
(FR-N9). Owner's pin applies on the Public board too (global flag, not per-viewer).

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
- [x] Real labeled checkboxes and labeled fields throughout.
- [x] Lock/save status regions announced (aria-live).
- [x] Contrast OK on all card shades; touch targets ≥ 44px *(ink-usage policy in
  HANDOFF §1: mute = placeholders/decorative only; on-shade muted text = `--body-ink`)*.
- [x] Keyboard-navigable primary flows *(global `:focus-visible` ring)*.

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
- [x] No user-facing string hardcoded in components; all come from the strings module.
- [x] The frozen copy matches HANDOFF §7 exactly.
- [x] Adding a locale would not require editing component JSX.

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
- [x] Back suite covers allowlist, atomic lock, versioning/restore, last-admin guard.
- [x] Key front tests pass across all flows.
- [x] CI green (lint · type · test · build) on push/PR, blocking on failure.

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
- [x] Focusing any field on mobile scrolls it above the keyboard; its primary
  button stays reachable without dismissing the keyboard first.
- [x] Bottom-anchored bars (editor save, mobile history « Fermer / Restaurer »,
  composer) are not covered by the keyboard *(all in-flow/sticky — they follow the
  resized layout viewport)*.
- [ ] Verified on iOS Safari **and** Android Chrome — *to confirm on device*.

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
- [ ] On `/login`, Bitwarden offers to autofill the saved e-mail + password —
  *to confirm with Bitwarden*.
- [ ] After a successful login or registration, the manager offers to **save**
  the credentials — *to confirm with Bitwarden*.
- [x] Auth inputs carry stable `name` + correct `autocomplete` tokens
  (`username` / `current-password` / `new-password`).

**Notes.** No visible UI change and no frozen-copy change (HANDOFF §7) — this is
markup/semantics only. Complements E8-S3's "all fields labeled".

---

## E8-S8 — Dark-mode legibility pass · M

**Goal.** Fix the **dark theme** where things are hard to read (« on voit pas
bien ») — low-contrast text, washed-out note shades, faint borders/placeholders —
so dark mode is as legible as light across every screen.

**Current state.** The theme is driven by `data-theme="light|dark"` + CSS token
variables (E0, ARCHITECTURE §9). Both themes ship, but several dark surfaces read
poorly in practice — likely the **5 card shades** (light-tuned pastels that lose
contrast on a dark background), **secondary/muted text** (timestamps, meta,
placeholders), and **borders/dividers** that vanish. This story is the **audit +
token/contrast fixes**, not a redesign.

**Tasks**
- **Audit each screen in dark mode** (board cards, editor, lock banners, history,
  admin, auth, and the E10 import review view) and list the low-contrast spots.
- **Fix via the dark token set** in `design/HANDOFF.md` §1 first — adjust the dark
  values for the offending tokens (card shades, muted text, borders, placeholders)
  rather than sprinkling per-component overrides. Update the tokens in HANDOFF §1
  **and** the CSS variables so the two stay in sync (design = source of truth).
- **Verify contrast** against WCAG AA (≥ 4.5:1 body text, ≥ 3:1 large text / UI
  borders) on every dark surface, including **title text on each of the 5 card
  shades**.
- Re-check the **light** theme didn't regress (shared tokens) and both `prefers-
  color-scheme` default + the manual toggle still land on the fixed values.

**Acceptance criteria**
- [x] The reported "hard to read in dark mode" cases are fixed; no dark surface
  falls below WCAG AA (body ≥ 4.5:1, large/UI ≥ 3:1), card-title-on-shade included
  *(measured: mute #8E8161→#ABA083, checktx #7E8A5F→#96A47A, borders lifted)*.
- [x] Fixes live in the **dark token set** (HANDOFF §1 + CSS variables), not
  scattered component hacks; light theme's tokens only gained the E8-S3 ink policy.
- [x] Verified across board, editor, lock, history, admin, auth (+ E10 import) in
  dark, desktop **and** mobile *(computed ratios on every token/surface pair +
  driven-browser screenshots)*.

**Notes.** Pairs with E8-S3 (a11y contrast) — this is the **dark-specific** slice.
If a card shade can't reach contrast by tweaking the pastel alone, adjust the **text
token** used on it (e.g. a darker Fredoka title on dark cards) rather than breaking
the fixed 5-shade identity. Keep `design/HANDOFF.md` §1 the source of truth — the
mockups' dark values change with it.

---

## E8-S9 — Inline text formatting: bold, italic, headings recognized as you type · L

**Goal.** Let Guillaume lay out a note with a **little Markdown**: **`**gras**`**
renders **bold**, `*italique*` renders *italic*, and a line starting with `#` /
`##` / `###` becomes a **heading**. Crucially, the formatting is **recognized
directly in the typed text** — you just type the Markdown characters and they take
effect — **not** through a selection + toolbar step. This is the deliberate contrast
with checkboxes: **checkboxes stay exactly as they are** (an explicit « Insérer une
case à cocher » block affordance, E4-S4), formatting is *inline in the text itself*.

**Current state.** Note bodies are **already stored as GFM Markdown** (E4-S2,
`web/src/lib/markdown.ts`, HANDOFF §3.3) — so `**`, `*` and `#` are already valid,
round-tripping characters today; they are simply rendered **flat** everywhere. The
editor paragraph block is a plain `<textarea>` (`components/editor/BlockList.tsx`),
which cannot display styled runs, and the read-only surfaces (NoteCard preview
`lib/preview.ts`, version preview E6, locked read-only E5) render paragraphs as
plain text. So the work is **recognition + rendering**, **not** a data-model or
storage change — **no migration**.

**Scope of the syntax (bounded — nothing else).**
- **Bold**: `**texte**`.
- **Italic**: `*texte*`.
- **Headings**: a line starting with `# `, `## `, or `### ` (heading levels 1–3).
- Everything else (links, images, tables, blockquotes, inline code, `_underscore_`
  emphasis, ordered lists…) stays **literal text** — do **not** pull in full GFM.
- **Checkboxes are untouched**: a line matching `- [ ] ` / `- [x] ` stays a checkbox
  block (E4-S4); `#`/`*`/`**` are paragraph-level / inline formatting only and never
  turn a line into a checkbox or vice-versa.

**Tasks**
- **Editing surface — the key decision.** A `<textarea>` can't show styled text
  while typing, so decide how to make formatting visible *as typed* (e.g. a
  Markdown-aware `contenteditable` editing surface, or a live styled overlay over
  the input) faithful to the editor chrome — **no floating toolbar, no selection
  popover**. Preserve everything E4 relies on: the block flow, autosave
  serialization (`serialize`/`parse`, E4-S6), read-only mode (E5), and the « Insérer
  une case » affordance. Keep the stored value **plain GFM Markdown** (the surface is
  a view over the Markdown, never a new storage format).
- **Rendering everywhere the body is shown.** Render bold/italic/headings in the
  **read-only** surfaces too so a note looks the same when not editing: NoteCard
  preview (`lib/preview.ts`), version preview (E6), and the locked read-only editor
  (E5). Use semantic elements — `<strong>` / `<em>` / `<h1>`–`<h3>` — for a11y (pairs
  with E8-S3).
- **Styling from tokens.** Bold/italic/heading styles come from the HANDOFF type
  scale (Fredoka / Nunito Sans, §1) — do **not** invent sizes. Heading sizing
  *inside a note body* is not in the mockups yet: pick from the existing type scale,
  and if it needs its own scale, run a **short design pass** (design-driven workflow,
  `design/claude.md`) and record it in HANDOFF §3.3 before shipping.
- **Docs.** Update HANDOFF §3.3 (content & Markdown) and `docs/ARCHITECTURE.md` §3 to
  document the supported inline subset; no `api/` change (bodies already Markdown).

**Acceptance criteria**
- [x] Typing `**gras**`, `*italique*`, and `# Titre` applies bold / italic / heading
  **as you type**, with no selection or toolbar step *(contenteditable view over the
  raw Markdown, markers visible but dimmed — `MarkdownArea.tsx`)*.
- [x] Only the bounded subset (bold `**`, italic `*`, headings `# … ###`) is
  recognized; other Markdown stays literal (`lib/inline.ts`).
- [x] **Checkboxes are unchanged** — still inserted via « Insérer une case à
  cocher », still `- [ ] ` in the Markdown, never produced by formatting characters.
- [x] The body still stores as plain GFM Markdown and **round-trips** unchanged
  (no migration); the same formatting renders identically in the card preview,
  version preview, and locked read-only view (`RichText.tsx`).
- [x] Semantic `<strong>`/`<em>`/`<h1–3>` output; correct in light + dark, desktop +
  mobile *(the card preview styles headings as `<p>` to keep its own `<h2>` outline)*.

**Notes.** Because bodies are already Markdown from the MVP, this adds **rendering**
on top of existing data — old notes containing `**`/`#` will suddenly render
formatted (expected). The editing-surface change is the architecturally significant
part; keep it isolated behind the block model so autosave (E4-S6) and the lock (E5)
are unaffected.

---

## E8-S10 — Allow normal text under a checkbox (two line breaks exit the checklist) · S

**Goal.** Be able to write a **normal paragraph under a checkbox**. Today the only
thing that can follow a checkbox is **another checkbox**, and that restriction should
be removed. The way to leave the checklist is **two line breaks**: a second Enter
(on an empty box) ends the list and drops you into a normal text paragraph.

**Current state.** In `components/editor/BlockList.tsx`, pressing **Enter** in a
checkbox label **always** inserts another checkbox (`insertCheckAt(i + 1)`,
lines 108–116) — so there is no keyboard path from a checkbox to a paragraph. The
data model and Markdown already support the ordering, though: `EditorBlock[]` is a
free-ordered flow and `serialize`/`parse` (`lib/markdown.ts`, E4-S2) already put a
**blank line** between a box group and a following paragraph (HANDOFF §3.3). So this
is an **editor-interaction** change, not a schema or Markdown change.

**Tasks**
- Change the checkbox `onKeyDown` (`BlockList.tsx`): **Enter on a non-empty box**
  still inserts the next checkbox (list continues, unchanged); **Enter on an empty
  box** — i.e. the second consecutive line break — **exits the checklist**: remove
  the empty box and insert a **normal text paragraph** below it, moving focus there.
- Net behaviour = **two line breaks to stop having a checkbox** (first Enter opens an
  empty box, second Enter breaks out to text), matching Google Keep.
- Keep Backspace-on-empty (remove the box) working; optionally, Backspace at the
  start of the just-created empty paragraph returns into the list (nice-to-have).
- Verify the round-trip: a `check → text` sequence serializes with the blank-line
  separator and parses back to the same blocks (no `lib/markdown.ts` change expected
  — confirm with a test).

**Acceptance criteria**
- [x] Enter on a **non-empty** checkbox still creates the next checkbox (unchanged).
- [x] A **second line break** (Enter on an empty checkbox) exits the checklist and
  creates a **normal text paragraph** below, with focus in it and no empty box left.
- [x] You can type normal text under a checkbox; the `check → text` flow persists and
  round-trips through Markdown (blank line separates the box group from the paragraph).
- [x] The old « only a checkbox can follow a checkbox » behaviour is gone.

**Notes.** Purely an editor-interaction change over the existing block model; pairs
with E8-S9 (both about the note body). Add the round-trip case to the E4-S2 /
E8-S5 test set. Checkbox insertion via « Insérer une case à cocher » is unchanged.

---

## Definition of "E8 done"

- [x] App installable (valid manifest, notebook+pen logo icon set incl. a
  background+border app icon, minimal SW) and **pinnable to the mobile home screen**
  (Android install prompt + iOS "Ajouter à l'écran d'accueil") — *install surface
  shipped; confirm the prompt/pinning on real devices in prod*.
- [x] **Pin + archive shipped** (E8-S2 / E8-S11) — owner-only, lock-free; card ⋯
  menu, « Notes archivées » view, pinned-first ordering. No dedicated mockup (reuses
  existing tokens); refine with the designer post-deploy if needed.
- [x] A11y verified (labeled inputs, aria-live status, contrast, 44px targets).
- [x] Mobile keyboard never covers the focused input or its primary button (E8-S6)
  — *on-device iOS/Android check pending*.
- [x] Bitwarden/built-in password managers autofill the login and offer to save (E8-S7)
  — *markup shipped; confirm with Bitwarden*.
- [x] **Dark mode legible everywhere** (WCAG AA), fixed via the dark token set (E8-S8).
- [x] **Inline text formatting** — bold `**`, italic `*`, headings `#` recognized as
  you type (not via a toolbar), checkboxes untouched, rendered in every read-only
  surface (E8-S9).
- [x] **Normal text under a checkbox** — two line breaks exit the checklist; the
  « only a checkbox can follow a checkbox » restriction is gone (E8-S10).
- [x] UI strings centralized (French verbatim), ready for later i18n.
- [x] Test suite green in CI across both apps.
