# Keepou — Design → development handoff

Reference document for reproducing the approved mockups **exactly**. The `Keepou - *.dc.html` files at the repo root are the visual source of truth; this document extracts their tokens, states and behaviors, and proposes the mapping to React + FastAPI.

Contents:
1. Design system (exact tokens)
2. Screen inventory (mockups ↔ PRD requirements)
3. Behavior specifications
4. Data model (SQLModel)
5. Routes & API
6. React front + FastAPI back breakdown
7. States & messages (French copy)
8. Accessibility, responsive, PWA

---

## 1. Design system — exact tokens

Palette extracted from the logo (burrito mascot). **Reuse these values as-is.**

### Brand colors
| Role | Hex | Usage |
|---|---|---|
| Gold (tortilla) | `#EAB64C` | Primary accent, button gradient `linear-gradient(150deg,#EAB64C,#D89030)` |
| Dark gold | `#D89030` | End of the primary gradient |
| Salsa / terracotta | `#C75D43` | "Edited by someone else" lock, errors, avatar |
| Dark terracotta | `#C04A30` | (denial) `linear-gradient(150deg,#D86A50,#C04A30)` |
| Avocado | `#9DB84E` | "Yours" states, public (light) |
| Deep green | `#3A5132` | Secondary buttons, checked boxes, active status, admin |
| Teal | `#5FA39A` | Avatar / tertiary accent |
| Warm ink | `#2E2A20` | Main text, mobile bezel |
| Cream | `#FBF5E9` / board background `#FBF4E6` | Light backgrounds |

### Surfaces & text (light)
```
--bg:#FBF4E6;  --surface:#ffffff;  --border:#EBDFC6;  --track:#EFE4CE;
--ink:#2E2A20; --ink-soft:#6A6354; --ink-mute:#A1977F;
--body-ink:#4A4636;  --checktx:#727762;
```
> **Ink usage policy (E8-S3, WCAG AA).** `--ink-mute` is reserved for
> **placeholders and decorative glyphs** (it cannot carry AA text on any
> surface). Muted **text** on `--bg`/`--surface` uses `--ink-soft`; muted text
> that sits **on a card shade** (card meta/author, editor subtitle, lock note)
> uses `--body-ink` (≥ 6:1 on every shade). Struck-through "done" labels use
> `--checktx` (≥ 3:1 on every light shade — dimmed state by design).

### Surfaces & text (dark)
```
--bg:#211D16;  --surface:#2C2719;  --border:#554A2B;
--ink:#F3ECDD; --ink-soft:#C9BFA3; --ink-mute:#ABA083;
```
> Dark values adjusted by the E8-S8 legibility pass (WCAG AA): `--ink-mute`
> reaches ≥ 4.5:1 on every dark surface (incl. the 5 card shades), the
> checkbox/struck-text ink is `--checktx:#96A47A` (was `#7E8A5F`), and borders
> are lifted so dividers stay visible on dark. Light values are unchanged.

### Card colors (5 shades, gradient + border)
| Name | Light (bg / border) | Dark (bg / border) |
|---|---|---|
| gold | `linear-gradient(160deg,#FCEFCF,#F7E2AE)` / `#EFD79E` | `linear-gradient(160deg,#3A3320,#2E2A18)` / `#5C5030` |
| avocat | `linear-gradient(160deg,#EEF3D2,#DFEAAE)` / `#D4E0A2` | `linear-gradient(160deg,#2F3A22,#26301B)` / `#4E5C34` |
| salsa | `linear-gradient(160deg,#FAE0D6,#F2C7B5)` / `#EDC0AC` | `linear-gradient(160deg,#3A2A22,#2E211B)` / `#5E4032` |
| clay | `linear-gradient(160deg,#F6E9D8,#ECD8BC)` / `#E6CDA9` | `linear-gradient(160deg,#352D1C,#2A2416)` / `#584826` |
| teal | `linear-gradient(160deg,#DFEDE8,#C7DED5)` / `#BAD7CD` | `linear-gradient(160deg,#1F332E,#1A2A26)` / `#38564D` |

These 5 shades are a note's color picker. Store an identifier (`gold|avocat|salsa|clay|teal`), not the hex.

### Typography
- **Fredoka** (600/500) — "Keepou" brand, note titles, screen titles, button labels.
- **Nunito Sans** (400/600/700) — body, UI, metadata.
- **IBM Plex Mono** (500/600) — technical labels, UPPERCASE timestamps, codes (`note.md`).
- Google Fonts imports (weights used):
  `Fredoka:wght@400;500;600;700` · `Nunito+Sans:opsz,wght@6..12,400;6..12,600;6..12,700` · `IBM+Plex+Mono:wght@400;500;600`

### Scale & shapes
- Radii: cards `18px`, UI panels/cards `14–16px`, modal `20px`, fields `10px`, pills/buttons `999px`, checkboxes `5px` (desktop) / `6px` (mobile, `22px`).
- Shadows: board card `0 8px 16px -13px rgba(46,42,32,.4)`; modal `0 40px 80px -30px rgba(46,42,32,.6)`; frame `0 30px 60px -40px rgba(46,42,32,.5)`.
- Topbar: `backdrop-filter:blur(8px)`, background `rgba(251,244,230,.86)`, bottom border `--border`.
- Board: masonry 4 (desktop) / 2 (mobile) columns, gap 16–18px. Cards spread round-robin across flex columns (card N → column N % cols) so they read left→right, top→bottom — not the column-major fill of CSS `column-count`.
- Mobile hit targets ≥ 44px.

---

## 2. Screen inventory ↔ PRD requirements

| Mockup | Screen | Covers (PRD, FR) |
|---|---|---|
| `Keepou - Board.dc.html` | Main board (canonical, light+dark, tabs, composer) | Note list, **Mes notes / Public** tabs, search, quick composer, color picker, private/public toggle, theme |
| `Keepou - Éditeur & verrou.dc.html` | Exploration of the 2 formats + **4 lock states** | Single-editor lock (yours / locked / expired / conflict), read-only, takeover |
| `Keepou - Éditeur canonique.dc.html` | **Chosen editor**: desktop modal / mobile full screen, text + boxes, Markdown panel | Text + checklist editing, box insertion, color picker, private/public, autosave, **Markdown storage** |
| `Keepou - Historique.dc.html` | History panel + read-only preview + restore (desktop & 2-screen mobile flow) | Version history, author + date, preview, restore |
| `Keepou - Auth.dc.html` | Login, account creation, **allowlist denial**, inline variants | Login, register gated on the allowlist, error messages, disabled account |
| `Keepou - Admin.dc.html` | Access management: allowlist, **Members / Pending**, statuses, member menu, entry point | Allowlist, registered members vs pending invitees, roles, activation/deactivation |
| `Keepou - Import Keep.dc.html` | **Import from Google Keep**: upload modal → **review/selection grid (« mode tunnel »)** → summary, light+dark+mobile | Takeout upload, per-note check/uncheck (trashed pre-unchecked), select all/none, live count, import summary (FR-I*) |
| `Board - 3 directions.dc.html` | Archive of the 3 explored directions (A chosen) | — (historical reference) |

**Frozen format decisions:** editor as a **modal** ≥ tablet, **full screen** below ~640px. History as a **side panel** on desktop, **2-screen flow** (list → preview) on mobile.

---

## 3. Behavior specifications

### 3.1 Single-editor lock
Deliberately simple model (no CRDT/OT). A note has at most one active lock.

1. **Acquisition** — when opening for editing, the client attempts to acquire the lock (`note.lockedById = me`, `lockedAt = now`, `lockExpiresAt = now + 60s`). If already locked by someone else → opens in **read-only**.
2. **Heartbeat** — every **~20 s** while the editor is active, extend `lockExpiresAt`. On prolonged blur / close, release the lock.
3. **Read-only (another editor)** — terracotta banner "🔒 Bob est en cours d'édition — lecture seule". Fields disabled. The display updates in real time (poll or SSE).
4. **Expiry** — with no heartbeat past `lockExpiresAt` (~60 s), the lock is considered free. Gold banner "Bob a fini de modifier — note disponible" + a **Modifier la note** button (takeover).
5. **Conflict** — if two people take over nearly simultaneously, the **server decides** (atomic transaction on the lock). The loser sees "Léa modifie cette note" and a **Passer en lecture seule** button. No persistent draft concept (out of MVP scope): we simply inform that the latest edits could not be saved.

**Banner colors:** avocado green = yours · terracotta = locked by someone else · gold = expired/takeover · sand `#F1EADB` = conflict.

### 3.2 Save
- Two **distinct** pieces of information, never in conflict:
  - **Session state** (header): `Modifié` (gold dot `#EAB64C`) → `Enregistrement…` (dot `#9DAE6C`) → `Enregistré · à l'instant` (dot/check `#3A5132`).
  - **Last saved version** (subtitle): author + timestamp of the last **persisted** version; changes only after a successful save.
- **Debounce ~1.5 s** after the last keystroke; **immediate** save on blur / close.
- The lock heartbeat is **independent** of content saving.

### 3.3 Content & Markdown
- The body mixes **paragraphs** and **checkboxes** in an ordered flow.
- **"Insert a checkbox"** affordance at the **bottom** of the text area (not in the middle).
- **Markdown (GFM)** persistence from the MVP onward:
  - paragraph → text;
  - box → `- [ ] label` (unchecked) / `- [x] label` (checked).
  - The **title** is stored separately (dedicated field), not in the Markdown.
- Reference serialization (see `Keepou - Éditeur canonique.dc.html`, `buildMd` method): a blank line between a paragraph and a group of boxes. *(Amended by field feedback round 3: the original « no more than one consecutive blank line » rule is relaxed — user-typed blank lines are preserved verbatim, including empty lines between two boxes; only the single structural separator at a paragraph ⇄ box-group boundary remains implicit.)*
- **Inline formatting subset (E8-S9)** — recognized **as you type** (no toolbar, no selection step), bounded to exactly:
  - **bold** `**texte**` · *italic* `*italique*` · headings `# ` / `## ` / `### ` (levels 1–3, space required);
  - everything else (links, code, `_underscore_`, tables, quotes…) stays **literal text** — not full GFM;
  - checkbox lines are **untouched**: `- [ ]` / `- [x]` never come from formatting characters and vice-versa.
  - Editing surface: the markers stay **visible but dimmed** (`--ink-mute`) while typing; read-only surfaces (card preview, version preview, locked editor) render `<strong>` / `<em>` / `<h1>`–`<h3>` **without** the markers.
  - Heading type scale **inside a note body** (relative, so it fits every surface): Fredoka 600, `h1 = 1.3em`, `h2 = 1.16em`, `h3 = 1.05em` of the surface's body size; bold = Nunito Sans 700.
- Further rich rendering (nested lists…) stays possible later **without migration** since it's already Markdown.

### 3.4 Versioning & history
- **One version = one editing session**, created on lock release (not per keystroke nor per checked box).
- A version stores: author, timestamp, snapshot of the body (Markdown) + title + color + visibility.
- History lists **who** and **when** (no change summary, no visual diff).
- Selecting a version **re-displays it as-is** (read-only). A single button: **Restaurer**.
- **Restaurer** creates a **new version** whose content = that of the chosen version. Nothing is overwritten.
- Mobile: list (chevrons) → **read-only preview** screen (gold banner "Aperçu — lecture seule · version de X") → **Fermer / Restaurer cette version** bar.

### 3.5 Private/public visibility
- **Reversible** switch in the editor.
- Public → visible to all members on the **Public** tab, with author + last-modified date.
- Switching **public → private**: **confirmation** "Cette note ne sera plus visible par les autres"; it then disappears from the others' public board.

### 3.6 Allowlist & accounts
- **Register**: the server checks that the email is on the allowlist **before** creating the account. Otherwise → **Accès non autorisé** screen (no creation, no in-app contact, **Retour à la connexion** button).
- **Login**: inline messages — wrong credentials (terracotta), **disabled account** (gold, "access suspended").
- No "access request": the user **creates an account**; it passes or fails depending on the allowlist.

### 3.7 Admin
- **Membres** (registered) / **Invités en attente** (email allowed, account not yet created) tabs, with counters.
- **Add an email** to the allowlist (field + button) → appears as *En attente*.
- Member statuses: **Actif** (green) / **Désactivé** (gold). Pending = allowed without an account.
- Member menu (⋯): **Promouvoir admin**, **Désactiver le compte**. **No account deletion.** (Removing a *pending* email from the allowlist remains possible.)
- **Disable** ≠ delete: blocks login, keeps account + notes, reversible.
- **Administration** entry visible **only to admins** (avatar menu). `/admin` route protected server-side.

---

## 4. Data model (proposed SQLModel)

Derived from the screens. **SQLModel** (SQLAlchemy + Pydantic), **Alembic** migrations. Adjust to the DBMS (PostgreSQL recommended).

```python
import uuid
from datetime import datetime
from enum import Enum
from sqlmodel import SQLModel, Field, Relationship

def _id() -> str:
    return uuid.uuid4().hex

class Role(str, Enum):
    MEMBER = "MEMBER"
    ADMIN = "ADMIN"

class UserStatus(str, Enum):
    ACTIVE = "ACTIVE"
    DISABLED = "DISABLED"          # never deleted

class NoteColor(str, Enum):
    GOLD = "GOLD"; AVOCAT = "AVOCAT"; SALSA = "SALSA"; CLAY = "CLAY"; TEAL = "TEAL"

class Visibility(str, Enum):
    PRIVATE = "PRIVATE"
    PUBLIC = "PUBLIC"

class User(SQLModel, table=True):
    id: str = Field(default_factory=_id, primary_key=True)
    email: str = Field(unique=True, index=True)
    display_name: str
    password_hash: str
    role: Role = Role.MEMBER
    status: UserStatus = UserStatus.ACTIVE
    created_at: datetime = Field(default_factory=datetime.utcnow)

class AllowlistEntry(SQLModel, table=True):
    id: str = Field(default_factory=_id, primary_key=True)
    email: str = Field(unique=True, index=True)
    added_by_id: str = Field(foreign_key="user.id")
    added_at: datetime = Field(default_factory=datetime.utcnow)
    # "pending" = AllowlistEntry whose email has no User (join on email)

class Note(SQLModel, table=True):
    id: str = Field(default_factory=_id, primary_key=True)
    title: str
    body: str                                  # Markdown (GFM task lists)
    color: NoteColor = NoteColor.GOLD
    visibility: Visibility = Visibility.PRIVATE
    archived: bool = False                     # hide from the board, never delete (E8)
    owner_id: str = Field(foreign_key="user.id", index=True)

    # single-editor lock (carried by the note)
    locked_by_id: str | None = Field(default=None, foreign_key="user.id")
    locked_at: datetime | None = None
    lock_expires_at: datetime | None = None

    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)  # = "last saved version"
    versions: list["NoteVersion"] = Relationship(back_populates="note")

class NoteVersion(SQLModel, table=True):
    id: str = Field(default_factory=_id, primary_key=True)
    note_id: str = Field(foreign_key="note.id", index=True)
    author_id: str = Field(foreign_key="user.id")
    title: str
    body: str                                  # Markdown snapshot
    color: NoteColor
    visibility: Visibility
    created_at: datetime = Field(default_factory=datetime.utcnow)  # timestamp shown in the history
    note: Note = Relationship(back_populates="versions")
    # composite index (note_id, created_at) to create via Alembic
```

Notes:
- **Lock** carried by the `Note` (1 lock max) → simplicity, atomicity via `UPDATE ... WHERE locked_by_id IS NULL OR lock_expires_at < :now` (conditional update, returning the affected row count to detect the conflict).
- **Pending** = `AllowlistEntry` whose `email` has no `User`. On the admin side, do a `LEFT JOIN User ON User.email = AllowlistEntry.email`.
- `Note.updated_at` feeds "Last saved version"; `NoteVersion.created_at` the history list.
- `password_hash` via **passlib** (`bcrypt`). Auth is a **JWT bearer token** (access + refresh) sent in the `Authorization` header; a httpOnly cookie is a possible later upgrade. Auth stays **server-side**.

---

## 5. Routes & API

Decoupled **React SPA** front (Vite); **FastAPI** back. The front consumes the API and handles client-side routing.

### Front routes (React Router)
| Route | Screen | Guard (client + API) |
|---|---|---|
| `/login` | Login | public |
| `/register` | Account creation | public (fails if off-allowlist) |
| `/` | Board (Mes notes / Public via `?tab=`) | authenticated |
| `/note/:id` | Editor — modal ≥ tablet / mobile full-screen page | authenticated + note access |
| `/note/:id/history` | History (desktop panel / mobile screen) | authenticated + note access |
| `/admin` | Administration | **admin only** (the real guard is the API) |
| `/import` | Import from Google Keep (upload → review → summary, own full-page shell) | authenticated |

### FastAPI endpoints (indicative)
```
POST   /api/auth/register                 → 403 if email off-allowlist ; 201 + {access, refresh} otherwise
POST   /api/auth/login                    → {access, refresh} ; 401 credentials ; 403 if status=DISABLED
POST   /api/auth/refresh                   (refresh token → new access token) ; 401 if invalid/expired
GET    /api/auth/me                        (current user ; role to display /admin)   # logout is client-side (drop tokens)

GET    /api/notes?tab=mine|public
POST   /api/notes                          (create)
GET    /api/notes/{id}
PATCH  /api/notes/{id}                      (title, body Markdown, color, visibility)
POST   /api/notes/{id}/lock                 (acquire/renew — heartbeat ~20s) → 409 if held by another
DELETE /api/notes/{id}/lock                 (release)
GET    /api/notes/{id}/versions
POST   /api/notes/{id}/restore/{version_id} → creates a new version

# Admin (require_admin dependency)
GET    /api/admin/members                   (Users + Allowlist via LEFT JOIN)
POST   /api/admin/allowlist                 {email}
DELETE /api/admin/allowlist/{id}            (only "pending" entries)
PATCH  /api/admin/users/{id}                {role|status}   # status: ACTIVE|DISABLED, never delete
```

- FastAPI conventions: **Pydantic** schemas in/out, codes via `HTTPException` (`403`, `401`, `409`), `Depends(get_current_user)` / `Depends(require_admin)` dependencies.
- The **lock** is acquired through an atomic conditional `UPDATE` (cf. §4): if 0 rows affected → `409` and return who holds the lock.
- All sensitive checks (allowlist, admin role, lock) are **server-side**. The front only displays what the API returns.

---

## 6. Breakdown (React front + FastAPI back)

### Front (`web/`, React + Vite + TS)
```
src/
  main.tsx, App.tsx          // router, light/dark theme (data-theme), fonts
  api/client.ts              // fetch wrapper (bearer token, typed errors)
  pages/Login.tsx, Register.tsx, Board.tsx, Admin.tsx
  components/
    Topbar.tsx               // logo, search, pill tabs, theme, avatar+menu
    TabSwitch.tsx            // Mes notes / Public (segmented pill)
    Composer.tsx             // quick input + colors + public toggle
    NoteCard.tsx             // board card (color, checklist, lock badge, author)
    NoteGrid.tsx             // responsive masonry (flex columns, round-robin → reading order)
    editor/
      NoteEditor.tsx         // shell (desktop modal / mobile full screen)
      LockBanner.tsx         // 4 states (yours / locked / expired / conflict)
      SaveStatus.tsx         // Modifié / Enregistrement… / Enregistré
      BlockList.tsx          // paragraphs + boxes ; "Insérer une case" at the bottom
      ColorPicker.tsx        // 5 shades
      VisibilityToggle.tsx   // private/public + public→private confirmation
    history/
      HistoryPanel.tsx       // desktop : list + preview
      VersionRow.tsx, VersionPreview.tsx, RestoreConfirm.tsx
    admin/
      AccessManager.tsx, MemberRow.tsx, PendingRow.tsx
  lib/
    markdown.ts              // serialize/parse blocks ↔ Markdown (see buildMd)
  hooks/
    useAutosave.ts           // debounce 1.5 s + flush on blur
    useNoteLock.ts           // heartbeat 20 s, lock states
    useTheme.ts
```

### Back (`api/`, FastAPI + SQLModel)
```
app/
  main.py                    // FastAPI(), router mounting, CORS
  db.py                      // engine, get_session
  models.py                  // SQLModel (cf. §4)
  schemas.py                 // Pydantic in/out
  security.py                // passlib hash, JWT, get_current_user, require_admin
  routers/
    auth.py                  // register (check allowlist), login, refresh, me
    notes.py                 // CRUD + lock/unlock + versions + restore
    admin.py                 // members, allowlist, users (role/status)
  services/
    locks.py                 // acquire/renew/release, expiration, conflict detection
    markdown.py              // (optional) Markdown validation/normalization
migrations/                  // Alembic
```

Key front hooks: `useAutosave(noteId)` (debounce 1.5 s + flush on blur), `useNoteLock(noteId)` (heartbeat 20 s, states), `useTheme()`. Markdown rendering can stay on the front (boxes remain editable); `lib/markdown.ts` mirrors the mockups' `buildMd`.

---

## 7. States & messages (frozen French copy)

**Lock**
- Yours: « Tu modifies cette note »
- Locked: « 🔒 Bob est en cours d'édition — lecture seule » / subtext « Édition indisponible tant que Bob modifie la note. L'affichage se met à jour en temps réel. »
- Expired: « Bob a fini de modifier — note disponible » + button « Modifier la note »
- Conflict: « Léa modifie cette note » + « Léa a commencé à modifier cette note pendant ton absence. Tes dernières modifications n'ont pas pu être enregistrées. » + button « Passer en lecture seule »

**Save**: « Modifié » · « Enregistrement… » · « Enregistré · à l'instant » · subtitle « Dernière version enregistrée par X · <date> »

**History**: « actuelle » badge · lines « Modifié par X » / « Créée par X » · button « Restaurer cette version » · mobile preview « Aperçu — lecture seule · Version de X · <date> » · confirmation « La version actuelle sera conservée dans l'historique — rien n'est perdu. »

**Visibility**: public→private confirmation « Cette note ne sera plus visible par les autres. »

**Auth**: « Se connecter » · « Créer mon compte » · login error « E-mail ou mot de passe incorrect. » · disabled « Ton accès a été suspendu. Contacte l'administrateur. » · allowlist denial « Accès non autorisé » + « L'adresse <email> ne figure pas sur la liste des membres autorisés de cette instance Keepou. » + button « Retour à la connexion ».

**Admin**: tabs « Membres » / « Invités en attente » · « Ajouter à la liste » · statuses « Actif » / « Désactivé » / « En attente » · menu « Promouvoir admin » / « Désactiver le compte ».

**Import** (Google Keep, E10 — validated in `Keepou - Import Keep.dc.html`):
- Menu entry: « Importer depuis Google Keep »
- Upload: « Récupère d'abord tes notes auprès de Google, puis dépose l'archive ici — tu choisiras ensuite note par note ce qui entre dans Keepou. » · steps « Ouvre Google Takeout, ne coche que Keep, et crée l'export (format .zip). » / « Télécharge l'archive takeout-….zip reçue par e-mail — sans la décompresser. » / « Dépose-la ci-dessous puis Continuer. » · « Dépose ton export ici, ou parcourir… » · « Archive .zip · 20 Mo maximum » · buttons « Continuer » / « Annuler » · loading « Analyse de l'archive… »
- Review: « N notes trouvées dans ton export » · « N fichier(s) illisible(s) sera/seront ignoré(s) » · « Les notes importées seront privées — tu pourras les rendre publiques ensuite. » · « Tout cocher » / « Tout décocher » · chip « Corbeille » · counter « N sélectionnées sur M » · primary « Importer les N notes » (singular « Importer la note »)
- Summary: « N notes importées » · « N doublons ignorés » · « N fichier(s) illisible(s) » · « Tes notes Keep gardent leur date d'origine et restent privées. » · button « Voir mes notes »
- Server errors (API detail, displayed as-is): « Le fichier n'est pas une archive ZIP valide. » · « Archive trop volumineuse (20 Mo maximum). » · « Aucune note Google Keep trouvée dans l'archive. »

**Field-feedback follow-up (E11):**
- Board controls: search reset button label « Effacer la recherche » · sort selector (label « Trier les notes ») « Date de modification » / « Date de création » / « Titre (A→Z) » · density selector (label « Densité d’affichage ») « Notes entières » / « Aperçu » (« Notes entières » default; « Aperçu » caps the card body so more notes fit). (Separating own private vs. public notes is handled by the top-right « Mes notes » / « Public » tab, so there is no separate visibility filter.)
- Hard delete: card / editor menu item « Supprimer définitivement » · confirmation « Supprimer définitivement ? » + « Cette note et son historique seront supprimés. Cette action est irréversible. » + button « Supprimer ».
- Archive multi-select: per-card « Sélectionner <titre> » · « Tout sélectionner » / « Tout désélectionner » · « Supprimer définitivement (N) » · bulk confirmation « Supprimer N notes ? » + « Les notes sélectionnées et leur historique seront supprimés. Cette action est irréversible. ».
- Editor owner menu (label « Actions sur la note »): « Épingler » / « Ne plus épingler » · « Archiver » · « Supprimer définitivement ». Shortcut: `Maj+Entrée` saves and closes the note.
- Editor checklist: « Supprimer les cases cochées » — bottom action next to « Insérer une case à cocher », shown only when at least one box is checked; clears every ticked box in one click (no confirmation, recoverable via history).
- Editor top bar: « Copier la note » — a discreet icon button that copies the whole note (title + text) to the clipboard in one click, available in read-only too; transient confirmation « Note copiée » (green checkmark, ~2 s).
- Profile: avatar-menu entry « Modifier mon nom » · dialog title « Modifier mon nom affiché » · field label « Nom affiché » · button « Enregistrer » · empty error « Choisis un nom affiché. » · failure « La modification a échoué. Réessaie dans un instant. ».

**Internationalization (E12):**
- Language switcher (account menu, under « Modifier mon nom »): label « Langue » ·
  the two options are endonyms shown the same in both locales — « Français » /
  « English ». The English strings are the mirror of this §7 copy, in
  `web/src/i18n/en.ts`.

**Agent access / MCP (E13):**
- **Admin-only, under /admin** (not the avatar menu): section title « Accès agent
  (MCP) » with intro (« … L'agent agit sous l'identité "Botou" et n'accède qu'aux
  notes publiques… ») and a « Gérer les jetons » button opening the dialog.
- Dialog title « Accès agent (MCP) » · « Adresse du serveur MCP » (+ « Copier
  l'adresse ») · « Nom du jeton » · « Générer un jeton » · created-once panel
  « Copie ton jeton maintenant » + warning + « Copier le jeton » / « J'ai copié le
  jeton » · list « Jetons actifs » · « Révoquer » (confirmation « Révoquer ce
  jeton ? »).
- The agent has its **own identity, « Botou »**, and is **public-only**: notes it
  creates are public and authored « par Botou ». MCP **tool** text (the
  agent-facing API, not product UI) is in **English**. Key creation + expected
  auth are documented in the [README](../README.md#agent-access-mcp).

---

## 8. Accessibility, responsive, PWA
- **Responsive**: board 4 col → 2 col; editor modal → full screen; history panel → 2-screen flow. Breakpoint ~640px.
- **Theme**: `data-theme="light|dark"` on the root, CSS variables from §1. Respect `prefers-color-scheme` on first load, persistent manual override (localStorage).
- **A11y**: checkboxes = real `<input type=checkbox>` + label; fields with labels; lock banners as `role="status"` (aria-live polite); text/ink contrasts OK on light cards.
- **PWA**: manifest (icon = mascot), responsive, offline-first not required for MVP but avoid blocking assumptions.
- **i18n** (E12): the app is now **bilingual (French + English)**. French stays the
  **reference locale** — the frozen copy below (§7) is the FR source of truth, and
  `web/src/i18n/en.ts` is its faithful English mirror (typed so the two can't drift
  out of shape). The member picks their language from the account menu (under
  « Modifier mon nom »); the choice is stored server-side (`User.language`) and
  follows them across devices. See `docs/ARCHITECTURE.md` §13.

---

### Opening the mockups
Open the `Keepou - *.dc.html` files in a browser to see all states in interaction (tabs, theme, box toggling, version selection, email addition). The `Keepou - Éditeur & verrou.dc.html` canvas shows the 4 lock states side by side; `Keepou - Éditeur canonique.dc.html` shows the generated Markdown live.
