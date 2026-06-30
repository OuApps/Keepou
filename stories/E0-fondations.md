# E0 — Fondations & design system — Stories détaillées

> Objectif de l'epic : un monorepo qui démarre (front + back) et un **design system
> fidèle aux maquettes**, base de tous les écrans suivants.
>
> 🛠️ **Une partie est déjà posée par le scaffold** (commit d'intégration). Chaque story
> indique son état : `posé` (fait par le scaffold), `à compléter`, ou `à faire`.
> Convention d'estimation : **S** (≤ ½ j), **M** (1–2 j), **L** (3 j+).

---

## E0-S1 — Monorepo, structure & tooling · `posé` · S

**Objectif.** Une arborescence claire `web/` + `api/` + `design/`, avec scripts de dev.

**Tâches**
- Arborescence `web/` (React+Vite+TS), `api/` (FastAPI), `design/` (maquettes, source de vérité).
- `.gitignore` (node_modules, `__pycache__`, `.venv`, `dist`, `*.db`, `.env`…).
- README racine (structure, démarrage front/back).

**Critères d'acceptation**
- [x] `web/` et `api/` présents avec leur structure (handoff §6).
- [x] `README.md` décrit la structure et les commandes de démarrage.
- [x] Aucun artefact de build versionné (`dist/`, `node_modules/`, `*.tsbuildinfo`).

**Notes.** Fait. Voir `README.md`, `.gitignore`.

---

## E0-S2 — Bootstrap back FastAPI · `posé` · S

**Objectif.** API qui démarre, configurable, avec un endpoint de santé.

**Tâches**
- `app/main.py` : `FastAPI()`, montage des routers (stubs), CORS.
- `app/config.py` : settings via env (`DATABASE_URL`, `SESSION_SECRET`, `CORS_ORIGINS`).
- `app/db.py` : engine + `get_session`.
- Route `GET /api/health`.

**Critères d'acceptation**
- [x] `uvicorn app.main:app` démarre sans erreur.
- [x] `GET /api/health` → `{"status":"ok"}`.
- [x] CORS lit `CORS_ORIGINS` depuis l'environnement.
- [x] `.env.example` fourni.

**Notes.** Fait. Routers `auth`/`notes`/`admin` montés mais **sans routes** (remplis en E2/E3…).

---

## E0-S3 — Base de données & migrations Alembic · `à compléter` · M

**Objectif.** Couche DB prête, migrations opérationnelles (vides tant qu'aucun modèle).

**Tâches**
- `alembic.ini` + `migrations/env.py` branchés sur `app.config` et `SQLModel.metadata` — `posé`.
- `app/models.py` : aujourd'hui un stub (le modèle réel est défini en E2/E3/E5/E6 selon handoff §4).
- **À compléter** : valider le flux `alembic revision --autogenerate` + `alembic upgrade head` dès le premier modèle (E2).
- Choisir le SGBD de dev : SQLite par défaut (E0), PostgreSQL en prod (cf. E1).

**Critères d'acceptation**
- [x] `alembic current` s'exécute (env.py charge la config sans erreur).
- [ ] `alembic upgrade head` joue une première migration réelle (déclenché en E2 avec `User`/`AllowlistEntry`).
- [x] L'URL de base vient de `settings.database_url` (pas codée en dur).

**Notes.** Le squelette Alembic est posé ; la première migration réelle vient avec le premier modèle (dépendance E2).

---

## E0-S4 — Bootstrap front React/Vite + routing · `à compléter` · M

**Objectif.** SPA qui démarre, routeur en place, prête à accueillir les écrans.

**Tâches**
- `main.tsx` (BrowserRouter), `App.tsx` (shell) — `posé`.
- `vite.config.ts` avec proxy `/api` → back en dev — `posé`.
- **À compléter** : déclarer les routes du handoff §5 (`/login`, `/register`, `/`, `/note/:id`, `/note/:id/history`, `/admin`) avec des placeholders, + garde d'auth basique (redirection).

**Critères d'acceptation**
- [x] `npm run dev` démarre, `npm run build` (type-check + build) passe.
- [x] Appels API relatifs `/api/...` proxifiés vers le back en dev.
- [ ] Les routes principales existent (placeholders) et la navigation fonctionne.

**Notes.** Le shell boot ; le squelette de routes/placeholders est à ajouter (les écrans réels arrivent E2+).

---

## E0-S5 — Design system : tokens & thème clair/sombre · `posé` · M

**Objectif.** Les tokens exacts des maquettes disponibles partout, thème commutable.

**Tâches**
- `styles/tokens.css` : variables `:root` + `[data-theme="dark"]` **copiées des maquettes** (surfaces, texte, 5 teintes de cartes clair+sombre, marque, rayons, ombres) — handoff §1.
- Polices Fredoka / Nunito Sans / IBM Plex Mono (import Google Fonts dans `index.html`).
- `hooks/useTheme.ts` : `data-theme` sur `<html>`, respect `prefers-color-scheme`, override persistant (localStorage).

**Critères d'acceptation**
- [x] Les valeurs de `tokens.css` correspondent **exactement** au `:root`/`[data-theme=dark]` de `Keepou - Board.dc.html`.
- [x] Les 3 polices se chargent et sont exposées via `--font-brand/-ui/-mono`.
- [x] Le toggle thème bascule clair⇄sombre et persiste au reload ; premier chargement respecte l'OS.

**Notes.** Fait. Référence visuelle : `design/Keepou - Board.dc.html`.

---

## E0-S6 — Shell UI : topbar + layout responsive · `à faire` · M

**Objectif.** Une coquille réutilisable (topbar + conteneur) au point de bascule des maquettes.

**Tâches**
- Composant **Topbar** : logo mascotte + « Keepou » (Fredoka), zone centrale, actions (thème, avatar) — structure fidèle à `Keepou - Board.dc.html` (sticky, `backdrop-filter: blur(8px)`, fond `--topbar`).
- Conteneur de contenu (`max-width` ~1320px, paddings des maquettes).
- Helper responsive : point de bascule **~640px** (desktop ↔ mobile) — utilisé ensuite par éditeur/historique.

**Critères d'acceptation**
- [ ] Topbar fidèle (mesures, blur, bordure `--border`) en clair + sombre.
- [ ] Layout responsive ≥/< 640px conforme aux maquettes.
- [ ] Composants réutilisables (importés par le Board en E3).

**Notes.** Le `App.tsx` actuel contient une topbar minimale de démonstration à remplacer par le composant réel.

---

## E0-S7 — Client API & gestion d'erreurs typées · `à compléter` · S

**Objectif.** Un wrapper fetch unique, cookies de session, erreurs exploitables par l'UI.

**Tâches**
- `api/client.ts` : `get/post/patch/delete`, `credentials:'include'`, `ApiError(status, message, payload)` — `posé`.
- **À compléter** : helpers de mapping d'erreurs UI (401 → redirection login, 403 → message, 409 → conflit verrou) au fil des epics.

**Critères d'acceptation**
- [x] Toutes les requêtes passent par le wrapper et envoient les cookies.
- [x] Les réponses non-2xx lèvent `ApiError` avec `status` + `payload`.
- [ ] Convention de traitement 401/403/409 documentée et appliquée (E2/E5).

**Notes.** Base posée ; l'exploitation fine des codes se fait dans les epics concernées.

---

## E0-S8 — Qualité : lint, format & CI de base · `à faire` · M

**Objectif.** Garde-fous automatiques dès le départ (avant que le code grossisse).

**Tâches**
- Front : `tsc --noEmit` (déjà en script `lint`), ajouter ESLint + Prettier (config légère).
- Back : Ruff (config posée dans `pyproject.toml`), ajouter format check ; éventuellement `mypy` léger.
- **CI** (GitHub Actions) : job front (install + lint + build) + job back (install + ruff + import smoke test).

**Critères d'acceptation**
- [ ] `npm run lint` (front) et `ruff check` (back) passent.
- [ ] Un workflow CI tourne sur push/PR et bloque si lint/build échoue.
- [ ] Smoke test back : import de `app.main` + `GET /api/health` (via httpx/TestClient).

**Notes.** Ruff est déjà configuré (`api/pyproject.toml`). La CI pourra être complétée par le déploiement en **E1**.

---

## Définition de « E0 terminée »

- [ ] Les deux apps démarrent et se parlent en dev (proxy `/api`).
- [ ] Design system fidèle (tokens + 3 polices + thème clair/sombre persistant).
- [ ] Topbar + layout responsive réutilisables.
- [ ] Squelette de routes front + garde d'auth basique.
- [ ] Lint front/back + CI verte.
- [ ] Squelette Alembic prêt (1ʳᵉ migration réelle déléguée à E2).
