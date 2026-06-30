# Keepou — instructions projet (Claude Code)

> Ce fichier est lu à chaque session. Il fixe le cadre. Le détail exhaustif des écrans, tokens et comportements est dans **`HANDOFF.md`** — lis-le avant d'écrire du code UI.

## Le produit
Keepou est un **Google Keep auto-hébergé**, privé, pour une petite communauté (famille, voisins). Notes texte + cases à cocher, privées ou publiques, édition **mono-éditeur verrouillée**, historique de versions, accès par **allowlist** gérée par un admin. PWA responsive (desktop + mobile), thème clair + sombre.

## Stack cible
- **Back : Python + FastAPI** (API REST), **SQLModel** (SQLAlchemy + Pydantic) sur base relationnelle, migrations **Alembic**
- **Front : React + TypeScript** (SPA Vite) découplé, consomme l'API FastAPI
- Auth par session/cookie (e-mail + mot de passe, hash **passlib/bcrypt**), vérification allowlist **côté serveur**
- Stockage du corps des notes en **Markdown** (task lists GFM `- [ ]` / `- [x]`)

## Règles non négociables (issues du design validé)
1. **Verrou mono-éditeur** : une seule personne édite une note à la fois. Heartbeat ~20 s, expiration ~60 s, reprise possible, gestion de conflit. Jamais d'édition concurrente.
2. **Autosave** ~1,5 s après la dernière frappe + au blur/fermeture. L'état de session (« Enregistré ») est distinct de « Dernière version enregistrée » (auteur + date persistés).
3. **Versionnage** : **une version = une session d'édition** (créée au relâchement du verrou), pas une version par frappe ni par case cochée. Restaurer crée une nouvelle version — rien n'est jamais écrasé.
4. **Allowlist** : un compte n'est créé que si l'e-mail est sur la liste. Vérification **serveur**, le front n'affiche que le message renvoyé. Pas de « demande d'accès » in-app, pas de contact admin in-app.
5. **Désactivation, jamais suppression** : l'admin peut désactiver un compte (connexion bloquée, notes conservées, réactivable). Pas de suppression de compte.
6. **`/admin` protégée serveur** : l'entrée n'apparaît que pour les admins ; la route refuse les non-admins.
7. **Privé ⇄ public réversible** : repasser une note en privé la retire du board public des autres (confirmation requise).

## Fidélité visuelle
Les maquettes `.dc.html` sont la **source de vérité visuelle**. Reprends les tokens exacts (couleurs, dégradés de cartes, typo, rayons, ombres) listés dans `HANDOFF.md` — ne réinvente pas de palette. Police : **Fredoka** (titres/marque), **Nunito Sans** (texte/UI), **IBM Plex Mono** (labels techniques, horodatages en majuscules).

## Ne pas faire
- Pas de collaboration temps réel type CRDT/OT — le modèle est le **verrou**, volontairement simple.
- Pas de diff visuel dans l'historique — on réaffiche une version telle quelle.
- Pas d'emoji décoratif dans la chrome (ceux des notes d'exemple sont du contenu utilisateur).
- Pas de nouvelle dépendance UI lourde sans raison ; CSS au plus proche des maquettes.
