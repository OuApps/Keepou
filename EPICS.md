# Keepou — Découpage en EPICS (macro)

> **But de ce document.** Proposer un découpage **macro** du développement de Keepou en
> epics, à partir des maquettes validées et du handoff (`design/HANDOFF.md`,
> `design/claude.md`). On reste volontairement au niveau **epic** : les **stories
> détaillées seront écrites epic par epic**, au moment d'attaquer chacun.
>
> Source de vérité visuelle : les fichiers `design/Keepou - *.dc.html`.
> Règles produit non négociables : `design/claude.md`.

---

## Vue d'ensemble & séquencement

| # | Epic | Cœur | Dépend de |
|---|------|------|-----------|
| **E0** | Fondations & design system | Monorepo, tooling, tokens, thème, layout responsive | — |
| **E1** | Authentification & allowlist | Comptes, sessions, allowlist serveur, refus | E0 |
| **E2** | Board & gestion des notes | CRUD notes, onglets Mes notes/Public, composer, cartes | E0, E1 |
| **E3** | Éditeur de note | Texte + cases, Markdown GFM, autosave, couleur, visibilité | E2 |
| **E4** | Verrou mono-éditeur & temps réel | Acquisition atomique, heartbeat, expiration, conflit, lecture seule | E3 |
| **E5** | Historique & versions | Versionnage (1 session = 1 version), aperçu, restauration | E3, E4 |
| **E6** | Administration des accès | Allowlist, membres/en attente, rôles, activation/désactivation | E1 |
| **E7** | Finitions : PWA, a11y, i18n, qualité | Manifest, accessibilité, centralisation copy, tests/CI | tous |

**Chemin critique conseillé :** `E0 → E1 → E2 → E3 → E4 → E5`, avec **E6** parallélisable
dès la fin de E1, et **E7** en continu (puis durcissement final). E4 et E5 sont fortement
couplés (une version naît au relâchement du verrou) : les enchaîner.

```
E0 ──▶ E1 ──┬──▶ E2 ──▶ E3 ──▶ E4 ──▶ E5
            └──────────────▶ E6   (en parallèle dès la fin de E1)
E7 : transversal, durci en fin de parcours
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
- **Design tokens** (CSS variables clair + sombre) repris **exactement** du handoff §1 :
  couleurs de marque, 5 teintes de cartes, surfaces/texte, rayons, ombres.
- **Polices** : Fredoka (marque/titres), Nunito Sans (UI/texte), IBM Plex Mono (labels/horodatages).
- **Thème** : `data-theme="light|dark"`, respect `prefers-color-scheme` + override persistant (localStorage).
- **Layout/responsive** : conteneurs, topbar (blur), point de bascule ~640px.

**Maquettes.** Toutes (référence transverse) — surtout `Keepou - Board.dc.html` pour le `:root`/`[data-theme=dark]`.

**Règles liées.** Fidélité visuelle (`claude.md` §Fidélité). Pas de dépendance UI lourde.

**Fait quand.** Les deux apps démarrent, le front affiche une page de référence aux bons
tokens/polices, bascule clair/sombre OK, CI lint/build verte.

---

## E1 — Authentification & allowlist

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

**Règles liées (claude.md).** §4 allowlist serveur · §5 désactivation ≠ suppression (le login d'un compte désactivé est refusé). Pas de « demande d'accès » ni contact admin in-app.

**Copy figée.** Voir HANDOFF §7 « Auth ».

**Fait quand.** Inscription bloquée hors allowlist, login OK/KO et compte désactivé gérés, session établie, `/api/auth/me` exploité par le front.

---

## E2 — Board & gestion des notes

**Objectif.** Le board principal : lister, créer, et naviguer ses notes ; basculer **Mes
notes / Public** ; composer rapide ; cartes fidèles (couleur, checklist, méta).

**Périmètre — Back**
- Modèle `Note` (title, body Markdown, color, visibility, owner, timestamps).
- `GET /api/notes?tab=mine|public`, `POST /api/notes` (create), `GET /api/notes/{id}`.
- `PATCH /api/notes/{id}` (title, body, color, visibility) — base, l'édition fine arrive en E3.
- Onglet **Public** = notes `PUBLIC` de tous les membres (auteur + date de dernière modif).

**Périmètre — Front**
- **Topbar** (logo, recherche, onglets pill, thème, avatar + menu).
- **TabSwitch** Mes notes / Public (segmenté).
- **Composer** : saisie rapide + sélecteur de couleur + toggle public.
- **NoteCard** (5 teintes, titre Fredoka, checklist en lecture, badge visibilité/auteur, lock badge à venir E4).
- **NoteGrid** masonry `column-count` 4→2 responsive (`break-inside:avoid`).
- Recherche (filtre client a minima).

**Maquettes.** `Keepou - Board.dc.html`.

**Règles liées.** §7 visibilité réversible (le toggle existe ; la confirmation public→privé est traitée en E3). Couleur stockée comme identifiant (`gold|avocat|salsa|clay|teal`), pas le hex.

**Fait quand.** On voit/crée des notes, onglets Mes notes/Public fonctionnels, board fidèle en clair + sombre, desktop + mobile.

---

## E3 — Éditeur de note (texte + cases + Markdown + autosave)

**Objectif.** L'éditeur canonique : **modale ≥ tablette / plein écran < ~640px**, mélange
paragraphes + cases à cocher, **persistance Markdown GFM**, **autosave**, sélecteur de
couleur, bascule privé/public avec confirmation.

**Périmètre — Back**
- Persistance du corps en **Markdown** (titre stocké à part).
- `PATCH /api/notes/{id}` consolidé (title, body, color, visibility) + `updated_at`.
- Confirmation public→privé (la note disparaît du board public des autres).

**Périmètre — Front**
- **NoteEditor** (shell modale desktop / plein écran mobile).
- **BlockList** : paragraphes + cases ; affordance **« Insérer une case à cocher » en bas**.
- **ColorPicker** (5 teintes) · **VisibilityToggle** (privé/public + **confirmation public→privé**).
- **SaveStatus** : `Modifié` → `Enregistrement…` → `Enregistré · à l'instant`, **distinct** de « Dernière version enregistrée par X · date ».
- **lib/markdown.ts** : sérialisation blocs ↔ Markdown, miroir de `buildMd` (cf. `Keepou - Éditeur canonique.dc.html`).
- **hook useAutosave** : debounce **~1,5 s** + flush au blur/fermeture.

**Maquettes.** `Keepou - Éditeur canonique.dc.html` (Markdown live) ; `Keepou - Éditeur & verrou.dc.html` (formats).

**Règles liées (claude.md).** §2 autosave & distinction des deux infos · §3 versionnage (la version est *créée* en E5 au relâchement du verrou) · §7 confirmation public→privé · Markdown GFM dès le MVP.

**Copy figée.** HANDOFF §7 « Sauvegarde » et « Visibilité ».

**Fait quand.** Édition texte + cases, insertion de case, Markdown généré correct, autosave avec les 3 états, toggle visibilité + confirmation. **Sans verrou** encore (mono-utilisateur) — ajouté en E4.

---

## E4 — Verrou mono-éditeur & temps réel

**Objectif.** Garantir qu'**une seule personne édite une note à la fois**, avec les **4
états** des maquettes (à toi / verrouillé par un autre / expiré-reprise / conflit), en
lecture seule pour les autres, mise à jour en quasi temps réel.

**Périmètre — Back**
- Champs verrou sur `Note` (`locked_by_id`, `locked_at`, `lock_expires_at`).
- `POST /api/notes/{id}/lock` (acquérir/renouveler) → **409** si tenu par un autre + qui le tient.
- `DELETE /api/notes/{id}/lock` (relâcher).
- **Acquisition atomique** : `UPDATE ... WHERE locked_by_id IS NULL OR lock_expires_at < now` (0 ligne → conflit).
- Service `locks.py` : acquisition / renouvellement / relâche / expiration / détection conflit.
- Diffusion de l'état (poll ou SSE) pour la lecture seule.

**Périmètre — Front**
- **hook useNoteLock** : **heartbeat ~20 s**, expiration ~60 s, états.
- **LockBanner** (4 états, couleurs : avocat=à toi · terracotta=verrouillé · or=expiré/reprise · sable=conflit).
- Mode **lecture seule** (champs désactivés) + bouton **Modifier la note** (reprise) · **Passer en lecture seule** (conflit).
- Ligne « Dernière édition par X » (desktop **et** mobile).

**Maquettes.** `Keepou - Éditeur & verrou.dc.html` (4 états côte à côte).

**Règles liées (claude.md).** §1 verrou mono-éditeur (heartbeat, expiration, reprise, conflit) — **jamais d'édition concurrente**, **pas de CRDT/OT**, pas de brouillon persistant.

**Copy figée.** HANDOFF §7 « Verrou ».

**Fait quand.** Les 4 états reproduits, conflit tranché côté serveur, lecture seule temps réel, reprise après expiration.

---

## E5 — Historique & versions

**Objectif.** Conserver l'historique (**1 session d'édition = 1 version**), permettre
d'**aperçu en lecture seule** une version et de la **restaurer** (jamais d'écrasement).

**Périmètre — Back**
- Modèle `NoteVersion` (author, timestamp, snapshot title/body/color/visibility) + index `(note_id, created_at)`.
- Création d'une version **au relâchement du verrou** (pas par frappe ni par case).
- `GET /api/notes/{id}/versions` · `POST /api/notes/{id}/restore/{version_id}` (→ **nouvelle** version).

**Périmètre — Front**
- **HistoryPanel** desktop (liste + aperçu) · **VersionRow** · **VersionPreview** · **RestoreConfirm**.
- **Flow mobile 2 écrans** : liste (chevrons) → **aperçu lecture seule** (bandeau or « Aperçu — lecture seule · version de X ») → barre **Fermer / Restaurer**.
- Pas de diff visuel : on **réaffiche la version telle quelle**.

**Maquettes.** `Keepou - Historique.dc.html`.

**Règles liées (claude.md).** §3 versionnage · §Ne pas faire : **pas de diff visuel**, un seul bouton **Restaurer**.

**Copy figée.** HANDOFF §7 « Historique ».

**Fait quand.** Liste qui/quand, aperçu lecture seule (desktop + mobile), restauration crée une nouvelle version, rien n'est écrasé.

---

## E6 — Administration des accès

**Objectif.** Donner à l'admin la gestion de l'**allowlist** et des **membres** (inscrits
vs en attente), rôles, **activation/désactivation** — **jamais de suppression**.

**Périmètre — Back**
- Dépendance `require_admin` ; route `/admin` **protégée serveur**.
- `GET /api/admin/members` (Users + Allowlist en LEFT JOIN sur email) — « en attente » = e-mail autorisé sans User.
- `POST /api/admin/allowlist {email}` · `DELETE /api/admin/allowlist/{id}` (uniquement entrées en attente).
- `PATCH /api/admin/users/{id} {role|status}` (status ACTIVE|DISABLED, **jamais delete**).

**Périmètre — Front**
- **AccessManager** : onglets **Membres** / **Invités en attente** + compteurs.
- **Ajouter un e-mail** à la liste · **MemberRow** (statut Actif/Désactivé, menu ⋯) · **PendingRow**.
- Menu membre : **Promouvoir admin**, **Désactiver le compte** (pas de suppression de compte).
- **Point d'entrée** : « Administration » dans le menu avatar, **visible admins uniquement**.

**Maquettes.** `Keepou - Admin.dc.html`.

**Règles liées (claude.md).** §5 désactivation jamais suppression · §6 `/admin` protégée serveur.

**Copy figée.** HANDOFF §7 « Admin ».

**Fait quand.** Allowlist gérable, statuts/rôles modifiables, désactivation réversible, route admin refusée aux non-admins (serveur), entrée masquée aux non-admins.

---

## E7 — Finitions : PWA, accessibilité, i18n, qualité

**Objectif.** Durcir et finaliser : installable, accessible, chaînes centralisées, testé.

**Périmètre**
- **PWA** : manifest (icône = mascotte), favicon, responsive (pas d'offline-first requis MVP mais éviter hypothèses bloquantes).
- **A11y** : vrais `<input type=checkbox>` + labels, champs labellisés, bandeaux verrou `role="status"`/aria-live, contrastes OK sur cartes claires, hit targets mobile ≥ 44px.
- **i18n** : centraliser la copy FR (HANDOFF §7) pour faciliter une trad ultérieure.
- **Qualité** : tests back (allowlist, verrou atomique, versionnage), tests front clés, CI lint/build/test.

**Maquettes.** Toutes (vérification d'états & responsive).

**Règles liées (claude.md).** §Fidélité visuelle · §Ne pas faire (pas d'emoji décoratif dans la chrome).

**Fait quand.** App installable, a11y vérifiée, chaînes centralisées, suite de tests verte en CI.

---

## Transversal (présent dans chaque epic)

- **Fidélité visuelle** : reprendre les tokens exacts du handoff ; clair **et** sombre ; desktop **et** mobile.
- **Sécurité serveur** : allowlist, rôle admin, verrou — **toujours** côté serveur ; le front n'affiche que ce que l'API renvoie.
- **Markdown** : le corps des notes est stocké en GFM dès le MVP (pas de migration future).
- **Tests** au fil de l'eau sur les règles métier critiques (allowlist, verrou atomique, versionnage).

---

## Prochaine étape

Quand tu valides ce découpage, on **descend dans les stories de l'E0** (ou de l'epic que tu
choisis), avec critères d'acceptation, périmètre technique précis et estimation.
