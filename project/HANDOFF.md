# Keepou — Handoff design → développement

Document de référence pour reprendre **à l'identique** les maquettes validées. Les fichiers `Keepou - *.dc.html` à la racine sont la source de vérité visuelle ; ce document en extrait les tokens, les états et les comportements, et propose le mapping vers Next.js + Prisma.

Sommaire :
1. Design system (tokens exacts)
2. Inventaire des écrans (maquettes ↔ exigences PRD)
3. Spécifications de comportement
4. Modèle de données (SQLModel)
5. Routes & API
6. Découpage front React + back FastAPI
7. États & messages (copy FR)
8. Accessibilité, responsive, PWA

---

## 1. Design system — tokens exacts

Palette extraite du logo (burrito-mascotte). **Réutiliser ces valeurs telles quelles.**

### Couleurs de marque
| Rôle | Hex | Usage |
|---|---|---|
| Or (tortilla) | `#EAB64C` | Accent primaire, dégradé bouton `linear-gradient(150deg,#EAB64C,#D89030)` |
| Or foncé | `#D89030` | Fin du dégradé primaire |
| Salsa / terracotta | `#C75D43` | Verrou « édité par un autre », erreurs, avatar |
| Terracotta foncé | `#C04A30` | (refus) `linear-gradient(150deg,#D86A50,#C04A30)` |
| Avocat | `#9DB84E` | États « à toi », public (clair) |
| Vert profond | `#3A5132` | Boutons secondaires, cases cochées, statut actif, admin |
| Teal | `#5FA39A` | Avatar / accent tertiaire |
| Encre chaude | `#2E2A20` | Texte principal, bezel mobile |
| Crème | `#FBF5E9` / fond board `#FBF4E6` | Fonds clairs |

### Surfaces & texte (clair)
```
--bg:#FBF4E6;  --surface:#ffffff;  --border:#EBDFC6;  --track:#EFE4CE;
--ink:#2E2A20; --ink-soft:#6A6354; --ink-mute:#A1977F;
```

### Surfaces & texte (sombre)
```
--bg:#211D16;  --surface:#2C2719;  --border:#43391F;
--ink:#F3ECDD; --ink-soft:#C9BFA3; --ink-mute:#8E8161;
```

### Couleurs de cartes (5 teintes, dégradé + bordure)
| Nom | Clair (bg / border) | Sombre (bg / border) |
|---|---|---|
| gold | `linear-gradient(160deg,#FCEFCF,#F7E2AE)` / `#EFD79E` | `linear-gradient(160deg,#3A3320,#2E2A18)` / `#4A4026` |
| avocat | `linear-gradient(160deg,#EEF3D2,#DFEAAE)` / `#D4E0A2` | `linear-gradient(160deg,#2F3A22,#26301B)` / `#3F4A2A` |
| salsa | `linear-gradient(160deg,#FAE0D6,#F2C7B5)` / `#EDC0AC` | `linear-gradient(160deg,#3A2A22,#2E211B)` / `#4A3328` |
| clay | `linear-gradient(160deg,#F6E9D8,#ECD8BC)` / `#E6CDA9` | `linear-gradient(160deg,#352D1C,#2A2416)` / `#46391F` |
| teal | `linear-gradient(160deg,#DFEDE8,#C7DED5)` / `#BAD7CD` | `linear-gradient(160deg,#1F332E,#1A2A26)` / `#2C443D` |

Ces 5 teintes sont le sélecteur de couleur d'une note. Stocker un identifiant (`gold|avocat|salsa|clay|teal`), pas le hex.

### Typographie
- **Fredoka** (600/500) — marque « Keepou », titres de notes, titres d'écran, libellés de boutons.
- **Nunito Sans** (400/600/700) — corps, UI, métadonnées.
- **IBM Plex Mono** (500/600) — labels techniques, horodatages en MAJUSCULES, codes (`note.md`).
- Imports Google Fonts (poids utilisés) :
  `Fredoka:wght@400;500;600;700` · `Nunito+Sans:opsz,wght@6..12,400;6..12,600;6..12,700` · `IBM+Plex+Mono:wght@400;500;600`

### Échelle & formes
- Rayons : cartes `18px`, panneaux/cartes UI `14–16px`, modale `20px`, champs `10px`, pilules/boutons `999px`, cases à cocher `5px` (desktop) / `6px` (mobile, `22px`).
- Ombres : carte board `0 8px 16px -13px rgba(46,42,32,.4)` ; modale `0 40px 80px -30px rgba(46,42,32,.6)` ; cadre `0 30px 60px -40px rgba(46,42,32,.5)`.
- Topbar : `backdrop-filter:blur(8px)`, fond `rgba(251,244,230,.86)`, bordure bas `--border`.
- Board : masonry `column-count:4` (desktop) / `2` (mobile), `column-gap:16–18px`, cartes `break-inside:avoid`.
- Hit targets mobile ≥ 44px.

---

## 2. Inventaire des écrans ↔ exigences PRD

| Maquette | Écran | Couvre (FR du PRD) |
|---|---|---|
| `Keepou - Board.dc.html` | Board principal (canonique, clair+sombre, onglets, composer) | Liste notes, onglets **Mes notes / Public**, recherche, composer rapide, sélecteur couleur, bascule privé/public, thème |
| `Keepou - Éditeur & verrou.dc.html` | Exploration des 2 formats + **4 états de verrou** | Verrou mono-éditeur (à toi / verrouillé / expiré / conflit), lecture seule, reprise |
| `Keepou - Éditeur canonique.dc.html` | **Éditeur retenu** : modale desktop / plein écran mobile, texte + cases, panneau Markdown | Édition texte + checklist, insertion de cases, sélecteur couleur, privé/public, autosave, **stockage Markdown** |
| `Keepou - Historique.dc.html` | Panneau d'historique + aperçu lecture seule + restaurer (desktop & flow mobile 2 écrans) | Historique des versions, auteur + date, aperçu, restauration |
| `Keepou - Auth.dc.html` | Connexion, création de compte, **refus allowlist**, variantes inline | Login, register conditionné à l'allowlist, messages d'erreur, compte désactivé |
| `Keepou - Admin.dc.html` | Gestion des accès : allowlist, **Membres / En attente**, statuts, menu membre, point d'entrée | Allowlist, membres inscrits vs invités en attente, rôles, activation/désactivation |
| `Board - 3 directions.dc.html` | Archive des 3 directions explorées (A retenue) | — (référence historique) |

**Décisions de format figées :** éditeur en **modale** ≥ tablette, **plein écran** sous ~640px. Historique en **panneau latéral** desktop, **flow 2 écrans** (liste → aperçu) mobile.

---

## 3. Spécifications de comportement

### 3.1 Verrou mono-éditeur
Modèle volontairement simple (pas de CRDT/OT). Une note a au plus un verrou actif.

1. **Acquisition** — à l'ouverture en édition, le client tente d'acquérir le verrou (`note.lockedById = me`, `lockedAt = now`, `lockExpiresAt = now + 60s`). Si déjà verrouillé par un autre → ouverture en **lecture seule**.
2. **Heartbeat** — toutes les **~20 s** tant que l'éditeur est actif, prolonge `lockExpiresAt`. Au blur prolongé / fermeture, relâche le verrou.
3. **Lecture seule (autre éditeur)** — bandeau terracotta « 🔒 Bob est en cours d'édition — lecture seule ». Champs désactivés. L'affichage se met à jour en temps réel (poll ou SSE).
4. **Expiration** — sans heartbeat au-delà de `lockExpiresAt` (~60 s), le verrou est considéré libre. Bandeau or « Bob a fini de modifier — note disponible » + bouton **Modifier la note** (reprise).
5. **Conflit** — si deux personnes reprennent quasi simultanément, le **serveur tranche** (transaction atomique sur le verrou). Le perdant voit « Léa modifie cette note » et un bouton **Passer en lecture seule**. Pas de notion de brouillon persistant (hors scope MVP) : on informe simplement que les dernières modifs n'ont pas pu être enregistrées.

**Couleurs de bandeau :** vert avocat = à toi · terracotta = verrouillé par un autre · or = expiré/reprise · sable `#F1EADB` = conflit.

### 3.2 Sauvegarde
- Deux informations **distinctes**, jamais en conflit :
  - **État de session** (en-tête) : `Modifié` (point or `#EAB64C`) → `Enregistrement…` (point `#9DAE6C`) → `Enregistré · à l'instant` (point/coche `#3A5132`).
  - **Dernière version enregistrée** (sous-titre) : auteur + horodatage de la dernière version **persistée** ; ne change qu'après sauvegarde réussie.
- **Debounce ~1,5 s** après la dernière frappe ; sauvegarde **immédiate** au blur / à la fermeture.
- Le heartbeat du verrou est **indépendant** de la sauvegarde du contenu.

### 3.3 Contenu & Markdown
- Le corps mélange **paragraphes** et **cases à cocher** dans un flux ordonné.
- Affordance **« Insérer une case à cocher »** en **bas** de la zone de texte (pas au milieu).
- Persistance **Markdown (GFM)** dès le MVP :
  - paragraphe → texte ;
  - case → `- [ ] libellé` (non cochée) / `- [x] libellé` (cochée).
  - Le **titre** est stocké à part (champ dédié), pas dans le Markdown.
- Sérialisation de référence (voir `Keepou - Éditeur canonique.dc.html`, méthode `buildMd`) : ligne vide entre un paragraphe et un groupe de cases ; pas plus d'une ligne vide consécutive.
- Rendu riche (gras, listes imbriquées) possible plus tard **sans migration** puisque déjà en Markdown.

### 3.4 Versionnage & historique
- **Une version = une session d'édition**, créée au relâchement du verrou (pas par frappe ni par case cochée).
- Une version stocke : auteur, timestamp, snapshot du corps (Markdown) + titre + couleur + visibilité.
- L'historique liste **qui** et **quand** (pas de résumé des changements, pas de diff visuel).
- Sélectionner une version la **réaffiche telle quelle** (lecture seule). Un seul bouton : **Restaurer**.
- **Restaurer** crée une **nouvelle version** dont le contenu = celui de la version choisie. Rien n'est écrasé.
- Mobile : liste (chevrons) → écran d'**aperçu lecture seule** (bandeau or « Aperçu — lecture seule · version de X ») → barre **Fermer / Restaurer cette version**.

### 3.5 Visibilité privé/public
- Interrupteur **réversible** dans l'éditeur.
- Public → visible par tous les membres sur l'onglet **Public**, avec auteur + date de dernière modif.
- Repasser **public → privé** : **confirmation** « Cette note ne sera plus visible par les autres » ; elle disparaît alors du board public des autres.

### 3.6 Allowlist & comptes
- **Register** : le serveur vérifie que l'e-mail est dans l'allowlist **avant** de créer le compte. Sinon → écran **Accès non autorisé** (pas de création, pas de contact in-app, bouton **Retour à la connexion**).
- **Login** : messages inline — identifiants erronés (terracotta), **compte désactivé** (or, « accès suspendu »).
- Pas de « demande d'accès » : l'utilisateur **crée un compte** ; il passe ou échoue selon l'allowlist.

### 3.7 Admin
- Onglets **Membres** (inscrits) / **Invités en attente** (e-mail autorisé, compte pas encore créé), avec compteurs.
- **Ajouter un e-mail** à l'allowlist (champ + bouton) → apparaît en *En attente*.
- Statuts membre : **Actif** (vert) / **Désactivé** (or). En attente = autorisé sans compte.
- Menu membre (⋯) : **Promouvoir admin**, **Désactiver le compte**. **Pas de suppression de compte.** (Retirer un e-mail *en attente* de l'allowlist reste possible.)
- **Désactiver** ≠ supprimer : bloque la connexion, conserve compte + notes, réversible.
- Entrée **Administration** visible **uniquement pour les admins** (menu avatar). Route `/admin` protégée serveur.

---

## 4. Modèle de données (SQLModel proposé)

Déduit des écrans. **SQLModel** (SQLAlchemy + Pydantic), migrations **Alembic**. À ajuster selon le SGBD (PostgreSQL recommandé).

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
    DISABLED = "DISABLED"          # jamais de suppression

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
    # "en attente" = AllowlistEntry dont l'email n'a pas de User (join sur email)

class Note(SQLModel, table=True):
    id: str = Field(default_factory=_id, primary_key=True)
    title: str
    body: str                                  # Markdown (GFM task lists)
    color: NoteColor = NoteColor.GOLD
    visibility: Visibility = Visibility.PRIVATE
    owner_id: str = Field(foreign_key="user.id", index=True)

    # verrou mono-éditeur (porté par la note)
    locked_by_id: str | None = Field(default=None, foreign_key="user.id")
    locked_at: datetime | None = None
    lock_expires_at: datetime | None = None

    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)  # = "dernière version enregistrée"
    versions: list["NoteVersion"] = Relationship(back_populates="note")

class NoteVersion(SQLModel, table=True):
    id: str = Field(default_factory=_id, primary_key=True)
    note_id: str = Field(foreign_key="note.id", index=True)
    author_id: str = Field(foreign_key="user.id")
    title: str
    body: str                                  # snapshot Markdown
    color: NoteColor
    visibility: Visibility
    created_at: datetime = Field(default_factory=datetime.utcnow)  # horodatage affiché dans l'historique
    note: Note = Relationship(back_populates="versions")
    # index composite (note_id, created_at) à créer via Alembic
```

Notes :
- **Verrou** porté par la `Note` (1 verrou max) → simplicité, atomicité via `UPDATE ... WHERE locked_by_id IS NULL OR lock_expires_at < :now` (update conditionnel, retour du nombre de lignes affectées pour détecter le conflit).
- **En attente** = `AllowlistEntry` dont l'`email` n'a pas de `User`. Côté admin, fais un `LEFT JOIN User ON User.email = AllowlistEntry.email`.
- `Note.updated_at` alimente « Dernière version enregistrée » ; `NoteVersion.created_at` la liste d'historique.
- `password_hash` via **passlib** (`bcrypt`). Sessions par cookie signé (ex. `itsdangerous`) ou JWT httpOnly — au choix, mais l'auth reste **serveur**.

---

## 5. Routes & API

Front **React SPA** (Vite) découplé ; back **FastAPI**. Le front consomme l'API et gère le routage client.

### Routes front (React Router)
| Route | Écran | Garde (client + API) |
|---|---|---|
| `/login` | Connexion | public |
| `/register` | Création de compte | public (échoue si hors allowlist) |
| `/` | Board (Mes notes / Public via `?tab=`) | authentifié |
| `/note/:id` | Éditeur — modale ≥ tablette / page plein écran mobile | authentifié + accès note |
| `/note/:id/history` | Historique (panneau desktop / écran mobile) | authentifié + accès note |
| `/admin` | Administration | **admin only** (la garde réelle est l'API) |

### Endpoints FastAPI (indicatifs)
```
POST   /api/auth/register                 → 403 si email hors allowlist ; 201 sinon
POST   /api/auth/login                    → 401 identifiants ; 403 si status=DISABLED
POST   /api/auth/logout
GET    /api/auth/me                        (session courante ; role pour afficher /admin)

GET    /api/notes?tab=mine|public
POST   /api/notes                          (create)
GET    /api/notes/{id}
PATCH  /api/notes/{id}                      (title, body Markdown, color, visibility)
POST   /api/notes/{id}/lock                 (acquire/renew — heartbeat ~20s) → 409 si tenu par autre
DELETE /api/notes/{id}/lock                 (release)
GET    /api/notes/{id}/versions
POST   /api/notes/{id}/restore/{version_id} → crée une nouvelle version

# Admin (dépendance require_admin)
GET    /api/admin/members                   (Users + Allowlist en LEFT JOIN)
POST   /api/admin/allowlist                 {email}
DELETE /api/admin/allowlist/{id}            (uniquement entrées "en attente")
PATCH  /api/admin/users/{id}                {role|status}   # status: ACTIVE|DISABLED, jamais delete
```

- Conventions FastAPI : schémas **Pydantic** en entrée/sortie, codes via `HTTPException` (`403`, `401`, `409`), dépendances `Depends(get_current_user)` / `Depends(require_admin)`.
- Le **verrou** s'acquiert par un `UPDATE` conditionnel atomique (cf. §4) : si 0 ligne affectée → `409` et renvoyer qui tient le verrou.
- Tous les contrôles sensibles (allowlist, rôle admin, verrou) sont **serveur**. Le front n'affiche que ce que l'API renvoie.

---

## 6. Découpage (front React + back FastAPI)

### Front (`web/`, React + Vite + TS)
```
src/
  main.tsx, App.tsx          // router, thème clair/sombre (data-theme), polices
  api/client.ts              // fetch wrapper (cookies/session, erreurs typées)
  pages/Login.tsx, Register.tsx, Board.tsx, Admin.tsx
  components/
    Topbar.tsx               // logo, recherche, onglets pill, thème, avatar+menu
    TabSwitch.tsx            // Mes notes / Public (pill segmenté)
    Composer.tsx             // saisie rapide + couleurs + toggle public
    NoteCard.tsx             // carte board (couleur, checklist, lock badge, auteur)
    NoteGrid.tsx             // masonry column-count responsive
    editor/
      NoteEditor.tsx         // shell (modale desktop / plein écran mobile)
      LockBanner.tsx         // 4 états (à toi / verrouillé / expiré / conflit)
      SaveStatus.tsx         // Modifié / Enregistrement… / Enregistré
      BlockList.tsx          // paragraphes + cases ; "Insérer une case" en bas
      ColorPicker.tsx        // 5 teintes
      VisibilityToggle.tsx   // privé/public + confirmation public→privé
    history/
      HistoryPanel.tsx       // desktop : liste + aperçu
      VersionRow.tsx, VersionPreview.tsx, RestoreConfirm.tsx
    admin/
      AccessManager.tsx, MemberRow.tsx, PendingRow.tsx
  lib/
    markdown.ts              // serialize/parse blocks ↔ Markdown (voir buildMd)
  hooks/
    useAutosave.ts           // debounce 1,5 s + flush au blur
    useNoteLock.ts           // heartbeat 20 s, états du verrou
    useTheme.ts
```

### Back (`api/`, FastAPI + SQLModel)
```
app/
  main.py                    // FastAPI(), montage routers, CORS, middleware session
  db.py                      // engine, get_session
  models.py                  // SQLModel (cf. §4)
  schemas.py                 // Pydantic in/out
  security.py                // hash passlib, session, get_current_user, require_admin
  routers/
    auth.py                  // register (check allowlist), login, logout, me
    notes.py                 // CRUD + lock/unlock + versions + restore
    admin.py                 // members, allowlist, users (role/status)
  services/
    locks.py                 // acquire/renew/release, expiration, détection conflit
    markdown.py              // (optionnel) validation/normalisation du Markdown
migrations/                  // Alembic
```

Hooks front clés : `useAutosave(noteId)` (debounce 1,5 s + flush au blur), `useNoteLock(noteId)` (heartbeat 20 s, états), `useTheme()`. Le rendu du Markdown peut rester côté front (les cases restent éditables) ; `lib/markdown.ts` est le miroir de `buildMd` des maquettes.

---

## 7. États & messages (copy FR figée)

**Verrou**
- À toi : « Tu modifies cette note »
- Verrouillé : « 🔒 Bob est en cours d'édition — lecture seule » / sous-texte « Édition indisponible tant que Bob modifie la note. L'affichage se met à jour en temps réel. »
- Expiré : « Bob a fini de modifier — note disponible » + bouton « Modifier la note »
- Conflit : « Léa modifie cette note » + « Léa a commencé à modifier cette note pendant ton absence. Tes dernières modifications n'ont pas pu être enregistrées. » + bouton « Passer en lecture seule »

**Sauvegarde** : « Modifié » · « Enregistrement… » · « Enregistré · à l'instant » · sous-titre « Dernière version enregistrée par X · <date> »

**Historique** : badge « actuelle » · lignes « Modifié par X » / « Créée par X » · bouton « Restaurer cette version » · aperçu mobile « Aperçu — lecture seule · Version de X · <date> » · confirmation « La version actuelle sera conservée dans l'historique — rien n'est perdu. »

**Visibilité** : confirmation public→privé « Cette note ne sera plus visible par les autres. »

**Auth** : « Se connecter » · « Créer mon compte » · login erreur « E-mail ou mot de passe incorrect. » · désactivé « Ton accès a été suspendu. Contacte l'administrateur. » · refus allowlist « Accès non autorisé » + « L'adresse <email> ne figure pas sur la liste des membres autorisés de cette instance Keepou. » + bouton « Retour à la connexion ».

**Admin** : onglets « Membres » / « Invités en attente » · « Ajouter à la liste » · statuts « Actif » / « Désactivé » / « En attente » · menu « Promouvoir admin » / « Désactiver le compte » · note « Désactiver, jamais supprimer ».

---

## 8. Accessibilité, responsive, PWA
- **Responsive** : board 4 col → 2 col ; éditeur modale → plein écran ; historique panneau → flow 2 écrans. Point de bascule ~640px.
- **Thème** : `data-theme="light|dark"` sur la racine, variables CSS de la §1. Respecter `prefers-color-scheme` au premier chargement, override manuel persistant (localStorage).
- **A11y** : cases à cocher = vrais `<input type=checkbox>` + label ; champs avec labels ; bandeaux de verrou en `role="status"` (aria-live polite) ; contrastes texte/encre OK sur cartes claires.
- **PWA** : manifest (icône = mascotte), responsive, offline-first non requis MVP mais éviter les hypothèses bloquantes.
- **i18n** : copy actuelle en français ; centraliser les chaînes (cf. §7) pour faciliter une trad ultérieure.

---

### Ouvrir les maquettes
Ouvre les fichiers `Keepou - *.dc.html` dans un navigateur pour voir tous les états en interaction (onglets, thème, toggle des cases, sélection de version, ajout d'e-mail). Le canvas `Keepou - Éditeur & verrou.dc.html` montre les 4 états de verrou côte à côte ; `Keepou - Éditeur canonique.dc.html` montre le Markdown généré en direct.
