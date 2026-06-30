# Keepou

**Google Keep auto-hébergé**, privé, pour une petite communauté (famille, voisins).
Notes texte + cases à cocher, privées ou publiques, édition **mono-éditeur verrouillée**,
historique de versions, accès par **allowlist** gérée par un admin. PWA responsive
(desktop + mobile), thème clair + sombre.

> Ce dépôt part des maquettes validées avec un designer. Le design est **figé** et fait
> office de source de vérité visuelle. L'implémentation se fait **epic par epic** — voir
> [`EPICS.md`](./EPICS.md).

## Structure du dépôt

```
.
├── EPICS.md          # Découpage macro en epics (point d'entrée du dev)
├── design/           # Maquettes validées + handoff (SOURCE DE VÉRITÉ visuelle)
│   ├── HANDOFF.md            # Tokens, comportements, modèle de données, API, copy FR
│   ├── claude.md            # Règles produit non négociables
│   ├── Keepou - *.dc.html   # Maquettes interactives (board, éditeur, historique, auth, admin)
│   ├── assets/ uploads/     # Logo mascotte, favicon
│   └── chats/               # Transcript des échanges design
├── web/              # Front — React + Vite + TypeScript (SPA découplée)
└── api/              # Back — Python + FastAPI + SQLModel + Alembic
```

## Stack

| Couche | Techno |
|---|---|
| Front | React + TypeScript (Vite), React Router, consomme l'API REST |
| Back | Python + FastAPI, SQLModel (SQLAlchemy + Pydantic), Alembic |
| Auth | Session/cookie, e-mail + mot de passe (passlib/bcrypt), allowlist **serveur** |
| Stockage notes | Markdown (GFM task lists `- [ ]` / `- [x]`) |

## Démarrer (squelette)

### Front (`web/`)
```bash
cd web
npm install
npm run dev          # http://localhost:5173
```

### Back (`api/`)
```bash
cd api
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload   # http://localhost:8000 — /api/health
```

> ⚠️ À ce stade le projet est un **squelette** : structure, tooling et design system
> sont en place, la logique métier est implémentée **story par story** au fil des epics.

## Règles produit non négociables

Voir [`design/claude.md`](./design/claude.md). En résumé : verrou mono-éditeur,
autosave, 1 session = 1 version, allowlist serveur, **désactivation jamais suppression**,
`/admin` protégée serveur, visibilité privé⇄public réversible.
