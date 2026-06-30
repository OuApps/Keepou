# E1 — Déploiement Railway (CD-first) — Stories détaillées

> Objectif de l'epic : **mettre Keepou en ligne sur Railway dès les fondations**, avec
> PostgreSQL managé, migrations jouées au déploiement, et **déploiement continu** sur push.
> Placée tôt pour que chaque epic suivante parte en prod sans effort manuel.
>
> Convention d'estimation : **S** (≤ ½ j), **M** (1–2 j), **L** (3 j+).
> Toutes ces stories sont `à faire` (rien n'est encore déployé).

**Topologie cible sur Railway (1 projet, 3 services) :**

```
Projet Railway « Keepou »
├── Postgres            (plugin managé)   → DATABASE_URL
├── keepou-api          (root: api/)      → https://keepou-api.up.railway.app
└── keepou-web          (root: web/)      → https://keepou.up.railway.app
```

> Monorepo : chaque service Railway pointe vers un **Root Directory** (`api/` ou `web/`).
> Railway injecte `$PORT` — les deux services **doivent écouter sur `$PORT`**.

---

## E1-S1 — Projet Railway + PostgreSQL managé · M

**Objectif.** Provisionner le projet et la base, relier le dépôt GitHub.

**Tâches**
- Créer le projet Railway « Keepou », connecter le repo **OuApps/Keepou** (intégration GitHub).
- Ajouter le service **PostgreSQL** managé → expose `DATABASE_URL` (+ `PGHOST`, `PGUSER`…).
- Définir l'environnement `production` (et préparer les variables partagées).

**Critères d'acceptation**
- [ ] Projet Railway créé et lié au repo GitHub.
- [ ] Service PostgreSQL up, `DATABASE_URL` disponible comme variable de référence.
- [ ] Accès équipe configuré.

**Notes.** Pas de code ; story d'infra. Les services API/web sont créés en S3/S5.

---

## E1-S2 — Driver PostgreSQL & config prod du back · S

**Objectif.** Rendre le back compatible PostgreSQL (dev reste SQLite).

**Tâches**
- Ajouter le driver **psycopg (v3)** à `api/requirements.txt` (`psycopg[binary]`).
- Normaliser le schéma d'URL : Railway fournit `postgresql://…` ; SQLModel/psycopg v3 attend `postgresql+psycopg://…`.
  → dans `app/config.py`, réécrire le préfixe si besoin (`postgresql://` → `postgresql+psycopg://`).
- Vérifier `app/db.py` : `connect_args` SQLite ne s'applique **pas** à Postgres (déjà géré).

**Critères d'acceptation**
- [ ] `pip install -r requirements.txt` installe psycopg.
- [ ] Avec `DATABASE_URL=postgresql://…`, l'app se connecte (schéma normalisé automatiquement).
- [ ] Le dev local SQLite continue de fonctionner sans changement.

**Notes.** Dépend de E0-S2/S3 (config + db posés).

---

## E1-S3 — Service API FastAPI sur Railway · M

**Objectif.** Déployer le back, joignable en HTTPS, avec healthcheck.

**Tâches**
- Service **keepou-api**, **Root Directory = `api/`**, builder Nixpacks (détecte `requirements.txt`).
- **Start command** : `uvicorn app.main:app --host 0.0.0.0 --port $PORT`.
- Fichier `api/railway.json` (ou `railway.toml`) : builder, `startCommand`, `healthcheckPath = /api/health`, politique de restart.
- Variables : `DATABASE_URL` (référence Postgres), `SESSION_SECRET` (généré), `CORS_ORIGINS` (URL du front, voir S6).
- Générer un **domaine public** pour le service API.

**Critères d'acceptation**
- [ ] `GET https://<api>/api/health` → 200 `{"status":"ok"}`.
- [ ] Le service lit ses variables d'env (DB, secret, CORS).
- [ ] Healthcheck Railway vert ; redémarrage automatique si crash.

**Notes.** `SESSION_SECRET` **doit** être un secret fort en prod (pas la valeur de `.env.example`).

---

## E1-S4 — Migrations Alembic jouées au déploiement · M

**Objectif.** La base est toujours à jour après un déploiement, automatiquement.

**Tâches**
- Définir une **pre-deploy command** Railway : `alembic upgrade head` (exécutée avant de basculer le trafic).
  - Alternative si pre-deploy indisponible : préfixer le start command (`alembic upgrade head && uvicorn …`) — moins propre (rejoué à chaque réplique).
- S'assurer qu'`alembic.ini`/`migrations/env.py` lisent `DATABASE_URL` de l'environnement (déjà le cas).
- Documenter le rollback (revenir à une révision Alembic + redeploy de l'image précédente).

**Critères d'acceptation**
- [ ] Un déploiement applique les migrations en attente avant de servir le trafic.
- [ ] Un déploiement sans nouvelle migration ne casse pas (idempotent).
- [ ] Procédure de rollback documentée (runbook S8).

**Notes.** Tant qu'aucun modèle réel (avant E2), `alembic upgrade head` est un no-op sûr.

---

## E1-S5 — Service Front (Vite) sur Railway · M

**Objectif.** Servir le build statique du front, pointant vers l'API.

**Tâches**
- Service **keepou-web**, **Root Directory = `web/`**, build `npm ci && npm run build` → `dist/`.
- Servir `dist/` en statique **avec fallback SPA** sur `$PORT` :
  - option simple : start `npx serve -s dist -l $PORT` (ajouter `serve` en devDep ou via `npx`),
  - ou un petit serveur statique (Caddy/Nginx) selon préférence ops.
- Variable de build **`VITE_API_URL`** = URL publique de l'API (S3). ⚠️ injectée **au build** (Vite inline les `import.meta.env` à la compilation) → rebuild si l'URL change.
- Générer le **domaine public** du front.

**Critères d'acceptation**
- [ ] Le front est servi en HTTPS et charge sans erreur console.
- [ ] Les appels `fetch` ciblent l'API de prod (`VITE_API_URL`), pas localhost.
- [ ] Le routing SPA fonctionne en deep-link (fallback `index.html`).

**Notes.** En dev, le proxy Vite `/api` suffit ; en prod, c'est `VITE_API_URL` + CORS (S6) qui relient les deux services.

---

## E1-S6 — CORS, cookies & sécurité prod · M

**Objectif.** Auth par cookie fonctionnelle et sûre entre deux domaines Railway.

**Tâches**
- Back : `CORS_ORIGINS` = domaine exact du front, `allow_credentials=True` (déjà câblé dans `main.py`).
- Cookies de session (posés en E2) en prod : `Secure`, `HttpOnly`, `SameSite` adapté.
  - Domaines distincts `keepou-web` ↔ `keepou-api` ⇒ cookie **cross-site** ⇒ `SameSite=None; Secure` (sinon le cookie n'est pas renvoyé).
  - ➡️ **Recommandation** : à terme, servir front + API sous le **même domaine** (sous-chemin `/api` via un reverse proxy / domaine custom) pour rester en `SameSite=Lax` — plus simple et plus sûr. À arbitrer.
- HTTPS forcé (par défaut sur Railway).

**Critères d'acceptation**
- [ ] Login depuis le front de prod établit la session et `GET /api/auth/me` fonctionne (cookie renvoyé).
- [ ] Aucune origine non autorisée n'est acceptée par l'API (CORS strict).
- [ ] Cookies marqués `Secure` + `HttpOnly` en prod.

**Notes.** Cette story formalise la décision d'architecture (cross-site vs même domaine). Impacte E2.

---

## E1-S7 — Déploiement continu (push + preview PR) · S

**Objectif.** Chaque push déclenche un déploiement ; chaque PR a un environnement de test.

**Tâches**
- Activer l'**auto-deploy** sur la branche de prod (ex. `main`) pour les deux services.
- Activer les **PR deploys** (environnement éphémère par PR) si l'offre Railway le permet.
- Vérifier que le build front injecte le bon `VITE_API_URL` selon l'environnement.

**Critères d'acceptation**
- [ ] Un merge sur `main` redéploie API + front automatiquement.
- [ ] Une PR crée (ou met à jour) un environnement de preview joignable.
- [ ] Les variables d'env diffèrent correctement entre prod et preview.

**Notes.** Complète la « CI de base » d'E0-S8 (lint/build) par le **CD**.

---

## E1-S8 — Variables d'env & runbook documentés · S

**Objectif.** Un ops/dev peut (re)déployer et dépanner sans deviner.

**Tâches**
- Documenter toutes les variables : back (`DATABASE_URL`, `SESSION_SECRET`, `CORS_ORIGINS`) et front (`VITE_API_URL`).
- Mettre à jour `api/.env.example` / `web/.env.example` si de nouvelles variables apparaissent.
- **Runbook** (`docs/DEPLOY.md` ou section README) : créer un service, rejouer une migration, rollback, régénérer `SESSION_SECRET`, consulter les logs.

**Critères d'acceptation**
- [ ] Liste exhaustive des variables (rôle + exemple) documentée.
- [ ] Runbook déploiement + rollback rédigé.
- [ ] Un nouveau membre peut suivre la doc pour reproduire l'environnement.

**Notes.** S'appuie sur les `.env.example` déjà fournis par le scaffold.

---

## Définition de « E1 terminée »

- [ ] API + front accessibles via leurs URLs Railway (HTTPS).
- [ ] PostgreSQL connecté ; migrations jouées automatiquement au déploiement.
- [ ] Push sur la branche de prod → déploiement auto des deux services.
- [ ] Auth par cookie fonctionnelle entre front et API (décision cross-site/même domaine actée).
- [ ] Variables d'env et runbook documentés.

> ℹ️ **Hypothèses à confirmer avec toi avant implémentation :** branche de prod (`main` ?),
> domaine custom souhaité (impacte la stratégie cookies S6), et offre Railway (PR deploys
> dispo ou non).
