"""
Modèle de données Keepou (SQLModel).

⚠️ Squelette : les tables réelles sont définies story par story.
Le modèle complet (User, AllowlistEntry, Note + verrou, NoteVersion) et les enums
(Role, UserStatus, NoteColor, Visibility) sont **spécifiés** dans `design/HANDOFF.md` §4.

Points structurants à respecter au moment de l'implémentation :
- Verrou porté par la Note (1 verrou max) → update conditionnel atomique (E4).
- « En attente » = AllowlistEntry dont l'email n'a pas de User (LEFT JOIN sur email).
- Note.updated_at = « dernière version enregistrée » ;
  NoteVersion.created_at = horodatage de l'historique.
- Désactivation jamais suppression (UserStatus.DISABLED).
"""

from sqlmodel import SQLModel  # noqa: F401  (réexport pour Alembic / metadata)
