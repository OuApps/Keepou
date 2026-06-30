# Keepou — Découpage en EPICS (macro)

> **But de ce document.** Proposer un découpage **macro** du développement de Keepou en
> epics, à partir des maquettes validées et du handoff (`design/HANDOFF.md`,
> `design/claude.md`). On reste au niveau **epic** ; les **stories détaillées** sont
> écrites epic par epic dans le dossier [`stories/`](./stories/) au moment de les attaquer.
>
> Source de vérité visuelle : les fichiers `design/Keepou - *.dc.html`.
> Règles produit non négociables : `design/claude.md`.

**État du détail :**
- ✅ **E0** détaillée → [`stories/E0-fondations.md`](./stories/E0-fondations.md)
- ✅ **E1** détaillée → [`stories/E1-deploiement-railway.md`](./stories/E1-deploiement-railway.md)
- ⏳ E2 → E8 : détaillées plus tard, epic par epic.

---

## Vue d'ensemble & séquencement

| # | Epic | Cœur | Dépend de |
|---|------|------|-----------|
| **E0** | Fondations & design system | Monorepo, tooling, tokens, thème, layout responsive | — |
| **E1** | Déploiement Railway (CD-first) | Projet Railway, Postgres, services API + front, migrations au deploy, CI/CD | E0 |
| **E2** | Authentification & allowlist | Comptes, sessions, allowlist serveur, refus | E0 |
| **E3** | Board & gestion des notes | CRUD notes, onglets Mes notes/Public, composer, cartes | E0, E2 |
| **E4** | Éditeur de note | Texte + cases, Markdown GFM, autosave, couleur, visibilité | E3 |
| **E5** | Verrou mono-éditeur & temps réel | Acquisition atomique, heartbeat, expiration, conflit, lecture seule | E4 |
| **E6** | Historique & versions | Versionnage (1 session = 1 version), aperçu, restauration | E4, E5 |
| **E7** | Administration des accès | Allowlist, membres/en attente, rôles, activation/désactivation | E2 |
| **E8** | Finitions : PWA, a11y, i18n, qualité | Manifest, accessibilité, centralisation copy, tests/CI | tous |

**Chemin critique conseillé :** `E0 → E1 → E2 → E3 → E4 → E5 → E6`. **E1 (Railway)** est placée
tôt à dessein : dès que le squelette tourne, on câble le déploiement continu pour que **chaque
epic suivante parte en prod automatiquement**. **E7** est parallélisable dès la fin de E2.
**E8** est transverse, durci en fin de parcours. E5 et E6 sont fortement couplés (une version
naît au relâchement du verrou) : les enchaîner.

```
E0 ──▶ E1 (deploy continu) ──▶ E2 ──▶ E3 ──▶ E4 ──▶ E5 ──▶ E6
                               └────────────▶ E7   (en parallèle dès la fin de E2)
E8 : transversal, durci en fin de parcours
```

---

## E0 — Fondations & design system

**Objectif.** Poser un monorepo qui démarre (front + back), le tooling, et **traduire les
tokens des maquettes en design system réutilisable** pour que tous les écrans suivants
soient « pixel-fidèles » sans réinventer la palette.

**Périmètre — Back (`api/`)**
- App FastAPI bootable, CORS, route `/api/health`.
- Connexion DB + `get_session`, configuration via env, squelette Alembic.
- Conventions : schémas Pydantic in/out, gestion d'erreurs `HTTPException`.

**Périmètre — Front (`web/`)**
- App React + Vite + TS bootable, React Router, wrapper `api/client.ts` (cookies/session, erreurs typées).
- **Design tokens** (CSS variables clair + sombre) repris **exactement** du handoff §1.
- **Polices** : Fredoka (marque/titres), Nunito Sans (UI/texte), IBM Plex Mono (labels/horodatages).
- **Thème** : `data-theme="light|dark"`, respect `prefers-color-scheme` + override persistant (localStorage).
- **Layout/responsive** : conteneurs, topbar (blur), point de bascule ~640px.

**Maquettes.** Toutes (référence transverse) — surtout `Keepou - Board.dc.html`.

**Règles liées.** Fidélité visuelle (`claude.md`). Pas de dépendance UI lourde.

**Fait quand.** Les deux apps démarrent, le front affiche une page de référence aux bons
tokens/polices, bascule clair/sombre OK, CI lint/build verte.

➡️ **Stories détaillées : [`stories/E0-fondations.md`](./stories/E0-fondations.md)**

---

## E1 — Déploiement Railway (CD-first)

**Objectif.** Mettre Keepou **en ligne sur Railway dès les fondations**, avec une base
**PostgreSQL** managée, les **migrations jouées au déploiement**, et un **déploiement
continu** sur push — pour que chaque epic suivante arrive en prod sans effort manuel.

**Périmètre — Infra / Railway**
- Projet Railway + **PostgreSQL** managé (`DATABASE_URL`).
- Service **API** (FastAPI) : build Nixpacks/Dockerfile, `uvicorn` sur `$PORT`, healthcheck `/api/health`, root dir `api/`.
- Service **Front** (Vite) : build statique servi, `VITE_API_URL` → URL publique de l'API.
- **Migrations Alembic** jouées automatiquement au déploiement (pre-deploy command).
- **CD** : déploiement auto sur push (intégration GitHub), preview par PR.
- **Sécurité prod** : CORS d'origine front, cookies `secure`/`SameSite`, HTTPS.

**Périmètre — Code**
- Driver **PostgreSQL** (psycopg) ajouté ; normalisation du schéma d'URL Railway.
- Fichiers de config déploiement (`railway.json`/`nixpacks`, commandes de build/start).
- Variables d'environnement documentées (back + front).

**Maquettes.** — (epic infra, pas d'écran).

**Règles liées.** Auth serveur (cookies sécurisés en prod) · allowlist/verrou serveur restent la référence.

**Fait quand.** API + front accessibles via URLs Railway, Postgres connecté, migrations
auto au deploy, push sur la branche → déploiement, checklist sécurité prod cochée.

➡️ **Stories détaillées : [`stories/E1-deploiement-railway.md`](./stories/E1-deploiement-railway.md)**

---

## E2 — Authentification & allowlist

**Objectif.** Permettre de **créer un compte (conditionné à l'allowlist)** et de **se
connecter**, avec tous les états d'erreur des maquettes. L'allowlist est vérifiée **côté serveur**.

**Périmètre — Back**
- Modèle `User` (email, display_name, password_hash, role, status) + `AllowlistEntry`.
- `POST /api/auth/register` → **403** si e-mail hors allowlist, **201** sinon (hash passlib/bcrypt).
- `POST /api/auth/login` → **401** identifiants, **403** si `status=DISABLED`.
- `POST /api/auth/logout`, `GET /api/auth/me` (session courante + rôle).
- Sessions par cookie signé (ou JWT httpOnly), dépendance `get_current_user`.

**Périmètre — Front**
- Écrans **Connexion** et **Création de compte**.
- Messages inline : identifiants erronés (terracotta), **compte désactivé** (or).
- Écran **Accès non autorisé** (refus allowlist) → bouton **Retour à la connexion**.
- Garde de routes côté client (redirection si non authentifié).

**Maquettes.** `Keepou - Auth.dc.html`.

**Règles liées (claude.md).** §4 allowlist serveur · §5 désactivation ≠ suppression. Pas de « demande d'accès » ni contact admin in-app.

**Copy figée.** HANDOFF §7 « Auth ».

**Fait quand.** Inscription bloquée hors allowlist, login OK/KO et compte désactivé gérés, session établie, `/api/auth/me` exploité par le front.

---

## E3 — Board & gestion des notes

**Objectif.** Le board principal : lister, créer, et naviguer ses notes ; basculer **Mes
notes / Public** ; composer rapide ; cartes fidèles (couleur, checklist, méta).

**Périmètre — Back**
- Modèle `Note` (title, body Markdown, color, visibility, owner, timestamps).
- `GET /api/notes?tab=mine|public`, `POST /api/notes` (create), `GET /api/notes/{id}`.
- `PATCH /api/notes/{id}` (base ; l'édition fine arrive en E4).
- Onglet **Public** = notes `PUBLIC` de tous les membres (auteur + date de dernière modif).

**Périmètre — Front**
- **Topbar** (logo, recherche, onglets pill, thème, avatar + menu).
- **TabSwitch** Mes notes / Public · **Composer** (saisie rapide + couleur + toggle public).
- **NoteCard** (5 teintes, titre Fredoka, checklist en lecture, badge visibilité/auteur).
- **NoteGrid** masonry `column-count` 4→2 responsive · recherche (filtre client a minima).

**Maquettes.** `Keepou - Board.dc.html`.

**Règles liées.** §7 visibilité réversible (toggle ; confirmation public→privé en E4). Couleur stockée comme identifiant (`gold|avocat|salsa|clay|teal`).

**Fait quand.** On voit/crée des notes, onglets fonctionnels, board fidèle clair + sombre, desktop + mobile.

---

## E4 — Éditeur de note (texte + cases + Markdown + autosave)

**Objectif.** L'éditeur canonique : **modale ≥ tablette / plein écran < ~640px**, mélange
paragraphes + cases à cocher, **persistance Markdown GFM**, **autosave**, sélecteur de
couleur, bascule privé/public avec confirmation.

**Périmètre — Back**
- Persistance du corps en **Markdown** (titre stocké à part).
- `PATCH /api/notes/{id}` consolidé (title, body, color, visibility) + `updated_at`.
- Confirmation public→privé (la note disparaît du board public des autres).

**Périmètre — Front**
- **NoteEditor** (shell modale desktop / plein écran mobile) · **BlockList** (paragraphes + cases ; **« Insérer une case » en bas**).
- **ColorPicker** (5 teintes) · **VisibilityToggle** (+ confirmation public→privé).
- **SaveStatus** : `Modifié` → `Enregistrement…` → `Enregistré · à l'instant`, **distinct** de « Dernière version enregistrée ».
- **lib/markdown.ts** (miroir de `buildMd`) · **hook useAutosave** (debounce ~1,5 s + flush au blur).

**Maquettes.** `Keepou - Éditeur canonique.dc.html`, `Keepou - Éditeur & verrou.dc.html`.

**Règles liées (claude.md).** §2 autosave · §3 versionnage (version créée en E6 au relâchement du verrou) · §7 confirmation public→privé · Markdown GFM dès le MVP.

**Copy figée.** HANDOFF §7 « Sauvegarde » et « Visibilité ».

**Fait quand.** Édition texte + cases, insertion de case, Markdown correct, autosave 3 états, toggle visibilité + confirmation. **Sans verrou** encore (ajouté en E5).

---

## E5 — Verrou mono-éditeur & temps réel

**Objectif.** Garantir qu'**une seule personne édite une note à la fois**, avec les **4
états** des maquettes (à toi / verrouillé par un autre / expiré-reprise / conflit), en
lecture seule pour les autres, mise à jour en quasi temps réel.

**Périmètre — Back**
- Champs verrou sur `Note` (`locked_by_id`, `locked_at`, `lock_expires_at`).
- `POST /api/notes/{id}/lock` (acquérir/renouveler) → **409** si tenu par un autre + qui le tient · `DELETE /api/notes/{id}/lock`.
- **Acquisition atomique** : `UPDATE ... WHERE locked_by_id IS NULL OR lock_expires_at < now` (0 ligne → conflit).
- Service `locks.py` (acquisition / renouvellement / relâche / expiration / conflit) · diffusion d'état (poll ou SSE).

**Périmètre — Front**
- **hook useNoteLock** (heartbeat ~20 s, expiration ~60 s, états) · **LockBanner** (4 états).
- Mode **lecture seule** + bouton **Modifier la note** (reprise) / **Passer en lecture seule** (conflit).
- Ligne « Dernière édition par X » (desktop **et** mobile).

**Maquettes.** `Keepou - Éditeur & verrou.dc.html`.

**Règles liées (claude.md).** §1 verrou mono-éditeur — **jamais d'édition concurrente**, **pas de CRDT/OT**, pas de brouillon persistant.

**Copy figée.** HANDOFF §7 « Verrou ».

**Fait quand.** Les 4 états reproduits, conflit tranché serveur, lecture seule temps réel, reprise après expiration.

---

## E6 — Historique & versions

**Objectif.** Conserver l'historique (**1 session d'édition = 1 version**), permettre
d'**aperçu en lecture seule** une version et de la **restaurer** (jamais d'écrasement).

**Périmètre — Back**
- Modèle `NoteVersion` (author, timestamp, snapshot title/body/color/visibility) + index `(note_id, created_at)`.
- Création d'une version **au relâchement du verrou**.
- `GET /api/notes/{id}/versions` · `POST /api/notes/{id}/restore/{version_id}` (→ **nouvelle** version).

**Périmètre — Front**
- **HistoryPanel** desktop (liste + aperçu) · **VersionRow** · **VersionPreview** · **RestoreConfirm**.
- **Flow mobile 2 écrans** : liste (chevrons) → **aperçu lecture seule** → barre **Fermer / Restaurer**.
- Pas de diff visuel : on **réaffiche la version telle quelle**.

**Maquettes.** `Keepou - Historique.dc.html`.

**Règles liées (claude.md).** §3 versionnage · **pas de diff visuel**, un seul bouton **Restaurer**.

**Copy figée.** HANDOFF §7 « Historique ».

**Fait quand.** Liste qui/quand, aperçu lecture seule (desktop + mobile), restauration crée une nouvelle version, rien n'est écrasé.

---

## E7 — Administration des accès

**Objectif.** Donner à l'admin la gestion de l'**allowlist** et des **membres** (inscrits
vs en attente), rôles, **activation/désactivation** — **jamais de suppression**.

**Périmètre — Back**
- Dépendance `require_admin` ; route `/admin` **protégée serveur**.
- `GET /api/admin/members` (Users + Allowlist en LEFT JOIN sur email).
- `POST /api/admin/allowlist {email}` · `DELETE /api/admin/allowlist/{id}` (entrées en attente uniquement).
- `PATCH /api/admin/users/{id} {role|status}` (ACTIVE|DISABLED, **jamais delete**).

**Périmètre — Front**
- **AccessManager** (onglets Membres / Invités en attente + compteurs) · **MemberRow** · **PendingRow**.
- **Ajouter un e-mail** · menu membre **Promouvoir admin** / **Désactiver le compte**.
- **Point d'entrée** « Administration » dans le menu avatar, **admins uniquement**.

**Maquettes.** `Keepou - Admin.dc.html`.

**Règles liées (claude.md).** §5 désactivation jamais suppression · §6 `/admin` protégée serveur.

**Copy figée.** HANDOFF §7 « Admin ».

**Fait quand.** Allowlist gérable, statuts/rôles modifiables, désactivation réversible, route admin refusée serveur, entrée masquée aux non-admins.

---

## E8 — Finitions : PWA, accessibilité, i18n, qualité

**Objectif.** Durcir et finaliser : installable, accessible, chaînes centralisées, testé.

**Périmètre**
- **PWA** : manifest (icône = mascotte), favicon, responsive.
- **A11y** : vrais `<input type=checkbox>` + labels, champs labellisés, bandeaux verrou `role="status"`/aria-live, contrastes OK, hit targets mobile ≥ 44px.
- **i18n** : centraliser la copy FR (HANDOFF §7).
- **Qualité** : tests back (allowlist, verrou atomique, versionnage), tests front clés, CI lint/build/test.

**Maquettes.** Toutes (vérification d'états & responsive).

**Fait quand.** App installable, a11y vérifiée, chaînes centralisées, suite de tests verte en CI.

---

## Transversal (présent dans chaque epic)

- **Fidélité visuelle** : tokens exacts ; clair **et** sombre ; desktop **et** mobile.
- **Sécurité serveur** : allowlist, rôle admin, verrou — **toujours** côté serveur.
- **Markdown** : corps des notes en GFM dès le MVP (pas de migration future).
- **Tests** au fil de l'eau sur les règles métier critiques.

---

## Prochaine étape

E0 et E1 sont détaillées dans [`stories/`](./stories/). Après relecture/merge, on enchaîne
sur le **détail de l'E2** (ou l'epic de ton choix), avec critères d'acceptation et périmètre technique.
